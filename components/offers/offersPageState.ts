/**
 * What the public /offers page shows once its data has loaded.
 *
 * The page lists two promotion types: automatic cart Offers and public Promo
 * Codes (bundle campaigns have their own /bundles pages and are not surfaced
 * here). It used to print "No active offers right now." whenever the
 * automatic-offer list was empty — even directly above a list of active promo
 * codes. A global empty state is now shown only when NEITHER type has
 * anything for the customer.
 */
export interface OffersPageState {
  /** Nothing of any type: show the single global empty message. */
  showGlobalEmpty: boolean;
  /** Render the automatic-offer cards. */
  showOffers: boolean;
  /** Render the promo-code section (sign-in gated by the page itself). */
  showPromoCodes: boolean;
}

export function offersPageState(counts: { offers: number; promoCodes: number }): OffersPageState {
  const showOffers = counts.offers > 0;
  const showPromoCodes = counts.promoCodes > 0;
  return { showGlobalEmpty: !showOffers && !showPromoCodes, showOffers, showPromoCodes };
}

export const OFFERS_PAGE_EMPTY_COPY = {
  en: "No active offers or promo codes right now.",
  ar: "لا توجد عروض أو أكواد خصم نشطة حالياً.",
} as const;
