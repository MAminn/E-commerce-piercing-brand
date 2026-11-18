import { t, adminProcedure, provideDatabase } from "#root/shared/trpc/server";
import { runBackendEffect, serializeBackendEffectResult } from "#root/shared/backend/effect";
import { query } from "#root/shared/database/drizzle/db";
import { getAbsTrackingSummary } from "./summary";

/**
 * Admin-only, READ-ONLY. Phase 1 has no mutations: confirming / rejecting a
 * match comes in Phase 2.
 */
export const absTrackingRouter = t.router({
  summary: adminProcedure.query(async ({ ctx }) => {
    return await runBackendEffect(query((db) => getAbsTrackingSummary(db)).pipe(provideDatabase(ctx))).then(
      serializeBackendEffectResult,
    );
  }),
});
