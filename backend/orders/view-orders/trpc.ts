import {
  runBackendEffect,
  serializeBackendEffectResult,
} from "#root/shared/backend/effect";
import { provideDatabase, protectedProcedure } from "#root/shared/trpc/server";
import { viewOrders, viewOrdersSchema } from "./service";

export const viewOrdersProcedure = protectedProcedure
  .input(viewOrdersSchema)
  .query(async ({ ctx, input }) => {
    return await runBackendEffect(
      viewOrders(input, ctx.clientSession).pipe(provideDatabase(ctx))
    ).then(serializeBackendEffectResult);
  });
