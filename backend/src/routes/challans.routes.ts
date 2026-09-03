import { Router } from "express";
import { pool, withTransaction } from "../db/pool";
import { authenticate, authorize } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { challanSchema } from "../lib/validators";
import { paginate, parsePagination } from "../lib/pagination";
import { badRequest, conflict, insufficientStock, notFound } from "../lib/errors";

export const challansRouter = Router();
challansRouter.use(authenticate);

async function loadChallan(id: string) {
  const { rows } = await pool.query(
    `SELECT c.id, c.challan_number, c.customer_id, c.status, c.notes, c.total_quantity,
            c.total_amount, c.confirmed_at, c.created_at, c.updated_at,
            cu.customer_name, cu.business_name
     FROM challans c JOIN customers cu ON cu.id = c.customer_id WHERE c.id = $1`,
    [id],
  );
  if (!rows[0]) throw notFound("Challan not found");
  const items = await pool.query(
    `SELECT id, product_id, product_name_snapshot, sku_snapshot, unit_price_snapshot, quantity
     FROM challan_items WHERE challan_id = $1 ORDER BY created_at ASC`,
    [id],
  );
  return { ...rows[0], items: items.rows };
}

challansRouter.get("/", async (req, res, next) => {
  try {
    const { page, limit, offset } = parsePagination(req.query as Record<string, unknown>);
    const status = String(req.query.status ?? "ALL");
    const customerId = String(req.query.customer_id ?? "ALL");

    const where: string[] = [];
    const params: unknown[] = [];
    if (status !== "ALL") {
      params.push(status);
      where.push(`c.status = $${params.length}::challan_status`);
    }
    if (customerId !== "ALL") {
      params.push(customerId);
      where.push(`c.customer_id = $${params.length}`);
    }
    const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const countResult = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM challans c ${clause}`,
      params,
    );
    const { rows } = await pool.query(
      `SELECT c.id, c.challan_number, c.status, c.total_quantity, c.total_amount, c.created_at,
              cu.id AS customer_id, cu.customer_name, cu.business_name
       FROM challans c JOIN customers cu ON cu.id = c.customer_id
       ${clause} ORDER BY c.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    );
    res.json({ success: true, data: paginate(rows, Number(countResult.rows[0].count), page, limit) });
  } catch (error) {
    next(error);
  }
});

challansRouter.get("/:id", async (req, res, next) => {
  try {
    res.json({ success: true, data: await loadChallan(req.params.id) });
  } catch (error) {
    next(error);
  }
});

/** Creates a DRAFT challan with price/name/SKU snapshots. Stock is untouched. */
challansRouter.post("/", authorize("SALES"), validate(challanSchema), async (req, res, next) => {
  try {
    const { customer_id, notes, items } = req.body;
    const id = await withTransaction(async (client) => {
      const customer = await client.query("SELECT 1 FROM customers WHERE id = $1", [customer_id]);
      if (!customer.rowCount) throw notFound("Customer not found");

      const productIds: string[] = items.map((i: { product_id: string }) => i.product_id);
      if (new Set(productIds).size !== productIds.length) {
        throw badRequest("Each product may appear only once per challan");
      }
      const products = await client.query<{
        id: string;
        product_name: string;
        sku: string;
        unit_price: string;
      }>("SELECT id, product_name, sku, unit_price FROM products WHERE id = ANY($1::uuid[])", [
        productIds,
      ]);
      if (products.rowCount !== productIds.length) throw notFound("One or more products not found");

      const { rows } = await client.query<{ id: string }>(
        "INSERT INTO challans (customer_id, notes, created_by) VALUES ($1,$2,$3) RETURNING id",
        [customer_id, notes ?? null, req.user!.id],
      );

      for (const item of items) {
        const product = products.rows.find((p) => p.id === item.product_id)!;
        await client.query(
          `INSERT INTO challan_items (challan_id, product_id, product_name_snapshot, sku_snapshot, unit_price_snapshot, quantity)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [rows[0].id, product.id, product.product_name, product.sku, product.unit_price, item.quantity],
        );
      }
      return rows[0].id;
    });
    res.status(201).json({ success: true, data: await loadChallan(id) });
  } catch (error) {
    next(error);
  }
});

/** Replaces customer, notes and the full item list of a DRAFT challan. */
challansRouter.put("/:id", authorize("SALES"), validate(challanSchema), async (req, res, next) => {
  try {
    const { customer_id, notes, items } = req.body;
    await withTransaction(async (client) => {
      const { rows } = await client.query<{ status: string; challan_number: string }>(
        "SELECT status, challan_number FROM challans WHERE id = $1 FOR UPDATE",
        [req.params.id],
      );
      if (!rows[0]) throw notFound("Challan not found");
      if (rows[0].status !== "DRAFT") {
        throw conflict(`Challan ${rows[0].challan_number} is ${rows[0].status} and cannot be edited`);
      }

      await client.query(
        "UPDATE challans SET customer_id = $1, notes = $2 WHERE id = $3",
        [customer_id, notes ?? null, req.params.id],
      );
      await client.query("DELETE FROM challan_items WHERE challan_id = $1", [req.params.id]);

      const productIds = items.map((i: { product_id: string }) => i.product_id);
      const products = await client.query<{
        id: string;
        product_name: string;
        sku: string;
        unit_price: string;
      }>("SELECT id, product_name, sku, unit_price FROM products WHERE id = ANY($1::uuid[])", [
        productIds,
      ]);
      if (products.rowCount !== new Set(productIds).size) throw notFound("One or more products not found");

      for (const item of items) {
        const product = products.rows.find((p) => p.id === item.product_id)!;
        await client.query(
          `INSERT INTO challan_items (challan_id, product_id, product_name_snapshot, sku_snapshot, unit_price_snapshot, quantity)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [req.params.id, product.id, product.product_name, product.sku, product.unit_price, item.quantity],
        );
      }
    });
    res.json({ success: true, data: await loadChallan(req.params.id) });
  } catch (error) {
    next(error);
  }
});

