import {
  runBackendEffect,
  serializeBackendEffectResult,
} from "#root/shared/backend/effect";
import { provideDatabase, publicProcedure } from "#root/shared/trpc/server";
import { listPublicPromoCodes } from "./service";

/** Public: storefront Offers page reads active, currently-valid promo codes. */
export const listPublicPromoCodesProcedure = publicProcedure.query(
  async ({ ctx }) => {
    return await runBackendEffect(
      listPublicPromoCodes().pipe(provideDatabase(ctx)),
    ).then(serializeBackendEffectResult);
  },
);
