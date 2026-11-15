import { z } from "zod";
import { Effect } from "effect";
import { adminProcedure, provideDatabase } from "#root/shared/trpc/server";
import { runBackendEffect, serializeBackendEffectResult } from "#root/shared/backend/effect";
import { query } from "#root/shared/database/drizzle/db";
import { COOKIE_HEALTH_MAX_DAYS, getCookieHealth } from "./cookie-health";

/** Admin, read-only: first-party cookie presence per visit and browser kind (no values). */
export const cookieHealthProcedure = adminProcedure
  .input(
    z
      .object({
        windowDays: z.number().int().min(1).max(COOKIE_HEALTH_MAX_DAYS).optional(),
        minBeaconsPerVisit: z.number().int().min(2).max(50).optional(),
      })
      .optional(),
  )
  .query(async ({ ctx, input }) => {
    return await runBackendEffect(
      Effect.gen(function* () {
        return yield* query((db) => getCookieHealth(db, input?.windowDays ?? 3, input?.minBeaconsPerVisit ?? 2));
      }).pipe(provideDatabase(ctx)),
    ).then(serializeBackendEffectResult);
  });
