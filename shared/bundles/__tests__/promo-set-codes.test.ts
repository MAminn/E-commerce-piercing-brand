import { describe, expect, it } from "vitest";
import { applyOffersToCart } from "#root/backend/offers/service";
import type { CartOfferRow } from "#root/shared/database/drizzle/schema";
import { deriveShippingLine } from "#root/shared/shipping/checkout-shipping";
import type { ShippingQuoteResponse } from "#root/shared/shipping/quote";
import {
  buildOfferInputs,
  type CartPromoInput,
  computeCartTotals,
  type PricingBundle,
  type PricingRegularLine,
  planPromo,
} from "../cart-pricing";

/**
 * PICK3 / PICK6 — the configurations the system must SUPPORT (they are not
 * created or activated by this change). Eligibility here mirrors the planned
 * setup: single earrings eligible by category, the fixed 3-piece sets in the
 * same category excluded by product, rings unrelated.
 */
const EARRINGS = "cat-earrings";
const RINGS = "cat-rings";

const eligibility = {
  appliesToAllProducts: false,
  productIds: [] as string[],
  categoryIds: [EARRINGS],
  excludedProductIds: ["set-3pc"],
};

const PICK3: CartPromoInput = {
  discountType: "percentage",
  discountValue: 20,
  eligibility,
  quantityRule: { minQuantity: 3, maxQuantity: 3 },
  freeShipping: false,
};

const PICK6: CartPromoInput = {
  discountType: "percentage",
  discountValue: 15,
  eligibility,
  quantityRule: { minQuantity: 6, maxQuantity: 6 },
  freeShipping: true,
};

const earring = (id: string, quantity: number, price: number): PricingRegularLine => ({
  id,
  name: id,
  quantity,
  price,
  categoryIds: [EARRINGS],
});
const ring = (id: string, quantity: number, price: number): PricingRegularLine => ({
  id,
  name: id,
  quantity,
  price,
  categoryIds: [RINGS],
});
const set3 = (quantity = 1): PricingRegularLine => ({
  id: "set-3pc",
  name: "Huggie Earring Set (3 Pieces)",
  quantity,
  price: 250,
  categoryIds: [EARRINGS],
});

/** Six eligible units worth exactly 1,075.00 — the brief's example. */
const sixEligible = (): PricingRegularLine[] => [
  earring("e1", 1, 150),
  earring("e2", 1, 150),
  earring("e3", 1, 175),
  earring("e4", 1, 200),
  earring("e5", 2, 200), // 2 units of one SKU = 2 eligible units
];

/** n eligible units at 100 each, as one line per unit. */
const eligibleUnits = (n: number) => Array.from({ length: n }, (_, i) => earring(`u${i}`, 1, 100));

const CAIRO_FEE = 70;

function totals(lines: PricingRegularLine[], promo: CartPromoInput | null, extra: Partial<Parameters<typeof computeCartTotals>[0]> = {}) {
  return computeCartTotals({
    regularLines: lines,
    bundles: [],
    offerDiscount: 0,
    promo,
    baseShippingFee: CAIRO_FEE,
    freeShipping: false,
    ...extra,
  });
}

describe("PICK3 — exactly 3 eligible units, 20% off eligible value, normal shipping", () => {
  it.each([1, 2, 4, 5, 6, 7])("%i eligible units → rejected (no discount)", (n) => {
    const plan = planPromo(eligibleUnits(n), [], PICK3);
    expect(plan.qualifies).toBe(false);
    expect(plan.quantity.ok).toBe(false);
    expect(totals(eligibleUnits(n), PICK3).promoDiscount).toBe(0);
  });

  it("exactly 3 → accepted: 20% of the eligible subtotal only, governorate shipping still charged", () => {
    const lines = [earring("a", 1, 120), earring("b", 2, 140), ring("r", 1, 300)];
    const t = totals(lines, PICK3);
    expect(t.promoPlan?.qualifies).toBe(true);
    expect(t.promoPlan?.eligibleUnits).toBe(3);
    expect(t.promoPlan?.eligibleSubtotal).toBe(400);
    expect(t.promoDiscount).toBe(80); // 20% of 400 — the 300 ring is untouched
    expect(t.promoFreeShipping).toBe(false);
    expect(t.shipping).toBe(CAIRO_FEE);
    expect(t.total).toBe(400 + 300 - 80 + CAIRO_FEE);
  });
});

