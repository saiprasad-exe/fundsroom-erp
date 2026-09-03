import { Router } from "express";
import { pool } from "../db/pool";
import { authenticate, authorize } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { customerSchema, followUpSchema } from "../lib/validators";
import { paginate, parsePagination } from "../lib/pagination";
import { notFound } from "../lib/errors";

export const customersRouter = Router();
customersRouter.use(authenticate);

const FIELDS = `id, customer_name, mobile_number, email, business_name, gst_number,
  customer_type, address, status, follow_up_date, notes, created_by, created_at, updated_at`;

customersRouter.get("/", authorize("SALES", "ACCOUNTS"), async (req, res, next) => {
  try {
    const { page, limit, offset } = parsePagination(req.query as Record<string, unknown>);
    const search = String(req.query.search ?? "").trim();
    const status = String(req.query.status ?? "ALL");
    const type = String(req.query.customer_type ?? "ALL");

    const where: string[] = [];
    const params: unknown[] = [];
    if (search) {
      params.push(`%${search}%`);
      where.push(
        `(customer_name ILIKE $${params.length} OR mobile_number ILIKE $${params.length}
          OR coalesce(business_name,'') ILIKE $${params.length} OR coalesce(email,'') ILIKE $${params.length})`,
      );
    }
    if (status !== "ALL") {
      params.push(status);
      where.push(`status = $${params.length}::customer_status`);
    }
    if (type !== "ALL") {
      params.push(type);
      where.push(`customer_type = $${params.length}::customer_type`);
    }
    const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const countResult = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM customers ${clause}`,
      params,
    );
    const { rows } = await pool.query(
      `SELECT ${FIELDS} FROM customers ${clause} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    );
    res.json({ success: true, data: paginate(rows, Number(countResult.rows[0].count), page, limit) });
  } catch (error) {
    next(error);
  }
});

customersRouter.get("/:id", authorize("SALES", "ACCOUNTS"), async (req, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT ${FIELDS} FROM customers WHERE id = $1`, [
      req.params.id,
    ]);
    if (!rows[0]) throw notFound("Customer not found");
    const followUps = await pool.query(
      "SELECT id, note, follow_up_date, created_by, created_at FROM follow_ups WHERE customer_id = $1 ORDER BY created_at DESC",
      [req.params.id],
    );
    res.json({ success: true, data: { ...rows[0], follow_ups: followUps.rows } });
  } catch (error) {
    next(error);
  }
});

customersRouter.post("/", authorize("SALES"), validate(customerSchema), async (req, res, next) => {
  try {
    const b = req.body;
    const { rows } = await pool.query(
      `INSERT INTO customers (customer_name, mobile_number, email, business_name, gst_number,
        customer_type, address, status, follow_up_date, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING ${FIELDS}`,
      [
        b.customer_name,
        b.mobile_number,
        b.email ?? null,
        b.business_name ?? null,
        b.gst_number ?? null,
        b.customer_type,
        b.address ?? null,
        b.status,
        b.follow_up_date ?? null,
        b.notes ?? null,
        req.user!.id,
      ],
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (error) {
    next(error);
  }
});

customersRouter.put(
  "/:id",
  authorize("SALES"),
  validate(customerSchema),
  async (req, res, next) => {
    try {
      const b = req.body;
      const { rows } = await pool.query(
        `UPDATE customers SET customer_name=$1, mobile_number=$2, email=$3, business_name=$4,
           gst_number=$5, customer_type=$6, address=$7, status=$8, follow_up_date=$9, notes=$10
         WHERE id=$11 RETURNING ${FIELDS}`,
        [
          b.customer_name,
          b.mobile_number,
          b.email ?? null,
          b.business_name ?? null,
          b.gst_number ?? null,
          b.customer_type,
          b.address ?? null,
          b.status,
          b.follow_up_date ?? null,
          b.notes ?? null,
          req.params.id,
        ],
      );
      if (!rows[0]) throw notFound("Customer not found");
      res.json({ success: true, data: rows[0] });
    } catch (error) {
      next(error);
    }
  },
);

customersRouter.delete("/:id", authorize(), async (req, res, next) => {
  try {
    const result = await pool.query("DELETE FROM customers WHERE id = $1", [req.params.id]);
    if (!result.rowCount) throw notFound("Customer not found");
    res.json({ success: true, data: { id: req.params.id, deleted: true } });
  } catch (error) {
    next(error);
  }
});

customersRouter.post(
  "/:id/follow-ups",
  authorize("SALES"),
  validate(followUpSchema),
  async (req, res, next) => {
    try {
      const exists = await pool.query("SELECT 1 FROM customers WHERE id = $1", [req.params.id]);
      if (!exists.rowCount) throw notFound("Customer not found");

      const { rows } = await pool.query(
        `INSERT INTO follow_ups (customer_id, note, follow_up_date, created_by)
         VALUES ($1,$2,$3,$4) RETURNING id, customer_id, note, follow_up_date, created_at`,
        [req.params.id, req.body.note, req.body.follow_up_date ?? null, req.user!.id],
      );
      if (req.body.follow_up_date) {
        await pool.query("UPDATE customers SET follow_up_date = $1 WHERE id = $2", [
          req.body.follow_up_date,
          req.params.id,
        ]);
      }
      res.status(201).json({ success: true, data: rows[0] });
    } catch (error) {
      next(error);
    }
  },
);
