import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { inArray, like } from "drizzle-orm";
import { Effect } from "effect";
import { v7 } from "uuid";

/**
 * A2 — with TRACKING_EXCLUDE_INTERNAL the event stats, the analytics
 * breakdown and the platform-health (readiness) counts skip tracking_event
 * rows recorded on /dashboard* pages; without the flag they count exactly
 * what they counted before. Real Postgres, because the rule is a `~*` regex.
 * Skipped when TEST_DATABASE_URL is unset.
 */
const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = TEST_DB_URL ? describe : describe.skip;

describeIfDb("dashboard rows excluded from tracking stats (integration)", () => {
  let db: ReturnType<typeof import("drizzle-orm/node-postgres").drizzle>;
  let schema: typeof import("#root/shared/database/drizzle/schema");
  let deliveryService: typeof import("#root/backend/pixel-tracking/event-delivery/service");
  let analytics: typeof import("#root/backend/analytics/service");
  let provideDatabase: typeof import("#root/shared/trpc/server").provideDatabase;

  const TAG = "a2-it-";
  const prev = process.env.TRACKING_EXCLUDE_INTERNAL;

  const run = <A, E>(
    effect: Effect.Effect<A, E, import("#root/shared/database/drizzle/db").DatabaseClientService>,
  ) => Effect.runPromise(effect.pipe(provideDatabase({ db: db as never })));

  const URLS = [
    "https://shop.test/dashboard",
    "https://shop.test/dashboard/admin/pixels",
    "https://shop.test/Dashboard/orders?x=1",
    "/dashboard/orders",
    "https://shop.test/shop",
    "https://shop.test/order-confirmation?id=1",
    "https://shop.test/dashboards-are-not-admin",
    null,
  ];

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    const { drizzle } = await import("drizzle-orm/node-postgres");
    schema = await import("#root/shared/database/drizzle/schema");
    db = drizzle(TEST_DB_URL as string, { schema });
    deliveryService = await import("#root/backend/pixel-tracking/event-delivery/service");
    analytics = await import("#root/backend/analytics/service");
    ({ provideDatabase } = await import("#root/shared/trpc/server"));
  });

  const cleanup = async () => {
    const rows = await db
      .select({ id: schema.trackingEvent.id })
      .from(schema.trackingEvent)
      .where(like(schema.trackingEvent.eventId, `${TAG}%`));
    if (rows.length > 0) {
      await db.delete(schema.trackingEvent).where(
        inArray(
          schema.trackingEvent.id,
          rows.map((r) => r.id),
        ),
      );
    }
  };

  beforeEach(async () => {
    await cleanup();
    // Isolate from anything else in the DB: archive whatever is there.
    await db.update(schema.trackingEvent).set({ archivedAt: new Date() });
    for (const [i, pageUrl] of URLS.entries()) {
      const id = v7();
      await db.insert(schema.trackingEvent).values({
        id,
        sessionId: `${TAG}s${i}`,
        eventName: "page_viewed",
        eventId: `${TAG}${i}`,
        eventData: {},
        pageUrl,
      });
      await db.insert(schema.trackingEventDelivery).values({
        id: v7(),
        trackingEventId: id,
        platform: "meta",
        sent: true,
        sentAt: new Date(),
      });
    }
  });

  afterEach(() => {
    if (prev === undefined) Reflect.deleteProperty(process.env, "TRACKING_EXCLUDE_INTERNAL");
    else process.env.TRACKING_EXCLUDE_INTERNAL = prev;
  });
  afterAll(async () => {
    await cleanup();
  });

  const metaSent = (stats: { platformStats: Array<{ platform: string; sent: boolean; total: number }> }) =>
    stats.platformStats.filter((p) => p.platform === "meta" && p.sent).reduce((s, p) => s + Number(p.total), 0);

  it("flag OFF: every row counts, as before", async () => {
    Reflect.deleteProperty(process.env, "TRACKING_EXCLUDE_INTERNAL");
    const stats = await run(deliveryService.getDeliveryStats());
    expect(stats.events24h).toBe(8);
    expect(metaSent(stats)).toBe(8);
    const breakdown = await run(analytics.getEventBreakdown());
    expect(breakdown.totalEvents).toBe(8);
  });

  it("flag ON: the four /dashboard* rows are left out of stats, breakdown and platform health", async () => {
    process.env.TRACKING_EXCLUDE_INTERNAL = "true";
    const stats = await run(deliveryService.getDeliveryStats());
    expect(stats.events24h).toBe(4);
    expect(stats.events7d).toBe(4);
    expect(stats.sessions24h).toBe(4);
    expect(metaSent(stats)).toBe(4);
    const breakdown = await run(analytics.getEventBreakdown());
    expect(breakdown.totalEvents).toBe(4);
    const health = (await run(analytics.getPlatformHealth())) as Array<{ platform: string; successCount: number }>;
    const meta = health.find((h) => h.platform === "meta");
    expect(meta?.successCount).toBe(4);
  });
});
