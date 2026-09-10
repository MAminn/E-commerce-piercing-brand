import { t } from "#root/shared/trpc/server";
import {
  runBackendEffect,
  serializeBackendEffectResult,
} from "#root/shared/backend/effect";
import { adminProcedure, provideDatabase } from "#root/shared/trpc/server";
import {
  listTrackingEvents,
  getDeliveryStats,
  listEventsSchema,
  archiveEventLog,
} from "./service";

export const eventDeliveryRouter = t.router({
  list: adminProcedure
    .input(listEventsSchema)
    .query(async ({ ctx, input }) => {
      return await runBackendEffect(
        listTrackingEvents(input).pipe(provideDatabase(ctx)),
      ).then(serializeBackendEffectResult);
    }),

  stats: adminProcedure.query(async ({ ctx }) => {
    return await runBackendEffect(
      getDeliveryStats().pipe(provideDatabase(ctx)),
    ).then(serializeBackendEffectResult);
  }),

  archiveLog: adminProcedure.mutation(async ({ ctx }) => {
    return await runBackendEffect(
      archiveEventLog().pipe(provideDatabase(ctx)),
    ).then(serializeBackendEffectResult);
  }),
});
