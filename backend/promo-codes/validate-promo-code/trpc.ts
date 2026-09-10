import {
  runBackendEffect,
  serializeBackendEffectResult,
} from "#root/shared/backend/effect";
import { provideDatabase, publicProcedure } from "#root/shared/trpc/server";
import { Effect } from "effect";
import {
  validatePromoCode,
  validatePromoCodeSchema,
} from "./validate-promo-code";

// Public: guests can place orders (see create-order), so they must also be
// able to apply promo codes. Per-user usage limits still apply to signed-in
// shoppers via ctx.clientSession, and are re-checked at order time.
export const validatePromoCodeProcedure = publicProcedure
  .input(validatePromoCodeSchema)
  .query(async ({ ctx, input }) => {
    return await runBackendEffect(
      validatePromoCode(input, ctx.clientSession ?? undefined).pipe(
        provideDatabase(ctx)
      )
    ).then(serializeBackendEffectResult);
  });
