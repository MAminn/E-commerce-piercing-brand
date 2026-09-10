import {
  runBackendEffect,
  serializeBackendEffectResult,
} from "#root/shared/backend/effect";
import { provideDatabase, adminProcedure, publicProcedure } from "#root/shared/trpc/server";
import { t } from "#root/shared/trpc/server";
import {
  listPixelConfigs,
  listActiveClientConfigs,
  getPixelConfig,
  createPixelConfig,
  updatePixelConfig,
  deletePixelConfig,
  createPixelConfigSchema,
  updatePixelConfigSchema,
} from "./service";
import { z } from "zod";

export const pixelConfigRouter = t.router({
  /** Public: returns only enabled client-side configs (no accessToken). */
  listActive: publicProcedure.query(async ({ ctx }) => {
    return await runBackendEffect(
      listActiveClientConfigs().pipe(provideDatabase(ctx)),
    ).then(serializeBackendEffectResult);
  }),

  list: adminProcedure.query(async ({ ctx }) => {
    return await runBackendEffect(
      listPixelConfigs().pipe(provideDatabase(ctx)),
    ).then(serializeBackendEffectResult);
  }),

  get: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return await runBackendEffect(
        getPixelConfig(input.id).pipe(provideDatabase(ctx)),
      ).then(serializeBackendEffectResult);
    }),

  create: adminProcedure
    .input(createPixelConfigSchema)
    .mutation(async ({ ctx, input }) => {
      return await runBackendEffect(
        createPixelConfig(input).pipe(provideDatabase(ctx)),
      ).then(serializeBackendEffectResult);
    }),

  update: adminProcedure
    .input(updatePixelConfigSchema)
    .mutation(async ({ ctx, input }) => {
      return await runBackendEffect(
        updatePixelConfig(input).pipe(provideDatabase(ctx)),
      ).then(serializeBackendEffectResult);
    }),

  delete: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return await runBackendEffect(
        deletePixelConfig(input.id).pipe(provideDatabase(ctx)),
      ).then(serializeBackendEffectResult);
    }),
});