describe("PICK6 — exactly 6 eligible units, 15% off eligible value, free shipping", () => {
  it.each([3, 5, 7])("%i eligible units → rejected, shipping stays normal", (n) => {
    const t = totals(eligibleUnits(n), PICK6);
    expect(t.promoPlan?.qualifies).toBe(false);
    expect(t.promoDiscount).toBe(0);
    expect(t.promoFreeShipping).toBe(false);
    expect(t.shipping).toBe(CAIRO_FEE);
  });

  it("exactly 6 → 15% of the eligible subtotal and shipping 0 (the brief's rounding example)", () => {
    const t = totals(sixEligible(), PICK6);
    expect(t.promoPlan?.eligibleUnits).toBe(6);
    expect(t.promoPlan?.eligibleSubtotal).toBe(1075);
    expect(t.promoDiscount).toBe(161.25);
    expect(t.subtotal - t.promoDiscount).toBe(913.75);
    expect(t.shipping).toBe(0);
    expect(t.freeShippingSource).toBe("promo_code");
    expect(t.total).toBe(913.75);
  });
});

describe("mixed carts", () => {
  it("6 eligible + unrelated products: only eligible value is discounted, PICK6 shipping still free", () => {
    const lines = [...sixEligible(), ring("ring-a", 1, 200), ring("ring-b", 1, 150)];
    const t = totals(lines, PICK6);
    expect(t.promoPlan?.eligibleUnits).toBe(6);
    expect(t.promoDiscount).toBe(161.25);
    // Unrelated rings stay at full effective price.
    expect(t.total).toBe(1075 - 161.25 + 200 + 150);
    expect(t.shipping).toBe(0);
  });

  it("the brief's case: 1,075 eligible + 200 unrelated → discount 161.25 on 1,075 only", () => {
    const t = totals([...sixEligible(), ring("ring", 1, 200)], PICK6);
    expect(t.promoDiscount).toBe(161.25);
    expect(t.total).toBe(1113.75);
  });
});

describe("excluded products (the fixed 3-piece sets)", () => {
  it("do not count as an eligible unit", () => {
    const lines = [...eligibleUnits(5), set3()];
    const plan = planPromo(lines, [], PICK6);
    expect(plan.eligibleUnits).toBe(5);
    expect(plan.qualifies).toBe(false);
  });

  it("do not receive the discount when the code qualifies on other pieces", () => {
    const t = totals([...eligibleUnits(3), set3(2)], PICK3);
    expect(t.promoPlan?.eligibleUnits).toBe(3);
    expect(t.promoDiscount).toBe(60); // 20% of 300; the 500 of sets untouched
    expect(t.total).toBe(300 + 500 - 60 + CAIRO_FEE);
  });
});

describe("cart mutation", () => {
  it("6 → remove one: PICK6 becomes invalid, the discount disappears, shipping returns", () => {
    const six = sixEligible();
    expect(totals(six, PICK6).promoDiscount).toBe(161.25);
    const five = six.map((l) => (l.id === "e5" ? { ...l, quantity: 1 } : l));
    const t = totals(five, PICK6);
    expect(t.promoPlan?.eligibleUnits).toBe(5);
    expect(t.promoDiscount).toBe(0);
    expect(t.shipping).toBe(CAIRO_FEE);
  });

  it("6 → add a seventh eligible piece: the exact-6 rule fails", () => {
    const t = totals([...sixEligible(), earring("e7", 1, 90)], PICK6);
    expect(t.promoPlan?.eligibleUnits).toBe(7);
    expect(t.promoPlan?.quantity).toMatchObject({ ok: false, reason: "above_max" });
    expect(t.promoDiscount).toBe(0);
    expect(t.shipping).toBe(CAIRO_FEE);
  });

  it("adding an unrelated product never changes the eligible count", () => {
    const t = totals([...sixEligible(), ring("ring", 3, 100)], PICK6);
    expect(t.promoPlan?.eligibleUnits).toBe(6);
    expect(t.promoPlan?.qualifies).toBe(true);
  });
});

