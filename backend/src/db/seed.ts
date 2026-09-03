import bcrypt from "bcryptjs";
import { pool, withTransaction } from "./pool";
import { env } from "../config/env";

const USERS = [
  { name: "Aarti Admin", email: "admin@fundsroom.test", role: "ADMIN", password: "Admin@123" },
  { name: "Sahil Sales", email: "sales@fundsroom.test", role: "SALES", password: "Sales@123" },
  {
    name: "Wasim Warehouse",
    email: "warehouse@fundsroom.test",
    role: "WAREHOUSE",
    password: "Ware@1234",
  },
  {
    name: "Anita Accounts",
    email: "accounts@fundsroom.test",
    role: "ACCOUNTS",
    password: "Acct@1234",
  },
];

const CUSTOMERS = [
  ["Rahul Mehta", "9812345670", "rahul@mehtatraders.test", "Mehta Traders", "WHOLESALE", "ACTIVE"],
  ["Priya Nair", "9876543210", "priya@nairretail.test", "Nair Retail", "RETAIL", "ACTIVE"],
  ["Imran Shaikh", "9765432109", null, "Shaikh Distributors", "DISTRIBUTOR", "ACTIVE"],
  ["Deepa Rao", "9654321098", "deepa@raostores.test", "Rao Stores", "RETAIL", "LEAD"],
  ["Vikram Singh", "9543210987", null, null, "WHOLESALE", "INACTIVE"],
];

const PRODUCTS = [
  ["Steel Ball Bearing 6205", "SKU-BRG-6205", "Bearings", 240.5, 180, 40, "A-01"],
  ["Steel Ball Bearing 6305", "SKU-BRG-6305", "Bearings", 318.0, 25, 30, "A-02"],
  ["V-Belt A-42", "SKU-BLT-A42", "Belts", 165.75, 300, 50, "B-01"],
  ["V-Belt B-56", "SKU-BLT-B56", "Belts", 219.0, 12, 25, "B-02"],
  ["Hydraulic Oil 20L", "SKU-OIL-20L", "Lubricants", 2450.0, 60, 15, "C-01"],
  ["Grease Cartridge 400g", "SKU-GRS-400", "Lubricants", 189.0, 420, 80, "C-02"],
  ["Coupling Sleeve 25mm", "SKU-CPL-25", "Couplings", 540.0, 8, 20, "D-01"],
  ["Gear Pump GP-12", "SKU-PMP-GP12", "Pumps", 8750.0, 14, 5, "D-02"],
];

async function main() {
  await withTransaction(async (client) => {
    await client.query(
      "TRUNCATE challan_items, challans, stock_movements, follow_ups, customers, products, users RESTART IDENTITY CASCADE",
    );

    const userIds: Record<string, string> = {};
    for (const user of USERS) {
      const hash = await bcrypt.hash(user.password, env.bcryptRounds);
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,$3,$4) RETURNING id`,
        [user.name, user.email, hash, user.role],
      );
      userIds[user.role] = rows[0].id;
    }

    const customerIds: string[] = [];
    for (const [name, mobile, email, business, type, status] of CUSTOMERS) {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO customers (customer_name, mobile_number, email, business_name, customer_type, status, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [name, mobile, email, business, type, status, userIds.SALES],
      );
      customerIds.push(rows[0].id);
    }

    await client.query(
      `INSERT INTO follow_ups (customer_id, note, follow_up_date, created_by)
       VALUES ($1, 'Shared updated bearing price list. Awaiting confirmation.', current_date + 3, $2)`,
      [customerIds[0], userIds.SALES],
    );

    const productIds: string[] = [];
    for (const [name, sku, category, price, stock, min, location] of PRODUCTS) {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO products (product_name, sku, category, unit_price, current_stock, minimum_stock_quantity, warehouse_location, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [name, sku, category, price, stock, min, location, userIds.WAREHOUSE],
      );
      productIds.push(rows[0].id);
      await client.query(
        `INSERT INTO stock_movements (product_id, quantity_changed, movement_type, reason, created_by)
         VALUES ($1,$2,'IN','Opening stock',$3)`,
        [rows[0].id, stock, userIds.WAREHOUSE],
      );
    }

    // Two DRAFT challans (stock untouched)
    for (const index of [0, 1]) {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO challans (customer_id, notes, created_by) VALUES ($1,$2,$3) RETURNING id`,
        [customerIds[index], `Seeded draft challan ${index + 1}`, userIds.SALES],
      );
      await client.query(
        `INSERT INTO challan_items (challan_id, product_id, product_name_snapshot, sku_snapshot, unit_price_snapshot, quantity)
         SELECT $1, p.id, p.product_name, p.sku, p.unit_price, $3 FROM products p WHERE p.id = $2`,
        [rows[0].id, productIds[index], 5],
      );
    }
  });

  console.log("Seed data inserted. Login with admin@fundsroom.test / Admin@123");
  await pool.end();
}

main().catch((error) => {
  console.error("Seeding failed:", error);
  process.exit(1);
});
