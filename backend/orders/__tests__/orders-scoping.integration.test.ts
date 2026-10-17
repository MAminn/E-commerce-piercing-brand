import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inArray, like } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

/**
 * Customer order isolation, against a real Postgres and through the real tRPC
 * router (auth middleware + procedure + service), not a service in isolation.
 *
 *   • order.view returns a customer ONLY their own orders, whatever filters
 *     they send; an admin sees everyone's.
 *   • No customer-reachable endpoint returns another customer's order data by
 *     direct id: the admin by-id procedures are FORBIDDEN, and the public
 *     payment endpoints (guest checkout needs them) expose payment status
 *     only — never the name, email, phone or address on the order.
 */
const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = TEST_DB_URL ? describe : describe.skip;

describeIfDb("customer order isolation (integration)", () => {
  let db: ReturnType<typeof import("drizzle-orm/node-postgres").drizzle>;
  let schema: typeof import("#root/shared/database/drizzle/schema");
  let appRouter: typeof import("#root/shared/trpc/router").appRouter;

  const TAG = "orderscope-it-";
  const alice = { id: `${TAG}alice`, email: `${TAG}alice@example.test`, name: "Alice" };
  const bob = { id: `${TAG}bob`, email: `${TAG}bob@example.test`, name: "Bob" };
  let aliceOrderId: string;
  let bobOrderId: string;

  const session = (u: { id: string; email: string; name: string }, role: "user" | "admin") =>
    ({
      id: u.id,
      token: "hashed",
      email: u.email,
      name: u.name,
      phone: "",
      expiresAt: new Date(Date.now() + 3_600_000),
      role,
      emailVerified: true,
      profilePicture: null,
    }) as never;

  const caller = (clientSession: unknown) =>
    appRouter.createCaller({
      db,
      clientSession,
      emailService: undefined,
      ipAddress: "127.0.0.1",
      userAgent: "vitest",
    } as never);

  const orderRow = (u: { id: string; email: string; name: string }) => ({
    userId: u.id,
    customerName: `${TAG}${u.name}`,
    customerEmail: u.email,
    customerPhone: "+201000000000",
    shippingAddress: `${u.name}'s street 1`,
    shippingCity: "Cairo",
    shippingState: "Cairo",
    shippingPostalCode: "11511",
    shippingCountry: "EG",
    subtotal: "100.00",
    shipping: "0.00",
    tax: "0.00",
    total: "100.00",
  });

  const codeOf = async (run: () => Promise<unknown>) => {
    try {
      await run();
      return "OK";
    } catch (err) {
      return err instanceof TRPCError ? err.code : String(err);
    }
  };

  const cleanup = async () => {
    await db.delete(schema.order).where(like(schema.order.customerName, `${TAG}%`));
    await db.delete(schema.user).where(inArray(schema.user.id, [alice.id, bob.id]));
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    const { drizzle } = await import("drizzle-orm/node-postgres");
    schema = await import("#root/shared/database/drizzle/schema");
    db = drizzle(TEST_DB_URL!, { schema });
    ({ appRouter } = await import("#root/shared/trpc/router"));
    await cleanup();
    await db.insert(schema.user).values([
      { ...alice, role: "user" },
      { ...bob, role: "user" },
    ]);
    const [a] = await db.insert(schema.order).values(orderRow(alice)).returning({ id: schema.order.id });
    const [b] = await db.insert(schema.order).values(orderRow(bob)).returning({ id: schema.order.id });
    aliceOrderId = a!.id;
    bobOrderId = b!.id;
  });

  afterAll(async () => {
    await cleanup();
  });

  it("anonymous cannot list orders", async () => {
    expect(await codeOf(() => caller(undefined).order.view({}))).toBe("UNAUTHORIZED");
  });

  it("a customer sees only their own orders", async () => {
    const res = (await caller(session(alice, "user")).order.view({ limit: 100 })) as {
      success: boolean;
      result: { items: { id: string; customerEmail: string }[]; total: number };
    };
    expect(res.success).toBe(true);
    const ids = res.result.items.map((o) => o.id);
    expect(ids).toContain(aliceOrderId);
    expect(ids).not.toContain(bobOrderId);
    expect(res.result.items.every((o) => o.customerEmail === alice.email)).toBe(true);
    expect(res.result.total).toBe(1);
  });

  it("filters cannot widen a customer's scope", async () => {
    for (const input of [
      { limit: 100, status: "pending" as const },
      { limit: 100, dateFrom: "2000-01-01T00:00:00.000Z", dateTo: "2999-01-01T00:00:00.000Z" },
      { limit: 100, paymentIssueOnly: false },
      // Unknown keys (e.g. a forged userId) are stripped by the input schema.
      { limit: 100, userId: bob.id } as never,
    ]) {
      const res = (await caller(session(alice, "user")).order.view(input)) as {
        result: { items: { id: string }[] };
      };
      expect(res.result.items.map((o) => o.id)).not.toContain(bobOrderId);
    }
  });

  it("an admin sees every customer's orders", async () => {
    const res = (await caller(session({ id: `${TAG}admin`, email: `${TAG}admin@example.test`, name: "Admin" }, "admin")).order.view({
      limit: 100,
    })) as { result: { items: { id: string }[] } };
    const ids = res.result.items.map((o) => o.id);
    expect(ids).toEqual(expect.arrayContaining([aliceOrderId, bobOrderId]));
  });

  it("a customer cannot reach another customer's order through any by-id admin endpoint", async () => {
    const asAlice = caller(session(alice, "user"));
    expect(await codeOf(() => asAlice.order.activity({ orderId: bobOrderId } as never))).toBe("FORBIDDEN");
    expect(await codeOf(() => asAlice.order.edit({ orderId: bobOrderId } as never))).toBe("FORBIDDEN");
    expect(await codeOf(() => asAlice.order.updateStatus({ orderId: bobOrderId, status: "cancelled" } as never))).toBe(
      "FORBIDDEN",
    );
    expect(await codeOf(() => asAlice.order.delete({ orderId: bobOrderId } as never))).toBe("FORBIDDEN");
  });

  it("the public payment-status endpoint exposes no customer data", async () => {
    const res = (await caller(session(alice, "user")).payment.verify({ orderId: bobOrderId })) as {
      success: boolean;
      result: Record<string, unknown>;
    };
    expect(res.success).toBe(true);
    const keys = Object.keys(res.result).sort();
    // orderNumber is the order's own display reference (#10001) — shown on the
    // confirmation page that calls this endpoint — not customer data.
    expect(keys).toEqual(
      ["id", "orderNumber", "paymentMethod", "paymentSessionId", "paymentStatus", "paymentTransactionId", "status", "total"].sort(),
    );
    const serialized = JSON.stringify(res.result);
    expect(serialized).not.toContain(bob.email);
    expect(serialized).not.toContain("street");
    expect(serialized).not.toContain("+20100");
  });
});
