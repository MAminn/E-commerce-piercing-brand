import {
  runBackendEffect,
  serializeBackendEffectResult,
} from "#root/shared/backend/effect";
import { DatabaseClientService } from "#root/shared/database/drizzle/db";
import { Effect } from "effect";
import { z } from "zod";
import { getOrderStats, getOrderStatsSchema } from "./service";
import { adminProcedure } from "#root/shared/trpc/server";

export const orderStatsProcedure = adminProcedure
  .input(getOrderStatsSchema)
  .query(async ({ input, ctx }) => {
    const result = await runBackendEffect(
      getOrderStats(input, ctx.clientSession).pipe(
        Effect.provideService(DatabaseClientService, ctx.db)
      )
    ).then(serializeBackendEffectResult);

    return result;
  });
