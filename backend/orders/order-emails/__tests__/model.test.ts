import { describe, expect, it } from "vitest";
import {
  baseLineName,
  buildOrderEmailModel,
  totalsReconcile,
  type OrderEmailInput,
  type OrderEmailItemInput,
} from "../model";

/**
 * The order email's money block must ALWAYS read
 *
 *     subtotal − discount + shipping = total
 *
 * whatever mix of sale prices, promo codes, offers, Sets and free shipping
 * produced the stored order. These build the model from stored-order shapes
 * exactly as create-order writes them (subtotal = regular value incl. Set
 * children at their regular price; discount = Set savings + offers + promo).
 */

const item = (over: Partial<OrderEmailItemInput> = {}): OrderEmailItemInput => ({
  id: `i-${Math.random().toString(16).slice(2)}`,
  name: "Star Labret",
  quantity: 1,
  price: "250.00",
  discountPrice: null,
  selectedOptions: null,
  orderBundleId: null,
  ...over,
});

const input = (over: Partial<OrderEmailInput> = {}): OrderEmailInput => ({
  orderId: "0192f000-0000-7000-8000-000000000001",
  orderNumber: 10001,
  createdAt: new Date("2026-10-17T10:00:00Z"),
  customerName: "Nour",
  customerEmail: "nour@example.com",
  customerPhone: "01000000000",
  shippingAddress: "12 Street (Bldg 4, Apt 2)",
  shippingCity: "Nasr City",
  shippingState: "Cairo",
  shippingGovernorateCode: "CAI",
  shippingCountry: "Egypt",
  subtotal: "250.00",
  shipping: "60.00",
  discount: null,
  total: "310.00",
  paymentMethod: "cod",
  paymentStatus: "not_required",
  promoCode: null,
  notes: null,
  items: [item()],
  bundles: [],
  ...over,
});

const set = (id: string, regular: string, charged: string) => ({
  id,
  instanceId: `inst-${id}`,
  campaignId: null,
  campaignSlug: "pick-your-set",
  campaignTitle: "Pick Your Set",
  campaignType: "build_your_stack" as const,
  requiredQuantity: 3,
  regularTotal: regular,
  bundleTotal: charged,
  offerStacking: "exclusive" as const,
});

