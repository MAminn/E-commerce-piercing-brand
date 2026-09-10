import { db } from "#root/shared/database/drizzle/db";
import { promoCode, popupClaim, comingSoonSubscribers } from "#root/shared/database/drizzle/schema";
import { and, eq, or, isNotNull } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { v7 } from "uuid";
import { normalizePhone } from "./normalize-phone";
import { getPopupDiscountConfigRaw } from "./config-service";
import { enqueueScheduledEmail } from "#root/backend/email-automations/queue/service";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function generateCodeSuffix(): string {
  // 6 base32-ish chars from a wide alphabet — short enough to type, long
  // enough that collisions against promo_code's unique constraint are rare
  // (and the insert path below retries on the rare collision anyway).
  return randomBytes(4).toString("hex").toUpperCase().slice(0, 6);
}

export interface ClaimPopupDiscountInput {
  email: string;
  phone?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface ClaimPopupDiscountResult {
  code: string;
  alreadyClaimed: boolean;
}

/**
 * The popup's abuse gate: one discount code per email AND per phone,
 * permanently — enforced here, not just suppressed client-side (browser
 * storage alone is defeated by incognito/clearing cookies). A returning
 * claimant gets their EXISTING code back rather than being refused outright,
 * so someone who lost the email isn't punished for asking again.
 */
export async function claimPopupDiscount(
  input: ClaimPopupDiscountInput,
): Promise<ClaimPopupDiscountResult> {
  const email = normalizeEmail(input.email);
  const phone = input.phone ? normalizePhone(input.phone) : null;

  const existing = await findExistingClaim(email, phone);
  if (existing) {
    return { code: existing.issuedCode, alreadyClaimed: true };
  }

  const discountConfig = await getPopupDiscountConfigRaw();
  const issuedCode = await resolveIssuedCode(discountConfig);

  try {
    await db().insert(popupClaim).values({
      email,
      phone,
      promoCodeId: discountConfig.promoCodeId,
      issuedCode,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    });
  } catch (err) {
    // Race: two concurrent submissions for the same person both passed the
    // findExistingClaim check above. The unique index on email/phone
    // rejects the loser — re-fetch and return the winner's code instead of
    // erroring, so the user still gets a working code either way.
    const raceWinner = await findExistingClaim(email, phone);
    if (raceWinner) {
      return { code: raceWinner.issuedCode, alreadyClaimed: true };
    }
    throw err;
  }

  // Tie into the existing subscriber list (shared with the coming-soon
  // page) so the admin sees popup signups alongside every other subscriber.
  await db()
    .insert(comingSoonSubscribers)
    .values({ email, phone: phone ?? undefined })
    .onConflictDoNothing({ target: comingSoonSubscribers.email });

  // Immediate welcome email via the template system (bilingual,
  // admin-editable, includes the discount code) — NOT the old hardcoded
  // coming-soon welcome template, which has no discount-code support.
  await enqueueScheduledEmail({
    automationType: "welcome",
    recipientEmail: email,
    payload: { discountCode: issuedCode },
    scheduledFor: new Date(),
    dedupeKey: `welcome:popup:${email}`,
  });

  return { code: issuedCode, alreadyClaimed: false };
}

async function findExistingClaim(
  email: string,
  phone: string | null,
): Promise<{ issuedCode: string } | undefined> {
  const [row] = await db()
    .select({ issuedCode: popupClaim.issuedCode })
    .from(popupClaim)
    .where(
      phone
        ? or(eq(popupClaim.email, email), and(isNotNull(popupClaim.phone), eq(popupClaim.phone, phone)))
        : eq(popupClaim.email, email),
    )
    .limit(1);
  return row;
}

async function resolveIssuedCode(discountConfig: {
  promoCodeId: string | null;
  codeMode: "existing" | "generate";
}): Promise<string> {
  if (!discountConfig.promoCodeId) {
    throw new Error(
      "Popup discount is not configured — an admin must select a promo code in Dashboard → Marketing Emails → Popup settings",
    );
  }

  const [template] = await db()
    .select()
    .from(promoCode)
    .where(eq(promoCode.id, discountConfig.promoCodeId))
    .limit(1);

  if (!template) {
    throw new Error(
      `Popup's configured promo code (${discountConfig.promoCodeId}) no longer exists`,
    );
  }

  if (discountConfig.codeMode === "existing") {
    return template.code;
  }

  // "generate": mint a single-use personal code derived from the template's
  // discount terms, so it can't be shared/leaked to a coupon site the way a
  // fixed shared code inevitably does.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = `${template.code.slice(0, 12)}-${generateCodeSuffix()}`;
    try {
      await db()
        .insert(promoCode)
        .values({
          id: v7(),
          code,
          description: `Auto-issued from entry popup (based on ${template.code})`,
          discountType: template.discountType,
          discountValue: template.discountValue,
          status: "active",
          usageLimit: 1,
          minPurchaseAmount: template.minPurchaseAmount,
          appliesToAllProducts: template.appliesToAllProducts,
          showOnOffersPage: false,
        });
      return code;
    } catch (err) {
      // Unique violation on `code` — vanishingly rare with 6 random hex
      // chars, but retry rather than fail the whole signup over it.
      if (attempt === 4) throw err;
    }
  }
  throw new Error("Failed to generate a unique popup discount code");
}
