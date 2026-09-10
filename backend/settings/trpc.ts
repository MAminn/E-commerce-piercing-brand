import { z } from "zod";
import {
  adminProcedure,
  provideDatabase,
  publicProcedure,
  router,
} from "#root/shared/trpc/server.js";
import {
  runBackendEffect,
  serializeBackendEffectResult,
} from "#root/shared/backend/effect.js";
import { getShippingFee } from "./get-shipping-fee";
import { updateShippingFee } from "./update-shipping-fee";
import { getTemplateSelection } from "./get-template-selection";
import { updateTemplateSelection } from "./update-template-selection";
import { getLinkTreeConfig } from "./get-link-tree-config";
import { updateLinkTreeConfig } from "./update-link-tree-config";
import { getVariantPresets } from "./get-variant-presets";
import { updateVariantPresets } from "./update-variant-presets";
import { getComingSoonMode } from "./get-coming-soon";
import { setComingSoonMode } from "./set-coming-soon";
import { getProductPageContent } from "./get-product-page-content";
import { updateProductPageContent } from "./update-product-page-content";
import { linkTreeConfigSchema } from "#root/shared/types/link-tree";
import { Effect } from "effect";
import { EmailService, renderEmailTemplate } from "#root/shared/email/service.js";
import { ComingSoonWelcomeTemplate } from "#root/backend/emails/minimal/coming-soon-welcome";
import { getEmailBranding } from "#root/backend/emails/branding";
import { query } from "#root/shared/database/drizzle/db.js";
import * as Tables from "#root/shared/database/drizzle/schema.js";
import { desc, eq, isNull } from "drizzle-orm";

