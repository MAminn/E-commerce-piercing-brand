import {
  runBackendEffect,
  serializeBackendEffectResult,
} from "#root/shared/backend/effect";
import { provideDatabase, adminProcedure } from "#root/shared/trpc/server";
import {
  assignProductsSchema,
  assignProductsToSubcategory,
  listCategoryProducts,
  listCategoryProductsSchema,
  moveProductsBetweenSubcategories,
  moveProductsSchema,
  removeProductsFromSubcategory,
  removeProductsSchema,
} from "./service";

export const listCategoryProductsProcedure = adminProcedure
  .input(listCategoryProductsSchema)
  .query(async ({ ctx, input }) => {
    return await runBackendEffect(
      listCategoryProducts(input, ctx.clientSession).pipe(provideDatabase(ctx)),
    ).then(serializeBackendEffectResult);
  });

export const assignProductsProcedure = adminProcedure
  .input(assignProductsSchema)
  .mutation(async ({ ctx, input }) => {
    return await runBackendEffect(
      assignProductsToSubcategory(input, ctx.clientSession).pipe(
        provideDatabase(ctx),
      ),
    ).then(serializeBackendEffectResult);
  });

export const removeProductsProcedure = adminProcedure
  .input(removeProductsSchema)
  .mutation(async ({ ctx, input }) => {
    return await runBackendEffect(
      removeProductsFromSubcategory(input, ctx.clientSession).pipe(
        provideDatabase(ctx),
      ),
    ).then(serializeBackendEffectResult);
  });

export const moveProductsProcedure = adminProcedure
  .input(moveProductsSchema)
  .mutation(async ({ ctx, input }) => {
    return await runBackendEffect(
      moveProductsBetweenSubcategories(input, ctx.clientSession).pipe(
        provideDatabase(ctx),
      ),
    ).then(serializeBackendEffectResult);
  });
