/*
 * ─────────────────────────────────────────────────────────────────────────────
 * PERCÉ RETURNS POLICY — the owner-approved wording, in ONE place.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Approved by the owner (October 2026) as a customer-service policy:
 *
 *   1. Standard returns: eligible orders can be returned within 14 days.
 *   2. Colour change: if a jewellery piece changes colour, the customer may
 *      contact Percé for a return without being limited by the 14-day window.
 *
 * Point 2 is a RETURN REMEDY, not a product claim. Never reword it into a
 * material promise ("will not tarnish", "never changes colour", "waterproof",
 * "lifetime colour guarantee") — those are claims docs/CURRENT_PROJECT.md
 * still rules out. No category or hygiene exclusions have been approved, so
 * none are listed.
 *
 * These points seed the CMS default for /return-policy
 * (DEFAULT_HOMEPAGE_CONTENT.returnPolicy). The CMS (Dashboard > Homepage >
 * Return Policy) is what the storefront and the order-confirmation email
 * render — see ./return-policy-content.ts.
 *
 * Deliberately import-free so the homepage-content defaults can depend on it
 * without a module cycle.
 */

export interface ReturnsPolicyPoint {
  title: string;
  titleAr: string;
  text: string;
  textAr: string;
}

export const RETURNS_POLICY_POINTS: readonly ReturnsPolicyPoint[] = [
  {
    title: "14-day returns",
    titleAr: "الإرجاع خلال 14 يومًا",
    text: "Eligible orders can be returned within 14 days.",
    textAr: "يمكن إرجاع الطلبات المؤهلة خلال 14 يومًا.",
  },
  {
    title: "If a piece changes colour",
    titleAr: "إذا تغيّر لون القطعة",
    text: "If a jewellery piece changes colour, contact Percé for a return even outside the standard 14-day window.",
    textAr:
      "إذا تغيّر لون قطعة المجوهرات، تواصل مع Percé لطلب الإرجاع حتى بعد انتهاء فترة الـ14 يومًا المعتادة.",
  },
];
