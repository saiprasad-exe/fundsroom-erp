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
      const result = await fn({ query: (...args: unknown[]) => clientQuery(...args) });
      return result;
    } catch (error) {
      rollback();
      throw error;
    }
  },
}));

const { app } = await import("../../app");
const { signToken } = await import("../../middleware/auth");

const salesToken = signToken({ id: "11111111-1111-1111-1111-111111111111", email: "s@x.io", role: "SALES" });
const accountsToken = signToken({ id: "22222222-2222-2222-2222-222222222222", email: "a@x.io", role: "ACCOUNTS" });

const challanId = "33333333-3333-3333-3333-333333333333";

beforeEach(() => {
  query.mockReset();
  clientQuery.mockReset();
  rollback.mockReset();
});

function confirmFlow(status: string, stock: number, quantity: number) {
  clientQuery.mockImplementation(async (sql: string) => {
    if (sql.includes("FROM challans WHERE id = $1 FOR UPDATE")) {
      return { rowCount: 1, rows: [{ status, challan_number: "CH-2026-000001" }] };
    }
    if (sql.includes("FROM challan_items WHERE challan_id")) {
      return { rowCount: 1, rows: [{ product_id: "44444444-4444-4444-4444-444444444444", quantity }] };
    }
    if (sql.includes("FOR UPDATE") && sql.includes("products")) {
      return {
        rowCount: 1,
        rows: [{ id: "44444444-4444-4444-4444-444444444444", product_name: "Widget", current_stock: stock }],
      };
    }
    return { rowCount: 1, rows: [] };
  });
}

describe("auth guards", () => {
  it("rejects unauthenticated requests", async () => {
    const res = await request(app).post(`/api/challans/${challanId}/confirm`);
    expect(res.status).toBe(401);
  });

  it("rejects roles that may not confirm challans", async () => {
    const res = await request(app)
      .post(`/api/challans/${challanId}/confirm`)
      .set("Authorization", `Bearer ${accountsToken}`);
    expect(res.status).toBe(403);
  });
});

describe("challan confirmation", () => {
  it("confirms a draft challan and writes an OUT movement", async () => {
    confirmFlow("DRAFT", 50, 5);
    const res = await request(app)
      .post(`/api/challans/${challanId}/confirm`)
      .set("Authorization", `Bearer ${salesToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("CONFIRMED");
    const sqls = clientQuery.mock.calls.map((c) => String(c[0]));
    expect(sqls.some((s) => s.includes("current_stock = current_stock - $1"))).toBe(true);
    expect(sqls.some((s) => s.includes("INSERT INTO stock_movements"))).toBe(true);
    expect(rollback).not.toHaveBeenCalled();
  });

  it("rejects insufficient stock and rolls everything back", async () => {
    confirmFlow("DRAFT", 2, 10);
    const res = await request(app)
      .post(`/api/challans/${challanId}/confirm`)
      .set("Authorization", `Bearer ${salesToken}`);

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("INSUFFICIENT_STOCK");
    const sqls = clientQuery.mock.calls.map((c) => String(c[0]));
    expect(sqls.some((s) => s.includes("current_stock = current_stock - $1"))).toBe(false);
    expect(rollback).toHaveBeenCalled();
  });

  it("rejects a second confirmation of the same challan", async () => {
    confirmFlow("CONFIRMED", 50, 5);
    const res = await request(app)
      .post(`/api/challans/${challanId}/confirm`)
      .set("Authorization", `Bearer ${salesToken}`);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
  });
});

describe("validation", () => {
  it("rejects a challan with no line items", async () => {
    const res = await request(app)
      .post("/api/challans")
      .set("Authorization", `Bearer ${salesToken}`)
      .send({ customer_id: "55555555-5555-5555-5555-555555555555", items: [] });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});
