import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { v7 } from "uuid";

/**
 * 2026-11-15 tracking hardening against real Postgres:
 * - cookie-presence diagnostics: visits (≥ 30 min split), ok / lost /
 *   intermittent / never, presence only; held-purchase section with real
 *   held outbox rows
 * - GA4 shadow diagnostics gap baseline, default wiring through
 *   effectiveGa4PurchaseOwnerSince()
 *
 * ISOLATION: every query runs in a private schema created for this file
 * (tables copied with LIKE … INCLUDING ALL, connection search_path set to
 * it), dropped afterwards. Nothing is written to, deleted from or locked in
 * the shared public tables, so counts are exact and parallel test files are
 * unaffected. Skipped when TEST_DATABASE_URL is unset.
 */
const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = TEST_DB_URL ? describe : describe.skip;

describeIfDb("tracking hardening 2026-11-15 (integration, isolated schema)", () => {
  type Pool = import("pg").Pool;
  let admin: Pool;
  let pool: Pool;
  let poolNoOutbox: Pool;
  let db: ReturnType<typeof import("drizzle-orm/node-postgres").drizzle>;
  let dbNoOutbox: ReturnType<typeof import("drizzle-orm/node-postgres").drizzle>;
  let schema: typeof import("#root/shared/database/drizzle/schema");
  let health: typeof import("#root/backend/pixel-tracking/cookie-health");
  let diagnostics: typeof import("#root/backend/pixel-tracking/ga4-purchase/diagnostics");
  let owner: typeof import("#root/shared/config/ga4-purchase-owner");

  const SUFFIX = randomBytes(4).toString("hex");
  const S = `trkh_${SUFFIX}`;
  const S2 = `trkh_noobx_${SUFFIX}`;
  const IOS_FB = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22B83 [FBAN/FBIOS;FBAV/490.0]";
  const ANDROID_IG = "Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36 Instagram 350.0";
  const DESKTOP = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0";
  const SECRET_GA = "GA1.1.999888777.1731600000";
  const now = Date.now();
  const minsAgo = (m: number) => new Date(now - m * 60_000);

  type Beacon = { at: number; ga?: boolean; fbc?: boolean; fbp?: boolean; events?: number };
  /** One row per event; events of one beacon share created_at and cookies. */
  const insertSession = async (target: typeof db, sessionId: string, ua: string, beacons: Beacon[]) => {
    const rows = beacons.flatMap((b, bi) =>
      Array.from({ length: b.events ?? 1 }, (_, ei) => ({
        id: v7(),
        sessionId,
        eventName: "page_viewed",
        eventId: `${sessionId}-${bi}-${ei}`,
        eventData: {
          serverContext: {
            ip: "203.0.113.9",
            userAgent: ua,
            ...(b.ga ? { ga: SECRET_GA } : {}),
            ...(b.fbc ? { fbc: "fb.1.1.SECRETFBC" } : {}),
            ...(b.fbp ? { fbp: "fb.1.1.SECRETFBP" } : {}),
          },
        },
        pageUrl: "https://perce-eg.com/shop",
        userAgent: ua,
        createdAt: minsAgo(b.at),
      })),
    );
    await target.insert(schema.trackingEvent).values(rows as never);
  };

  const insertOrder = async (createdAt: Date) => {
    const id = v7();
    await db.insert(schema.order).values({
      id,
      customerName: "Isolated Test",
      customerEmail: "isolated.test@example.com",
      customerPhone: "01000000000",
      shippingAddress: "1 St",
      shippingCity: "Cairo",
      shippingState: "Cairo",
      shippingPostalCode: "11511",
      shippingCountry: "Egypt",
      subtotal: "100.00",
      shipping: "0.00",
      tax: "0.00",
      total: "100.00",
      createdAt,
    } as never);
    return id;
  };

  const insertOutbox = async (orderId: string, status: string, heldReason: string | null, createdAt = new Date()) => {
    await db.insert(schema.ga4PurchaseOutbox).values({
      orderId,
      mode: "shadow",
      source: "order_create",
      status,
      heldReason,
      eligibleAt: createdAt,
      createdAt,
    } as never);
  };

  beforeAll(async () => {
    const pg = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    schema = await import("#root/shared/database/drizzle/schema");
    admin = new pg.default.Pool({ connectionString: TEST_DB_URL, max: 1 });
    await admin.query(`CREATE SCHEMA ${S}`);
    await admin.query(`CREATE SCHEMA ${S2}`);
    for (const table of ["order", "tracking_event", "ga4_purchase_outbox", "ga4_purchase_context"]) {
      await admin.query(`CREATE TABLE ${S}."${table}" (LIKE public."${table}" INCLUDING ALL)`);
    }
    await admin.query(`CREATE TABLE ${S2}."tracking_event" (LIKE public."tracking_event" INCLUDING ALL)`);
    pool = new pg.default.Pool({ connectionString: TEST_DB_URL, max: 2, options: `-c search_path=${S}` });
    poolNoOutbox = new pg.default.Pool({ connectionString: TEST_DB_URL, max: 1, options: `-c search_path=${S2}` });
    db = drizzle(pool, { schema });
    dbNoOutbox = drizzle(poolNoOutbox, { schema });
    process.env.DATABASE_URL = TEST_DB_URL;
    health = await import("#root/backend/pixel-tracking/cookie-health");
    diagnostics = await import("#root/backend/pixel-tracking/ga4-purchase/diagnostics");
    owner = await import("#root/shared/config/ga4-purchase-owner");
  });

  afterEach(() => owner?.setEffectiveGa4PurchaseOwner("browser"));

  afterAll(async () => {
    await pool?.end();
    await poolNoOutbox?.end();
    await admin?.query(`DROP SCHEMA IF EXISTS ${S} CASCADE`);
    await admin?.query(`DROP SCHEMA IF EXISTS ${S2} CASCADE`);
    await admin?.end();
  });

  it("isolation: the connection really resolves to the private schema", async () => {
    const r = await pool.query("SELECT current_schema() AS s");
    expect(r.rows[0].s).toBe(S);
  });

  it("cookie health: visits split at ≥ 30 min; ok / lost / intermittent / never; presence only", async () => {
    // iOS Facebook in-app
    await insertSession(db, "s-ok", IOS_FB, [{ at: 50, ga: true, fbp: true }, { at: 49, ga: true, fbp: true }, { at: 48, ga: true, fbp: true }]);
    await insertSession(db, "s-lost", IOS_FB, [{ at: 50, ga: true, fbc: true }, { at: 49, ga: true, fbc: true }, { at: 48 }, { at: 47 }]);
    await insertSession(db, "s-inter", IOS_FB, [{ at: 50, ga: true }, { at: 49 }, { at: 48, ga: true }]);
    await insertSession(db, "s-never", IOS_FB, [{ at: 50 }, { at: 49 }]);
    // _ga set only after the first beacon → ok, not lost
    await insertSession(db, "s-late", IOS_FB, [{ at: 50 }, { at: 49, ga: true }, { at: 48, ga: true }]);
    // Two visits 2 h apart: first ok; second never — NOT "lost"
    await insertSession(db, "s-split", IOS_FB, [{ at: 200, ga: true }, { at: 199, ga: true }, { at: 60 }, { at: 59 }]);
    // Several events in one beacon count once: P(3 events), A → lost
    await insertSession(db, "s-multi", IOS_FB, [{ at: 40, ga: true, events: 3 }, { at: 39 }]);
    // A one-beacon visit is below minBeaconsPerVisit = 2 → excluded
    await insertSession(db, "s-single", IOS_FB, [{ at: 30, ga: true }]);
    // P A P A → intermittent (it came back at least once)
    await insertSession(db, "s-papa", IOS_FB, [{ at: 20, ga: true }, { at: 19 }, { at: 18, ga: true }, { at: 17 }]);
    // Android Instagram in-app: one healthy visit
    await insertSession(db, "s-android", ANDROID_IG, [{ at: 50, ga: true, fbc: true, fbp: true }, { at: 49, ga: true, fbc: true, fbp: true }]);

    const report = await health.getCookieHealth(db as never, 3, 2);
    expect(report).toMatchObject({ windowDays: 3, minBeaconsPerVisit: 2, visitGapMinutes: 30 });
    const ios = report.buckets.find((b) => b.app === "facebook_inapp" && b.os === "ios")!;
    const android = report.buckets.find((b) => b.app === "instagram_inapp" && b.os === "android")!;

    // visits: ok, lost, inter, never, late, split×2, multi, papa = 9 (single excluded)
    expect(ios.visits).toBe(9);
    expect(ios.cookies.ga).toEqual({ ok: 3, lost: 2, intermittent: 2, never: 2 });
    expect(ios.cookies.fbc).toEqual({ ok: 0, lost: 1, intermittent: 0, never: 8 });
    expect(ios.cookies.fbp).toEqual({ ok: 1, lost: 0, intermittent: 0, never: 8 });
    expect(android.visits).toBe(1);
    expect(android.cookies.ga).toEqual({ ok: 1, lost: 0, intermittent: 0, never: 0 });

    const json = JSON.stringify(report);
    for (const secret of [SECRET_GA, "SECRETFBC", "SECRETFBP", "203.0.113.9", "FBIOS", "Instagram 350", "s-ok"]) {
      expect(json).not.toContain(secret);
    }
  });

  it("cookie health: window is capped at 7 days", async () => {
    const report = await health.getCookieHealth(db as never, 30, 2);
    expect(report.windowDays).toBe(7);
  });

  it("held purchases: real held outbox rows, with / without _ga on the purchase beacon, and without a beacon", async () => {
    const withGa = await insertOrder(minsAgo(30));
    const withoutGa = await insertOrder(minsAgo(30));
    const noBeacon = await insertOrder(minsAgo(30));
    const consent = await insertOrder(minsAgo(30));
    const shadowOk = await insertOrder(minsAgo(30));
    await insertOutbox(withGa, "held", "missing_client_id");
    await insertOutbox(withoutGa, "held", "missing_client_id");
    await insertOutbox(noBeacon, "held", "missing_client_id");
    await insertOutbox(consent, "held", "consent_not_granted");
    await insertOutbox(shadowOk, "shadow", null);
    // Purchase beacons (single-beacon sessions → not counted as visits)
    const beacon = async (orderId: string, ga: boolean) =>
      db.insert(schema.trackingEvent).values({
        id: v7(),
        sessionId: `buy-${orderId}`,
        eventName: "checkout_completed",
        eventId: `purchase-${orderId}`,
        eventData: { serverContext: { ip: "203.0.113.9", ...(ga ? { ga: SECRET_GA } : {}) } },
        pageUrl: "https://perce-eg.com/order-confirmation",
        userAgent: DESKTOP,
      } as never);
    await beacon(withGa, true);
    await beacon(withoutGa, false);

    const report = await health.getCookieHealth(db as never, 3, 2);
    expect(report.heldPurchases).toEqual({ held: 3, beaconWithGa: 1, beaconWithoutGa: 1, noBeacon: 1 });
    expect(JSON.stringify(report)).not.toContain(SECRET_GA);
  });

  it("held purchases: null when the GA4 outbox table does not exist", async () => {
    await insertSession(dbNoOutbox, "n-1", IOS_FB, [{ at: 10, ga: true }, { at: 9 }]);
    const report = await health.getCookieHealth(dbNoOutbox as never, 3, 2);
    expect(report.heldPurchases).toBeNull();
    expect(report.buckets[0]?.cookies.ga.lost).toBe(1);
  });

  describe("GA4 diagnostics gap baseline (default wiring, no opts)", () => {
    it("empty outbox: pre-activation orders are not gaps; post-activation orders without a row are", async () => {
      await db.execute((await import("drizzle-orm")).sql`DELETE FROM ga4_purchase_outbox`); // private schema only
      const preActivation = await insertOrder(minsAgo(60));
      const postActivation = await insertOrder(minsAgo(1));
      owner.setEffectiveGa4PurchaseOwner("shadow", minsAgo(5));
      const d = await diagnostics.getGa4PurchaseDiagnostics(db as never, 7);
      const ids = d.gapOrders.map((g) => g.orderId);
      expect(ids).not.toContain(preActivation);
      expect(ids).toContain(postActivation);
    });

    it("a first outbox row OLDER than this process's start pins the baseline (the earlier of the two wins)", async () => {
      const early = await insertOrder(minsAgo(240));
      await insertOutbox(early, "shadow", null, minsAgo(180));
      const afterFirstRow = await insertOrder(minsAgo(120)); // before the process start below, after the first row
      owner.setEffectiveGa4PurchaseOwner("shadow", minsAgo(5));
      const d = await diagnostics.getGa4PurchaseDiagnostics(db as never, 7);
      expect(d.gapOrders.map((g) => g.orderId)).toContain(afterFirstRow);
      expect(d.gapOrders.map((g) => g.orderId)).not.toContain(early);
    });
  });
});
