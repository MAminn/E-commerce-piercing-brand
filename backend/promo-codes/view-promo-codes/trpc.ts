import {
  runBackendEffect,
  serializeBackendEffectResult,
} from "#root/shared/backend/effect";
import { provideDatabase, adminProcedure } from "#root/shared/trpc/server";
import {
  viewPromoCodes,
  viewPromoCodesSchema,
  getPromoCodeById,
  getPromoCodeByIdSchema,
} from "./view-promo-codes";

export const viewPromoCodesProcedure = adminProcedure
  .input(viewPromoCodesSchema)
  .query(async ({ ctx, input }) => {
    return await runBackendEffect(
      viewPromoCodes(input, ctx.clientSession).pipe(provideDatabase(ctx))
    ).then(serializeBackendEffectResult);
  });

export const getPromoCodeByIdProcedure = adminProcedure
  .input(getPromoCodeByIdSchema)
  .query(async ({ ctx, input }) => {
    return await runBackendEffect(
      getPromoCodeById(input, ctx.clientSession).pipe(provideDatabase(ctx))
    ).then(serializeBackendEffectResult);
  });
