import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { inArray, like } from "drizzle-orm";
import { Effect } from "effect";
import { v7 } from "uuid";

/**
 * getPlatformHealth against real Postgres, shaped like production after the
 * GA4 restore: a GA4 row with client-side ON, server-side ON and historical
 * "Missing api_secret" MP failures, next to a healthy Meta CAPI row.
 * Skipped when TEST_DATABASE_URL is unset.
 */
const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = TEST_DB_URL ? describe : describe.skip;

describeIfDb("platform health with GA4 client-owned (integration)", () => {
  let db: ReturnType<typeof import("drizzle-orm/node-postgres").drizzle>;
  let schema: typeof import("#root/shared/database/drizzle/schema");
  let analytics: typeof import("#root/backend/analytics/service");
  let provideDatabase: typeof import("#root/shared/trpc/server").provideDatabase;

  const TAG = "ph-it-";
  const prevMode = process.env.GA4_MP_MODE;
  const configIds: string[] = [];

  const run = <A, E>(
    effect: Effect.Effect<A, E, import("#root/shared/database/drizzle/db").DatabaseClientService>,
  ) => Effect.runPromise(effect.pipe(provideDatabase({ db: db as never })));

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    const { drizzle } = await import("drizzle-orm/node-postgres");
    schema = await import("#root/shared/database/drizzle/schema");
    db = drizzle(TEST_DB_URL as string, { schema });
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
    if (configIds.length > 0) {
      await db.delete(schema.pixelConfig).where(inArray(schema.pixelConfig.id, configIds));
      configIds.length = 0;
    }
  };

  const delivery = async (i: number, platform: "meta" | "google_ga4", sent: boolean, error?: string) => {
    const id = v7();
    await db.insert(schema.trackingEvent).values({
      id,
      sessionId: `${TAG}s`,
      eventName: "product_added_to_cart",
      eventId: `${TAG}${platform}-${i}`,
      eventData: {},
      pageUrl: "https://shop.test/shop/seamless-ring-8mm",
    });
    await db.insert(schema.trackingEventDelivery).values({
      id: v7(),
      trackingEventId: id,
      platform,
      sent,
      sentAt: sent ? new Date() : null,
      error: error ?? null,
    });
  };

  beforeEach(async () => {
    await cleanup();
    // Only this test's rows count: clear other pixel configs' influence by
    // running against platforms we create here.
    await db.delete(schema.trackingEventDelivery);
    await db.delete(schema.pixelConfig);
    const ga4Id = v7();
    const metaId = v7();
    configIds.push(ga4Id, metaId);
    await db.insert(schema.pixelConfig).values([
      {
        id: ga4Id,
        platform: "google_ga4",
        pixelId: "G-TZZRFSD70Q",
        accessToken: null,
        enabled: true,
        enableClientSide: true,
        enableServerSide: true,
      },
      {
        id: metaId,
        platform: "meta",
        pixelId: "1234567890",
        accessToken: "token",
        enabled: true,
        enableClientSide: true,
        enableServerSide: true,
      },
    ]);
    for (let i = 0; i < 6; i++) {
      await delivery(i, "google_ga4", false, "Missing api_secret (accessToken) for GA4 Measurement Protocol");
    }
    for (let i = 0; i < 5; i++) await delivery(i, "meta", true);
  });

  afterEach(() => {
    if (prevMode === undefined) Reflect.deleteProperty(process.env, "GA4_MP_MODE");
    else process.env.GA4_MP_MODE = prevMode;
  });
  afterAll(async () => {
    await cleanup();
  });

  type Row = { platform: string; status: string; basis: string; note?: string; failedCount: number; successRate: number };

  it("default mode: GA4 is healthy (client-side) despite historical MP failures; Meta unchanged", async () => {
    Reflect.deleteProperty(process.env, "GA4_MP_MODE");
    const rows = (await run(analytics.getPlatformHealth())) as Row[];
    const ga4 = rows.find((r) => r.platform === "google_ga4");
    const meta = rows.find((r) => r.platform === "meta");
    expect(ga4).toMatchObject({
      status: "healthy",
      basis: "client",
      note: "Client-side active · Server mirror disabled to prevent duplicate GA4 events",
      failedCount: 6,
    });
    expect(meta).toMatchObject({ status: "healthy", basis: "server_delivery", successRate: 100, failedCount: 0 });
  });

  it("GA4_MP_MODE=legacy_all: the same rows make GA4 DOWN by server-delivery health", async () => {
    process.env.GA4_MP_MODE = "legacy_all";
    const rows = (await run(analytics.getPlatformHealth())) as Row[];
    expect(rows.find((r) => r.platform === "google_ga4")).toMatchObject({
      status: "down",
      basis: "server_delivery",
      successRate: 0,
      failedCount: 6,
    });
    expect(rows.find((r) => r.platform === "meta")).toMatchObject({ status: "healthy", successRate: 100 });
  });
});
