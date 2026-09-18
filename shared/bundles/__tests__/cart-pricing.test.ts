import { describe, expect, it } from "vitest";
import {
  allocateBundleUnitLines,
  buildOfferInputs,
  computeCartTotals,
  type PricingBundle,
  type PricingRegularLine,
} from "../cart-pricing";

const line = (id: string, quantity: number, price: number): PricingRegularLine => ({ id, name: id, quantity, price });

/** The brief's stack: 6 × 100 regular, charged 480. */
const stack = (
  instanceId: string,
  offerStacking: PricingBundle["offerStacking"] = "exclusive",
  overrides: Partial<PricingBundle> = {},
): PricingBundle => ({
  instanceId,
  offerStacking,
  regularTotal: 600,
  bundleTotal: 480,
  items: ["A", "B", "C", "D", "E", "F"].map((id) => ({ productId: id, name: id, quantity: 1, unitPrice: 100 })),
  ...overrides,
});

const noOffers = { offerDiscount: 0, promo: null, baseShippingFee: 0, freeShipping: false };

describe("computeCartTotals — ordinary items only (legacy behaviour preserved)", () => {
  it("matches the pre-bundle math exactly: subtotal − promo − offers + shipping", () => {
    const totals = computeCartTotals({
      regularLines: [line("p1", 2, 800), line("p2", 1, 350)],
      bundles: [],
      offerDiscount: 650,
      promo: { discountType: "percentage", discountValue: 5 },
      baseShippingFee: 80,
      freeShipping: false,
    });
    expect(totals.merchandiseSubtotal).toBe(1950);
    expect(totals.subtotal).toBe(1950);
    expect(totals.offerBase).toBe(1950);
    expect(totals.offerDiscount).toBe(650);
    // 5% of (1950 − 650) — the existing promo rule
    expect(totals.promoDiscount).toBe(65);
    expect(totals.shipping).toBe(80);
    expect(totals.total).toBe(1950 - 650 - 65 + 80);
    expect(totals.bundleSavings).toBe(0);
  });

  it("zeroes shipping when an offer grants free shipping", () => {
    const totals = computeCartTotals({ ...noOffers, regularLines: [line("p1", 1, 100)], bundles: [], baseShippingFee: 80, freeShipping: true });
    expect(totals.shipping).toBe(0);
    expect(totals.total).toBe(100);
  });

  it("never goes negative when discounts exceed the goods value", () => {
    const totals = computeCartTotals({
      ...noOffers,
      regularLines: [line("p1", 1, 100)],
      bundles: [],
      offerDiscount: 500,
      baseShippingFee: 30,
    });
    expect(totals.offerDiscount).toBe(100); // clamped to the base it saw
    expect(totals.total).toBe(30);
  });
});

describe("computeCartTotals — bundle instances", () => {
  it("charges one stack at its fixed price and does not double-count the children", () => {
    const totals = computeCartTotals({ ...noOffers, regularLines: [], bundles: [stack("s1")] });
    expect(totals.merchandiseSubtotal).toBe(0);
    expect(totals.bundleRegularValue).toBe(600);
    expect(totals.bundleChargedValue).toBe(480);
    expect(totals.bundleSavings).toBe(120);
    // order.subtotal convention: regular value, with the saving in discount
    expect(totals.subtotal).toBe(600);
    expect(totals.total).toBe(480);
  });

  it("keeps two identical stacks as two independent charges", () => {
    const totals = computeCartTotals({ ...noOffers, regularLines: [], bundles: [stack("s1"), stack("s2")] });
    expect(totals.bundleChargedValue).toBe(960);
    expect(totals.bundleSavings).toBe(240);
    expect(totals.total).toBe(960);
  });

  it("adds ordinary items at their normal prices next to a stack", () => {
    const totals = computeCartTotals({ ...noOffers, regularLines: [line("p1", 1, 250)], bundles: [stack("s1")], baseShippingFee: 50 });
    expect(totals.merchandiseSubtotal).toBe(250);
    expect(totals.subtotal).toBe(850);
    expect(totals.total).toBe(250 + 480 + 50);
    // subtotal − savings − offers − promo + shipping === total
    expect(totals.subtotal - totals.bundleSavings - totals.offerDiscount - totals.promoDiscount + totals.shipping).toBe(totals.total);
  });

  it("is exact with prices that don't sum cleanly in floating point", () => {
    const b = stack("s1", "exclusive", {
      regularTotal: 479.94,
      bundleTotal: 400.1,
      items: ["A", "B", "C", "D", "E", "F"].map((id) => ({ productId: id, name: id, quantity: 1, unitPrice: 79.99 })),
    });
    const totals = computeCartTotals({ ...noOffers, regularLines: [line("p", 3, 0.1)], bundles: [b] });
    expect(totals.merchandiseSubtotal).toBe(0.3);
    expect(totals.bundleSavings).toBe(79.84);
    expect(totals.total).toBe(400.4);
  });

  it("reports a negative saving (and charges the fixed price) when the stack is dearer than its parts", () => {
    const totals = computeCartTotals({ ...noOffers, regularLines: [], bundles: [stack("s1", "exclusive", { regularTotal: 300 })] });
    expect(totals.bundleSavings).toBe(-180);
    expect(totals.total).toBe(480);
  });
});

