import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { t, adminProcedure, provideDatabase } from "#root/shared/trpc/server";
import { runBackendEffect, serializeBackendEffectResult } from "#root/shared/backend/effect";
import { query } from "#root/shared/database/drizzle/db";
import { effectiveAbsTrackingMode, getAbsTrackingBootStatus, readAbsTrackingConfig } from "#root/shared/config/abs-tracking";
import { createAbsClient } from "./client";
import {
  approveOld,
  approveReady,
  getLiveAttention,
  getLiveDone,
  getLiveReady,
  liveConfigOf,
  LiveError,
  setLivePaused,
  suppressDecision,
  undoApplication,
  type ApplyDeps,
} from "./live";
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
 * - Queries are SELECT-only. The review mutations write abs_* tables only, each
 *   in one transaction with one abs_audit_log row (review.ts).
 * - The `live*` procedures (live mode, live.ts) are the only ones that may
 *   change a website order — Delivered (approve) and its Undo — and only
 *   through the shared admin status core. They refuse outside live mode,
 *   except Undo / "Done automatically", which also work after a rollback to
 *   shadow so an automatic change can still be reverted.
 */
export const ABS_OFF_MESSAGE = "ABS tracking is off";
export const ABS_NOT_LIVE_MESSAGE = "Live mode is not on";

export function assertAbsLive(): void {
  assertAbsTrackingOn();
  if (effectiveAbsTrackingMode() !== "live") throw new TRPCError({ code: "PRECONDITION_FAILED", message: ABS_NOT_LIVE_MESSAGE });
}

/** Undo and the "Done automatically" list: live, or shadow with the 0072 tables present. */
export function assertAbsLiveTables(): void {
  assertAbsTrackingOn();
  if (effectiveAbsTrackingMode() !== "live" && getAbsTrackingBootStatus()?.liveTablesReady !== true) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: ABS_NOT_LIVE_MESSAGE });
  }
}

/** The approve actions re-run every check, including the fresh ABS history (read-only client). */
function liveActionDeps(db: ApplyDeps["db"], actor: string): ApplyDeps & { actor: string } {
  const config = readAbsTrackingConfig();
  const client = config.baseUrl && config.apiKey ? createAbsClient({ baseUrl: config.baseUrl, apiKey: config.apiKey, log: (m) => console.warn(m) }) : null;
  return {
    db,
    actor,
    config: liveConfigOf(config),
    fetchHistory: client ? (awb) => client.getHistory(awb) : null,
    secrets: [config.apiKey],
  };
}

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
    if (err instanceof LiveError) throw new TRPCError({ code: err.code, message: err.message });
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

  // ── Live mode (Delivered only) ─────────────────────────────────────────
  /** "Ready to mark Delivered (N)" — approval mode. */
  liveReady: adminProcedure.query(async ({ ctx }) => {
    assertAbsLive();
    return await getLiveReady(ctx.db);
  }),

  /** Live candidates that need a person (the "Needs your attention" live rows). */
  liveAttention: adminProcedure.query(async ({ ctx }) => {
    assertAbsLive();
    return await getLiveAttention(ctx.db);
  }),

  /** "Done automatically": today and the last 7 days. */
  liveDone: adminProcedure.query(async ({ ctx }) => {
    assertAbsLiveTables();
    return await getLiveDone(ctx.db);
  }),

  liveSetPaused: adminProcedure.input(z.object({ paused: z.boolean(), note: z.string().trim().max(NOTE_MAX).optional().nullable() })).mutation(async ({ ctx, input }) => {
    assertAbsLive();
    return await guarded(() => setLivePaused({ db: ctx.db, actor: actorOf(ctx) }, { paused: input.paused, note: input.note?.trim() || null }));
  }),

  /** "Mark these N Delivered": exactly the previewed ids, each re-checked. */
  liveApproveReady: adminProcedure.input(z.object({ decisionIds: z.array(z.string().uuid()).min(1).max(100) })).mutation(async ({ ctx, input }) => {
    assertAbsLive();
    return await guarded(() => approveReady(liveActionDeps(ctx.db, actorOf(ctx)), input.decisionIds));
  }),

  /** "Delivered more than N days ago — approve" (one item). */
  liveApproveOld: adminProcedure.input(z.object({ decisionId: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    assertAbsLive();
    return await guarded(() => approveOld(liveActionDeps(ctx.db, actorOf(ctx)), input.decisionId));
  }),

  /** "Undo this automatic Delivered". */
  liveUndo: adminProcedure.input(z.object({ applicationId: z.string().uuid(), note })).mutation(async ({ ctx, input }) => {
    assertAbsLiveTables();
    return await guarded(() => undoApplication({ db: ctx.db, actor: actorOf(ctx) }, input));
  }),

  /** "Don't mark this one automatically". */
  liveSuppress: adminProcedure.input(z.object({ decisionId: z.string().uuid(), note })).mutation(async ({ ctx, input }) => {
    assertAbsLive();
    return await guarded(() => suppressDecision({ db: ctx.db, actor: actorOf(ctx) }, input));
  }),
});
