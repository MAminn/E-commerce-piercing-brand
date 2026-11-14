import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, like } from "drizzle-orm";
import { Effect } from "effect";
import { v7 } from "uuid";

/**
 * The Stripe webhook is the one payment path that updates the order itself
 * (not through applyOnlinePaymentUpdate). Driven through the real Fastify
 * plugin; only Stripe's signature check is stubbed. Server mode: one GA4
 * purchase row on the first `checkout.session.completed`, none on replays.
 * Skipped when TEST_DATABASE_URL is unset.
 */
const TEST_DB_URL = process.env.TEST_DATABASE_URL;

// Order emails are not under test here. Queuing them for every order this
// file creates would flood the shared test database's email queue while
// other integration files run in parallel (order-emails claims ≤ 100 rows).
vi.mock("#root/backend/orders/order-emails/service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("#root/backend/orders/order-emails/service")>()),
  queueOrderPlacedEmails: async () => {},
}));
const describeIfDb = TEST_DB_URL ? describe : describe.skip;

const stripeEvent = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("#root/backend/payments/stripe-service", () => ({
  verifyStripeWebhook: () => Effect.succeed(stripeEvent.current),
}));

describeIfDb("Stripe webhook → GA4 purchase outbox (integration)", () => {
  let db: ReturnType<typeof import("drizzle-orm/node-postgres").drizzle>;
  let schema: typeof import("#root/shared/database/drizzle/schema");
  let app: import("fastify").FastifyInstance;
  let owner: typeof import("#root/shared/config/ga4-purchase-owner");
  const TAG = "ga4p-stripe-it-";

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    process.env.STRIPE_SECRET_KEY = "sk_test_it";
    const { drizzle } = await import("drizzle-orm/node-postgres");
    schema = await import("#root/shared/database/drizzle/schema");
    db = drizzle(TEST_DB_URL as string, { schema });
    owner = await import("#root/shared/config/ga4-purchase-owner");
    const Fastify = (await import("fastify")).default;
    const { stripeWebhookPlugin } = await import("#root/backend/payments/stripe-webhook");
    app = Fastify();
    app.decorateRequest("db", null as never);
    app.addHook("onRequest", async (req) => {
      (req as unknown as { db: unknown }).db = db;
    });
    await app.register(stripeWebhookPlugin, { prefix: "/api/webhooks/stripe" });
    await app.ready();
  });

  afterAll(async () => {
    owner.setEffectiveGa4PurchaseOwner("browser");
    process.env.STRIPE_SECRET_KEY = "";
    await db.delete(schema.order).where(like(schema.order.customerEmail, `${TAG}%`));
    await app.close();
  });

  const insertStripeOrder = async (paymentMethod: "stripe" | "cod" = "stripe") => {
    const id = v7();
    await db.insert(schema.order).values({
      id,
      customerName: "Stripe Tester",
      customerEmail: `${TAG}${id}@example.test`,
      customerPhone: "+201000000111",
      shippingAddress: "1 Test St",
      shippingCity: "Giza",
      shippingState: "Giza",
      shippingPostalCode: "12511",
      shippingCountry: "Egypt",
      subtotal: "250.00",
      shipping: "20.00",
      tax: "0.00",
      total: "270.00",
      paymentMethod,
      paymentStatus: paymentMethod === "cod" ? "not_required" : "pending",
    } as never);
    return id;
  };

  const deliver = (orderId: string) => {
    stripeEvent.current = {
      type: "checkout.session.completed",
      data: { object: { metadata: { orderId }, payment_status: "paid", payment_intent: `pi_${orderId.slice(0, 8)}` } },
    };
    return app.inject({
      method: "POST",
      url: "/api/webhooks/stripe",
      headers: { "content-type": "application/json", "stripe-signature": "t=1,v1=stub" },
      payload: "{}",
    });
  };

  const rowsFor = (orderId: string) =>
    db.select().from(schema.ga4PurchaseOutbox).where(eq(schema.ga4PurchaseOutbox.orderId, orderId));

  it("first completion enqueues one purchase (stripe_webhook); replays add none", async () => {
    owner.setEffectiveGa4PurchaseOwner("server");
    const id = await insertStripeOrder();
    expect((await deliver(id)).statusCode).toBe(200);
    expect((await deliver(id)).statusCode).toBe(200);
    const rows = await rowsFor(id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source: "stripe_webhook", status: "pending", mode: "server" });
    const [o] = await db.select().from(schema.order).where(eq(schema.order.id, id));
    expect(o).toMatchObject({ paymentStatus: "paid", status: "processing" });
  });

  it("browser mode: the webhook behaves exactly as before and writes no GA4 row", async () => {
    owner.setEffectiveGa4PurchaseOwner("browser");
    const id = await insertStripeOrder();
    expect((await deliver(id)).statusCode).toBe(200);
    expect(await rowsFor(id)).toHaveLength(0);
    const [o] = await db.select().from(schema.order).where(eq(schema.order.id, id));
    expect(o).toMatchObject({ paymentStatus: "paid", status: "processing" });
  });
});
