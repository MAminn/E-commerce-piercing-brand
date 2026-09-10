import {
  runBackendEffect,
  serializeBackendEffectResult,
} from "#root/shared/backend/effect";
import {
  provideDatabase,
  adminProcedure,
  publicProcedure,
} from "#root/shared/trpc/server";
import { t } from "#root/shared/trpc/server";
import {
  recordConsent,
  updateConsent,
  getConsentBySession,
  getConsentByUser,
  getConsentAuditLog,
  getConsentAuditLogBySession,
  recordConsentSchema,
  updateConsentSchema,
} from "./service";
import { z } from "zod";

export const consentRouter = t.router({
  /** Public: record a consent decision (from banner interaction). */
  record: publicProcedure
    .input(recordConsentSchema)
    .mutation(async ({ ctx, input }) => {
      return await runBackendEffect(
        recordConsent(input).pipe(provideDatabase(ctx)),
      ).then(serializeBackendEffectResult);
    }),

  /** Public: update consent preferences (from settings page). */
  update: publicProcedure
    .input(updateConsentSchema)
    .mutation(async ({ ctx, input }) => {
      return await runBackendEffect(
        updateConsent(input).pipe(provideDatabase(ctx)),
      ).then(serializeBackendEffectResult);
    }),

  /** Public: get current consent for a session (used by TrackingContext). */
  bySession: publicProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ ctx, input }) => {
      return await runBackendEffect(
        getConsentBySession(input.sessionId).pipe(provideDatabase(ctx)),
      ).then(serializeBackendEffectResult);
    }),

  /** Admin: get current consent for a user. */
  byUser: adminProcedure
    .input(z.object({ userId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return await runBackendEffect(
        getConsentByUser(input.userId).pipe(provideDatabase(ctx)),
      ).then(serializeBackendEffectResult);
    }),

  /** Admin: get full consent audit log for a user. */
  auditLog: adminProcedure
    .input(z.object({ userId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return await runBackendEffect(
        getConsentAuditLog(input.userId).pipe(provideDatabase(ctx)),
      ).then(serializeBackendEffectResult);
    }),

  /** Admin: get full consent audit log for a session. */
  auditLogBySession: adminProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ ctx, input }) => {
      return await runBackendEffect(
        getConsentAuditLogBySession(input.sessionId).pipe(
          provideDatabase(ctx),
        ),
      ).then(serializeBackendEffectResult);
    }),
});