describe("shipping interaction", () => {
  const cairo: ShippingQuoteResponse = {
    mode: "zones",
    quote: {
      available: true,
      provider: "manual_zone",
      method: "standard",
      amount: CAIRO_FEE,
      currency: "EGP",
      rateSource: "governorate_rate",
      governorateCode: "CAI",
      governorateName: "Cairo",
    },
  };
  const unavailable: ShippingQuoteResponse = {
    mode: "zones",
    quote: {
      available: false,
      provider: "manual_zone",
      reason: "destination_unavailable",
      governorateCode: "SSI",
      governorateName: "South Sinai",
    },
  };

  it("a valid governorate: PICK6 sets the shipping line to 0", () => {
    expect(deriveShippingLine(cairo, [], { promoFreeShipping: true })).toMatchObject({
      status: "quoted",
      baseFee: CAIRO_FEE,
      fee: 0,
      freeShipping: true,
    });
  });

  it("an unavailable destination stays unavailable — free shipping never creates a shipping option", () => {
    expect(deriveShippingLine(unavailable, [], { promoFreeShipping: true })).toMatchObject({
      status: "unavailable",
      fee: 0,
    });
    expect(deriveShippingLine(null, [], { promoFreeShipping: true }).status).toBe("pending");
  });

  it("PICK3 keeps the governorate fee", () => {
    expect(deriveShippingLine(cairo, [], { promoFreeShipping: false })).toMatchObject({ fee: CAIRO_FEE });
  });
});

// ─── Double discounting ───────────────────────────────────────────────────────

const percentageStack = (instanceId: string, offerStacking: PricingBundle["offerStacking"] = "exclusive"): PricingBundle => ({
  instanceId,
  offerStacking,
  // Six earrings worth 1,075 bought through a 15% Pick Your Set.
  regularTotal: 1075,
  bundleTotal: 913.75,
  items: [
    { productId: "e1", name: "e1", quantity: 1, unitPrice: 150, categoryIds: [EARRINGS] },
    { productId: "e2", name: "e2", quantity: 1, unitPrice: 150, categoryIds: [EARRINGS] },
    { productId: "e3", name: "e3", quantity: 1, unitPrice: 175, categoryIds: [EARRINGS] },
    { productId: "e4", name: "e4", quantity: 1, unitPrice: 200, categoryIds: [EARRINGS] },
    { productId: "e5", name: "e5", quantity: 2, unitPrice: 200, categoryIds: [EARRINGS] },
  ],
});

const offer = (overrides: Partial<CartOfferRow>): CartOfferRow => ({
  id: "offer-1",
  name: "Everything 10% off",
  description: null,
  isActive: true,
  priority: 0,
  isExclusive: false,
  condition: { type: "always" },
  reward: { type: "percentage_off", percentOff: 10 },
  startsAt: null,
  endsAt: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  ...overrides,
});

