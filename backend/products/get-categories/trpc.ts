import {
  runBackendEffect,
  serializeBackendEffectResult,
} from "#root/shared/backend/effect";
import { provideDatabase, publicProcedure } from "#root/shared/trpc/server";
import { getCategories, getCategoriesSchema } from "./service";

export const getCategoriesProcedure = publicProcedure
  .input(getCategoriesSchema)
  .query(async ({ ctx, input }) => {
    return await runBackendEffect(
      getCategories(input).pipe(provideDatabase(ctx))
    ).then(serializeBackendEffectResult);
  });
