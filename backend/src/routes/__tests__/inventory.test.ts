import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";

process.env.DATABASE_URL ??= "postgresql://localhost:5432/test";
process.env.JWT_SECRET ??= "test-secret-value-please-change";
process.env.NODE_ENV = "test";

const query = vi.fn();
const clientQuery = vi.fn();
const rollback = vi.fn();

vi.mock("../../db/pool", () => ({
  pool: { query: (...args: unknown[]) => query(...args) },
  withTransaction: async (fn: (c: unknown) => Promise<unknown>) => {
    try {
      return await fn({ query: (...args: unknown[]) => clientQuery(...args) });
    } catch (error) {
      rollback();
      throw error;
    }
  },
}));

const { app } = await import("../../app");
const { signToken } = await import("../../middleware/auth");

const warehouseToken = signToken({
  id: "11111111-1111-1111-1111-111111111111",
  email: "w@x.io",
  role: "WAREHOUSE",
});
const salesToken = signToken({
  id: "22222222-2222-2222-2222-222222222222",
  email: "s@x.io",
  role: "SALES",
});
const productId = "44444444-4444-4444-4444-444444444444";

beforeEach(() => {
  query.mockReset();
  clientQuery.mockReset();
  rollback.mockReset();
});

function stockFlow(stock: number) {
  clientQuery.mockImplementation(async (sql: string) => {
    if (sql.includes("FOR UPDATE")) {
      return { rowCount: 1, rows: [{ id: productId, product_name: "Widget", current_stock: stock }] };
    }
    return { rowCount: 1, rows: [{ id: productId, current_stock: stock }] };
  });
  query.mockResolvedValue({ rowCount: 1, rows: [{ id: productId, current_stock: stock }] });
}

describe("stock adjustments", () => {
  it("requires authentication", async () => {
    const res = await request(app).post(`/api/products/${productId}/stock`);
    expect(res.status).toBe(401);
  });

  it("denies roles that cannot adjust stock", async () => {
    const res = await request(app)
      .post(`/api/products/${productId}/stock`)
      .set("Authorization", `Bearer ${salesToken}`)
      .send({ quantity: 5, movement_type: "IN", reason: "Purchase receipt" });
    expect(res.status).toBe(403);
  });

  it("rejects non-positive quantities", async () => {
    const res = await request(app)
      .post(`/api/products/${productId}/stock`)
      .set("Authorization", `Bearer ${warehouseToken}`)
      .send({ quantity: 0, movement_type: "IN", reason: "Purchase receipt" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("refuses an OUT movement larger than available stock", async () => {
    stockFlow(3);
    const res = await request(app)
      .post(`/api/products/${productId}/stock`)
      .set("Authorization", `Bearer ${warehouseToken}`)
      .send({ quantity: 10, movement_type: "OUT", reason: "Damaged goods" });

    expect(res.status).toBe(422);
    expect(rollback).toHaveBeenCalled();
  });

  it("applies a valid IN movement", async () => {
    stockFlow(3);
    const res = await request(app)
      .post(`/api/products/${productId}/stock`)
      .set("Authorization", `Bearer ${warehouseToken}`)
      .send({ quantity: 10, movement_type: "IN", reason: "Purchase receipt" });

    expect(res.status).toBeLessThan(300);
    const sqls = clientQuery.mock.calls.map((c) => String(c[0]));
    expect(sqls.some((s) => s.includes("INSERT INTO stock_movements"))).toBe(true);
  });
});
