/**
 * What the public /offers page shows once its data has loaded.
 *
 * The page lists three promotion types: live Pick Your Set campaigns (each
 * with a "Build this set" CTA into its builder), public Promo Codes and
 * automatic cart Offers. All three are visible to every visitor — there is no
 * sign-in gate (the codes listed are only those the merchant marked "show on
 * offers page"; private codes never reach this page). A global empty state is
 * shown only when NO type has anything for the customer.
 */
export interface OffersPageState {
  /** Nothing of any type: show the single global empty message. */
  showGlobalEmpty: boolean;
  /** Render the Pick Your Set offer cards. */
  showSets: boolean;
  /** Render the automatic-offer cards. */
  showOffers: boolean;
  /** Render the promo-code section. */
  showPromoCodes: boolean;
}

export function offersPageState(counts: { sets?: number; offers: number; promoCodes: number }): OffersPageState {
  const showSets = (counts.sets ?? 0) > 0;
  const showOffers = counts.offers > 0;
  const showPromoCodes = counts.promoCodes > 0;
  return { showGlobalEmpty: !showSets && !showOffers && !showPromoCodes, showSets, showOffers, showPromoCodes };
}

export const OFFERS_PAGE_EMPTY_COPY = {
  en: "No active offers or promo codes right now.",
  ar: "لا توجد عروض أو أكواد خصم نشطة حالياً.",
} as const;
