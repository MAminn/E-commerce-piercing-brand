import { z } from "zod";
import {
  adminProcedure,
  provideDatabase,
  publicProcedure,
  router,
} from "#root/shared/trpc/server";
import {
  runBackendEffect,
  serializeBackendEffectResult,
} from "#root/shared/backend/effect";
import { getSocialProofConfig, updateSocialProofConfig } from "./config-service";
import { getPublicSocialProofFeed } from "./service";

/**
 * Bounds exist so a bad CMS value cannot produce a hostile storefront:
 * negative or zero timers (a toast that never leaves, or fires every frame),
 * sub-second cycling, or a lookback wide enough to turn the public feed into
 * a scan of the whole order table. The admin UI offers the same ranges; this
 * is the enforcement.
 */
export const socialProofConfigSchema = z.object({
  enabled: z.boolean(),
  firstDelaySeconds: z.number().int().min(0).max(60),
  displayDurationSeconds: z.number().int().min(2).max(20),
  intervalSeconds: z.number().int().min(5).max(120),
  maxPerSession: z.number().int().min(1).max(20),
  lookbackDays: z.number().int().min(1).max(365),
  showLocation: z.boolean(),
  locationSource: z.enum(["city", "governorate"]),
  showRelativeTime: z.boolean(),
  /** Empty = all eligible products. Capped so the IN clause stays sane. */
  allowedProductIds: z.array(z.string().uuid()).max(200),
  eligibleStatuses: z
    .array(z.enum(["processing", "shipped", "delivered"]))
    .min(1)
    .max(3),
});

export const socialProofRouter = router({
  /**
   * Public: the storefront toast's config plus its already-sanitised events.
   *
   * Served as one call because the two are useless apart — the client cannot
   * decide whether to run without the config, and cannot render without the
   * events. Disabled configs return an empty event list, so nothing about the
   * store's orders is readable while the feature is off.
   */
  getPublicFeed: publicProcedure.query(async ({ ctx }) => {
    return runBackendEffect(
      getPublicSocialProofFeed().pipe(provideDatabase(ctx)),
    ).then(serializeBackendEffectResult);
  }),

  /** Admin-only: the full config, including the query-shaping fields. */
  getConfig: adminProcedure.query(async ({ ctx }) => {
    return runBackendEffect(
      getSocialProofConfig().pipe(provideDatabase(ctx)),
    ).then(serializeBackendEffectResult);
  }),

  updateConfig: adminProcedure
    .input(socialProofConfigSchema)
    .mutation(async ({ ctx, input }) => {
      return runBackendEffect(
        updateSocialProofConfig(input).pipe(provideDatabase(ctx)),
      ).then(serializeBackendEffectResult);
    }),
});
