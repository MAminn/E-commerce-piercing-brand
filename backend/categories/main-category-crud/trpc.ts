import {
  runBackendEffect,
  serializeBackendEffectResult,
} from "#root/shared/backend/effect";
import { provideDatabase, adminProcedure } from "#root/shared/trpc/server";
import {
  createMainCategory,
  createMainCategorySchema,
  renameMainCategory,
  renameMainCategorySchema,
  deleteMainCategory,
  deleteMainCategorySchema,
  toggleCategoryLanding,
  toggleCategoryLandingSchema,
} from "./service";

export const createMainCategoryProcedure = adminProcedure
  .input(createMainCategorySchema)
  .mutation(async ({ ctx, input }) => {
    return await runBackendEffect(
      createMainCategory(input, ctx.clientSession).pipe(provideDatabase(ctx)),
    ).then(serializeBackendEffectResult);
  });

export const renameMainCategoryProcedure = adminProcedure
  .input(renameMainCategorySchema)
  .mutation(async ({ ctx, input }) => {
    return await runBackendEffect(
      renameMainCategory(input, ctx.clientSession).pipe(provideDatabase(ctx)),
    ).then(serializeBackendEffectResult);
  });

export const deleteMainCategoryProcedure = adminProcedure
  .input(deleteMainCategorySchema)
  .mutation(async ({ ctx, input }) => {
    return await runBackendEffect(
      deleteMainCategory(input, ctx.clientSession).pipe(provideDatabase(ctx)),
    ).then(serializeBackendEffectResult);
  });

export const toggleCategoryLandingProcedure = adminProcedure
  .input(toggleCategoryLandingSchema)
  .mutation(async ({ ctx, input }) => {
    return await runBackendEffect(
      toggleCategoryLanding(input, ctx.clientSession).pipe(
        provideDatabase(ctx),
      ),
    ).then(serializeBackendEffectResult);
  });
