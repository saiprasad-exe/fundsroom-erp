import { readFileSync } from "fs";
import { join } from "path";
import { pool } from "./pool";

async function main() {
  const sql = readFileSync(join(__dirname, "schema.sql"), "utf8");
  await pool.query(sql);
  console.log("Schema applied successfully.");
  await pool.end();
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
