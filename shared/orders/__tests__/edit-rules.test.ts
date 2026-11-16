import { describe, expect, it } from "vitest";
import {
  type MergeableLine,
  addProductBlockReason,
  findMergeTarget,
  lineUnitCharge,
  orderTotalFromParts,
} from "../edit-rules";

const open = {
  status: "pending" as const,
  paymentMethod: "cod" as const,
  stockRestored: false,
  bostaDeliveryId: null,
  fincartTrackingNumber: null,
};

describe("addProductBlockReason", () => {
  it("allows open cash-on-delivery orders", () => {
    expect(addProductBlockReason(open)).toBeNull();
    expect(addProductBlockReason({ ...open, status: "processing" })).toBeNull();
  });

  it.each(["shipped", "delivered", "cancelled"] as const)("blocks %s orders", (status) => {
    expect(addProductBlockReason({ ...open, status })).toContain(`this order is ${status}`);
  });

  it("blocks online-payment orders, released stock and courier hand-offs", () => {
    expect(addProductBlockReason({ ...open, paymentMethod: "paymob" })).toContain("Cash on Delivery");
    expect(addProductBlockReason({ ...open, paymentMethod: "stripe" })).toContain("Cash on Delivery");
    expect(addProductBlockReason({ ...open, stockRestored: true })).toContain("stock has already been released");
    expect(addProductBlockReason({ ...open, bostaDeliveryId: "b1" })).toContain("courier");
    expect(addProductBlockReason({ ...open, fincartTrackingNumber: "f1" })).toContain("courier");
  });
});

describe("findMergeTarget", () => {
  const line = (over: Partial<MergeableLine>): MergeableLine => ({
    id: "l1",
    productId: "p1",
    quantity: 1,
    price: 100,
    discountPrice: null,
    orderBundleId: null,
    selectedOptions: null,
    ...over,
  });

  it("matches the same product, options and unit charge", () => {
    const target = line({ selectedOptions: { Color: "Gold", Size: "8mm" } });
    expect(
      findMergeTarget([target], { productId: "p1", selectedOptions: { Size: "8mm", Color: "Gold" }, unitPrice: 100 }),
    ).toBe(target);
  });

  it("compares against what the line charges (its sale price when it has one)", () => {
    const sale = line({ price: 200, discountPrice: 150 });
    expect(findMergeTarget([sale], { productId: "p1", selectedOptions: null, unitPrice: 150 })).toBe(sale);
    expect(findMergeTarget([sale], { productId: "p1", selectedOptions: null, unitPrice: 200 })).toBeNull();
  });

  it("never matches a different variant, a different price, a bundle child or a removed line", () => {
    const candidate = { productId: "p1", selectedOptions: { Color: "Gold" }, unitPrice: 100 };
    expect(findMergeTarget([line({ selectedOptions: { Color: "Silver" } })], candidate)).toBeNull();
    expect(findMergeTarget([line({ selectedOptions: null })], candidate)).toBeNull();
    expect(findMergeTarget([line({ selectedOptions: { Color: "Gold" }, price: 90 })], candidate)).toBeNull();
    expect(findMergeTarget([line({ selectedOptions: { Color: "Gold" }, orderBundleId: "b1" })], candidate)).toBeNull();
    expect(findMergeTarget([line({ selectedOptions: { Color: "Gold" }, removed: true })], candidate)).toBeNull();
    expect(findMergeTarget([line({ selectedOptions: { Color: "Gold" }, quantity: 0 })], candidate)).toBeNull();
    expect(findMergeTarget([line({ productId: "p2", selectedOptions: { Color: "Gold" } })], candidate)).toBeNull();
  });

  it("is exact to the piastre (no float drift)", () => {
    const l = line({ price: 79.99 });
    expect(findMergeTarget([l], { productId: "p1", selectedOptions: null, unitPrice: 79.99 })).toBe(l);
    expect(findMergeTarget([l], { productId: "p1", selectedOptions: null, unitPrice: 80 })).toBeNull();
  });
});

describe("lineUnitCharge / orderTotalFromParts", () => {
  it("charges the snapshotted sale price when present", () => {
    expect(lineUnitCharge(200, 150)).toBe(150);
    expect(lineUnitCharge(200, null)).toBe(200);
  });

  it("adds shipping and tax to the discounted goods amount", () => {
    expect(orderTotalFromParts({ subtotal: 400, discount: 10, shipping: 70, tax: 0 })).toBe(460);
    expect(orderTotalFromParts({ subtotal: 0.1, discount: 0, shipping: 0.2, tax: 0 })).toBe(0.3);
  });

  it("never lets a discount larger than the goods eat into shipping", () => {
    expect(orderTotalFromParts({ subtotal: 100, discount: 500, shipping: 70, tax: 0 })).toBe(70);
  });
});
