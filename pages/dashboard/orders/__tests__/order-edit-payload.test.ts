import { describe, expect, it } from "vitest";
import {
  type OrderDraft,
  type OriginalOrder,
  buildOrderEditPayload,
  describeDetailChanges,
  payloadChangesMoney,
} from "../order-edit-payload";

const original: OriginalOrder = {
  customerName: "Mona",
  customerEmail: "", // COD order without an email
  customerPhone: "01000000000",
  shippingAddress: "1 Test St",
  shippingCity: "Cairo",
  shippingState: "Cairo",
  shippingPostalCode: null,
  shippingCountry: "EG",
  shipping: "70.00",
  tax: "0.00",
  discount: "10.00",
  status: "pending",
  notes: null,
  paymentMethod: "cod",
  paymentStatus: "not_required",
  items: [
    { id: "i1", quantity: 1, price: "200.00", discountPrice: "150.00" },
    { id: "i2", quantity: 2, price: "100.00", discountPrice: null },
  ],
};

/** The draft exactly as the panel initialises it from `original`. */
const untouched = (): OrderDraft => ({
  customerName: "Mona",
  customerEmail: "",
  customerPhone: "01000000000",
  shippingAddress: "1 Test St",
  shippingCity: "Cairo",
  shippingState: "Cairo",
  shippingPostalCode: "",
  shippingCountry: "EG",
  items: [
    { orderItemId: "i1", quantity: 1, unitPrice: "150.00", removed: false },
    { orderItemId: "i2", quantity: 2, unitPrice: "100.00", removed: false },
  ],
  newItems: [],
  shipping: "70.00",
  tax: "0.00",
  discount: "10.00",
  overrideTotal: false,
  total: "380.00",
  paymentMethod: "cod",
  paymentStatus: "not_required",
  status: "pending",
  notes: "",
});

describe("buildOrderEditPayload", () => {
  it("sends nothing for an untouched draft", () => {
    expect(buildOrderEditPayload(original, untouched())).toEqual({});
  });

  it("sends only the added product when that is all that changed — no address, payment, status or price rewrites", () => {
    const draft = untouched();
    draft.newItems = [{ productId: "p9", quantity: 2, selectedOptions: { Color: "Gold" } }];
    const payload = buildOrderEditPayload(original, draft);
    expect(payload).toEqual({ newItems: [{ productId: "p9", quantity: 2, selectedOptions: { Color: "Gold" } }] });
    expect(payloadChangesMoney(payload)).toBe(true);
    expect(describeDetailChanges(original, payload)).toEqual([]);
  });

  it("omits selectedOptions for a simple product", () => {
    const draft = untouched();
    draft.newItems = [{ productId: "p9", quantity: 1, selectedOptions: null }];
    expect(buildOrderEditPayload(original, draft).newItems).toEqual([{ productId: "p9", quantity: 1 }]);
  });

  it("keeps a line's sale-price snapshot unless its unit price is edited", () => {
    const draft = untouched();
    draft.items[0]!.quantity = 3;
    expect(buildOrderEditPayload(original, draft).items).toEqual([{ orderItemId: "i1", quantity: 3 }]);

    draft.items[0]!.unitPrice = "140";
    expect(buildOrderEditPayload(original, draft).items).toEqual([
      { orderItemId: "i1", quantity: 3, price: 140, discountPrice: null },
    ]);
  });

  it("sends removals as quantity 0", () => {
    const draft = untouched();
    draft.items[1]!.removed = true;
    expect(buildOrderEditPayload(original, draft).items).toEqual([{ orderItemId: "i2", quantity: 0 }]);
  });

  it("treats equal amounts typed differently as unchanged", () => {
    const draft = untouched();
    draft.shipping = "70";
    draft.discount = "10.0";
    draft.items[0]!.unitPrice = "150";
    expect(buildOrderEditPayload(original, draft)).toEqual({});
  });

  it("sends changed details and describes them for the review step", () => {
    const draft = untouched();
    draft.status = "processing";
    draft.shippingCity = "Giza";
    draft.notes = "call first";
    draft.shipping = "50";
    const payload = buildOrderEditPayload(original, draft);
    expect(payload).toEqual({ status: "processing", shippingCity: "Giza", notes: "call first", shipping: 50 });
    expect(describeDetailChanges(original, payload)).toEqual([
      "Shipping address updated",
      "Order status: Pending → Processing",
      "Shipping fee changed manually",
      "Order notes updated",
    ]);
  });

  it("sends a manual total only when the override is on", () => {
    const draft = untouched();
    draft.total = "999";
    expect(buildOrderEditPayload(original, draft)).toEqual({});
    draft.overrideTotal = true;
    expect(buildOrderEditPayload(original, draft)).toEqual({ total: 999 });
  });

  it("clears notes to null and never sends whitespace-only notes as a change", () => {
    const withNotes = { ...original, notes: "old" };
    const draft = untouched();
    draft.notes = "   ";
    expect(buildOrderEditPayload(withNotes, draft)).toEqual({ notes: null });
    expect(buildOrderEditPayload(original, draft)).toEqual({});
  });
});
