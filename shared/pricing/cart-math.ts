/**
 * Single source of truth for how promo codes and automatic cart offers stack.
 * Used by both the client-side cart preview (CartContext) and the
 * server-side authoritative calculation (create-order/service.ts) — kept
 * here specifically so the two can't drift out of sync the way they did
 * before (promo discount was computed from the raw subtotal on both sides,
 * ignoring the automatic offer discount entirely).
 */

export type PromoDiscountType = "percentage" | "fixed_amount";

/**
 * A promo code's discount always applies to what's left *after* automatic
 * offer discounts, not the raw subtotal — so a 5% code doesn't overcharge
 * on top of e.g. a "Buy 2 Get 1" offer that's already reduced the total.
 */
export function computePromoDiscount(
  discountType: PromoDiscountType,
  discountValue: number,
  subtotal: number,
  offerDiscount: number,
): number {
  const base = Math.max(0, subtotal - offerDiscount);
  if (discountType === "percentage") {
    return base * (discountValue / 100);
  }
  return Math.min(discountValue, base);
}

/**
 * Shipping is derived fresh from current offer state rather than toggled
 * imperatively — that's what caused it to get stuck at 0 after a
 * free-shipping offer stopped applying (e.g. removing a cart item that had
 * pushed the total over a free-shipping threshold).
 */
export function deriveEffectiveShipping(
  baseShippingFee: number,
  appliedOffers: readonly { freeShipping: boolean }[],
): number {
  return appliedOffers.some((o) => o.freeShipping) ? 0 : baseShippingFee;
}

interface FreeQuantityCartItem {
  price: number;
  quantity: number;
}

interface FreeItemsOffer {
  reward: {
    type: string;
    quantity?: number;
    which?: "cheapest" | "most_expensive";
  };
}

/**
 * Mirrors backend/offers/service.ts's computeDiscount "free_items" case, but
 * tracks WHICH cart line each free unit lands on (by array index) instead of
 * just a flat discount total — lets the cart/checkout UI show a "FREE" badge
 * on the exact item(s) an offer gave away. Must be called with the same
 * items array (same order) that was sent to the offer-evaluation endpoint,
 * so index positions line up.
 */
export function computeFreeItemQuantities(
  items: readonly FreeQuantityCartItem[],
  appliedOffers: readonly FreeItemsOffer[],
): number[] {
  const freeByIndex = new Array(items.length).fill(0) as number[];

  for (const offer of appliedOffers) {
    if (offer.reward.type !== "free_items") continue;
    const quantity = offer.reward.quantity ?? 0;
    const which = offer.reward.which ?? "cheapest";

    const units: { index: number; price: number }[] = [];
    items.forEach((item, index) => {
      for (let i = 0; i < item.quantity; i++) {
        units.push({ index, price: item.price });
      }
    });

    units.sort((a, b) =>
      which === "cheapest" ? a.price - b.price : b.price - a.price,
    );

    for (const unit of units.slice(0, quantity)) {
      freeByIndex[unit.index]! += 1;
    }
  }

  return freeByIndex;
}
