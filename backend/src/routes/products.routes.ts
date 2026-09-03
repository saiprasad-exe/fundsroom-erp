import { Router } from "express";
import { pool, withTransaction } from "../db/pool";
import { authenticate, authorize } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { productSchema, productUpdateSchema, stockAdjustSchema } from "../lib/validators";
import { paginate, parsePagination } from "../lib/pagination";
import { conflict, insufficientStock, notFound } from "../lib/errors";

export const productsRouter = Router();
productsRouter.use(authenticate);

const FIELDS = `id, product_name, sku, category, unit_price, current_stock,
  minimum_stock_quantity, warehouse_location, created_at, updated_at`;

productsRouter.get("/", async (req, res, next) => {
  try {
    const { page, limit, offset } = parsePagination(req.query as Record<string, unknown>);
    const search = String(req.query.search ?? "").trim();
    const category = String(req.query.category ?? "ALL");
    const lowStockOnly = String(req.query.lowStockOnly ?? "") === "true";

    const where: string[] = [];
    const params: unknown[] = [];
    if (search) {
      params.push(`%${search}%`);
      where.push(
        `(product_name ILIKE $${params.length} OR sku ILIKE $${params.length} OR category ILIKE $${params.length})`,
      );
    }
    if (category !== "ALL") {
      params.push(category);
      where.push(`category = $${params.length}`);
    }
    if (lowStockOnly) where.push("current_stock <= minimum_stock_quantity");
    const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const countResult = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM products ${clause}`,
      params,
    );
    const { rows } = await pool.query(
      `SELECT ${FIELDS} FROM products ${clause} ORDER BY product_name ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    );
    res.json({ success: true, data: paginate(rows, Number(countResult.rows[0].count), page, limit) });
  } catch (error) {
    next(error);
  }
});

productsRouter.get("/low-stock", async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${FIELDS} FROM products WHERE current_stock <= minimum_stock_quantity ORDER BY current_stock ASC`,
    );
    res.json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
});

productsRouter.get("/:id", async (req, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT ${FIELDS} FROM products WHERE id = $1`, [
      req.params.id,
    ]);
    if (!rows[0]) throw notFound("Product not found");
    res.json({ success: true, data: rows[0] });
  } catch (error) {
    next(error);
  }
});

productsRouter.post(
  "/",
  authorize("WAREHOUSE"),
  validate(productSchema),
  async (req, res, next) => {
    try {
      const b = req.body;
      const dup = await pool.query("SELECT 1 FROM products WHERE upper(sku) = upper($1)", [b.sku]);
      if (dup.rowCount) throw conflict("A product with this SKU already exists");

      const created = await withTransaction(async (client) => {
        const { rows } = await client.query(
          `INSERT INTO products (product_name, sku, category, unit_price, current_stock,
             minimum_stock_quantity, warehouse_location, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING ${FIELDS}`,
          [
            b.product_name,
            b.sku.toUpperCase(),
            b.category,
            b.unit_price,
            b.current_stock,
            b.minimum_stock_quantity,
            b.warehouse_location ?? null,
            req.user!.id,
          ],
        );
        if (b.current_stock > 0) {
          await client.query(
            `INSERT INTO stock_movements (product_id, quantity_changed, movement_type, reason, created_by)
             VALUES ($1,$2,'IN','Opening stock',$3)`,
            [rows[0].id, b.current_stock, req.user!.id],
          );
        }
        return rows[0];
      });
      res.status(201).json({ success: true, data: created });
    } catch (error) {
      next(error);
    }
  },
);

/** SKU and current_stock are immutable here; stock only moves through /stock. */
productsRouter.put(
  "/:id",
  authorize("WAREHOUSE"),
  validate(productUpdateSchema),
  async (req, res, next) => {
    try {
      const b = req.body;
      const { rows } = await pool.query(
        `UPDATE products SET
           product_name = coalesce($1, product_name),
           category = coalesce($2, category),
           unit_price = coalesce($3, unit_price),
           minimum_stock_quantity = coalesce($4, minimum_stock_quantity),
           warehouse_location = $5
         WHERE id = $6 RETURNING ${FIELDS}`,
        [
          b.product_name ?? null,
          b.category ?? null,
          b.unit_price ?? null,
          b.minimum_stock_quantity ?? null,
          b.warehouse_location ?? null,
          req.params.id,
        ],
      );
      if (!rows[0]) throw notFound("Product not found");
      res.json({ success: true, data: rows[0] });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * Transactional stock adjustment: the product row is locked, the resulting
 * stock is validated, then the level and the movement log are written together.
 */
productsRouter.post(
  "/:id/stock",
  authorize("WAREHOUSE"),
  validate(stockAdjustSchema),
  async (req, res, next) => {
    try {
      const { quantity, movement_type, reason } = req.body;
      const result = await withTransaction(async (client) => {
        const { rows } = await client.query<{
          id: string;
          product_name: string;
          current_stock: number;
        }>("SELECT id, product_name, current_stock FROM products WHERE id = $1 FOR UPDATE", [
          req.params.id,
        ]);
        const product = rows[0];
        if (!product) throw notFound("Product not found");

        const next =
          movement_type === "IN" ? product.current_stock + quantity : product.current_stock - quantity;
        if (next < 0) {
          throw insufficientStock(
            `Insufficient stock for product ${product.product_name}. Available: ${product.current_stock}, Requested: ${quantity}.`,
          );
        }

        await client.query("UPDATE products SET current_stock = $1 WHERE id = $2", [
          next,
          product.id,
        ]);
        await client.query(
          `INSERT INTO stock_movements (product_id, quantity_changed, movement_type, reason, created_by)
           VALUES ($1,$2,$3,$4,$5)`,
          [product.id, quantity, movement_type, reason, req.user!.id],
        );
        return { product_id: product.id, previous_stock: product.current_stock, current_stock: next };
      });
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);

productsRouter.get("/:id/movements", async (req, res, next) => {
  try {
    const { page, limit, offset } = parsePagination(req.query as Record<string, unknown>);
    const countResult = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM stock_movements WHERE product_id = $1",
      [req.params.id],
    );
    const { rows } = await pool.query(
      `SELECT id, product_id, quantity_changed, movement_type, reason, reference, created_at
       FROM stock_movements WHERE product_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [req.params.id, limit, offset],
    );
    res.json({ success: true, data: paginate(rows, Number(countResult.rows[0].count), page, limit) });
  } catch (error) {
    next(error);
  }
});