describe("buildOrderEmailModel — money reconciliation", () => {
  it("plain order: subtotal + shipping = total, no discount line", () => {
    const m = buildOrderEmailModel(input());
    expect(m.totals).toEqual({
      subtotalMinor: 25000,
      discountMinor: 0,
      adjustmentMinor: 0,
      shippingMinor: 6000,
      totalMinor: 31000,
    });
    expect(totalsReconcile(m.totals)).toBe(true);
    expect(m.warnings).toEqual([]);
  });

  it("promo code: subtotal − discount + shipping = total, and the code is carried", () => {
    // 2 × 250 + 300 = 800; PERCE10 takes 100; shipping 60 → 760.
    const m = buildOrderEmailModel(
      input({
        items: [item({ quantity: 2 }), item({ name: "Pear Arc Cuff", price: "300.00" })],
        subtotal: "800.00",
        discount: "100.00",
        shipping: "60.00",
        total: "760.00",
        promoCode: "PERCE10",
      }),
    );
    expect(m.totals.subtotalMinor).toBe(80000);
    expect(m.totals.discountMinor).toBe(10000);
    expect(m.totals.shippingMinor).toBe(6000);
    expect(m.totals.totalMinor).toBe(76000);
    expect(totalsReconcile(m.totals)).toBe(true);
    expect(m.promoCode).toBe("PERCE10");
    expect(m.warnings).toEqual([]);
  });

  it("line total = unit price × quantity, at the sale price when there is one", () => {
    const m = buildOrderEmailModel(
      input({
        items: [item({ quantity: 3, price: "200.00", discountPrice: "150.00" })],
        subtotal: "450.00",
        total: "510.00",
      }),
    );
    const [line] = m.lines;
    expect(line!.unitPriceMinor).toBe(15000);
    expect(line!.regularUnitPriceMinor).toBe(20000);
    expect(line!.lineTotalMinor).toBe(45000);
    expect(totalsReconcile(m.totals)).toBe(true);
    expect(m.warnings).toEqual([]);
  });

  it("an invalid sale price (at or above regular) is ignored, like checkout", () => {
    const m = buildOrderEmailModel(
      input({ items: [item({ price: "200.00", discountPrice: "250.00" })], subtotal: "200.00", total: "260.00" }),
    );
    expect(m.lines[0]!.unitPriceMinor).toBe(20000);
    expect(m.lines[0]!.regularUnitPriceMinor).toBeUndefined();
  });

  it("a Set prints at its charged price; only offers/promo appear as the discount", () => {
    // Set: 3 × 120 regular = 360, charged 270 (savings 90). Loose ring 200.
    // Stored: subtotal 560 (regular), discount 90 (Set) + 47 (promo) = 137,
    // shipping 70 → total 493.
    const m = buildOrderEmailModel(
      input({
        items: [
          item({ name: "Hoop (Color: Gold) — Pick Your Set", price: "120.00", selectedOptions: { Color: "Gold" }, orderBundleId: "b1" }),
          item({ name: "Stud — Pick Your Set", price: "120.00", orderBundleId: "b1" }),
          item({ name: "Cuff — Pick Your Set", price: "120.00", orderBundleId: "b1" }),
          item({ name: "Ring", price: "200.00" }),
        ],
        bundles: [set("b1", "360.00", "270.00")],
        subtotal: "560.00",
        discount: "137.00",
        shipping: "70.00",
        total: "493.00",
        promoCode: "WELCOME",
      }),
    );
    const setLine = m.lines.find((l) => l.kind === "set")!;
    expect(setLine.name).toBe("Pick Your Set");
    expect(setLine.lineTotalMinor).toBe(27000);
    expect(setLine.regularUnitPriceMinor).toBe(36000);
    expect(setLine.children.map((c) => c.name)).toEqual(["Hoop", "Stud", "Cuff"]);
    expect(setLine.children[0]!.options).toEqual([{ name: "Color", value: "Gold" }]);

    expect(m.totals.subtotalMinor).toBe(47000); // 270 + 200
    expect(m.totals.discountMinor).toBe(4700); // promo only
    expect(totalsReconcile(m.totals)).toBe(true);
    expect(m.warnings).toEqual([]);
  });

  it("free shipping prints a zero shipping line and still reconciles", () => {
    const m = buildOrderEmailModel(input({ shipping: "0.00", total: "250.00" }));
    expect(m.totals.shippingMinor).toBe(0);
    expect(totalsReconcile(m.totals)).toBe(true);
  });

  it("piasters survive: fractional amounts reconcile exactly", () => {
    const m = buildOrderEmailModel(
      input({
        items: [item({ quantity: 3, price: "99.99" })],
        subtotal: "299.97",
        discount: "29.99",
        shipping: "45.50",
        total: "315.48",
      }),
    );
    expect(totalsReconcile(m.totals)).toBe(true);
    expect(m.totals.discountMinor).toBe(2999);
    expect(m.warnings).toEqual([]);
  });

  it("reconciles for every combination of quantities, prices, discounts and shipping", () => {
    let checked = 0;
    for (const qty of [1, 2, 5]) {
      for (const price of [99.5, 150, 275.25]) {
        for (const discountShare of [0, 0.1, 0.33, 1]) {
          for (const shipping of [0, 45.5, 70]) {
            const subtotal = Math.round(qty * price * 100) / 100;
            const discount = Math.round(subtotal * discountShare * 100) / 100;
            const total = Math.round((subtotal - discount + shipping) * 100) / 100;
            const m = buildOrderEmailModel(
              input({
                items: [item({ quantity: qty, price: price.toFixed(2) })],
                subtotal: subtotal.toFixed(2),
                discount: discount > 0 ? discount.toFixed(2) : null,
                shipping: shipping.toFixed(2),
                total: total.toFixed(2),
              }),
            );
            expect(totalsReconcile(m.totals)).toBe(true);
            expect(m.totals.subtotalMinor - m.totals.discountMinor + m.totals.shippingMinor).toBe(
              m.totals.totalMinor,
            );
            expect(m.totals.adjustmentMinor).toBe(0);
            checked++;
          }
        }
      }
    }
    expect(checked).toBe(108);
  });

  it("an inconsistent stored row still prints numbers that add up, and is flagged", () => {
    // Someone edited discount without touching total.
    const m = buildOrderEmailModel(input({ discount: "999.00" }));
    expect(totalsReconcile(m.totals)).toBe(true);
    expect(m.totals.discountMinor).toBe(0);
    expect(m.warnings.join(" ")).toMatch(/does not match/);
  });

  it("a total above subtotal + shipping is shown as an adjustment, never hidden", () => {
    const m = buildOrderEmailModel(input({ total: "400.00" }));
    expect(m.totals.adjustmentMinor).toBe(9000);
    expect(totalsReconcile(m.totals)).toBe(true);
    expect(m.warnings.join(" ")).toMatch(/exceeds/);
  });
});

describe("buildOrderEmailModel — content", () => {
  it("prints the variant separately from the product name", () => {
    const m = buildOrderEmailModel(
      input({
        items: [
          item({
            name: "Star Labret (Color: Gold, Size: 8mm)",
            selectedOptions: { Color: "Gold", Size: "8mm" },
          }),
        ],
      }),
    );
    expect(m.lines[0]!.name).toBe("Star Labret");
    expect(m.lines[0]!.options).toEqual([
      { name: "Color", value: "Gold" },
      { name: "Size", value: "8mm" },
    ]);
  });

  it("formats the order number and resolves the governorate in both languages", () => {
    const m = buildOrderEmailModel(input());
    expect(m.orderNumber).toBe("#10001");
    expect(m.delivery.governorateEn).toBe("Cairo");
    expect(m.delivery.governorateAr).toBe("القاهرة");
  });

  it("marks cash on delivery and online payment", () => {
    expect(buildOrderEmailModel(input()).payment).toMatchObject({ isCashOnDelivery: true, isPaid: false });
    expect(
      buildOrderEmailModel(input({ paymentMethod: "paymob", paymentStatus: "paid" })).payment,
    ).toMatchObject({ isCashOnDelivery: false, isPaid: true });
  });
});

describe("baseLineName", () => {
  it("strips only an exact options / Set suffix, never guesses", () => {
    expect(baseLineName("Hoop (Color: Gold) — Ear Stack", { Color: "Gold" }, "Ear Stack")).toBe("Hoop");
    expect(baseLineName("Hoop (Color: Silver)", { Color: "Gold" })).toBe("Hoop (Color: Silver)");
    expect(baseLineName("Plain", null)).toBe("Plain");
  });
});
