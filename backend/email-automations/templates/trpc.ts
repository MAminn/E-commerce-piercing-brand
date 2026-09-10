import { z } from "zod";
import { Effect } from "effect";
import { TRPCError } from "@trpc/server";
import { adminProcedure, router } from "#root/shared/trpc/server";
import { EmailService } from "#root/shared/email/service";
import { listEffectiveTemplates, upsertTemplate } from "./service";
import { listAllTemplateKeys } from "./defaults";
import { buildSamplePayload } from "./sample-payload";
import { renderScheduledEmail } from "../render";
// Side effect: registers every automation type's HTML renderer, needed for
// preview/sendTest below. Idempotent, safe alongside worker.ts's own import.
import "./render";
import type { ScheduledEmailRow } from "#root/shared/database/drizzle/schema";

const automationTypeEnum = z.enum([
  "welcome",
  "review_check",
  "abandoned_cart",
  "abandoned_browse",
  "win_back",
  "new_drops",
  "flash_offer",
  "retention",
]);

const templateContentSchema = z.object({
  headlineEn: z.string(),
  headlineAr: z.string(),
  bodyEn: z.string(),
  bodyAr: z.string(),
  ctaLabelEn: z.string(),
  ctaLabelAr: z.string(),
  ctaHref: z.string(),
  showFeaturedItem: z.boolean(),
  showReviewStars: z.boolean(),
  showDiscountCode: z.boolean(),
  discountBadgeTextEn: z.string(),
  discountBadgeTextAr: z.string(),
});

function assertValidKey(automationType: string, stepKey: string) {
  const valid = listAllTemplateKeys().some(
    (k) => k.automationType === automationType && k.stepKey === stepKey,
  );
  if (!valid) {
    throw new Error(`Unknown template key ${automationType}:${stepKey}`);
  }
}

function buildPreviewRow(
  automationType: z.infer<typeof automationTypeEnum>,
  stepKey: string,
  locale: "en" | "ar",
  toEmail: string,
): ScheduledEmailRow {
  return {
    id: "preview",
    automationType,
    recipientEmail: toEmail,
    locale,
    payload: buildSamplePayload(automationType, stepKey),
    scheduledFor: new Date(),
    status: "sending",
    attempts: 0,
    lastError: null,
    dedupeKey: "preview",
    sentAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export const emailTemplatesRouter = router({
  list: adminProcedure.query(async () => {
    const templates = await listEffectiveTemplates();
    return { success: true as const, result: templates };
  }),

  update: adminProcedure
    .input(
      z.object({
        automationType: automationTypeEnum,
        stepKey: z.string(),
        enabled: z.boolean(),
        delayMinutes: z.number().int().min(0),
        subjectEn: z.string().min(1),
        subjectAr: z.string().min(1),
        preheaderEn: z.string().optional(),
        preheaderAr: z.string().optional(),
        content: templateContentSchema,
        promoCodeId: z.string().uuid().nullable(),
      }),
    )
    .mutation(async ({ input }) => {
      assertValidKey(input.automationType, input.stepKey);
      try {
        await upsertTemplate(input);
      } catch (err) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: err instanceof Error ? err.message : "Failed to save template",
        });
      }
      return { success: true as const };
    }),

  preview: adminProcedure
    .input(
      z.object({
        automationType: automationTypeEnum,
        stepKey: z.string(),
        locale: z.enum(["en", "ar"]).default("en"),
      }),
    )
    .query(async ({ input }) => {
      assertValidKey(input.automationType, input.stepKey);
      const row = buildPreviewRow(
        input.automationType,
        input.stepKey,
        input.locale,
        "preview@example.com",
      );
      const rendered = await renderScheduledEmail(
        row,
        "https://example.com/unsubscribe?token=preview",
      );
      return { success: true as const, result: rendered };
    }),

  sendTest: adminProcedure
    .input(
      z.object({
        automationType: automationTypeEnum,
        stepKey: z.string(),
        locale: z.enum(["en", "ar"]).default("en"),
        toEmail: z.string().email(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      assertValidKey(input.automationType, input.stepKey);
      const row = buildPreviewRow(
        input.automationType,
        input.stepKey,
        input.locale,
        input.toEmail,
      );
      const rendered = await renderScheduledEmail(
        row,
        "https://example.com/unsubscribe?token=preview",
      );

      const result = await Effect.runPromise(
        Effect.gen(function* ($) {
          const emailService = yield* $(EmailService);
          return yield* $(
            emailService.sendEmail(
              input.toEmail,
              `[TEST] ${rendered.subject}`,
              rendered.html,
            ),
          );
        }).pipe(Effect.provideService(EmailService, ctx.emailService)),
      );

      if (!result.success) {
        return { success: false as const, error: result.error ?? "Send failed" };
      }
      return { success: true as const };
    }),
});
