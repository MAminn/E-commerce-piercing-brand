import {
  runBackendEffect,
  serializeBackendEffectResult,
} from "#root/shared/backend/effect";
import {
  adminProcedure,
  provideDatabase,
  publicProcedure,
  t,
} from "#root/shared/trpc/server";
import { z } from "zod";
import { Effect } from "effect";
import { query } from "#root/shared/database/drizzle/db";
import { loadAndValidateBundleSelection } from "./selection";
import {
  bundleSlugSchema,
  createBundleCampaign,
  createBundleCampaignSchema,
  deleteBundleCampaign,
  getBundleCampaign,
  getLiveBundleCampaignBySlug,
  isBundleSlugAvailable,
  listAllBundleCampaigns,
  listLiveBundleCampaigns,
  listLiveBundleCampaignsSchema,
  previewBundleEligibility,
  previewBundleEligibilitySchema,
  setBundleCampaignActive,
  updateBundleCampaign,
  updateBundleCampaignSchema,
} from "./service";
import { bundleAnalyticsSchema, getBundleAnalytics } from "./analytics";

export const evaluateSelectionInputSchema = z.object({
  campaignId: z.string().uuid(),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.number().int().min(1).max(100),
        selectedOptions: z.record(z.string().max(100), z.string().max(200)).optional(),
      }),
    )
    .max(200)
    /** Curated stacks need no items — the server uses the campaign's composition. */
    .default([]),
  expectedBundleTotal: z.number().nonnegative().optional(),
});

export const bundlesRouter = t.router({
  /** Public: live campaigns for storefront merchandising (Phase 2 consumer). */
  listLive: publicProcedure
    .input(listLiveBundleCampaignsSchema.optional())
    .query(async ({ ctx, input }) => {
      return await runBackendEffect(
        listLiveBundleCampaigns(input ?? {}).pipe(provideDatabase(ctx))
      ).then(serializeBackendEffectResult);
    }),

  /** Public: one live campaign by slug — the future bundle-builder page's data source. */
  getLiveBySlug: publicProcedure
    .input(z.object({ slug: bundleSlugSchema }))
    .query(async ({ ctx, input }) => {
      return await runBackendEffect(
        getLiveBundleCampaignBySlug(input.slug).pipe(provideDatabase(ctx))
      ).then(serializeBackendEffectResult);
    }),

  /**
   * Public: server-authoritative check of a proposed stack. The client sends
   * only product ids + quantities (and, optionally, the bundle total it was
   * shown so a price change can be detected); every price in the response is
   * re-derived from the live campaign and product rows.
   */
  evaluateSelection: publicProcedure
    .input(evaluateSelectionInputSchema)
    .query(async ({ ctx, input }) => {
      return await runBackendEffect(
        Effect.gen(function* ($) {
          return yield* $(
            query((db) =>
              loadAndValidateBundleSelection(db, {
                campaignId: input.campaignId,
                requested: input.items,
                expectedBundleTotal: input.expectedBundleTotal ?? null,
              }),
            ),
          );
        }).pipe(provideDatabase(ctx))
      ).then(serializeBackendEffectResult);
    }),

  /**
   * Admin: bundle sales analytics for a date range, derived entirely from
   * placed orders and their `order_bundle` snapshots. Six grouped queries;
   * never reads live campaign pricing for a historical figure.
   */
  analytics: adminProcedure
    .input(bundleAnalyticsSchema.optional())
    .query(async ({ ctx, input }) => {
      return await runBackendEffect(
        getBundleAnalytics(bundleAnalyticsSchema.parse(input ?? {})).pipe(provideDatabase(ctx))
      ).then(serializeBackendEffectResult);
    }),

  /** Admin: every campaign with derived state and its eligible pool. */
  adminList: adminProcedure.query(async ({ ctx }) => {
    return await runBackendEffect(
      listAllBundleCampaigns().pipe(provideDatabase(ctx))
    ).then(serializeBackendEffectResult);
  }),

  /** Admin: one campaign regardless of state. */
  adminGet: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return await runBackendEffect(
        getBundleCampaign(input.id).pipe(provideDatabase(ctx))
      ).then(serializeBackendEffectResult);
    }),

  /**
   * Admin: how many products the campaign's eligibility configuration matches
   * right now, and whether a stack can currently be completed. Takes the
   * UNSAVED form state so the editor can show live counts, and answers from
   * the same resolver + Phase 3 availability rules the storefront uses — the
   * CMS never approximates eligibility itself.
   */
  previewEligibility: adminProcedure
    .input(previewBundleEligibilitySchema)
    .query(async ({ ctx, input }) => {
      return await runBackendEffect(
        previewBundleEligibility(input).pipe(provideDatabase(ctx))
      ).then(serializeBackendEffectResult);
    }),

  /** Admin: pre-submit slug check for the form. */
  slugAvailable: adminProcedure
    .input(z.object({ slug: bundleSlugSchema, excludeId: z.string().uuid().optional() }))
    .query(async ({ ctx, input }) => {
      return await runBackendEffect(
        isBundleSlugAvailable(input.slug, input.excludeId).pipe(provideDatabase(ctx))
      ).then(serializeBackendEffectResult);
    }),

  create: adminProcedure
    .input(createBundleCampaignSchema)
    .mutation(async ({ ctx, input }) => {
      return await runBackendEffect(
        createBundleCampaign(input).pipe(provideDatabase(ctx))
      ).then(serializeBackendEffectResult);
    }),

  update: adminProcedure
    .input(updateBundleCampaignSchema)
    .mutation(async ({ ctx, input }) => {
      return await runBackendEffect(
        updateBundleCampaign(input).pipe(provideDatabase(ctx))
      ).then(serializeBackendEffectResult);
    }),

  /** Admin: on/off switch. Activation is refused if the pool can't complete a bundle. */
  setActive: adminProcedure
    .input(z.object({ id: z.string().uuid(), isActive: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      return await runBackendEffect(
        setBundleCampaignActive(input.id, input.isActive).pipe(provideDatabase(ctx))
      ).then(serializeBackendEffectResult);
    }),

  delete: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return await runBackendEffect(
        deleteBundleCampaign(input.id).pipe(provideDatabase(ctx))
      ).then(serializeBackendEffectResult);
    }),
});