export const settingsRouter = router({
  /** Public: anyone (including the cart page) can read the shipping fee */
  getShippingFee: publicProcedure.query(async ({ ctx }) => {
    return runBackendEffect(getShippingFee().pipe(provideDatabase(ctx))).then(
      serializeBackendEffectResult,
    );
  }),

  /** Admin-only: update the shipping fee */
  updateShippingFee: adminProcedure
    .input(z.object({ fee: z.number().min(0) }))
    .mutation(async ({ ctx, input }) => {
      return runBackendEffect(
        updateShippingFee(input.fee).pipe(provideDatabase(ctx)),
      ).then(serializeBackendEffectResult);
    }),

  /** Public: storefront and admin can read the active template selection */
  getTemplateSelection: publicProcedure.query(async ({ ctx }) => {
    return runBackendEffect(
      getTemplateSelection().pipe(provideDatabase(ctx)),
    ).then(serializeBackendEffectResult);
  }),

  /** Admin-only: update template selection */
  updateTemplateSelection: adminProcedure
    .input(z.object({ selection: z.record(z.string(), z.string()) }))
    .mutation(async ({ ctx, input }) => {
      return runBackendEffect(
        updateTemplateSelection(input.selection).pipe(provideDatabase(ctx)),
      ).then(serializeBackendEffectResult);
    }),

  /** Public: anyone (including the /links page) can read the link tree config */
  getLinkTreeConfig: publicProcedure.query(async ({ ctx }) => {
    return runBackendEffect(
      getLinkTreeConfig().pipe(provideDatabase(ctx)),
    ).then(serializeBackendEffectResult);
  }),

  /** Admin-only: update the link tree config */
  updateLinkTreeConfig: adminProcedure
    .input(z.object({ config: linkTreeConfigSchema }))
    .mutation(async ({ ctx, input }) => {
      return runBackendEffect(
        updateLinkTreeConfig(input.config).pipe(provideDatabase(ctx)),
      ).then(serializeBackendEffectResult);
    }),

  /** Public: product form needs presets to offer quick-apply */
  getVariantPresets: publicProcedure.query(async ({ ctx }) => {
    return runBackendEffect(
      getVariantPresets().pipe(provideDatabase(ctx)),
    ).then(serializeBackendEffectResult);
  }),

  /** Admin-only: update variant presets */
  updateVariantPresets: adminProcedure
    .input(
      z.object({
        presets: z.array(
          z.object({
            id: z.string(),
            name: z.string().min(1).max(255),
            values: z.array(
              z.object({
                value: z.string().min(1).max(255),
                priceModifier: z.number().optional(),
              }),
            ),
            defaultValue: z.string().max(255).optional(),
            strikethroughValues: z.array(z.string().max(255)).optional(),
          }),
        ),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return runBackendEffect(
        updateVariantPresets(input.presets).pipe(provideDatabase(ctx)),
      ).then(serializeBackendEffectResult);
    }),

  /** Public: anyone can check coming-soon mode (used by storefront) */
  getComingSoonMode: publicProcedure.query(async ({ ctx }) => {
    return runBackendEffect(
      getComingSoonMode().pipe(provideDatabase(ctx)),
    ).then(serializeBackendEffectResult);
  }),

  /** Admin-only: toggle coming-soon mode */
  setComingSoonMode: adminProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      return runBackendEffect(
        setComingSoonMode(input.enabled).pipe(provideDatabase(ctx)),
      ).then(serializeBackendEffectResult);
    }),

  /** Public: product page needs this to render Shipping/Returns/FAQs text */
  getProductPageContent: publicProcedure.query(async ({ ctx }) => {
    return runBackendEffect(
      getProductPageContent().pipe(provideDatabase(ctx)),
    ).then(serializeBackendEffectResult);
  }),

  /** Admin-only: update Shipping/Returns/FAQs text shown on the product page */
  updateProductPageContent: adminProcedure
    .input(
      z.object({
        content: z.object({
          shippingText: z.string().max(2000).optional(),
          shippingTextAr: z.string().max(2000).optional(),
          returnsText: z.string().max(2000).optional(),
          returnsTextAr: z.string().max(2000).optional(),
          faqs: z
            .array(
              z.object({
                question: z.string().max(200),
                questionAr: z.string().max(200).optional(),
                answer: z.string().max(2000),
                answerAr: z.string().max(2000).optional(),
              }),
            )
            .max(20)
            .optional(),
        }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return runBackendEffect(
        updateProductPageContent(input.content).pipe(provideDatabase(ctx)),
      ).then(serializeBackendEffectResult);
    }),

  /**
   * Public: footer newsletter signup. Shares the same subscriber list as
   * the coming-soon page (so both show up together on the Settings
   * subscribers table) but does NOT send the "you got here early" email —
   * that copy only makes sense for the coming-soon flow.
   */
  subscribeNewsletter: publicProcedure
    .input(z.object({ email: z.string().email() }))
    .mutation(async ({ ctx, input }) => {
      return runBackendEffect(
        Effect.gen(function* ($) {
          const existing = yield* $(
            query((db) =>
              db
                .select({ id: Tables.comingSoonSubscribers.id })
                .from(Tables.comingSoonSubscribers)
                .where(eq(Tables.comingSoonSubscribers.email, input.email))
                .limit(1),
            ),
          );

          if (existing.length === 0) {
            yield* $(
              query((db) =>
                db.insert(Tables.comingSoonSubscribers).values({ email: input.email }),
              ),
            );
          }

          return { subscribed: true };
        }).pipe(provideDatabase(ctx)),
      ).then(serializeBackendEffectResult);
    }),

  /** Public: subscribe an email to the coming-soon list and send welcome email */
  subscribeComingSoon: publicProcedure
    .input(z.object({ email: z.string().email(), phone: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      // DB: upsert subscriber
      const dbResult = await runBackendEffect(
        Effect.gen(function* ($) {
          const existing = yield* $(
            query((db) =>
              db
                .select({ id: Tables.comingSoonSubscribers.id })
                .from(Tables.comingSoonSubscribers)
                .where(eq(Tables.comingSoonSubscribers.email, input.email))
                .limit(1),
            ),
          );

          if (existing.length === 0) {
            yield* $(
              query((db) =>
                db.insert(Tables.comingSoonSubscribers).values({ email: input.email, phone: input.phone ?? null }),
              ),
            );
          }

          return { inserted: existing.length === 0 };
        }).pipe(provideDatabase(ctx)),
      ).then(serializeBackendEffectResult);

      if (!dbResult.success) return dbResult;

      // Email: send welcome (outside of runBackendEffect so EmailService is provided)
      try {
        const branding = await getEmailBranding();
        const htmlResult = await Effect.runPromise(
          renderEmailTemplate(
            ComingSoonWelcomeTemplate({
              storeName: branding.storeName,
            }),
          ),
        );
        await Effect.runPromise(
          Effect.gen(function* ($) {
            const emailService = yield* $(EmailService);
            yield* $(
              emailService.sendEmail(
                input.email,
                `Welcome to ${branding.storeName} — You're early!`,
                htmlResult,
              ),
            );
          }).pipe(Effect.provideService(EmailService, ctx.emailService)),
        );
      } catch (err) {
        console.error("Failed to send coming-soon welcome email:", err);
      }

      return { success: true as const, result: { success: true } };
    }),

  /** Admin: get all coming-soon subscribers */
  getComingSoonSubscribers: adminProcedure.query(async ({ ctx }) => {
    return runBackendEffect(
      Effect.gen(function* ($) {
        const rows = yield* $(
          query((db) =>
            db
              .select({
                id: Tables.comingSoonSubscribers.id,
                email: Tables.comingSoonSubscribers.email,
                phone: Tables.comingSoonSubscribers.phone,
                subscribedAt: Tables.comingSoonSubscribers.subscribedAt,
                notifiedAt: Tables.comingSoonSubscribers.notifiedAt,
              })
              .from(Tables.comingSoonSubscribers)
              .orderBy(desc(Tables.comingSoonSubscribers.subscribedAt)),
          ),
        );

        return rows;
      }).pipe(provideDatabase(ctx)),
    ).then(serializeBackendEffectResult);
  }),

  /** Admin: delete a coming-soon subscriber */
  deleteComingSoonSubscriber: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return runBackendEffect(
        Effect.gen(function* ($) {
          yield* $(
            query((db) =>
              db
                .delete(Tables.comingSoonSubscribers)
                .where(eq(Tables.comingSoonSubscribers.id, input.id)),
            ),
          );
          return { deleted: true };
        }).pipe(provideDatabase(ctx)),
      ).then(serializeBackendEffectResult);
    }),

  /** Admin: blast "we're live" email to all subscribers who haven't been notified yet */
  notifySubscribersGoLive: adminProcedure
    .input(
      z.object({
        subject: z.string().min(1),
        htmlContent: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Fetch un-notified subscribers from DB
      const subsResult = await runBackendEffect(
        query((db) =>
          db
            .select({ id: Tables.comingSoonSubscribers.id, email: Tables.comingSoonSubscribers.email })
            .from(Tables.comingSoonSubscribers)
            .where(isNull(Tables.comingSoonSubscribers.notifiedAt)),
        ).pipe(provideDatabase(ctx)),
      ).then(serializeBackendEffectResult);

      if (!subsResult.success) return subsResult;

      const subscribers = subsResult.result;
      let sent = 0;

      // Send emails outside of runBackendEffect
      await Effect.runPromise(
        Effect.gen(function* ($) {
          const emailService = yield* $(EmailService);
          for (const sub of subscribers) {
            try {
              yield* $(emailService.sendEmail(sub.email, input.subject, input.htmlContent));
              sent++;
            } catch (err) {
              console.error(`Failed to send go-live email to ${sub.email}:`, err);
            }
          }
        }).pipe(Effect.provideService(EmailService, ctx.emailService)),
      );

      // Bulk-mark notified in DB
      if (sent > 0) {
        const now = new Date();
        await runBackendEffect(
          query((db) =>
            db
              .update(Tables.comingSoonSubscribers)
              .set({ notifiedAt: now })
              .where(isNull(Tables.comingSoonSubscribers.notifiedAt)),
          ).pipe(provideDatabase(ctx)),
        );
      }

      return { success: true as const, result: { sent, total: subscribers.length } };
    }),

  /** Admin: send a one-off broadcast to an arbitrary list of emails (no DB marking) */
  sendBroadcast: adminProcedure
    .input(
      z.object({
        emails: z.array(z.string().email()).min(1),
        subject: z.string().min(1),
        htmlContent: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      let sent = 0;

      await Effect.runPromise(
        Effect.gen(function* ($) {
          const emailService = yield* $(EmailService);
          for (const email of input.emails) {
            try {
              yield* $(emailService.sendEmail(email, input.subject, input.htmlContent));
              sent++;
            } catch (err) {
              console.error(`Failed to send broadcast to ${email}:`, err);
            }
          }
        }).pipe(Effect.provideService(EmailService, ctx.emailService)),
      );

      return { success: true as const, result: { sent, total: input.emails.length } };
    }),
});
