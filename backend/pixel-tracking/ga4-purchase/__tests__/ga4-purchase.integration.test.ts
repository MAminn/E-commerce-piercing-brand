import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, inArray, like } from "drizzle-orm";
import { Effect } from "effect";
import { v7 } from "uuid";

/**
 * Server-owned GA4 purchase against real Postgres: orders created through the
 * real create-order service, payments confirmed through the real
 * applyOnlinePaymentUpdate (Paymob webhook + payment.verify path) and the
 * real admin editOrder, delivered by the real worker. Only the HTTP call to
 * Google is stubbed (injected fetch) — no real GA4 request is ever made.
 *
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

describeIfDb("GA4 server-owned purchase (integration)", () => {
  let db: ReturnType<typeof import("drizzle-orm/node-postgres").drizzle>;
  let schema: typeof import("#root/shared/database/drizzle/schema");
  let createOrderModule: typeof import("#root/backend/orders/create-order/service");
  let editOrderModule: typeof import("#root/backend/orders/edit-order/service");
  let payments: typeof import("#root/backend/payments/confirm-online-payment");
  let worker: typeof import("#root/backend/pixel-tracking/ga4-purchase/worker");
  let owner: typeof import("#root/shared/config/ga4-purchase-owner");
  let config: typeof import("#root/backend/pixel-tracking/ga4-purchase/config");
  let readiness: typeof import("#root/backend/pixel-tracking/ga4-purchase/readiness");
  let diagnostics: typeof import("#root/backend/pixel-tracking/ga4-purchase/diagnostics");
  let provideDatabase: typeof import("#root/shared/trpc/server").provideDatabase;
  let EmailService: typeof import("#root/shared/email/service").EmailService;

  const TAG = "ga4p-it-";
  const MEASUREMENT_ID = "G-ITTEST1234";
  const API_SECRET = "it-secret-do-not-log";
  const COOKIES = {
    _ga: "GA1.1.1111111111.1730000000",
    _ga_ITTEST1234: "GS2.1.s1731585600$o4$g1$t1731585700$j60$l0$h0",
    session_token: "must-not-be-read",
  };
  let fileId: string;
  let categoryId: string;
  let productIds: string[] = [];
  let configSnapshot: Array<typeof import("#root/shared/database/drizzle/schema").pixelConfig.$inferSelect> = [];

  const stubEmail = { sendEmail: () => Effect.succeed({ success: true }) };
  type Env =
    | import("#root/shared/database/drizzle/db").DatabaseClientService
    | import("#root/shared/email/service").EmailService;
  const run = <A, E>(effect: Effect.Effect<A, E, Env>) =>
    Effect.runPromise(effect.pipe(provideDatabase({ db: db as never }), Effect.provideService(EmailService, stubEmail as never)));

  // ── GA4 stub: records every request; never reaches Google ──────────────
  type Sent = { url: string; body: import("../payload").Ga4MpPurchaseBody };
  const okFetch = (sent: Sent[], status = 204, delayMs = 0) =>
    vi.fn(async (url: string, init: { body: string }) => {
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
      sent.push({ url, body: JSON.parse(init.body) });
      return { status, ok: status >= 200 && status < 300 };
    });

  const placeOrder = async (
    mode: "browser" | "shadow" | "server",
    over: { paymentMethod?: "cod" | "paymob" | "stripe"; cookies?: Record<string, string> } = {},
  ) => {
    owner.setEffectiveGa4PurchaseOwner(mode);
    const result = await run(
      createOrderModule.createOrder(
        createOrderModule.createOrderSchema.parse({
          customerName: "Ga4 Tester",
          customerEmail: `${TAG}${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`,
          customerPhone: "+201000000999",
          shippingAddress: "99 Secret Street",
          shippingCity: "Maadi",
          shippingState: "",
          shippingPostalCode: "",
          shippingCountry: "Egypt",
          shippingGovernorateCode: "CAI",
          items: [
            { productId: productIds[0], quantity: 2 },
            { productId: productIds[1], quantity: 1 },
          ],
          bundles: [],
          paymentMethod: over.paymentMethod ?? "cod",
        }),
        undefined,
        { cookies: (await import("../identifiers")).pickGa4PurchaseCookies(over.cookies ?? COOKIES) },
      ),
    );
    return result as unknown as { id: string; total: string; createdAt: Date; customerEmail: string; customerPhone: string; customerName: string };
  };

  const outboxOf = async (orderId: string) =>
    db.select().from(schema.ga4PurchaseOutbox).where(eq(schema.ga4PurchaseOutbox.orderId, orderId));
  const contextOf = async (orderId: string) =>
    db.select().from(schema.ga4PurchaseContext).where(eq(schema.ga4PurchaseContext.orderId, orderId));

  type FetchImpl = import("../transport").FetchLike;
  const tick = (mode: "shadow" | "server", fetchImpl: unknown, at?: Date, extra: Record<string, unknown> = {}) =>
    worker.runGa4PurchaseTick({
      db: db as never,
      owner: () => mode,
      fetchImpl: fetchImpl as FetchImpl,
      now: at ? () => at : undefined,
      ...extra,
    });

  const setGa4Config = async (values: Partial<typeof schema.pixelConfig.$inferInsert>) => {
    await db.update(schema.pixelConfig).set(values).where(eq(schema.pixelConfig.platform, "google_ga4"));
    config.clearGa4ServerConfigCache();
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    const { drizzle } = await import("drizzle-orm/node-postgres");
    schema = await import("#root/shared/database/drizzle/schema");
    db = drizzle(TEST_DB_URL as string, { schema });
    createOrderModule = await import("#root/backend/orders/create-order/service");
    editOrderModule = await import("#root/backend/orders/edit-order/service");
    payments = await import("#root/backend/payments/confirm-online-payment");
    worker = await import("#root/backend/pixel-tracking/ga4-purchase/worker");
    owner = await import("#root/shared/config/ga4-purchase-owner");
    config = await import("#root/backend/pixel-tracking/ga4-purchase/config");
    readiness = await import("#root/backend/pixel-tracking/ga4-purchase/readiness");
    diagnostics = await import("#root/backend/pixel-tracking/ga4-purchase/diagnostics");
    ({ provideDatabase } = await import("#root/shared/trpc/server"));
    ({ EmailService } = await import("#root/shared/email/service"));

    const storeOwner = (await import("#root/shared/config/store")).getStoreOwnerId();
    await db.insert(schema.vendor).values({ id: storeOwner, name: `${TAG}store`, status: "active" }).onConflictDoNothing();
    const [file] = await db.insert(schema.file).values({ diskname: `${TAG}img.webp` }).returning();
    fileId = file!.id;
    const [cat] = await db.insert(schema.category).values({ name: `${TAG}cat`, slug: `${TAG}cat`, type: "general" }).returning();
    categoryId = cat!.id;
    const rows = await db
      .insert(schema.product)
      .values(
        [150, 200].map((price, i) => ({
          name: `${TAG}piece-${i}`,
          description: "it",
          imageId: fileId,
          categoryId,
          price: price.toFixed(2),
          vendorId: storeOwner,
          stock: 10_000,
        })),
      )
      .returning({ id: schema.product.id });
    productIds = rows.map((r) => r.id);
    await db.insert(schema.storeSettings).values({ key: "default" }).onConflictDoNothing();
    await db
      .update(schema.storeSettings)
      .set({ shippingRules: { version: 1, mode: "zones", currency: "EGP", rates: { CAI: 70 }, fallbackFee: 90 }, shippingFee: "0.00" })
      .where(eq(schema.storeSettings.key, "default"));

    configSnapshot = await db.select().from(schema.pixelConfig);
    const [ga4] = await db.select().from(schema.pixelConfig).where(eq(schema.pixelConfig.platform, "google_ga4"));
    if (!ga4) {
      await db.insert(schema.pixelConfig).values({ platform: "google_ga4", pixelId: MEASUREMENT_ID } as never);
    }
  });

  beforeEach(async () => {
    await setGa4Config({ pixelId: MEASUREMENT_ID, accessToken: API_SECRET, enabled: true, consentRequired: false, consentCategory: null });
  });

  afterEach(() => {
    owner.setEffectiveGa4PurchaseOwner("browser");
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    owner.setEffectiveGa4PurchaseOwner("browser");
    await db.delete(schema.order).where(like(schema.order.customerEmail, `${TAG}%`));
    await db.delete(schema.pixelConfig).where(eq(schema.pixelConfig.platform, "google_ga4"));
    for (const row of configSnapshot.filter((c) => c.platform === "google_ga4")) {
      await db.insert(schema.pixelConfig).values(row);
    }
    await db.update(schema.storeSettings).set({ shippingRules: null }).where(eq(schema.storeSettings.key, "default"));
    await db.delete(schema.product).where(inArray(schema.product.id, productIds));
    await db.delete(schema.category).where(eq(schema.category.id, categoryId));
    await db.delete(schema.file).where(eq(schema.file.id, fileId));
  });

  // ── readiness ──────────────────────────────────────────────────────────
  it("migration 0069 is in place: readiness confirms tables + unique index", async () => {
    expect(await readiness.checkGa4PurchaseReadiness(db as never)).toEqual({ ready: true, missing: [] });
  });

  // ── browser mode = production today ────────────────────────────────────
  it("browser mode: order.create writes nothing GA4 and the worker sends nothing", async () => {
    const o = await placeOrder("browser");
    expect(await outboxOf(o.id)).toHaveLength(0);
    expect(await contextOf(o.id)).toHaveLength(0);
    const fetchImpl = vi.fn();
    const report = await worker.runGa4PurchaseTick({ db: db as never, owner: () => "browser", fetchImpl });
    expect(report.skipped).toBe("browser_mode");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  // ── COD ────────────────────────────────────────────────────────────────
  it("COD in server mode: GA4 ids + one pending row commit with the order", async () => {
    const o = await placeOrder("server");
    const [ctx] = await contextOf(o.id);
    expect(ctx).toMatchObject({ gaClientId: "1111111111.1730000000", gaSessionId: "1731585600", gaSessionNumber: 4 });
    const rows = await outboxOf(o.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ mode: "server", source: "order_create", status: "pending", attempts: 0 });
    expect(rows[0]!.eligibleAt.getTime()).toBe(new Date(o.createdAt).getTime());
  });

  it("the browser closed before confirmation: the worker still delivers the verified purchase, with no PII", async () => {
    const o = await placeOrder("server");
    const sent: Sent[] = [];
    const report = await tick("server", okFetch(sent));
    expect(report.sent).toBeGreaterThanOrEqual(1);
    const mine = sent.filter((s) => s.body.events[0].params.transaction_id === o.id);
    expect(mine).toHaveLength(1);
    expect(mine[0]!.url).toBe(`https://www.google-analytics.com/mp/collect?measurement_id=${MEASUREMENT_ID}&api_secret=${API_SECRET}`);
    expect(mine[0]!.body).toEqual({
      client_id: "1111111111.1730000000",
      timestamp_micros: new Date(o.createdAt).getTime() * 1000,
      events: [
        {
          name: "purchase",
          params: {
            transaction_id: o.id,
            value: Number(o.total),
            currency: "EGP",
            items: [
              { item_id: productIds[0], item_name: `${TAG}piece-0`, quantity: 2, price: 150 },
              { item_id: productIds[1], item_name: `${TAG}piece-1`, quantity: 1, price: 200 },
            ],
            session_id: "1731585600",
            engagement_time_msec: 1,
          },
        },
      ],
    });
    const [row] = await outboxOf(o.id);
    expect(row).toMatchObject({ status: "sent", attempts: 1, lastStatusCode: 204, lockedUntil: null });
    // No customer data anywhere GA4-side: request body, stored payload.
    const dump = JSON.stringify([mine[0]!.body, row!.payload]);
    for (const pii of [o.customerEmail, o.customerPhone, o.customerName, "99 Secret Street", "must-not-be-read"]) {
      expect(dump).not.toContain(pii);
    }
    // a second tick sends nothing more
    const again: Sent[] = [];
    await tick("server", okFetch(again));
    expect(again.filter((s) => s.body.events[0].params.transaction_id === o.id)).toHaveLength(0);
  });

  // ── online payments ────────────────────────────────────────────────────
  it("online payment: nothing at creation; one row when paid — even when the webhook lands after the 60 s poll window", async () => {
    const o = await placeOrder("server", { paymentMethod: "paymob" });
    expect(await outboxOf(o.id)).toHaveLength(0);
    expect(await contextOf(o.id)).toHaveLength(1); // ids kept for the later webhook (which has no cookies)

    await payments.applyOnlinePaymentUpdate(db as never, o.id, { paymentStatus: "processing" });
    expect(await outboxOf(o.id)).toHaveLength(0);

    // The browser stopped polling long ago; the webhook arrives now.
    await payments.applyOnlinePaymentUpdate(db as never, o.id, { paymentStatus: "paid", transactionId: "pm-1" });
    const rows = await outboxOf(o.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source: "payment_confirmed", status: "pending" });
    expect(rows[0]!.eligibleAt.getTime()).toBeGreaterThan(new Date(o.createdAt).getTime());

    const sent: Sent[] = [];
    await tick("server", okFetch(sent));
    const mine = sent.filter((s) => s.body.events[0].params.transaction_id === o.id);
    expect(mine).toHaveLength(1);
    expect(mine[0]!.body.client_id).toBe("1111111111.1730000000");
  });

  it("duplicate and concurrent payment callbacks produce exactly one purchase row", async () => {
    const o = await placeOrder("server", { paymentMethod: "paymob" });
    await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        payments.applyOnlinePaymentUpdate(db as never, o.id, { paymentStatus: "paid", transactionId: `pm-${i}` }),
      ),
    );
    await payments.applyOnlinePaymentUpdate(db as never, o.id, { paymentStatus: "paid", transactionId: "pm-late" });
    expect(await outboxOf(o.id)).toHaveLength(1);
    const logs = await db
      .select()
      .from(schema.orderLog)
      .where(and(eq(schema.orderLog.orderId, o.id), eq(schema.orderLog.action, "payment_confirmed")));
    expect(logs).toHaveLength(1); // the row lock serialises callbacks: one transition
  });

  it("a failed online payment never produces a purchase", async () => {
    const o = await placeOrder("server", { paymentMethod: "paymob" });
    await payments.applyOnlinePaymentUpdate(db as never, o.id, { paymentStatus: "failed" });
    expect(await outboxOf(o.id)).toHaveLength(0);
  });

  it("admin marks an online order paid → one row (admin_edit); editing a COD order adds none", async () => {
    const admin = { id: "a", token: "t", email: `${TAG}admin@example.test`, name: "A", phone: "", expiresAt: new Date(Date.now() + 3600e3), role: "admin" } as const;
    const online = await placeOrder("server", { paymentMethod: "paymob" });
    await run(editOrderModule.editOrder(editOrderModule.editOrderSchema.parse({ orderId: online.id, paymentStatus: "paid" }), admin as never));
    expect((await outboxOf(online.id)).map((r) => r.source)).toEqual(["admin_edit"]);
    await run(editOrderModule.editOrder(editOrderModule.editOrderSchema.parse({ orderId: online.id, notes: "again" }), admin as never));
    expect(await outboxOf(online.id)).toHaveLength(1);

    const cod = await placeOrder("browser"); // placed while the browser owned purchase
    owner.setEffectiveGa4PurchaseOwner("server");
    await run(editOrderModule.editOrder(editOrderModule.editOrderSchema.parse({ orderId: cod.id, paymentStatus: "paid", status: "delivered" }), admin as never));
    expect(await outboxOf(cod.id)).toHaveLength(0);
  });

  // ── retries, crashes, concurrency ──────────────────────────────────────
  it("worker crash mid-send: the row is reclaimed after its lease and delivered (counted ambiguous)", async () => {
    const o = await placeOrder("server");
    const now = new Date();
    // As if a worker claimed it and the process died before recording the outcome.
    await db
      .update(schema.ga4PurchaseOutbox)
      .set({ status: "sending", claimToken: v7(), lockedUntil: new Date(now.getTime() + 30_000), attempts: 1 })
      .where(eq(schema.ga4PurchaseOutbox.orderId, o.id));
    const early: Sent[] = [];
    await tick("server", okFetch(early), now);
    expect(early.filter((s) => s.body.events[0].params.transaction_id === o.id)).toHaveLength(0); // lease still held

    const sent: Sent[] = [];
    await tick("server", okFetch(sent), new Date(now.getTime() + 61_000)); // restarted process, lease expired
    expect(sent.filter((s) => s.body.events[0].params.transaction_id === o.id)).toHaveLength(1);
    const [row] = await outboxOf(o.id);
    expect(row).toMatchObject({ status: "sent", attempts: 2, ambiguousAttempts: 1 });
  });

  it("network timeout: retried with backoff, resending the identical frozen body", async () => {
    const o = await placeOrder("server");
    const t0 = new Date();
    const hang = vi.fn(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(new Error("aborted")))),
    );
    const r1 = await tick("server", hang, t0, { timeoutMs: 30 });
    expect(r1.ambiguous).toBeGreaterThanOrEqual(1);
    let [row] = await outboxOf(o.id);
    expect(row).toMatchObject({ status: "pending", attempts: 1, ambiguousAttempts: 1, lastError: "timeout" });
    expect(row!.nextAttemptAt.getTime()).toBe(t0.getTime() + 30_000);
    const frozen = row!.payload;

    const tooEarly: Sent[] = [];
    await tick("server", okFetch(tooEarly), new Date(t0.getTime() + 10_000));
    expect(tooEarly.filter((s) => s.body.events[0].params.transaction_id === o.id)).toHaveLength(0);

    const sent: Sent[] = [];
    await tick("server", okFetch(sent), new Date(t0.getTime() + 31_000));
    const mine = sent.filter((s) => s.body.events[0].params.transaction_id === o.id);
    expect(mine).toHaveLength(1);
    expect(mine[0]!.body).toEqual(frozen);
    [row] = await outboxOf(o.id);
    expect(row).toMatchObject({ status: "sent", attempts: 2, ambiguousAttempts: 1 });
  });

  it("5xx is retried with backoff and stops after MAX_ATTEMPTS; 4xx fails at once", async () => {
    const a = await placeOrder("server");
    const t0 = new Date();
    await tick("server", okFetch([], 503), t0);
    let [row] = await outboxOf(a.id);
    expect(row).toMatchObject({ status: "pending", attempts: 1, lastStatusCode: 503, lastError: "http_503" });
    await db.update(schema.ga4PurchaseOutbox).set({ attempts: worker.MAX_ATTEMPTS - 1, nextAttemptAt: t0 }).where(eq(schema.ga4PurchaseOutbox.orderId, a.id));
    await tick("server", okFetch([], 503), new Date(t0.getTime() + 1000));
    [row] = await outboxOf(a.id);
    expect(row).toMatchObject({ status: "failed", attempts: worker.MAX_ATTEMPTS, lastError: "attempts_exhausted:http_503" });

    const b = await placeOrder("server");
    await tick("server", okFetch([], 400));
    [row] = await outboxOf(b.id);
    expect(row).toMatchObject({ status: "failed", attempts: 1, lastStatusCode: 400, lastError: "http_400" });
    const later: Sent[] = [];
    await tick("server", okFetch(later), new Date(Date.now() + 24 * 3600e3));
    expect(later.filter((s) => s.body.events[0].params.transaction_id === b.id)).toHaveLength(0);
  });

  it("concurrent workers never send the same order twice", async () => {
    const orders: Array<{ id: string }> = [];
    for (let i = 0; i < 8; i++) orders.push(await placeOrder("server"));
    const sent: Sent[] = [];
    const fetchImpl = okFetch(sent, 204, 25);
    await Promise.all([1, 2, 3, 4].map(() => tick("server", fetchImpl, undefined, { batchSize: 3 })));
    await Promise.all([1, 2, 3, 4].map(() => tick("server", fetchImpl, undefined, { batchSize: 3 })));
    const ids = sent.map((s) => s.body.events[0].params.transaction_id).filter((id: string) => orders.some((o) => o.id === id));
    expect(ids.sort()).toEqual(orders.map((o) => o.id).sort());
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("a worker that outlived its lease cannot overwrite the newer claim's outcome", async () => {
    const o = await placeOrder("server");
    const t0 = new Date();
    const slowSent: Sent[] = [];
    const slow = tick("server", okFetch(slowSent, 503, 150), t0, { leaseMs: 1 });
    await new Promise((r) => setTimeout(r, 30));
    const fastSent: Sent[] = [];
    const fast = await tick("server", okFetch(fastSent), new Date(t0.getTime() + 5_000));
    const slowReport = await slow;
    expect(fastSent.filter((s) => s.body.events[0].params.transaction_id === o.id)).toHaveLength(1);
    expect(slowReport.lostLease).toBeGreaterThanOrEqual(1);
    expect(fast.sent).toBeGreaterThanOrEqual(1);
    const [row] = await outboxOf(o.id);
    expect(row).toMatchObject({ status: "sent" }); // not overwritten by the slow 503
  });

  // ── attribution / consent policy ───────────────────────────────────────
  it("no GA4 cookie: held as missing_client_id, nothing sent, visible in diagnostics", async () => {
    const o = await placeOrder("server", { cookies: {} });
    const [ctx] = await contextOf(o.id);
    expect(ctx).toMatchObject({ gaClientId: null, gaSessionId: null });
    const sent: Sent[] = [];
    await tick("server", okFetch(sent));
    expect(sent.filter((s) => s.body.events[0].params.transaction_id === o.id)).toHaveLength(0);
    const [row] = await outboxOf(o.id);
    expect(row).toMatchObject({ status: "held", heldReason: "missing_client_id", attempts: 0 });
    const d = await diagnostics.getGa4PurchaseDiagnostics(db as never, 1);
    expect(d.attribution.missingClientId).toBeGreaterThanOrEqual(1);
    expect(d.recentProblems.some((p) => p.orderId === o.id && p.heldReason === "missing_client_id")).toBe(true);
  });

  it("consent required by the GA4 row: no / denied consent is held, granted consent is sent", async () => {
    await setGa4Config({ consentRequired: true, consentCategory: "analytics" });
    const future = Date.now() + 3600e3;
    const denied = await placeOrder("server", { cookies: { ...COOKIES, _tracking_consent: JSON.stringify({ g: 1, a: 0, m: 0, ex: future }) } });
    const unknown = await placeOrder("server");
    const granted = await placeOrder("server", { cookies: { ...COOKIES, _tracking_consent: JSON.stringify({ g: 1, a: 1, m: 0, ex: future }) } });
    const sent: Sent[] = [];
    await tick("server", okFetch(sent));
    const sentIds = sent.map((s) => s.body.events[0].params.transaction_id);
    expect(sentIds).toContain(granted.id);
    expect(sentIds).not.toContain(denied.id);
    expect(sentIds).not.toContain(unknown.id);
    expect((await outboxOf(denied.id))[0]).toMatchObject({ status: "held", heldReason: "consent_not_granted" });
    expect((await outboxOf(unknown.id))[0]).toMatchObject({ status: "held", heldReason: "consent_not_granted" });
    const grantedBody = sent.find((s) => s.body.events[0].params.transaction_id === granted.id)!.body;
    expect(grantedBody.consent).toEqual({ ad_user_data: "DENIED", ad_personalization: "DENIED" });
  });

  // ── shadow ─────────────────────────────────────────────────────────────
  it("shadow mode: candidates recorded and prepared, ZERO requests to GA4 — and never sent after switching to server", async () => {
    const o = await placeOrder("shadow");
    expect((await outboxOf(o.id))[0]).toMatchObject({ mode: "shadow", status: "shadow" });
    const fetchImpl = vi.fn();
    const report = await tick("shadow", fetchImpl);
    expect(report.prepared).toBeGreaterThanOrEqual(1);
    expect(fetchImpl).not.toHaveBeenCalled();
    const [row] = await outboxOf(o.id);
    expect(row!.preparedAt).not.toBeNull();
    expect((row!.payload as Sent["body"]).events[0].params.transaction_id).toBe(o.id);

    // The browser already sent this one; server mode must not send it again.
    const sent: Sent[] = [];
    await tick("server", okFetch(sent));
    expect(sent.filter((s) => s.body.events[0].params.transaction_id === o.id)).toHaveLength(0);
    expect((await outboxOf(o.id))[0]!.status).toBe("shadow");
  });

  it("shadow diagnostics: candidates with vs without a browser purchase beacon; gap orders listed", async () => {
    const seen = await placeOrder("shadow");
    const missed = await placeOrder("shadow");
    await db.insert(schema.trackingEvent).values({
      sessionId: `${TAG}s`,
      eventName: "checkout_completed",
      eventId: `purchase-${seen.id}`,
      eventData: {},
      pageUrl: "https://shop.test/order-confirmation",
    } as never);
    // An eligible COD order whose row is missing (as if its enqueue had failed).
    const gap = await placeOrder("browser");
    const d = await diagnostics.getGa4PurchaseDiagnostics(db as never, 1);
    expect(d.shadowCoverage.candidates).toBeGreaterThanOrEqual(2);
    expect(d.shadowCoverage.withoutBrowserBeacon).toBeGreaterThanOrEqual(1);
    expect(d.gapOrders.map((g) => g.orderId)).toContain(gap.id);
    expect(d.gapOrders.map((g) => g.orderId)).not.toContain(missed.id);
    expect(JSON.stringify(d)).not.toContain(seen.customerEmail);
    await db.delete(schema.trackingEvent).where(eq(schema.trackingEvent.eventId, `purchase-${seen.id}`));
  });

  // ── misconfiguration / expiry ──────────────────────────────────────────
  it("server mode without an API secret claims nothing and burns no attempts", async () => {
    const o = await placeOrder("server");
    await setGa4Config({ accessToken: null });
    const fetchImpl = vi.fn();
    expect((await tick("server", fetchImpl)).skipped).toBe("no_api_secret");
    expect(fetchImpl).not.toHaveBeenCalled();
    expect((await outboxOf(o.id))[0]).toMatchObject({ status: "pending", attempts: 0 });
  });

  it("a row older than GA4's 72 h window is failed, not sent", async () => {
    const o = await placeOrder("server");
    const sent: Sent[] = [];
    await tick("server", okFetch(sent), new Date(new Date(o.createdAt).getTime() + 72 * 3600e3));
    expect(sent.filter((s) => s.body.events[0].params.transaction_id === o.id)).toHaveLength(0);
    expect((await outboxOf(o.id))[0]).toMatchObject({ status: "failed", lastError: "expired_72h", attempts: 0 });
  });

  // ── Meta regression guard ──────────────────────────────────────────────
  it("server mode leaves the /api/track pipeline untouched: no GA4 request from the beacon (legacy mirror off)", async () => {
    const o = await placeOrder("server");
    await setGa4Config({ enableServerSide: true }); // even with the legacy toggle on
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(String(url));
        return new Response("{}", { status: 200 });
      }),
    );
    const { processTrackingBeacon } = await import("#root/backend/pixel-tracking/delivery-pipeline");
    await processTrackingBeacon(
      [
        {
          eventId: `purchase-${o.id}`,
          eventName: "checkout_completed",
          timestamp: Date.now(),
          pageUrl: "https://shop.test/order-confirmation",
          sessionId: `${TAG}beacon`,
          ecommerce: { currency: "EGP", value: Number(o.total), transactionId: o.id },
        },
      ] as never,
      { ip: "127.0.0.1", ipHash: "h", userAgent: "it", referrer: "" } as never,
      db as never,
      { metaAdvancedMatching: true },
    );
    expect(calls.some((u) => u.includes("google-analytics.com"))).toBe(false);
    await setGa4Config({ enableServerSide: false });
    await db.delete(schema.trackingEvent).where(eq(schema.trackingEvent.eventId, `purchase-${o.id}`));
  });
});
