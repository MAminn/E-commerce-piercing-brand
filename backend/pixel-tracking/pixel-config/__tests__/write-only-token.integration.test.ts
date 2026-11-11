import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { Effect } from "effect";

/**
 * S1 — the CAPI token / GA4 Measurement Protocol API secret is write-only:
 * no admin read returns it, a blank update keeps it, null clears it.
 * Real Postgres; skipped when TEST_DATABASE_URL is unset. Fake values only.
 */
const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = TEST_DB_URL ? describe : describe.skip;

describeIfDb("pixel config secret is write-only (integration)", () => {
  let db: ReturnType<typeof import("drizzle-orm/node-postgres").drizzle>;
  let schema: typeof import("#root/shared/database/drizzle/schema");
  let svc: typeof import("#root/backend/pixel-tracking/pixel-config/service");
  let provideDatabase: typeof import("#root/shared/trpc/server").provideDatabase;
  let id = "";

  const FAKE_SECRET = "fake-secret-for-tests-0001";
  const run = <A, E>(
    effect: Effect.Effect<A, E, import("#root/shared/database/drizzle/db").DatabaseClientService>,
  ) => Effect.runPromise(effect.pipe(provideDatabase({ db: db as never })));
  const stored = async () =>
    (await db.select().from(schema.pixelConfig).where(eq(schema.pixelConfig.id, id)))[0]?.accessToken ?? null;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    const { drizzle } = await import("drizzle-orm/node-postgres");
    schema = await import("#root/shared/database/drizzle/schema");
    db = drizzle(TEST_DB_URL as string, { schema });
    svc = await import("#root/backend/pixel-tracking/pixel-config/service");
    ({ provideDatabase } = await import("#root/shared/trpc/server"));
  });
  afterAll(async () => {
    if (id) await db.delete(schema.pixelConfig).where(eq(schema.pixelConfig.id, id));
  });

  it("create returns no secret, only hasAccessToken", async () => {
    const created = await run(
      svc.createPixelConfig(
        svc.createPixelConfigSchema.parse({ platform: "google_ga4", pixelId: "G-TEST000001", accessToken: FAKE_SECRET }),
      ),
    );
    id = created.id;
    expect(created).not.toHaveProperty("accessToken");
    expect(created.hasAccessToken).toBe(true);
    expect(JSON.stringify(created)).not.toContain(FAKE_SECRET);
    expect(await stored()).toBe(FAKE_SECRET);
  });

  it("list and get never return the secret", async () => {
    const list = await run(svc.listPixelConfigs());
    const mine = list.find((c) => c.id === id);
    expect(mine?.hasAccessToken).toBe(true);
    expect(JSON.stringify(list)).not.toContain(FAKE_SECRET);
    const one = await run(svc.getPixelConfig(id));
    expect(one).not.toHaveProperty("accessToken");
    expect(JSON.stringify(one)).not.toContain(FAKE_SECRET);
  });

  it("update with no token or a blank token keeps the saved secret", async () => {
    await run(svc.updatePixelConfig({ id, enableServerSide: true }));
    expect(await stored()).toBe(FAKE_SECRET);
    const updated = await run(svc.updatePixelConfig({ id, accessToken: "   " }));
    expect(await stored()).toBe(FAKE_SECRET);
    expect(JSON.stringify(updated)).not.toContain(FAKE_SECRET);
  });

  it("a new token replaces it; null clears it", async () => {
    await run(svc.updatePixelConfig({ id, accessToken: "fake-secret-for-tests-0002" }));
    expect(await stored()).toBe("fake-secret-for-tests-0002");
    const cleared = await run(svc.updatePixelConfig({ id, accessToken: null }));
    expect(await stored()).toBeNull();
    expect(cleared.hasAccessToken).toBe(false);
  });
});
