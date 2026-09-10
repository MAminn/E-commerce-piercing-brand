import {
  runBackendEffect,
  serializeBackendEffectResult,
} from "#root/shared/backend/effect";
import { provideDatabase, adminProcedure } from "#root/shared/trpc/server";
import { updatePromoCode, updatePromoCodeSchema } from "./update-promo-code";

export const updatePromoCodeProcedure = adminProcedure
  .input(updatePromoCodeSchema)
  .mutation(async ({ ctx, input }) => {
    return await runBackendEffect(
      updatePromoCode(input, ctx.clientSession).pipe(provideDatabase(ctx))
    ).then(serializeBackendEffectResult);
  });