describe("buildOfferInputs — what the offers engine may see", () => {
  it("hides exclusive stacks completely: no lines, nothing in the base", () => {
    const inputs = buildOfferInputs([line("p1", 1, 100)], [stack("s1", "exclusive")]);
    expect(inputs.cartItems.map((i) => i.id)).toEqual(["p1"]);
    expect(inputs.subtotal).toBe(100);
  });

  it("exposes stackable stacks as their children at bundle-share prices, never regular prices", () => {
    const inputs = buildOfferInputs([line("p1", 1, 100)], [stack("s1", "stackable")]);
    const bundleLines = inputs.cartItems.filter((i) => i.id !== "p1");
    expect(bundleLines).toHaveLength(6);
    expect(bundleLines.every((l) => l.quantity === 1 && l.price === 80)).toBe(true);
    expect(inputs.subtotal).toBe(100 + 480);
  });

  it("with no bundles, is exactly the ordinary line list and subtotal", () => {
    const inputs = buildOfferInputs([line("p1", 2, 30), line("p2", 1, 45.5)], []);
    expect(inputs.cartItems).toHaveLength(2);
    expect(inputs.subtotal).toBe(105.5);
  });
});

describe("allocateBundleUnitLines", () => {
  it("spreads the bundle price in proportion to regular prices and sums exactly to the bundle total", () => {
    const b = stack("s1", "stackable", {
      regularTotal: 350,
      bundleTotal: 299.99,
      items: [
        { productId: "A", name: "A", quantity: 2, unitPrice: 100 },
        { productId: "B", name: "B", quantity: 1, unitPrice: 150 },
      ],
    });
    const lines = allocateBundleUnitLines(b);
    expect(lines).toHaveLength(3);
    const sum = lines.reduce((s, l) => s + Math.round(l.price * 100), 0);
    expect(sum).toBe(29999);
    // cheaper units get a smaller share than the dearer one
    expect(lines[0]!.price).toBeLessThan(lines[2]!.price);
    expect(lines.map((l) => l.id)).toEqual(["A", "A", "B"]);
  });

  it("splits evenly when regular prices are all zero", () => {
    const b = stack("s1", "stackable", {
      regularTotal: 0,
      bundleTotal: 10,
      items: [
        { productId: "A", name: "A", quantity: 1, unitPrice: 0 },
        { productId: "B", name: "B", quantity: 1, unitPrice: 0 },
        { productId: "C", name: "C", quantity: 1, unitPrice: 0 },
      ],
    });
    const lines = allocateBundleUnitLines(b);
    expect(lines.map((l) => l.price)).toEqual([3.33, 3.33, 3.34]);
  });
});

describe("computeCartTotals — offer_stacking policy", () => {
  it("exclusive: a percentage offer only ever reaches the ordinary items", () => {
    // 10% cart offer, evaluated by the engine on the offer base (100).
    const inputs = buildOfferInputs([line("p1", 1, 100)], [stack("s1", "exclusive")]);
    const offerDiscount = inputs.subtotal * 0.1;
    const totals = computeCartTotals({ ...noOffers, regularLines: [line("p1", 1, 100)], bundles: [stack("s1", "exclusive")], offerDiscount });
    expect(totals.offerBase).toBe(100);
    expect(totals.offerDiscount).toBe(10);
    expect(totals.total).toBe(100 - 10 + 480);
  });

  it("stackable: the same offer applies to the bundle's CHARGED value, not its regular value", () => {
    const inputs = buildOfferInputs([line("p1", 1, 100)], [stack("s1", "stackable")]);
    const offerDiscount = inputs.subtotal * 0.1;
    const totals = computeCartTotals({ ...noOffers, regularLines: [line("p1", 1, 100)], bundles: [stack("s1", "stackable")], offerDiscount });
    expect(totals.offerBase).toBe(580);
    expect(totals.offerDiscount).toBe(58);
    expect(totals.total).toBe(580 - 58);
  });

  it("promo codes follow the same policy: exclusive stacks are not discounted by a code", () => {
    const exclusive = computeCartTotals({
      ...noOffers,
      regularLines: [line("p1", 1, 100)],
      bundles: [stack("s1", "exclusive")],
      promo: { discountType: "percentage", discountValue: 10 },
    });
    expect(exclusive.promoDiscount).toBe(10);
    expect(exclusive.total).toBe(90 + 480);

    const stackable = computeCartTotals({
      ...noOffers,
      regularLines: [line("p1", 1, 100)],
      bundles: [stack("s1", "stackable")],
      promo: { discountType: "percentage", discountValue: 10 },
    });
    expect(stackable.promoDiscount).toBe(58);
    expect(stackable.total).toBe(580 - 58);
  });

  it("a fixed promo code is capped at the offer base, so an exclusive stack can't be eaten by it", () => {
    const totals = computeCartTotals({
      ...noOffers,
      regularLines: [line("p1", 1, 50)],
      bundles: [stack("s1", "exclusive")],
      promo: { discountType: "fixed_amount", discountValue: 500 },
    });
    expect(totals.promoDiscount).toBe(50);
    expect(totals.total).toBe(480);
  });

  it("a bundles-only cart with an exclusive stack has an empty offer base and no promo discount", () => {
    const totals = computeCartTotals({
      ...noOffers,
      regularLines: [],
      bundles: [stack("s1", "exclusive")],
      promo: { discountType: "percentage", discountValue: 50 },
    });
    expect(totals.offerBase).toBe(0);
    expect(totals.promoDiscount).toBe(0);
    expect(totals.total).toBe(480);
  });
});
