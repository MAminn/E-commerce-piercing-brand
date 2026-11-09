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
import {
  UPSELL_MAX_ITEMS,
  UPSELL_MIN_ITEMS,
  UPSELL_RANDOM_POOLS,
} from "#root/shared/upsell/config";
import {
  getProductUpsells,
  getUpsellSettings,
  productUpsellsSchema,
  updateUpsellSettings,
} from "./service";

export const upsellSettingsSchema = z.object({
  enabled: z.boolean(),
  productPageEnabled: z.boolean(),
  postAddEnabled: z.boolean(),
  maxItems: z.number().int().min(UPSELL_MIN_ITEMS).max(UPSELL_MAX_ITEMS),
  randomPool: z.enum(UPSELL_RANDOM_POOLS),
});

export const upsellRouter = router({
  /**
   * Public: the recommendations for one product page. Both the product-page
   * block and the post-add sheet consume this one answer.
   */
  forProduct: publicProcedure
    .input(productUpsellsSchema)
    .query(async ({ ctx, input }) => {
      return runBackendEffect(
        getProductUpsells(input).pipe(provideDatabase(ctx)),
      ).then(serializeBackendEffectResult);
    }),

  /** Admin-only: the store-wide upsell switches, merged over defaults. */
  getSettings: adminProcedure.query(async ({ ctx }) => {
    return runBackendEffect(
      getUpsellSettings().pipe(provideDatabase(ctx)),
    ).then(serializeBackendEffectResult);
  }),

  updateSettings: adminProcedure
    .input(upsellSettingsSchema)
    .mutation(async ({ ctx, input }) => {
      return runBackendEffect(
        updateUpsellSettings(input).pipe(provideDatabase(ctx)),
      ).then(serializeBackendEffectResult);
    }),
});
