import {
  runBackendEffect,
  serializeBackendEffectResult,
} from "#root/shared/backend/effect";
import { DatabaseClientService } from "#root/shared/database/drizzle/db";
import { Effect } from "effect";
import { getTopSelling, getTopSellingSchema } from "./service";
import { adminProcedure } from "#root/shared/trpc/server";

export const topSellingProcedure = adminProcedure
  .input(getTopSellingSchema)
  .query(async ({ input, ctx }) => {
    const result = await runBackendEffect(
      getTopSelling(input, ctx.clientSession).pipe(
        Effect.provideService(DatabaseClientService, ctx.db)
      )
    ).then(serializeBackendEffectResult);

    return result;
  });
