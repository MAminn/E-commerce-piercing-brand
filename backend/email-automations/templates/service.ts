import { db } from "#root/shared/database/drizzle/db";
import { emailTemplate, promoCode } from "#root/shared/database/drizzle/schema";
import type { EmailTemplateContent } from "#root/shared/database/drizzle/schema";
import { and, eq } from "drizzle-orm";
import {
  DEFAULT_EMAIL_TEMPLATES,
  getDefaultTemplate,
  listAllTemplateKeys,
} from "./defaults";
import type { EmailAutomationType } from "../queue/service";

export interface AttachedPromoCode {
  id: string;
  code: string;
  discountType: "percentage" | "fixed_amount";
  discountValue: number;
}

export interface EffectiveEmailTemplate {
  automationType: EmailAutomationType;
  stepKey: string;
  enabled: boolean;
  delayMinutes: number;
  subjectEn: string;
  subjectAr: string;
  preheaderEn: string;
  preheaderAr: string;
  content: EmailTemplateContent;
  /** The real promo code this template's {{discountCode}} resolves to, if any. */
  promoCode: AttachedPromoCode | null;
  /** True if an admin override exists in the DB; false if this is the shipped default, untouched. */
  isCustomized: boolean;
}

type StoredTemplateRow = typeof emailTemplate.$inferSelect;
type PromoCodeRow = typeof promoCode.$inferSelect;

function toAttachedPromoCode(row: PromoCodeRow | null | undefined): AttachedPromoCode | null {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    discountType: row.discountType,
    discountValue: Number(row.discountValue),
  };
}

function mergeWithDefault(
  automationType: EmailAutomationType,
  stepKey: string,
  stored: StoredTemplateRow | undefined,
  attachedPromoCode: PromoCodeRow | null | undefined,
): EffectiveEmailTemplate {
  const fallback = getDefaultTemplate(automationType, stepKey);
  if (!fallback && !stored) {
    throw new Error(
      `No default or stored template for ${automationType}:${stepKey}`,
    );
  }
  if (!stored) {
    return {
      automationType,
      stepKey,
      enabled: true,
      delayMinutes: fallback!.delayMinutes,
      subjectEn: fallback!.subjectEn,
      subjectAr: fallback!.subjectAr,
      preheaderEn: fallback!.preheaderEn,
      preheaderAr: fallback!.preheaderAr,
      content: fallback!.content,
      promoCode: null,
      isCustomized: false,
    };
  }
  return {
    automationType,
    stepKey,
    enabled: stored.enabled,
    delayMinutes: stored.delayMinutes,
    subjectEn: stored.subjectEn,
    subjectAr: stored.subjectAr,
    preheaderEn: stored.preheaderEn ?? fallback?.preheaderEn ?? "",
    preheaderAr: stored.preheaderAr ?? fallback?.preheaderAr ?? "",
    content: stored.content,
    promoCode: toAttachedPromoCode(attachedPromoCode),
    isCustomized: true,
  };
}

export async function getEffectiveTemplate(
  automationType: EmailAutomationType,
  stepKey: string,
): Promise<EffectiveEmailTemplate> {
  const rows = await db()
    .select({ template: emailTemplate, promoCode })
    .from(emailTemplate)
    .leftJoin(promoCode, eq(emailTemplate.promoCodeId, promoCode.id))
    .where(
      and(
        eq(emailTemplate.automationType, automationType),
        eq(emailTemplate.stepKey, stepKey),
      ),
    )
    .limit(1);
  const row = rows[0];
  return mergeWithDefault(automationType, stepKey, row?.template, row?.promoCode);
}

export async function listEffectiveTemplates(): Promise<
  EffectiveEmailTemplate[]
> {
  const storedRows = await db()
    .select({ template: emailTemplate, promoCode })
    .from(emailTemplate)
    .leftJoin(promoCode, eq(emailTemplate.promoCodeId, promoCode.id));
  const storedByKey = new Map(
    storedRows.map((row) => [`${row.template.automationType}:${row.template.stepKey}`, row]),
  );
  return listAllTemplateKeys().map(({ automationType, stepKey }) => {
    const row = storedByKey.get(`${automationType}:${stepKey}`);
    return mergeWithDefault(automationType, stepKey, row?.template, row?.promoCode);
  });
}

export interface UpsertTemplateInput {
  automationType: EmailAutomationType;
  stepKey: string;
  enabled: boolean;
  delayMinutes: number;
  subjectEn: string;
  subjectAr: string;
  preheaderEn?: string;
  preheaderAr?: string;
  content: EmailTemplateContent;
  /** Real promo code id from the Promo Codes page, or null to show no code. */
  promoCodeId: string | null;
}

export async function upsertTemplate(
  input: UpsertTemplateInput,
): Promise<void> {
  if (!getDefaultTemplate(input.automationType, input.stepKey)) {
    throw new Error(
      `Unknown template key ${input.automationType}:${input.stepKey}`,
    );
  }

  if (input.content.showDiscountCode && !input.promoCodeId) {
    throw new Error(
      "This template shows a discount code badge but no promo code is attached. Pick one from the Promo Codes page first.",
    );
  }

  await db()
    .insert(emailTemplate)
    .values({
      automationType: input.automationType,
      stepKey: input.stepKey,
      enabled: input.enabled,
      delayMinutes: input.delayMinutes,
      subjectEn: input.subjectEn,
      subjectAr: input.subjectAr,
      preheaderEn: input.preheaderEn ?? null,
      preheaderAr: input.preheaderAr ?? null,
      content: input.content,
      promoCodeId: input.promoCodeId,
    })
    .onConflictDoUpdate({
      target: [emailTemplate.automationType, emailTemplate.stepKey],
      set: {
        enabled: input.enabled,
        delayMinutes: input.delayMinutes,
        subjectEn: input.subjectEn,
        subjectAr: input.subjectAr,
        preheaderEn: input.preheaderEn ?? null,
        preheaderAr: input.preheaderAr ?? null,
        content: input.content,
        promoCodeId: input.promoCodeId,
        updatedAt: new Date(),
      },
    });
}

export { DEFAULT_EMAIL_TEMPLATES };
