import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { t, adminProcedure, provideDatabase } from "#root/shared/trpc/server";
import { runBackendEffect, serializeBackendEffectResult } from "#root/shared/backend/effect";
import { query } from "#root/shared/database/drizzle/db";
import { effectiveAbsTrackingMode } from "#root/shared/config/abs-tracking";
import { getAbsTrackingSummary } from "./summary";
import { getAbsValidationReport } from "./validation";

/**
 * Admin-only. Every procedure except `summary` refuses while the effective
 * mode is `off` (no abs_* query, nothing written). Queries are SELECT-only;
 * no procedure here ever writes a website table.
 */
export const ABS_OFF_MESSAGE = "ABS tracking is off";

export function assertAbsTrackingOn(): void {
  if (effectiveAbsTrackingMode() === "off") {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: ABS_OFF_MESSAGE });
  }
}

const dateInput = z
  .union([z.date(), z.string().datetime({ offset: true })])
  .optional()
  .nullable()
  .transform((v) => (v ? new Date(v) : null));

export const absTrackingRouter = t.router({
  summary: adminProcedure.query(async ({ ctx }) => {
    return await runBackendEffect(query((db) => getAbsTrackingSummary(db)).pipe(provideDatabase(ctx))).then(
      serializeBackendEffectResult,
    );
  }),

  /** Shadow validation report — the gate before live mode is proposed. Read-only. */
  validation: adminProcedure.input(z.object({ from: dateInput, to: dateInput }).optional()).query(async ({ ctx, input }) => {
    assertAbsTrackingOn();
    return await getAbsValidationReport(ctx.db, { from: input?.from ?? null, to: input?.to ?? null });
  }),
});
