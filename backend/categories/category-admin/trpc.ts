import {
  runBackendEffect,
  serializeBackendEffectResult,
} from "#root/shared/backend/effect";
import { provideDatabase, adminProcedure } from "#root/shared/trpc/server";
import {
  reorderCategories,
  reorderCategoriesSchema,
  setCategoryVisibility,
  setCategoryVisibilitySchema,
  viewCategoryAdminTree,
} from "./service";

export const viewCategoryAdminTreeProcedure = adminProcedure.query(
  async ({ ctx }) => {
    return await runBackendEffect(
      viewCategoryAdminTree(ctx.clientSession).pipe(provideDatabase(ctx)),
    ).then(serializeBackendEffectResult);
  },
);

export const reorderCategoriesProcedure = adminProcedure
  .input(reorderCategoriesSchema)
  .mutation(async ({ ctx, input }) => {
    return await runBackendEffect(
      reorderCategories(input, ctx.clientSession).pipe(provideDatabase(ctx)),
    ).then(serializeBackendEffectResult);
  });

export const setCategoryVisibilityProcedure = adminProcedure
  .input(setCategoryVisibilitySchema)
  .mutation(async ({ ctx, input }) => {
    return await runBackendEffect(
      setCategoryVisibility(input, ctx.clientSession).pipe(provideDatabase(ctx)),
    ).then(serializeBackendEffectResult);
  });
