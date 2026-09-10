import { t } from "#root/shared/trpc/server";
import {
  runBackendEffect,
  serializeBackendEffectResult,
} from "#root/shared/backend/effect";
import { adminProcedure, provideDatabase } from "#root/shared/trpc/server";
import {
  getOverviewMetrics,
  getConversionFunnel,
  getEventBreakdown,
  getPlatformHealth,
  getTopTrackedProducts,
  getReturningCustomers,
  archiveAnalytics,
} from "./service";

export const analyticsRouter = t.router({
  overview: adminProcedure.query(async ({ ctx }) => {
    return await runBackendEffect(
      getOverviewMetrics().pipe(provideDatabase(ctx)),
    ).then(serializeBackendEffectResult);
  }),

  funnel: adminProcedure.query(async ({ ctx }) => {
    return await runBackendEffect(
      getConversionFunnel().pipe(provideDatabase(ctx)),
    ).then(serializeBackendEffectResult);
  }),

  eventBreakdown: adminProcedure.query(async ({ ctx }) => {
    return await runBackendEffect(
      getEventBreakdown().pipe(provideDatabase(ctx)),
    ).then(serializeBackendEffectResult);
  }),

  platformHealth: adminProcedure.query(async ({ ctx }) => {
    return await runBackendEffect(
      getPlatformHealth().pipe(provideDatabase(ctx)),
    ).then(serializeBackendEffectResult);
  }),

  topTrackedProducts: adminProcedure.query(async ({ ctx }) => {
    return await runBackendEffect(
      getTopTrackedProducts().pipe(provideDatabase(ctx)),
    ).then(serializeBackendEffectResult);
  }),

  returningCustomers: adminProcedure.query(async ({ ctx }) => {
    return await runBackendEffect(
      getReturningCustomers().pipe(provideDatabase(ctx)),
    ).then(serializeBackendEffectResult);
  }),

  archiveAll: adminProcedure.mutation(async ({ ctx }) => {
    return await runBackendEffect(
      archiveAnalytics().pipe(provideDatabase(ctx)),
    ).then(serializeBackendEffectResult);
  }),
});
