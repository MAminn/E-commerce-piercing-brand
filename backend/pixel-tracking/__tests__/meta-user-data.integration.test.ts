import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { eq, inArray, like } from "drizzle-orm";
import { v7 } from "uuid";

/**
 * Meta user_data against real Postgres:
 * - the read-only order lookup behind a Purchase (placed / pending / cancelled
 *   / unknown / malformed id), hashed before it leaves the lookup
 * - processTrackingBeacon end to end: tracking_event rows for PageViews (incl.
 *   client-navigation ones), the Meta CAPI body (Graph API call stubbed),
 *   and proof that neither raw nor hashed customer data is persisted
 * Skipped when TEST_DATABASE_URL is unset.
 */
const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = TEST_DB_URL ? describe : describe.skip;

const sha = (v: string) => createHash("sha256").update(v, "utf8").digest("hex");

describeIfDb("Meta user_data with real orders (integration)", () => {
  let db: ReturnType<typeof import("drizzle-orm/node-postgres").drizzle>;
  let schema: typeof import("#root/shared/database/drizzle/schema");
  let loadPurchaseMatch: typeof import("#root/backend/pixel-tracking/purchase-match").loadPurchaseMatch;
  let processTrackingBeacon: typeof import("#root/backend/pixel-tracking/delivery-pipeline").processTrackingBeacon;
  let purchaseEventId: typeof import("#root/frontend/tracking/purchase-event").purchaseEventId;

  const TAG = "meta-ud-it-";
  const EMAIL = "Meta.Ud.It@Example.com";
  const orderIds: string[] = [];
  let metaConfigId: string | null = null;
  let configSnapshot: Array<typeof import("#root/shared/database/drizzle/schema").pixelConfig.$inferSelect> = [];

  const insertOrder = async (over: Record<string, unknown> = {}) => {
    const id = v7();
    orderIds.push(id);
    await db.insert(schema.order).values({
      id,
      customerName: "Mona Hassan",
      customerEmail: EMAIL,
      customerPhone: "010 1234 5678",
      shippingAddress: "1 Test St",
      shippingCity: "Giza",
      shippingState: "Giza",
      shippingPostalCode: "12511",
      shippingCountry: "Egypt",
      subtotal: "250.00",
      shipping: "20.00",
      tax: "0.00",
      total: "270.00",
      ...over,
    } as never);
    return id;
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    const { drizzle } = await import("drizzle-orm/node-postgres");
    schema = await import("#root/shared/database/drizzle/schema");
    db = drizzle(TEST_DB_URL as string, { schema });
    ({ loadPurchaseMatch } = await import("#root/backend/pixel-tracking/purchase-match"));
    ({ processTrackingBeacon } = await import("#root/backend/pixel-tracking/delivery-pipeline"));
    ({ purchaseEventId } = await import("#root/frontend/tracking/purchase-event"));

    // Only this test's Meta row may be enabled server-side (restored afterAll).
    configSnapshot = await db.select().from(schema.pixelConfig);
    await db
      .update(schema.pixelConfig)
      .set({ enableServerSide: false })
      .where(eq(schema.pixelConfig.enableServerSide, true));
    const [existing] = await db.select().from(schema.pixelConfig).where(eq(schema.pixelConfig.platform, "meta"));
    if (existing) {
      metaConfigId = existing.id;
      await db
        .update(schema.pixelConfig)
        .set({ enabled: true, enableServerSide: true, pixelId: "1234567890", accessToken: "it-token" })
        .where(eq(schema.pixelConfig.id, existing.id));
    } else {
      metaConfigId = v7();
      await db.insert(schema.pixelConfig).values({
        id: metaConfigId,
        platform: "meta",
        pixelId: "1234567890",
        accessToken: "it-token",
        enabled: true,
        enableClientSide: true,
        enableServerSide: true,
      } as never);
    }
  });

  const cleanupEvents = async () => {
    const rows = await db
      .select({ id: schema.trackingEvent.id })
      .from(schema.trackingEvent)
      .where(like(schema.trackingEvent.eventId, `${TAG}%`));
    const purchaseRows = orderIds.length
      ? await db
          .select({ id: schema.trackingEvent.id })
          .from(schema.trackingEvent)
          .where(inArray(schema.trackingEvent.eventId, orderIds.map((id) => purchaseEventId(id))))
      : [];
    const ids = [...rows, ...purchaseRows].map((r) => r.id);
    if (ids.length > 0) {
      await db.delete(schema.trackingEventDelivery).where(inArray(schema.trackingEventDelivery.trackingEventId, ids));
      await db.delete(schema.trackingEvent).where(inArray(schema.trackingEvent.id, ids));
    }
  };

  beforeEach(cleanupEvents);

  afterAll(async () => {
    await cleanupEvents();
    if (orderIds.length > 0) await db.delete(schema.order).where(inArray(schema.order.id, orderIds));
    // Put pixel_config back exactly as found.
    const before = new Set(configSnapshot.map((c) => c.id));
    if (metaConfigId && !before.has(metaConfigId)) {
      await db.delete(schema.pixelConfig).where(eq(schema.pixelConfig.id, metaConfigId));
    }
    for (const row of configSnapshot) {
      await db.update(schema.pixelConfig).set(row).where(eq(schema.pixelConfig.id, row.id));
    }
  });

  describe("loadPurchaseMatch (read-only lookup by order id)", () => {
    it("placed COD order → hashed em / ph / fn / ln / ct / st / zp / country", async () => {
      const id = await insertOrder();
      const match = await loadPurchaseMatch(db as never, id);
      expect(match).toEqual({
        orderId: id,
        hashedUserData: {
          em: sha("meta.ud.it@example.com"),
          ph: sha("201012345678"),
          fn: sha("mona"),
          ln: sha("hassan"),
          ct: sha("giza"),
          st: sha("giza"),
          zp: sha("12511"),
          country: sha("eg"),
        },
      });
      expect(JSON.stringify(match)).not.toContain("Example.com");
    });

    it("paid online order → match; pending / failed payment, cancelled → none", async () => {
      expect(await loadPurchaseMatch(db as never, await insertOrder({ paymentMethod: "paymob", paymentStatus: "paid" }))).not.toBeNull();
      expect(await loadPurchaseMatch(db as never, await insertOrder({ paymentMethod: "paymob", paymentStatus: "pending" }))).toBeNull();
      expect(await loadPurchaseMatch(db as never, await insertOrder({ paymentMethod: "paymob", paymentStatus: "failed" }))).toBeNull();
      expect(await loadPurchaseMatch(db as never, await insertOrder({ status: "cancelled" }))).toBeNull();
    });

    it("older than 24 h, unknown id, malformed id → none (no query for a malformed id)", async () => {
      const old = await insertOrder({ createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) });
      expect(await loadPurchaseMatch(db as never, old)).toBeNull();
      expect(await loadPurchaseMatch(db as never, v7())).toBeNull();
      expect(await loadPurchaseMatch(db as never, "'; drop table order; --")).toBeNull();
      expect(await loadPurchaseMatch(db as never, undefined)).toBeNull();
    });
  });

  describe("processTrackingBeacon with Postgres", () => {
    const ctx = { ip: "203.0.113.9", ipHash: "h", userAgent: "UA-it", fbp: "fb.1.1.2", fbc: "fb.1.3.Click" };

    it("landing + client-navigation PageViews and a Purchase: rows stored, CAPI enriched, nothing hashed or raw persisted", async () => {
      const orderId = await insertOrder();
      const sent: Array<{ data: Array<Record<string, unknown>> }> = [];
      vi.stubGlobal(
        "fetch",
        vi.fn(async (_u: unknown, init?: { body?: unknown }) => {
          sent.push(JSON.parse(String(init?.body)));
          return new Response("{}", { status: 200 });
        }),
      );
      const now = Date.now();
      const base = { timestamp: now, sessionId: "Sess-IT-1" };
      await processTrackingBeacon(
        [
          { ...base, eventId: `${TAG}pv-landing`, eventName: "page_viewed", pageUrl: "https://shop.test/" },
          { ...base, eventId: `${TAG}pv-spa-shop`, eventName: "page_viewed", pageUrl: "https://shop.test/shop" },
          { ...base, eventId: `${TAG}pv-spa-cart`, eventName: "page_viewed", pageUrl: "https://shop.test/cart" },
          {
            ...base,
            eventId: purchaseEventId(orderId),
            eventName: "checkout_completed",
            pageUrl: `https://shop.test/order-confirmation?orderId=${orderId}`,
            ecommerce: { currency: "EGP", value: 270, transactionId: orderId },
          },
        ],
        ctx,
        db as never,
        { metaAdvancedMatching: true },
      );
      vi.unstubAllGlobals();

      // Internal stats: every PageView (client navigations included) is a row.
      const stored = await db
        .select()
        .from(schema.trackingEvent)
        .where(
          inArray(schema.trackingEvent.eventId, [
            `${TAG}pv-landing`,
            `${TAG}pv-spa-shop`,
            `${TAG}pv-spa-cart`,
            purchaseEventId(orderId),
          ]),
        );
      expect(stored).toHaveLength(4);
      expect(stored.filter((r) => r.eventName === "page_viewed")).toHaveLength(3);

      // Meta CAPI: one batch, 4 events, same ids; Purchase enriched from the order.
      expect(sent).toHaveLength(1);
      const events = sent[0]?.data ?? [];
      expect(events.map((e) => e.event_id)).toEqual([
        `${TAG}pv-landing`,
        `${TAG}pv-spa-shop`,
        `${TAG}pv-spa-cart`,
        purchaseEventId(orderId),
      ]);
      for (const e of events) expect((e.user_data as Record<string, unknown>).external_id).toBe(sha("sess-it-1"));
      expect(events[3]?.user_data).toMatchObject({ em: sha("meta.ud.it@example.com"), ph: sha("201012345678") });
      expect(events[0]?.user_data).not.toHaveProperty("em");

      // Persisted: no raw and no hashed customer data.
      const dump = JSON.stringify(stored);
      for (const needle of [EMAIL, EMAIL.toLowerCase(), "201012345678", sha("meta.ud.it@example.com"), sha("sess-it-1"), "metaUserData"]) {
        expect(dump.includes(needle), needle).toBe(false);
      }
      const deliveries = await db
        .select()
        .from(schema.trackingEventDelivery)
        .where(inArray(schema.trackingEventDelivery.trackingEventId, stored.map((r) => r.id)));
      expect(deliveries).toHaveLength(4);
      expect(deliveries.every((d) => d.sent === true && d.platform === "meta")).toBe(true);
      expect(JSON.stringify(deliveries)).not.toContain(EMAIL.toLowerCase());
    });

    it("the same Purchase beacon again (refresh / replay) → relayed as before, without customer data", async () => {
      const orderId = await insertOrder();
      const sent: Array<{ data: Array<Record<string, unknown>> }> = [];
      vi.stubGlobal(
        "fetch",
        vi.fn(async (_u: unknown, init?: { body?: unknown }) => {
          sent.push(JSON.parse(String(init?.body)));
          return new Response("{}", { status: 200 });
        }),
      );
      const purchase = {
        eventId: purchaseEventId(orderId),
        eventName: "checkout_completed",
        timestamp: Date.now(),
        pageUrl: "https://shop.test/order-confirmation",
        sessionId: "Sess-IT-2",
        ecommerce: { currency: "EGP", value: 270, transactionId: orderId },
      };
      await processTrackingBeacon([purchase], ctx, db as never, { metaAdvancedMatching: true });
      await processTrackingBeacon([purchase], ctx, db as never, { metaAdvancedMatching: true });
      vi.unstubAllGlobals();

      expect(sent).toHaveLength(2);
      expect(sent[0]?.data[0]?.user_data).toMatchObject({ em: sha("meta.ud.it@example.com") });
      expect(sent[1]?.data[0]?.event_id).toBe(purchaseEventId(orderId));
      expect(sent[1]?.data[0]?.user_data).not.toHaveProperty("em");
      const rows = await db.select().from(schema.trackingEvent).where(eq(schema.trackingEvent.eventId, purchaseEventId(orderId)));
      expect(rows).toHaveLength(1);
    });
  });
});
