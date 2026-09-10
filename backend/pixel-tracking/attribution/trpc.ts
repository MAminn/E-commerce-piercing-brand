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
  recordTouchpoint,
  getTouchpointsBySession,
  getTouchpointsByUser,
  getChannelStats,
  createTouchpointSchema,
} from "./service";
import { z } from "zod";

export const attributionRouter = t.router({
  /** Public: record a new attribution touchpoint (called from client on page load). */
  record: publicProcedure
    .input(createTouchpointSchema)
    .mutation(async ({ ctx, input }) => {
      return await runBackendEffect(
        recordTouchpoint(input).pipe(provideDatabase(ctx)),
      ).then(serializeBackendEffectResult);
    }),

  /** Admin: get all touchpoints for a session. */
  bySession: adminProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ ctx, input }) => {
      return await runBackendEffect(
        getTouchpointsBySession(input.sessionId).pipe(provideDatabase(ctx)),
      ).then(serializeBackendEffectResult);
    }),

  /** Admin: get all touchpoints for a user. */
  byUser: adminProcedure
    .input(z.object({ userId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return await runBackendEffect(
        getTouchpointsByUser(input.userId).pipe(provideDatabase(ctx)),
      ).then(serializeBackendEffectResult);
    }),

  /** Admin: get channel stats for the analytics dashboard. */
  channelStats: adminProcedure.query(async ({ ctx }) => {
    return await runBackendEffect(
      getChannelStats().pipe(provideDatabase(ctx)),
    ).then(serializeBackendEffectResult);
  }),
});
