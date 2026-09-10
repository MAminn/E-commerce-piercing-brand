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
  listCustomEvents,
  listActiveCustomEvents,
  getCustomEvent,
  createCustomEvent,
  updateCustomEvent,
  deleteCustomEvent,
  createCustomEventSchema,
  updateCustomEventSchema,
} from "./service";
import { z } from "zod";

export const customEventsRouter = t.router({
  /** Public: returns active custom event configs for client trigger system. */
  listActive: publicProcedure.query(async ({ ctx }) => {
    return await runBackendEffect(
      listActiveCustomEvents().pipe(provideDatabase(ctx)),
    ).then(serializeBackendEffectResult);
  }),

  list: adminProcedure.query(async ({ ctx }) => {
    return await runBackendEffect(
      listCustomEvents().pipe(provideDatabase(ctx)),
    ).then(serializeBackendEffectResult);
  }),

  get: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return await runBackendEffect(
        getCustomEvent(input.id).pipe(provideDatabase(ctx)),
      ).then(serializeBackendEffectResult);
    }),

  create: adminProcedure
    .input(createCustomEventSchema)
    .mutation(async ({ ctx, input }) => {
      return await runBackendEffect(
        createCustomEvent(input).pipe(provideDatabase(ctx)),
      ).then(serializeBackendEffectResult);
    }),

  update: adminProcedure
    .input(updateCustomEventSchema)
    .mutation(async ({ ctx, input }) => {
      return await runBackendEffect(
        updateCustomEvent(input).pipe(provideDatabase(ctx)),
      ).then(serializeBackendEffectResult);
    }),

  delete: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return await runBackendEffect(
        deleteCustomEvent(input.id).pipe(provideDatabase(ctx)),
      ).then(serializeBackendEffectResult);
    }),
});
