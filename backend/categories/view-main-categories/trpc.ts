import {
  runBackendEffect,
  serializeBackendEffectResult,
} from "#root/shared/backend/effect";
import { provideDatabase, publicProcedure } from "#root/shared/trpc/server";
import { viewMainCategories } from "./service";

export const viewMainCategoriesProcedure = publicProcedure.query(
  async ({ ctx }) => {
    return await runBackendEffect(
      viewMainCategories().pipe(provideDatabase(ctx)),
    ).then(serializeBackendEffectResult);
  },
);
