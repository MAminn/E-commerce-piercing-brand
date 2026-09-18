import { describe, expect, it } from "vitest";
import type { CartOfferRow } from "#root/shared/database/drizzle/schema";
import { applyOffersToCart } from "../service";
import {
  buildOfferInputs,
  computeCartTotals,
  type PricingBundle,
  type PricingRegularLine,
} from "#root/shared/bundles/cart-pricing";

/**
 * The real offers engine driven through the bundle-aware inputs — proves the
 * `offer_stacking` policy end to end without touching the engine itself.
 */

function makeOffer(overrides: Partial<CartOfferRow>): CartOfferRow {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    name: "Test offer",
    description: null,
    isActive: true,
    priority: 0,
    isExclusive: false,
    condition: { type: "always" },
    reward: { type: "free_shipping" },
    startsAt: null,
    endsAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as CartOfferRow;
}

const line = (id: string, quantity: number, price: number): PricingRegularLine => ({ id, name: id, quantity, price });
const stack = (offerStacking: PricingBundle["offerStacking"], instanceId = "s1"): PricingBundle => ({
  instanceId,
  offerStacking,
  regularTotal: 600,
  bundleTotal: 480,
  items: ["A", "B", "C", "D", "E", "F"].map((id) => ({ productId: id, name: id, quantity: 1, unitPrice: 100 })),
});

function priceCart(regular: PricingRegularLine[], bundles: PricingBundle[], offers: CartOfferRow[]) {
  const inputs = buildOfferInputs(regular, bundles);
  const applied = applyOffersToCart(offers, inputs.cartItems, inputs.subtotal);
  const offerDiscount = applied.reduce((s, o) => s + o.discountAmount, 0);
  const totals = computeCartTotals({
    regularLines: regular,
    bundles,
    offerDiscount,
    promo: null,
    baseShippingFee: 50,
    freeShipping: applied.some((o) => o.freeShipping),
  });
  return { applied, totals };
}

const tenPercentOver500 = makeOffer({
  condition: { type: "cart_total", minTotal: 500 },
  reward: { type: "percentage_off", percentOff: 10 },
});

describe("offer_stacking = exclusive", () => {
  it("does not let a cart-total offer see or discount the stack (no double discount)", () => {
    const { applied, totals } = priceCart([], [stack("exclusive")], [tenPercentOver500]);
    // The stack alone is 480 charged / 600 regular — invisible to the engine either way.
    expect(applied).toHaveLength(0);
    expect(totals.total).toBe(480 + 50);
  });

  it("still applies offers to the ordinary items next to an exclusive stack, on their value only", () => {
    const { applied, totals } = priceCart([line("p1", 1, 600)], [stack("exclusive")], [tenPercentOver500]);
    expect(applied).toHaveLength(1);
    expect(applied[0]!.discountAmount).toBe(60); // 10% of 600, not of 1080 or 1200
    expect(totals.total).toBe(600 - 60 + 480 + 50);
  });

  it("a quantity-threshold free-item offer cannot pick a stack child as the free unit", () => {
    const buy3get1 = makeOffer({
      condition: { type: "quantity_threshold", minQuantity: 3 },
      reward: { type: "free_items", quantity: 1, which: "cheapest" },
    });
    const { applied } = priceCart([line("p1", 3, 200)], [stack("exclusive")], [buy3get1]);
    expect(applied).toHaveLength(1);
    expect(applied[0]!.discountAmount).toBe(200); // cheapest ordinary unit, never a 100 EGP stack child
  });
});

describe("offer_stacking = stackable", () => {
  it("lets a cart-total offer count the stack at its CHARGED value and discount that", () => {
    const { applied, totals } = priceCart([], [stack("stackable")], [
      makeOffer({ condition: { type: "cart_total", minTotal: 450 }, reward: { type: "percentage_off", percentOff: 10 } }),
    ]);
    expect(applied).toHaveLength(1);
    expect(applied[0]!.discountAmount).toBe(48); // 10% of 480, never of 600
    expect(totals.total).toBe(480 - 48 + 50);
  });

  it("quantity thresholds count stack children as units, at bundle-share prices", () => {
    const buy6get1 = makeOffer({
      condition: { type: "quantity_threshold", minQuantity: 6 },
      reward: { type: "free_items", quantity: 1, which: "cheapest" },
    });
    const { applied, totals } = priceCart([], [stack("stackable")], [buy6get1]);
    expect(applied).toHaveLength(1);
    expect(applied[0]!.discountAmount).toBe(80); // one child's share (480 / 6), not its 100 regular price
    expect(totals.total).toBe(480 - 80 + 50);
  });

  it("a fixed-off offer is capped by the stackable base", () => {
    const { totals } = priceCart([], [stack("stackable")], [
      makeOffer({ condition: { type: "always" }, reward: { type: "fixed_off", amountOff: 1000 } }),
    ]);
    expect(totals.offerDiscount).toBe(480);
    expect(totals.total).toBe(50);
  });
});

describe("normal carts are unaffected", () => {
  it("prices an ordinary cart identically to the pre-bundle path", () => {
    const { applied, totals } = priceCart([line("p1", 2, 400)], [], [tenPercentOver500]);
    expect(applied[0]!.discountAmount).toBe(80);
    expect(totals.subtotal).toBe(800);
    expect(totals.total).toBe(800 - 80 + 50);
  });

  it("free shipping from an offer still zeroes shipping with stacks in the cart", () => {
    const freeShipOver1000 = makeOffer({ condition: { type: "cart_total", minTotal: 1000 }, reward: { type: "free_shipping" } });
    const { totals } = priceCart([line("p1", 1, 1000)], [stack("exclusive")], [freeShipOver1000]);
    expect(totals.shipping).toBe(0);
    expect(totals.total).toBe(1000 + 480);
  });

  it("two independent stacks are two charges even when one is stackable and one exclusive", () => {
    const { totals } = priceCart([], [stack("exclusive", "s1"), stack("stackable", "s2")], [
      makeOffer({ condition: { type: "always" }, reward: { type: "percentage_off", percentOff: 50 } }),
    ]);
    expect(totals.bundleChargedValue).toBe(960);
    expect(totals.offerBase).toBe(480);
    expect(totals.offerDiscount).toBe(240);
    expect(totals.total).toBe(960 - 240 + 50);
  });
});
