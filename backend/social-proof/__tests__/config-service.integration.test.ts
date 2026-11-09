import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { Effect } from "effect";

const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = TEST_DB_URL ? describe : describe.skip;

describeIfDb("social proof config service (integration)", () => {
  let db: ReturnType<typeof import("drizzle-orm/node-postgres").drizzle>;
  let schema: typeof import("#root/shared/database/drizzle/schema");
  let configService: typeof import("#root/backend/social-proof/config-service");
  let defaults: typeof import("#root/backend/social-proof/defaults");
  let provideDatabase: typeof import("#root/shared/trpc/server").provideDatabase;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    const { drizzle } = await import("drizzle-orm/node-postgres");
    schema = await import("#root/shared/database/drizzle/schema");
    db = drizzle(TEST_DB_URL!, { schema });
    configService = await import("#root/backend/social-proof/config-service");
    defaults = await import("#root/backend/social-proof/defaults");
    ({ provideDatabase } = await import("#root/shared/trpc/server"));

    await db
      .insert(schema.storeSettings)
      .values({ key: "default" })
      .onConflictDoNothing({ target: schema.storeSettings.key });
  });

  afterAll(async () => {
    // Only this feature's column is reset — the popup's config and everything
    // else in the shared settings row is left exactly as it was found.
    await db
      .update(schema.storeSettings)
      .set({ socialProofConfig: null })
      .where(eq(schema.storeSettings.key, "default"));
  });

  const run = <A, E>(
    effect: Effect.Effect<
      A,
      E,
      import("#root/shared/database/drizzle/db").DatabaseClientService
    >,
  ) => Effect.runPromise(effect.pipe(provideDatabase({ db: db as never })));

  it("returns the shipped defaults when nothing has been saved", async () => {
    await db
      .update(schema.storeSettings)
      .set({ socialProofConfig: null })
      .where(eq(schema.storeSettings.key, "default"));

    const config = await run(configService.getSocialProofConfig());
    expect(config).toEqual(defaults.DEFAULT_SOCIAL_PROOF_CONFIG);
  });

  it("round-trips a saved config", async () => {
    const override = {
      ...defaults.DEFAULT_SOCIAL_PROOF_CONFIG,
      enabled: true,
      firstDelaySeconds: 3,
      lookbackDays: 14,
      locationSource: "governorate" as const,
      eligibleStatuses: ["delivered"] as Array<"delivered">,
    };
    await run(configService.updateSocialProofConfig(override));

    const config = await run(configService.getSocialProofConfig());
    expect(config.enabled).toBe(true);
    expect(config.firstDelaySeconds).toBe(3);
    expect(config.lookbackDays).toBe(14);
    expect(config.locationSource).toBe("governorate");
    expect(config.eligibleStatuses).toEqual(["delivered"]);
  });

  it("fills in defaults for fields a previously-saved config never had", async () => {
    // A row written before a field existed must not read back as undefined.
    await db
      .update(schema.storeSettings)
      .set({ socialProofConfig: { enabled: true } as never })
      .where(eq(schema.storeSettings.key, "default"));

    const config = await run(configService.getSocialProofConfig());
    expect(config.enabled).toBe(true);
    expect(config.maxPerSession).toBe(
      defaults.DEFAULT_SOCIAL_PROOF_CONFIG.maxPerSession,
    );
    expect(config.eligibleStatuses).toEqual(
      defaults.DEFAULT_SOCIAL_PROOF_CONFIG.eligibleStatuses,
    );
  });

  it("does not disturb the Entry Popup's config in the same settings row", async () => {
    const { DEFAULT_POPUP_CONFIG } = await import("#root/backend/popup/defaults");
    const popupService = await import("#root/backend/popup/config-service");

    await run(popupService.updatePopupConfig(DEFAULT_POPUP_CONFIG));
    await run(
      configService.updateSocialProofConfig({
        ...defaults.DEFAULT_SOCIAL_PROOF_CONFIG,
        enabled: true,
      }),
    );

    const popupConfig = await run(popupService.getPopupConfig());
    expect(popupConfig).toEqual(DEFAULT_POPUP_CONFIG);
  });
});