/**
 * Transactional confirmation. Inside ONE transaction we:
 *  1. lock the challan row and reject anything that is not DRAFT (no double confirm),
 *  2. lock every referenced product row (ordered, to avoid deadlocks),
 *  3. validate stock for EVERY line before writing anything,
 *  4. decrement stock and insert an OUT movement per line,
 *  5. flip the challan to CONFIRMED.
 * Any failure rolls the whole thing back — stock is never partially deducted.
 */
challansRouter.post("/:id/confirm", authorize("SALES"), async (req, res, next) => {
  try {
    const result = await withTransaction(async (client) => {
      const { rows } = await client.query<{ status: string; challan_number: string }>(
        "SELECT status, challan_number FROM challans WHERE id = $1 FOR UPDATE",
        [req.params.id],
      );
      const challan = rows[0];
      if (!challan) throw notFound("Challan not found");
      if (challan.status !== "DRAFT") {
        throw conflict(
          `Challan ${challan.challan_number} is already ${challan.status} and cannot be confirmed again`,
        );
      }

      const items = await client.query<{ product_id: string; quantity: number }>(
        "SELECT product_id, quantity FROM challan_items WHERE challan_id = $1",
        [req.params.id],
      );
      if (!items.rowCount) throw badRequest("Challan has no line items");

      const locked = await client.query<{
        id: string;
        product_name: string;
        current_stock: number;
      }>(
        `SELECT id, product_name, current_stock FROM products
         WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE`,
        [items.rows.map((i) => i.product_id)],
      );

      for (const item of items.rows) {
        const product = locked.rows.find((p) => p.id === item.product_id);
        if (!product) throw notFound("A product on this challan no longer exists");
        if (product.current_stock < item.quantity) {
          throw insufficientStock(
            `Insufficient stock for product ${product.product_name}. Available: ${product.current_stock}, Requested: ${item.quantity}.`,
          );
        }
      }

      for (const item of items.rows) {
        await client.query(
          "UPDATE products SET current_stock = current_stock - $1 WHERE id = $2",
          [item.quantity, item.product_id],
        );
        await client.query(
          `INSERT INTO stock_movements (product_id, quantity_changed, movement_type, reason, reference, created_by)
           VALUES ($1,$2,'OUT',$3,$4,$5)`,
          [
            item.product_id,
            item.quantity,
            `Challan ${challan.challan_number} confirmed`,
            challan.challan_number,
            req.user!.id,
          ],
        );
      }

      await client.query(
        "UPDATE challans SET status = 'CONFIRMED', confirmed_at = now() WHERE id = $1",
        [req.params.id],
      );

      return {
        challan_id: req.params.id,
        challan_number: challan.challan_number,
        status: "CONFIRMED",
        items: items.rowCount,
      };
    });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/** Cancels a DRAFT challan. Never touches stock. */
challansRouter.post("/:id/cancel", authorize("SALES"), async (req, res, next) => {
  try {
    const result = await withTransaction(async (client) => {
      const { rows } = await client.query<{ status: string; challan_number: string }>(
        "SELECT status, challan_number FROM challans WHERE id = $1 FOR UPDATE",
        [req.params.id],
      );
      if (!rows[0]) throw notFound("Challan not found");
      if (rows[0].status === "CONFIRMED") {
        throw conflict(`Challan ${rows[0].challan_number} is confirmed and cannot be cancelled`);
      }
      if (rows[0].status === "CANCELLED") {
        throw conflict(`Challan ${rows[0].challan_number} is already cancelled`);
      }
      await client.query("UPDATE challans SET status = 'CANCELLED' WHERE id = $1", [req.params.id]);
      return { challan_id: req.params.id, status: "CANCELLED" };
    });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});
