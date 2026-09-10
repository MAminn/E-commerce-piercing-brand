import {
  runBackendEffect,
  serializeBackendEffectResult,
} from "#root/shared/backend/effect";
import { provideDatabase, adminProcedure } from "#root/shared/trpc/server";
import { editOrder, editOrderSchema } from "./service";

export const editOrderProcedure = adminProcedure
  .input(editOrderSchema)
  .mutation(async ({ ctx, input }) => {
    return await runBackendEffect(
      editOrder(input, ctx.clientSession).pipe(provideDatabase(ctx)),
    ).then(serializeBackendEffectResult);
  });
