import { describe, expect, it } from "vitest";
import { applyOffersToCart, type CartItemInput } from "../service";
import type { CartOfferRow } from "#root/shared/database/drizzle/schema";

/** Minimal valid CartOfferRow — only the fields applyOffersToCart reads matter for these tests. */
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
    updatedAt: null,
    ...overrides,
  } as CartOfferRow;
}

const item = (id: string, quantity: number, price: number): CartItemInput => ({
  id,
  name: id,
  quantity,
  price,
});

describe("applyOffersToCart — cart_total free-shipping offer (client's reported scenario)", () => {
  const freeShippingOver1500 = makeOffer({
    condition: { type: "cart_total", minTotal: 1500 },
    reward: { type: "free_shipping" },
  });

  it("does NOT apply free shipping when the cart total is below the threshold (1300 EGP)", () => {
    const cartItems = [item("p1", 1, 1300)];
    const applied = applyOffersToCart([freeShippingOver1500], cartItems, 1300);
    expect(applied).toHaveLength(0);
  });

  it("applies free shipping once the cart total meets the threshold (1500 EGP)", () => {
    const cartItems = [item("p1", 1, 1500)];
    const applied = applyOffersToCart([freeShippingOver1500], cartItems, 1500);
    expect(applied).toHaveLength(1);
    expect(applied[0]!.freeShipping).toBe(true);
  });

  it("stops applying free shipping again once the total drops back below the threshold (the exact regression the client hit)", () => {
    // Starts above threshold — free shipping applies.
    let applied = applyOffersToCart([freeShippingOver1500], [item("p1", 2, 800)], 1600);
    expect(applied.some((o) => o.freeShipping)).toBe(true);

    // Cart total drops back under 1500 (e.g. quantity reduced via the "-" button).
    applied = applyOffersToCart([freeShippingOver1500], [item("p1", 1, 800)], 800);
    expect(applied.some((o) => o.freeShipping)).toBe(false);
  });
});

describe("applyOffersToCart — quantity_threshold free-shipping offer (alt condition client tried)", () => {
  const freeShippingOver4Items = makeOffer({
    condition: { type: "quantity_threshold", minQuantity: 4 },
    reward: { type: "free_shipping" },
  });

  it("does not apply with 3 items in cart", () => {
    const applied = applyOffersToCart([freeShippingOver4Items], [item("p1", 3, 100)], 300);
    expect(applied.some((o) => o.freeShipping)).toBe(false);
  });

  it("applies once quantity reaches 4", () => {
    const applied = applyOffersToCart([freeShippingOver4Items], [item("p1", 4, 100)], 400);
    expect(applied.some((o) => o.freeShipping)).toBe(true);
  });

  it("stops applying again after quantity drops back to 3 via decrement (client's exact repro: 3 -> 4 -> minus back to 3)", () => {
    let applied = applyOffersToCart([freeShippingOver4Items], [item("p1", 3, 100)], 300);
    expect(applied.some((o) => o.freeShipping)).toBe(false);

    applied = applyOffersToCart([freeShippingOver4Items], [item("p1", 4, 100)], 400);
    expect(applied.some((o) => o.freeShipping)).toBe(true);

    // The "-" button: quantity goes back down to 3.
    applied = applyOffersToCart([freeShippingOver4Items], [item("p1", 3, 100)], 300);
    expect(applied.some((o) => o.freeShipping)).toBe(false);
  });
});

describe("applyOffersToCart — percentage/fixed discounts stack additively with each other", () => {
  it("computes percentage_off against the cart subtotal", () => {
    const offer = makeOffer({
      condition: { type: "always" },
      reward: { type: "percentage_off", percentOff: 10 },
    });
    const applied = applyOffersToCart([offer], [item("p1", 1, 1000)], 1000);
    expect(applied[0]!.discountAmount).toBe(100);
  });

  it("caps fixed_off at the subtotal so it can never produce a negative total", () => {
    const offer = makeOffer({
      condition: { type: "always" },
      reward: { type: "fixed_off", amountOff: 5000 },
    });
    const applied = applyOffersToCart([offer], [item("p1", 1, 200)], 200);
    expect(applied[0]!.discountAmount).toBe(200);
  });
});

describe("applyOffersToCart — repeatsPerMultiple (Buy 2 Get 1 scaling with quantity)", () => {
  const buy2Get1 = makeOffer({
    condition: { type: "quantity_threshold", minQuantity: 3, repeatsPerMultiple: true },
    reward: { type: "free_items", quantity: 1, which: "cheapest" },
  });

  it("frees only 1 item at exactly the threshold (3 in cart)", () => {
    const applied = applyOffersToCart([buy2Get1], [item("p1", 3, 100)], 300);
    expect(applied[0]!.discountAmount).toBe(100);
    expect((applied[0]!.reward as { quantity: number }).quantity).toBe(1);
  });

  it("frees 2 items at double the threshold (6 in cart) — the client's exact ask", () => {
    const applied = applyOffersToCart([buy2Get1], [item("p1", 6, 100)], 600);
    expect(applied[0]!.discountAmount).toBe(200);
    expect((applied[0]!.reward as { quantity: number }).quantity).toBe(2);
  });

  it("frees 3 items at triple the threshold (9 in cart)", () => {
    const applied = applyOffersToCart([buy2Get1], [item("p1", 9, 100)], 900);
    expect(applied[0]!.discountAmount).toBe(300);
    expect((applied[0]!.reward as { quantity: number }).quantity).toBe(3);
  });

  it("does not multiply when repeatsPerMultiple is off (today's default behavior, unchanged)", () => {
    const flatBuy2Get1 = makeOffer({
      condition: { type: "quantity_threshold", minQuantity: 3 },
      reward: { type: "free_items", quantity: 1, which: "cheapest" },
    });
    const applied = applyOffersToCart([flatBuy2Get1], [item("p1", 9, 100)], 900);
    expect(applied[0]!.discountAmount).toBe(100);
    expect((applied[0]!.reward as { quantity: number }).quantity).toBe(1);
  });

  it("also scales fixed_off rewards the same way", () => {
    const offer = makeOffer({
      condition: { type: "quantity_threshold", minQuantity: 3, repeatsPerMultiple: true },
      reward: { type: "fixed_off", amountOff: 50 },
    });
    const applied = applyOffersToCart([offer], [item("p1", 6, 100)], 600);
    expect(applied[0]!.discountAmount).toBe(100); // 50 * 2
  });
});
