import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { t, adminProcedure, provideDatabase } from "#root/shared/trpc/server";
import { runBackendEffect, serializeBackendEffectResult } from "#root/shared/backend/effect";
import { query } from "#root/shared/database/drizzle/db";
import { effectiveAbsTrackingMode, readAbsTrackingConfig } from "#root/shared/config/abs-tracking";
import { runPollNow } from "./poll-now";
import { getActionGroups, getAudit, getDecisions, getMissingAwb, getOverview, getReviewQueue, getRuns, getShipments, SHIPMENT_FILTERS } from "./queries";
import { AbsReviewError, acknowledgeDecision, confirmLink, manualLink, NOTE_MAX, rejectLink, unlink } from "./review";
import { getAbsTrackingSummary } from "./summary";
import { getAbsValidationReport } from "./validation";

/**
 * ABS tracking admin API. Every procedure is `adminProcedure`.
 *
 * - `overview` answers in every mode; in `off` it makes NO query and only
 *   says why the mode is off.
 * - Every other procedure refuses while the effective mode is `off`.
 * - Queries are SELECT-only. Mutations write abs_* tables only, each in one
 *   transaction with one abs_audit_log row (backend/shipping-tracking/abs/review.ts).
 *   Nothing here changes a website order, its stock, order_log or emails.
 */
export const ABS_OFF_MESSAGE = "ABS tracking is off";

export function assertAbsTrackingOn(): void {
  if (effectiveAbsTrackingMode() === "off") {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: ABS_OFF_MESSAGE });
  }
}

async function guarded<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof AbsReviewError) throw new TRPCError({ code: err.code, message: err.message });
    throw err;
  }
}

const dateInput = z
  .union([z.date(), z.string().datetime({ offset: true })])
  .optional()
  .nullable()
  .transform((v) => (v ? new Date(v) : null));
const awb = z.string().trim().regex(/^[A-Za-z0-9_-]{1,64}$/, "Invalid AWB");
const note = z.string().trim().min(3, "A note is required (at least 3 characters)").max(NOTE_MAX);
const actorOf = (ctx: { clientSession: { email: string } }) => ctx.clientSession.email;

export const absTrackingRouter = t.router({
  /** Phase 1 summary (kept for scripts / compatibility). */
  summary: adminProcedure.query(async ({ ctx }) => {
    return await runBackendEffect(query((db) => getAbsTrackingSummary(db)).pipe(provideDatabase(ctx))).then(
      serializeBackendEffectResult,
    );
  }),

  // ── Queries ────────────────────────────────────────────────────────────
  overview: adminProcedure.query(async ({ ctx }) => {
    const off = effectiveAbsTrackingMode() === "off";
    return await getOverview(off ? null : ctx.db, readAbsTrackingConfig());
  }),

  shipments: adminProcedure
    .input(
      z
        .object({
          filter: z.enum(SHIPMENT_FILTERS).optional().default("all"),
          search: z.string().max(64).optional().nullable(),
          cursor: z.string().max(200).optional().nullable(),
          limit: z.number().int().min(1).max(100).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      assertAbsTrackingOn();
      return await getShipments(ctx.db, input ?? {});
    }),

  reviewQueue: adminProcedure.query(async ({ ctx }) => {
    assertAbsTrackingOn();
    return await getReviewQueue(ctx.db);
  }),

  decisions: adminProcedure.input(z.object({ onlyOpen: z.boolean().optional().default(false), limit: z.number().int().min(1).max(300).optional() }).optional()).query(async ({ ctx, input }) => {
    assertAbsTrackingOn();
    return await getDecisions(ctx.db, input ?? {});
  }),

  actionGroups: adminProcedure.query(async ({ ctx }) => {
    assertAbsTrackingOn();
    return await getActionGroups(ctx.db);
  }),

  missingAwb: adminProcedure.query(async ({ ctx }) => {
    assertAbsTrackingOn();
    return await getMissingAwb(ctx.db, readAbsTrackingConfig());
  }),

  runs: adminProcedure.query(async ({ ctx }) => {
    assertAbsTrackingOn();
    return await getRuns(ctx.db, 50);
  }),

  audit: adminProcedure.input(z.object({ awb: awb.optional().nullable(), orderId: z.string().uuid().optional().nullable() }).optional()).query(async ({ ctx, input }) => {
    assertAbsTrackingOn();
    return await getAudit(ctx.db, input ?? {});
  }),

  /** Shadow validation report — the gate before live mode is proposed. Read-only. */
  validation: adminProcedure.input(z.object({ from: dateInput, to: dateInput }).optional()).query(async ({ ctx, input }) => {
    assertAbsTrackingOn();
    return await getAbsValidationReport(ctx.db, { from: input?.from ?? null, to: input?.to ?? null });
  }),

  // ── Mutations (abs_* only, transactional, audited) ─────────────────────
  confirmLink: adminProcedure.input(z.object({ awb, orderId: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    assertAbsTrackingOn();
    return await guarded(() => confirmLink({ db: ctx.db, actor: actorOf(ctx) }, input));
  }),

  rejectLink: adminProcedure.input(z.object({ awb, note })).mutation(async ({ ctx, input }) => {
    assertAbsTrackingOn();
    return await guarded(() => rejectLink({ db: ctx.db, actor: actorOf(ctx) }, input));
  }),

  manualLink: adminProcedure
    .input(z.object({ awb, orderNumber: z.number().int().positive(), role: z.enum(["primary", "reverse", "exchange", "other"]), note }))
    .mutation(async ({ ctx, input }) => {
      assertAbsTrackingOn();
      return await guarded(() => manualLink({ db: ctx.db, actor: actorOf(ctx) }, input));
    }),

  unlink: adminProcedure.input(z.object({ awb, note })).mutation(async ({ ctx, input }) => {
    assertAbsTrackingOn();
    return await guarded(() => unlink({ db: ctx.db, actor: actorOf(ctx) }, input));
  }),

  acknowledgeDecision: adminProcedure.input(z.object({ decisionId: z.string().uuid(), note })).mutation(async ({ ctx, input }) => {
    assertAbsTrackingOn();
    return await guarded(() => acknowledgeDecision({ db: ctx.db, actor: actorOf(ctx) }, input));
  }),

  pollNow: adminProcedure.mutation(async ({ ctx }) => {
    assertAbsTrackingOn();
    return await guarded(() => runPollNow({ db: ctx.db, actor: actorOf(ctx), config: readAbsTrackingConfig() }));
  }),
});
