import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../export-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../export-service")>();
  return {
    ...actual,
    listOrderDigest: vi.fn(async () => ({ orders: [{ id: "o1", orderNumber: 10001, version: "v" }], nextCursor: null })),
    getOrdersForExport: vi.fn(async (_db: unknown, ids: string[]) => ids.map((id) => ({ id }))),
    listProductsForExport: vi.fn(async () => [{ id: "p1" }]),
  };
});

const TOKEN = "t".repeat(40);

async function app() {
  const { erpSyncApiPlugin } = await import("../api");
  const instance = Fastify();
  // The export service is mocked, so the request-scoped db is never touched.
  instance.decorateRequest("db", null as never);
  await instance.register(erpSyncApiPlugin, { prefix: "/api/erp/v1" });
  await instance.ready();
  return instance;
}

describe("/api/erp/v1", () => {
  const original = process.env.ERP_SYNC_TOKEN;
  afterEach(() => {
    process.env.ERP_SYNC_TOKEN = original;
  });

  describe("without a configured token", () => {
    beforeEach(() => {
      delete process.env.ERP_SYNC_TOKEN;
    });
    it("registers no routes", async () => {
      const a = await app();
      const res = await a.inject({ method: "GET", url: "/api/erp/v1/orders/digest", headers: { authorization: `Bearer ${TOKEN}` } });
      expect(res.statusCode).toBe(404);
    });
  });

  describe("with a configured token", () => {
    beforeEach(() => {
      process.env.ERP_SYNC_TOKEN = TOKEN;
    });

    it("rejects a missing or wrong token", async () => {
      const a = await app();
      expect((await a.inject({ method: "GET", url: "/api/erp/v1/orders/digest" })).statusCode).toBe(401);
      expect(
        (await a.inject({ method: "GET", url: "/api/erp/v1/products", headers: { authorization: "Bearer nope" } })).statusCode,
      ).toBe(401);
    });

    it("serves the digest, orders and products, uncached", async () => {
      const a = await app();
      const auth = { authorization: `Bearer ${TOKEN}` };
      const digest = await a.inject({ method: "GET", url: "/api/erp/v1/orders/digest?after=10000&limit=50", headers: auth });
      expect(digest.statusCode).toBe(200);
      expect(digest.headers["cache-control"]).toBe("no-store");
      expect(digest.json()).toMatchObject({ success: true, orders: [{ id: "o1" }], nextCursor: null });

      const id = "0190a000-0000-7000-8000-000000000001";
      const orders = await a.inject({ method: "GET", url: `/api/erp/v1/orders?ids=${id}`, headers: auth });
      expect(orders.json()).toMatchObject({ success: true, orders: [{ id }] });

      const products = await a.inject({ method: "GET", url: "/api/erp/v1/products", headers: auth });
      expect(products.json()).toMatchObject({ success: true, products: [{ id: "p1" }] });
    });

    it("validates the ids list", async () => {
      const a = await app();
      const auth = { authorization: `Bearer ${TOKEN}` };
      expect((await a.inject({ method: "GET", url: "/api/erp/v1/orders?ids=not-a-uuid", headers: auth })).statusCode).toBe(400);
      const tooMany = Array.from({ length: 101 }, (_, i) => `0190a000-0000-7000-8000-${String(i).padStart(12, "0")}`).join(",");
      expect((await a.inject({ method: "GET", url: `/api/erp/v1/orders?ids=${tooMany}`, headers: auth })).statusCode).toBe(400);
    });

    it("only answers GET", async () => {
      const a = await app();
      const res = await a.inject({ method: "POST", url: "/api/erp/v1/orders", headers: { authorization: `Bearer ${TOKEN}` } });
      expect(res.statusCode).toBe(404);
    });
  });
});
