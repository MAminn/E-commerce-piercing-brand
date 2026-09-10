import {
  runBackendEffect,
  serializeBackendEffectResult,
} from "#root/shared/backend/effect";
import { provideDatabase, publicProcedure } from "#root/shared/trpc/server";
import { searchProducts, searchProductsSchema } from "./service";

export const searchProductsProcedure = publicProcedure
  .input(searchProductsSchema)
  .query(async ({ ctx, input }) => {
    return await runBackendEffect(
      searchProducts(input).pipe(provideDatabase(ctx))
    ).then(serializeBackendEffectResult);
  });
