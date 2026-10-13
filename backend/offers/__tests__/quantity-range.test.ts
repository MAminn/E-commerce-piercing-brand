import { describe, expect, it } from "vitest";
import { applyOffersToCart, createOfferSchema, type CartItemInput } from "../service";
import type { CartOfferRow } from "#root/shared/database/drizzle/schema";

/**
 * The Min Quantity offer condition gained an optional inclusive maximum, so
 * an offer can target an exact or bounded number of UNITS. Offers without a
 * maximum (every existing one) keep their minimum-only behaviour.
 */
function makeOffer(overrides: Partial<CartOfferRow>): CartOfferRow {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    name: "Range offer",
    description: null,
    isActive: true,
    priority: 0,
    isExclusive: false,
    condition: { type: "always" },
    reward: { type: "percentage_off", percentOff: 10 },
    startsAt: null,
    endsAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as CartOfferRow;
}

const item = (id: string, quantity: number, price: number): CartItemInput => ({ id, name: id, quantity, price });
const cart = (units: number) => [item("a", units, 100)];

describe("quantity_threshold with maxQuantity", () => {
  const exactlyThree = makeOffer({ condition: { type: "quantity_threshold", minQuantity: 3, maxQuantity: 3 } });

  it("applies only at exactly 3 units when min = max = 3", () => {
    const applied = [1, 2, 3, 4, 6].map((n) => applyOffersToCart([exactlyThree], cart(n), n * 100).length);
    expect(applied).toEqual([0, 0, 1, 0, 0]);
  });

  it("counts units across lines, not lines", () => {
    const applied = applyOffersToCart([exactlyThree], [item("a", 2, 100), item("b", 1, 100)], 300);
    expect(applied).toHaveLength(1);
  });

  it("without a maximum the condition stays minimum-only (existing offers unchanged)", () => {
    const atLeastThree = makeOffer({ condition: { type: "quantity_threshold", minQuantity: 3 } });
    expect(applyOffersToCart([atLeastThree], cart(9), 900)).toHaveLength(1);
  });

  it("refuses a maximum below the minimum", () => {
    const parsed = createOfferSchema.safeParse({
      name: "bad",
      condition: { type: "quantity_threshold", minQuantity: 6, maxQuantity: 3 },
      reward: { type: "free_shipping" },
    });
    expect(parsed.success).toBe(false);
    const ok = createOfferSchema.safeParse({
      name: "ok",
      condition: { type: "quantity_threshold", minQuantity: 6, maxQuantity: 6 },
      reward: { type: "free_shipping" },
    });
    expect(ok.success).toBe(true);
  });
});
