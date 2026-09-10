import {
  runBackendEffect,
  serializeBackendEffectResult,
} from "#root/shared/backend/effect";
import { provideDatabase, adminProcedure } from "#root/shared/trpc/server";
import { createPromoCode, createPromoCodeSchema } from "./create-promo-code";

export const createPromoCodeProcedure = adminProcedure
  .input(createPromoCodeSchema)
  .mutation(async ({ ctx, input }) => {
    return await runBackendEffect(
      createPromoCode(input, ctx.clientSession).pipe(provideDatabase(ctx))
    ).then(serializeBackendEffectResult);
  });