describe("double discount prevention", () => {
  it("a Pick Your Set (percentage, exclusive) + the equivalent PICK6 code never discount the same pieces", () => {
    const plan = planPromo([], [percentageStack("s1")], PICK6);
    expect(plan.eligibleUnits).toBe(0);
    expect(plan.qualifies).toBe(false);
    const t = computeCartTotals({
      regularLines: [],
      bundles: [percentageStack("s1")],
      offerDiscount: 0,
      promo: PICK6,
      baseShippingFee: CAIRO_FEE,
      freeShipping: false,
    });
    expect(t.bundleSavings).toBe(161.25);
    expect(t.promoDiscount).toBe(0);
    expect(t.shipping).toBe(CAIRO_FEE);
    expect(t.total).toBe(913.75 + CAIRO_FEE);
  });

  it("a set code never counts units inside a bundle, even a stackable one", () => {
    const stackable = { ...percentageStack("s1", "stackable"), bundleTotal: 900 };
    expect(planPromo([], [stackable], PICK6).eligibleUnits).toBe(0);
    // A set built on the page + 6 loose pieces: only the loose 6 count.
    const plan = planPromo(sixEligible(), [stackable], PICK6);
    expect(plan.eligibleUnits).toBe(6);
    expect(plan.eligibleSubtotal).toBe(1075);
  });

  it("an overlapping automatic offer cannot discount the units a qualifying set code owns", () => {
    const lines = [...sixEligible(), ring("ring", 1, 200)];
    const plan = planPromo(lines, [], PICK6);
    const offerInputs = buildOfferInputs(lines, [], plan);
    // The offer engine only sees the unrelated ring.
    expect(offerInputs.cartItems.map((i) => i.id)).toEqual(["ring"]);
    expect(offerInputs.subtotal).toBe(200);
    const applied = applyOffersToCart([offer({})], offerInputs.cartItems, offerInputs.subtotal);
    const offerDiscount = applied.reduce((s, o) => s + o.discountAmount, 0);
    expect(offerDiscount).toBe(20); // 10% of the ring only
    const t = totals(lines, PICK6, { offerDiscount });
    expect(t.offerBase).toBe(200);
    expect(t.offerDiscount).toBe(20);
    expect(t.promoDiscount).toBe(161.25); // computed on the full, undiscounted eligible value
    expect(t.total).toBe(1075 - 161.25 + 200 - 20);
  });

  it("an owned unit no longer triggers a quantity offer (e.g. an old '2+ pieces free shipping' rule)", () => {
    const twoPlusFreeShipping = offer({
      condition: { type: "quantity_threshold", minQuantity: 2 },
      reward: { type: "free_shipping" },
    });
    const lines = eligibleUnits(3);
    const plan = planPromo(lines, [], PICK3);
    const inputs = buildOfferInputs(lines, [], plan);
    expect(applyOffersToCart([twoPlusFreeShipping], inputs.cartItems, inputs.subtotal)).toEqual([]);
    // Without a code the same old rule would still apply to the loose pieces.
    const plain = buildOfferInputs(lines, []);
    expect(applyOffersToCart([twoPlusFreeShipping], plain.cartItems, plain.subtotal)).toHaveLength(1);
  });

  it("a set code that does not qualify owns nothing — offers see the cart as usual", () => {
    const lines = eligibleUnits(5);
    const plan = planPromo(lines, [], PICK6);
    expect(plan.ownedLineIndexes).toEqual([]);
    expect(buildOfferInputs(lines, [], plan).cartItems).toHaveLength(5);
  });

  it("fixed-total bundles are unchanged: exclusive stacks stay out of promo and offers", () => {
    const fixed: PricingBundle = { ...percentageStack("f1"), bundleTotal: 480, regularTotal: 1075 };
    const t = computeCartTotals({
      regularLines: [ring("ring", 1, 100)],
      bundles: [fixed],
      offerDiscount: 0,
      promo: { discountType: "percentage", discountValue: 10 },
      baseShippingFee: 0,
      freeShipping: false,
    });
    expect(t.bundleSavings).toBe(595);
    expect(t.promoDiscount).toBe(10);
  });
});

describe("ordinary promo codes (no quantity rule)", () => {
  it("an all-products code keeps the pre-existing math exactly", () => {
    const t = computeCartTotals({
      regularLines: [ring("p1", 2, 800), ring("p2", 1, 350)],
      bundles: [],
      offerDiscount: 650,
      promo: { discountType: "percentage", discountValue: 5 },
      baseShippingFee: 80,
      freeShipping: false,
    });
    expect(t.promoDiscount).toBe(65); // 5% of (1950 − 650)
    expect(t.total).toBe(1950 - 650 - 65 + 80);
  });

  it("a restricted code now discounts only its eligible value", () => {
    const t = totals([earring("e", 2, 100), ring("r", 1, 300)], {
      discountType: "percentage",
      discountValue: 10,
      eligibility,
    });
    expect(t.promoDiscount).toBe(20); // was 50 (10% of the whole 500) before
  });

  it("a restricted fixed-amount code is capped at its eligible value", () => {
    const t = totals([earring("e", 1, 40), ring("r", 1, 300)], {
      discountType: "fixed_amount",
      discountValue: 100,
      eligibility,
    });
    expect(t.promoDiscount).toBe(40);
  });

  it("a restricted code takes only its eligible share of the offer discount into account", () => {
    // 500 visible to offers, 100 off → 20% of the base. Eligible 200 → its
    // share is 40, so the code discounts 10% of 160.
    const t = totals([earring("e", 2, 100), ring("r", 1, 300)], {
      discountType: "percentage",
      discountValue: 10,
      eligibility,
    }, { offerDiscount: 100 });
    expect(t.promoDiscount).toBe(16);
  });

  it("free shipping on an ordinary code applies while it qualifies", () => {
    const t = totals([ring("r", 1, 300)], { discountType: "percentage", discountValue: 10, freeShipping: true });
    expect(t.shipping).toBe(0);
    expect(t.freeShippingSource).toBe("promo_code");
  });

  it("an offer's free shipping is reported as the offer's", () => {
    const t = totals(sixEligible(), PICK6, { freeShipping: true });
    expect(t.shipping).toBe(0);
    expect(t.freeShippingSource).toBe("offer");
  });
});
