import {
  runBackendEffect,
  serializeBackendEffectResult,
} from "#root/shared/backend/effect";
import { DatabaseClientService } from "#root/shared/database/drizzle/db";
import { Effect } from "effect";
import { getProductStats, getProductStatsSchema } from "./service";
import { adminProcedure } from "#root/shared/trpc/server";

export const productStatsProcedure = adminProcedure
  .input(getProductStatsSchema)
  .query(async ({ input, ctx }) => {
    const result = await runBackendEffect(
      getProductStats(input, ctx.clientSession).pipe(
        Effect.provideService(DatabaseClientService, ctx.db)
      )
    ).then(serializeBackendEffectResult);

    return result;
  });
