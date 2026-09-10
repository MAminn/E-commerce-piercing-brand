import {
  runBackendEffect,
  serializeBackendEffectResult,
} from "#root/shared/backend/effect";
import { provideDatabase, adminProcedure } from "#root/shared/trpc/server";
import { getOrderActivity, getOrderActivitySchema } from "./service";

export const getOrderActivityProcedure = adminProcedure
  .input(getOrderActivitySchema)
  .query(async ({ ctx, input }) => {
    return await runBackendEffect(
      getOrderActivity(input, ctx.clientSession).pipe(provideDatabase(ctx)),
    ).then(serializeBackendEffectResult);
  });
