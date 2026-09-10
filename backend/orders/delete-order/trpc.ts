import {
  runBackendEffect,
  serializeBackendEffectResult,
} from "#root/shared/backend/effect";
import { provideDatabase, adminProcedure } from "#root/shared/trpc/server";
import { deleteOrder, deleteOrderSchema } from "./service";

export const deleteOrderProcedure = adminProcedure
  .input(deleteOrderSchema)
  .mutation(async ({ ctx, input }) => {
    return await runBackendEffect(
      deleteOrder(input, ctx.clientSession).pipe(provideDatabase(ctx))
    ).then(serializeBackendEffectResult);
  });
