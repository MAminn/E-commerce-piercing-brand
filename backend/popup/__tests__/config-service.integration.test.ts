import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { Effect } from "effect";

const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = TEST_DB_URL ? describe : describe.skip;

describeIfDb("popup config service (integration)", () => {
  let db: ReturnType<typeof import("drizzle-orm/node-postgres").drizzle>;
  let schema: typeof import("#root/shared/database/drizzle/schema");
  let configService: typeof import("#root/backend/popup/config-service");
  let defaults: typeof import("#root/backend/popup/defaults");
  let provideDatabase: typeof import("#root/shared/trpc/server").provideDatabase;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    const { drizzle } = await import("drizzle-orm/node-postgres");
    schema = await import("#root/shared/database/drizzle/schema");
    db = drizzle(TEST_DB_URL!, { schema });
    configService = await import("#root/backend/popup/config-service");
    defaults = await import("#root/backend/popup/defaults");
    ({ provideDatabase } = await import("#root/shared/trpc/server"));

    // Effect-based service functions need DatabaseClientService provided —
    // in production that's ctx.db inside a tRPC procedure; here we provide
    // the same test db instance directly.
    await db
      .insert(schema.storeSettings)
      .values({ key: "default" })
      .onConflictDoNothing({ target: schema.storeSettings.key });
  });

  afterAll(async () => {
    await db
      .update(schema.storeSettings)
      .set({ popupConfig: null, popupDiscountConfig: null })
      .where(eq(schema.storeSettings.key, "default"));
  });

  const run = <A, E>(effect: Effect.Effect<A, E, import("#root/shared/database/drizzle/db").DatabaseClientService>) =>
    Effect.runPromise(effect.pipe(provideDatabase({ db: db as never })));

  it("getPopupConfig returns the shipped defaults when nothing has been saved", async () => {
    await db
      .update(schema.storeSettings)
      .set({ popupConfig: null })
      .where(eq(schema.storeSettings.key, "default"));

    const config = await run(configService.getPopupConfig());
    expect(config).toEqual(defaults.DEFAULT_POPUP_CONFIG);
  });

  it("updatePopupConfig + getPopupConfig round-trips a full override", async () => {
    const override = {
      ...defaults.DEFAULT_POPUP_CONFIG,
      enabled: true,
      titleEn: "Custom Title",
      triggerDelaySeconds: 10,
    };
    await run(configService.updatePopupConfig(override));

    const config = await run(configService.getPopupConfig());
    expect(config.enabled).toBe(true);
    expect(config.titleEn).toBe("Custom Title");
    expect(config.triggerDelaySeconds).toBe(10);
  });

  it("getPopupDiscountConfig defaults promoCodeId to null and codeMode to 'existing'", async () => {
    await db
      .update(schema.storeSettings)
      .set({ popupDiscountConfig: null })
      .where(eq(schema.storeSettings.key, "default"));

    const config = await run(configService.getPopupDiscountConfig());
    expect(config).toEqual(defaults.DEFAULT_POPUP_DISCOUNT_CONFIG);
  });

  it("updatePopupDiscountConfig + getPopupDiscountConfigRaw round-trips correctly (raw variant used by the claim flow)", async () => {
    const fakeId = "00000000-0000-7000-8000-000000000000";
    await run(
      configService.updatePopupDiscountConfig({ promoCodeId: fakeId, codeMode: "generate" }),
    );

    const raw = await configService.getPopupDiscountConfigRaw();
    expect(raw).toEqual({ promoCodeId: fakeId, codeMode: "generate" });
  });
});
