import { Router } from "express";
import { pool } from "../db/pool";
import { authenticate } from "../middleware/auth";

export const dashboardRouter = Router();
dashboardRouter.use(authenticate);

/** Aggregated KPIs + recent activity for the portal home screen. */
dashboardRouter.get("/", async (_req, res, next) => {
  try {
    const [metrics, lowStock, recentChallans, recentMovements] = await Promise.all([
      pool.query(
        `SELECT
           (SELECT count(*) FROM customers)::int AS total_customers,
           (SELECT count(*) FROM customers WHERE status = 'ACTIVE')::int AS active_customers,
           (SELECT count(*) FROM customers WHERE status = 'LEAD')::int AS leads,
           (SELECT count(*) FROM products)::int AS total_products,
           (SELECT count(*) FROM products WHERE current_stock <= minimum_stock_quantity)::int AS low_stock_products,
           (SELECT count(*) FROM challans WHERE status = 'DRAFT')::int AS draft_challans,
           (SELECT count(*) FROM challans WHERE status = 'CONFIRMED')::int AS confirmed_challans,
           (SELECT coalesce(sum(total_amount),0) FROM challans WHERE status = 'CONFIRMED')::text AS confirmed_value`,
      ),
      pool.query(
        `SELECT id, product_name, sku, current_stock, minimum_stock_quantity, warehouse_location
         FROM products WHERE current_stock <= minimum_stock_quantity
         ORDER BY current_stock ASC LIMIT 10`,
      ),
      pool.query(
        `SELECT c.id, c.challan_number, c.status, c.total_quantity, c.total_amount, c.created_at,
                cu.customer_name
         FROM challans c JOIN customers cu ON cu.id = c.customer_id
         ORDER BY c.created_at DESC LIMIT 10`,
      ),
      pool.query(
        `SELECT m.id, m.product_id, m.quantity_changed, m.movement_type, m.reason, m.created_at,
                p.product_name, p.sku
         FROM stock_movements m JOIN products p ON p.id = m.product_id
         ORDER BY m.created_at DESC LIMIT 10`,
      ),
    ]);

    res.json({
      success: true,
      data: {
        metrics: metrics.rows[0],
        low_stock_products: lowStock.rows,
        recent_challans: recentChallans.rows,
        recent_movements: recentMovements.rows,
      },
    });
  } catch (error) {
    next(error);
  }
});
