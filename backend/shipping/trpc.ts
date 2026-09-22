import { z } from "zod";
import { Effect } from "effect";
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
import { query } from "#root/shared/database/drizzle/db";
import { EGYPT_GOVERNORATES } from "#root/shared/shipping/egypt-governorates";
import { governorateCodeSchema, shippingRulesConfigSchema } from "#root/shared/shipping/rules";
import { quoteShipping } from "./service";
import { getShippingRules, updateShippingRules } from "./rules-store";

export const shippingRouter = router({
  /** Public: the canonical governorate list for the checkout selector. Static — no DB. */
  destinations: publicProcedure.query(() => ({
    governorates: EGYPT_GOVERNORATES.map(({ code, nameEn, nameAr }) => ({ code, nameEn, nameAr })),
  })),

  /**
   * Public: the shipping price for a destination (or, with none, whether one
   * is needed). Cart and checkout render from this; create-order recomputes
   * it server-side through the very same service and never trusts the client.
   */
  quote: publicProcedure
    .input(
      z.object({
        governorateCode: governorateCodeSchema.nullable().optional(),
        cart: z
          .object({
            subtotal: z.number().nonnegative(),
            itemCount: z.number().int().nonnegative(),
          })
          .optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return runBackendEffect(
        query(async (db) => {
          const { response } = await quoteShipping(db, {
            governorateCode: input.governorateCode ?? null,
            cart: input.cart ?? { subtotal: 0, itemCount: 0 },
          });
          return response;
        }).pipe(provideDatabase(ctx)),
      ).then(serializeBackendEffectResult);
    }),

  /** Admin: the stored rules plus the flat fee, for the settings card. */
  getRules: adminProcedure.query(async ({ ctx }) => {
    return runBackendEffect(
      getShippingRules().pipe(
        Effect.map((stored) => ({
          rules: stored.rules,
          flatFee: stored.flatFee,
          updatedAt: stored.updatedAt,
        })),
        provideDatabase(ctx),
      ),
    ).then(serializeBackendEffectResult);
  }),

  /** Admin: replace the rules. Rejects a zones config that could accept no order. */
  updateRules: adminProcedure
    .input(z.object({ rules: shippingRulesConfigSchema }))
    .mutation(async ({ ctx, input }) => {
      return runBackendEffect(
        updateShippingRules(input.rules).pipe(provideDatabase(ctx)),
      ).then(serializeBackendEffectResult);
    }),
});
