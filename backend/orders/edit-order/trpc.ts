import {
  runBackendEffect,
  serializeBackendEffectResult,
} from "#root/shared/backend/effect";
import { provideDatabase, adminProcedure } from "#root/shared/trpc/server";
import {
  editOrder,
  editOrderSchema,
  getOrderEditContext,
  orderEditContextSchema,
  previewOrderEdit,
} from "./service";
import {
  searchProductsForOrderEdit,
  searchProductsForOrderEditSchema,
} from "./catalog-search";

export const editOrderProcedure = adminProcedure
  .input(editOrderSchema)
  .mutation(async ({ ctx, input }) => {
    return await runBackendEffect(
      editOrder(input, ctx.clientSession).pipe(provideDatabase(ctx)),
    ).then(serializeBackendEffectResult);
  });

/**
 * Dry run of `edit`: same validation and computation, rolled back. A
 * mutation (not a query) because it takes row locks and must never be
 * cached, retried on focus or prefetched.
 */
export const previewOrderEditProcedure = adminProcedure
  .input(editOrderSchema)
  .mutation(async ({ ctx, input }) => {
    return await runBackendEffect(
      previewOrderEdit(input, ctx.clientSession).pipe(provideDatabase(ctx)),
    ).then(serializeBackendEffectResult);
  });

export const orderEditContextProcedure = adminProcedure
  .input(orderEditContextSchema)
  .query(async ({ ctx, input }) => {
    return await runBackendEffect(
      getOrderEditContext(input, ctx.clientSession).pipe(provideDatabase(ctx)),
    ).then(serializeBackendEffectResult);
  });

export const searchProductsForOrderEditProcedure = adminProcedure
  .input(searchProductsForOrderEditSchema)
  .query(async ({ ctx, input }) => {
    return await runBackendEffect(
      searchProductsForOrderEdit(input, ctx.clientSession).pipe(provideDatabase(ctx)),
    ).then(serializeBackendEffectResult);
  });
