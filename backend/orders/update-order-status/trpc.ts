import {
  runBackendEffect,
  serializeBackendEffectResult,
} from "#root/shared/backend/effect";
import { adminProcedure, provideDatabase } from "#root/shared/trpc/server";
import { updateOrderStatus, updateOrderStatusSchema } from "./service";
export const updateOrderStatusProcedure = adminProcedure
  .input(updateOrderStatusSchema)
  .mutation(async ({ ctx, input }) => {
    return await runBackendEffect(
      updateOrderStatus(input, ctx.clientSession).pipe(provideDatabase(ctx))
    ).then(serializeBackendEffectResult);
  });
