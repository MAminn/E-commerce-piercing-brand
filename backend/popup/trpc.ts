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
  getPopupConfig,
  updatePopupConfig,
  getPopupDiscountConfig,
  updatePopupDiscountConfig,
} from "./config-service";
import { claimPopupDiscount } from "./claim-service";
import { attachContactToCart } from "#root/backend/cart-capture/service";

const popupConfigSchema = z.object({
  enabled: z.boolean(),
  imageUrl: z.string(),
  titleEn: z.string(),
  titleAr: z.string(),
  descriptionEn: z.string(),
  descriptionAr: z.string(),
  submitLabelEn: z.string(),
  submitLabelAr: z.string(),
  successMessageEn: z.string(),
  successMessageAr: z.string(),
  dismissLabelEn: z.string(),
  dismissLabelAr: z.string(),
  dismissHref: z.string(),
  collectPhone: z.boolean(),
  phoneRequired: z.boolean(),
  triggerDelaySeconds: z.number().int().min(0),
  triggerScrollPercent: z.number().int().min(0).max(100),
  triggerExitIntent: z.boolean(),
  reshowAfterDays: z.number().int().min(0),
});

const popupDiscountConfigSchema = z.object({
  promoCodeId: z.string().uuid().nullable(),
  codeMode: z.enum(["existing", "generate"]),
});

export const popupRouter = router({
  /** Public: the popup needs its own copy/trigger config before anyone is logged in. */
  getPublicConfig: publicProcedure.query(async ({ ctx }) => {
    return runBackendEffect(getPopupConfig().pipe(provideDatabase(ctx))).then(
      serializeBackendEffectResult,
    );
  }),

  /** Public: submit email (+ optional phone) and claim the first-order discount. */
  claim: publicProcedure
    .input(
      z.object({
        email: z.string().email(),
        phone: z.string().optional(),
        /** The same browser's cart-capture session token, if any — lets a popup signup immediately attribute an in-progress cart. */
        cartSessionToken: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const result = await claimPopupDiscount({
          email: input.email,
          phone: input.phone,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        });
        if (input.cartSessionToken) {
          await attachContactToCart({
            sessionToken: input.cartSessionToken,
            email: input.email,
            phone: input.phone,
          });
        }
        return { success: true as const, result };
      } catch (err) {
        return {
          success: false as const,
          error: err instanceof Error ? err.message : "Failed to claim discount",
        };
      }
    }),

  /** Admin-only: presentational config (image, copy, triggers). */
  getConfig: adminProcedure.query(async ({ ctx }) => {
    return runBackendEffect(getPopupConfig().pipe(provideDatabase(ctx))).then(
      serializeBackendEffectResult,
    );
  }),

  updateConfig: adminProcedure
    .input(popupConfigSchema)
    .mutation(async ({ ctx, input }) => {
      return runBackendEffect(updatePopupConfig(input).pipe(provideDatabase(ctx))).then(
        serializeBackendEffectResult,
      );
    }),

  /** Admin-only: which promo code the popup issues, and how. Never exposed publicly. */
  getDiscountConfig: adminProcedure.query(async ({ ctx }) => {
    return runBackendEffect(getPopupDiscountConfig().pipe(provideDatabase(ctx))).then(
      serializeBackendEffectResult,
    );
  }),

  updateDiscountConfig: adminProcedure
    .input(popupDiscountConfigSchema)
    .mutation(async ({ ctx, input }) => {
      return runBackendEffect(
        updatePopupDiscountConfig(input).pipe(provideDatabase(ctx)),
      ).then(serializeBackendEffectResult);
    }),
});
