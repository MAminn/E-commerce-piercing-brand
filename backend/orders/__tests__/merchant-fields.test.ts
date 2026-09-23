import { describe, expect, it } from "vitest";
import {
  MERCHANT_ONLY_ORDER_ITEM_FIELDS,
  stripOrderItemMerchantFields,
  stripOrderItemsMerchantFields,
} from "../merchant-fields";

/**
 * The guard that keeps `order_item.internal_code` off customer-facing order
 * payloads. `order.create` is a public procedure that returns its inserted
 * rows, so this runs on the checkout response itself.
 */
describe("stripOrderItemMerchantFields", () => {
  const line = {
    id: "li1",
    productId: "p1",
    name: "Polished Ball Labret Piercing - Silver",
    quantity: 2,
    price: "75.00",
    discountPrice: null,
    internalCode: "PC001",
  };

  it("removes the key outright rather than nulling it", () => {
    const stripped = stripOrderItemMerchantFields(line);
    expect("internalCode" in stripped).toBe(false);
    expect(Object.keys(stripped)).not.toContain("internalCode");
  });

  it("leaves every customer-visible field intact", () => {
    expect(stripOrderItemMerchantFields(line)).toEqual({
      id: "li1",
      productId: "p1",
      name: "Polished Ball Labret Piercing - Silver",
      quantity: 2,
      price: "75.00",
      discountPrice: null,
    });
  });

  it("does not mutate the row it was given", () => {
    stripOrderItemMerchantFields(line);
    expect(line.internalCode).toBe("PC001");
  });

  it("is a no-op on a legacy line that never had the field", () => {
    const legacy = { id: "li2", name: "Old Hoop", quantity: 1, price: "40.00" };
    expect(stripOrderItemMerchantFields(legacy)).toEqual(legacy);
  });

  it("strips a null code too, so its absence is not implied by a null", () => {
    const stripped = stripOrderItemMerchantFields({ ...line, internalCode: null });
    expect("internalCode" in stripped).toBe(false);
  });

  it("leaves no trace after JSON serialization", () => {
    const json = JSON.stringify(stripOrderItemMerchantFields(line));
    expect(json).not.toContain("internalCode");
    expect(json).not.toContain("internal_code");
    expect(json).not.toContain("PC001");
  });

  it("covers every field the shared list declares merchant-only", () => {
    const full = Object.fromEntries(
      MERCHANT_ONLY_ORDER_ITEM_FIELDS.map((f) => [f, "secret"]),
    );
    expect(
      Object.keys(stripOrderItemMerchantFields({ ...full, id: "li3" })),
    ).toEqual(["id"]);
  });
});

describe("stripOrderItemsMerchantFields", () => {
  it("strips every line of an order", () => {
    const lines = [
      { id: "a", name: "One", internalCode: "PC001" },
      { id: "b", name: "Two", internalCode: "ER001" },
      { id: "c", name: "Three", internalCode: null },
    ];
    const json = JSON.stringify(stripOrderItemsMerchantFields(lines));
    expect(json).not.toContain("internalCode");
    expect(json).not.toContain("PC001");
    expect(json).not.toContain("ER001");
  });

  it("preserves line order and count", () => {
    const lines = [
      { id: "a", internalCode: "PC001" },
      { id: "b", internalCode: "PC002" },
    ];
    expect(stripOrderItemsMerchantFields(lines).map((l) => l.id)).toEqual([
      "a",
      "b",
    ]);
  });

  it("handles an empty order", () => {
    expect(stripOrderItemsMerchantFields([])).toEqual([]);
  });
});
