import { describe, expect, it } from "vitest";
import {
  deliveredAt,
  type ExportOrderBundle,
  type ExportOrderRecord,
  fullShippingAddress,
  lineSaleDiscount,
  lineTotal,
  ORDERS_WORKBOOK_SHEETS,
  rowsForOrder,
  SHEET,
} from "../sheets";

const baseOrder: ExportOrderRecord = {
  id: "0190a1b2-0000-7000-8000-000000000001",
  orderNumber: 10042,
  userId: null,
  customerName: "منى حسن",
  customerEmail: "mona@example.test",
  customerPhone: "+201001234567",
  shippingAddress: "١٢ شارع التحرير",
  shippingDistrict: "الدقي",
  shippingCity: "الجيزة",
  shippingState: "Giza",
  shippingPostalCode: "",
  shippingCountry: "EG",
  shippingGovernorateCode: "GZ",
  subtotal: "750.00",
  shipping: "70.00",
  shippingQuote: null,
  tax: "0.00",
  discount: "150.00",
  promoCode: "WELCOME5",
  total: "670.00",
  status: "delivered",
  notes: null,
  paymentMethod: "cod",
  paymentStatus: "not_required",
  paymentTransactionId: null,
  createdAt: new Date("2026-11-01T10:00:00Z"),
  updatedAt: null,
  fincartTrackingNumber: null,
  fincartStatus: null,
  fincartSubStatus: null,
  fincartRejectionReason: null,
  fincartSupportNote: null,
  fincartReturnTrackingNumber: null,
  fincartStatusUpdatedDate: null,
  bostaDeliveryId: "bd-1",
  bostaTrackingNumber: "TRK1",
  bostaStatus: "Delivered",
  bostaStatusCode: "45",
  bostaStatusUpdatedAt: new Date("2026-11-03T08:00:00Z"),
  bostaSyncStatus: "sent",
  bostaSyncError: null,
  bostaSyncedAt: new Date("2026-11-01T11:00:00Z"),
  archivedAt: null,
  stockRestored: false,
};

const header = (sheet: string) => ORDERS_WORKBOOK_SHEETS.find((s) => s.name === sheet)!.columns.map((c) => c.header);
const cell = (sheet: string, row: unknown[], name: string) => row[header(sheet).indexOf(name)];

describe("order workbook rows", () => {
  const data: ExportOrderBundle = {
    order: baseOrder,
    items: [
      {
        id: "i1",
        orderId: baseOrder.id,
        productId: "p1",
        name: "Seamless ring 8mm",
        internalCode: "PC001",
        quantity: 3,
        price: "250.00",
        discountPrice: "200.00",
        selectedOptions: { Colour: "Gold", Size: "8mm" },
        orderBundleId: "b1",
        createdAt: new Date(),
        currentCostPrice: "80.00",
      },
      {
        id: "i2",
        orderId: baseOrder.id,
        productId: "p2",
        name: "Stud",
        internalCode: null,
        quantity: 1,
        price: "150.00",
        discountPrice: "160.00", // invalid sale price (>= regular) → regular applies
        selectedOptions: null,
        orderBundleId: null,
        createdAt: new Date(),
        currentCostPrice: null,
      },
    ],
    bundles: [
      {
        id: "b1",
        orderId: baseOrder.id,
        instanceId: "inst-1",
        campaignSlug: "pick-your-3",
        campaignTitle: "Pick Your 3",
        campaignType: "build_your_stack",
        pricingType: "percentage_discount",
        discountPercent: "20.00",
        requiredQuantity: 3,
        regularTotal: "600.00",
        bundleTotal: "480.00",
        freeShipping: false,
        offerStacking: "none",
        createdAt: new Date(),
      },
    ],
    logs: [
      { orderId: baseOrder.id, createdAt: new Date("2026-11-02T09:00:00Z"), action: "status_changed", oldStatus: "shipped", newStatus: "delivered", note: null, actorName: "Admin" },
      { orderId: baseOrder.id, createdAt: new Date("2026-11-01T10:00:00Z"), action: "created", oldStatus: null, newStatus: "pending", note: null, actorName: null },
    ],
    webhooks: [],
  };

  it("one Orders row with the stored money, Arabic text and courier data", () => {
    const rows = rowsForOrder(data);
    expect(rows.orders).toHaveLength(1);
    const r = rows.orders[0]!;
    expect(r).toHaveLength(header(SHEET.orders).length);
    expect(cell(SHEET.orders, r, "Order number")).toBe(10042);
    expect(cell(SHEET.orders, r, "Order reference")).toBe("#10042");
    expect(cell(SHEET.orders, r, "Customer name")).toBe("منى حسن");
    expect(cell(SHEET.orders, r, "Subtotal (EGP)")).toBe(750);
    expect(cell(SHEET.orders, r, "Discount (EGP) — Sets + offers + promo code")).toBe(150);
    expect(cell(SHEET.orders, r, "Total (EGP)")).toBe(670);
    expect(cell(SHEET.orders, r, "Promo code")).toBe("WELCOME5");
    expect(cell(SHEET.orders, r, "Line items")).toBe(2);
    expect(cell(SHEET.orders, r, "Units")).toBe(4);
    expect(cell(SHEET.orders, r, "Shipping provider")).toBe("Bosta");
    expect(cell(SHEET.orders, r, "Tracking number")).toBe("TRK1");
    expect(cell(SHEET.orders, r, "Shipping pricing")).toBe("Flat fee (legacy order)");
    expect(cell(SHEET.orders, r, "Free shipping applied")).toBeNull();
    expect(cell(SHEET.orders, r, "Delivered at (Cairo time, from status history)")).toEqual(new Date("2026-11-02T09:00:00Z"));
    expect(cell(SHEET.orders, r, "Registered customer")).toBe(false);
    expect(cell(SHEET.orders, r, "Full shipping address")).toBe("١٢ شارع التحرير, الدقي, الجيزة, Giza, EG");
  });

  it("one Order Items row per line, linked by order id, with the checkout's price rule", () => {
    const rows = rowsForOrder(data);
    expect(rows.items).toHaveLength(2);
    const [a, b] = rows.items as [unknown[], unknown[]];
    expect(cell(SHEET.items, a, "Order ID")).toBe(baseOrder.id);
    expect(cell(SHEET.items, a, "Line")).toBe(1);
    expect(cell(SHEET.items, a, "Charged unit price before order discounts (EGP)")).toBe(200);
    expect(cell(SHEET.items, a, "Sale discount on line (EGP)")).toBe(150);
    expect(cell(SHEET.items, a, "Line total before order discounts (EGP)")).toBe(600);
    expect(cell(SHEET.items, a, "Variant / selected options")).toBe("Colour: Gold; Size: 8mm");
    expect(cell(SHEET.items, a, "Set name")).toBe("Pick Your 3");
    expect(cell(SHEET.items, a, "Current unit cost (EGP, not a purchase-time snapshot)")).toBe(80);
    expect(cell(SHEET.items, b, "Charged unit price before order discounts (EGP)")).toBe(150);
    expect(cell(SHEET.items, b, "Sale discount on line (EGP)")).toBe(0);
    expect(cell(SHEET.items, b, "Set name")).toBeUndefined();
  });

  it("Sets and status history rows", () => {
    const rows = rowsForOrder(data);
    expect(rows.bundles).toHaveLength(1);
    expect(cell(SHEET.bundles, rows.bundles[0]!, "Set savings (EGP)")).toBe(120);
    expect(rows.history).toHaveLength(2);
    expect(cell(SHEET.history, rows.history[0]!, "Changed by")).toBe("Admin");
  });

  it("delivered date only when the order is delivered now", () => {
    expect(deliveredAt({ ...baseOrder, status: "shipped" }, data.logs)).toBeNull();
    expect(deliveredAt(baseOrder, [])).toBeNull();
  });

  it("money helpers stay exact in cents", () => {
    expect(lineTotal({ price: "0.10", discountPrice: null, quantity: 3 })).toBe(0.3);
    expect(lineSaleDiscount({ price: "19.99", discountPrice: "9.99", quantity: 7 })).toBe(70);
    expect(fullShippingAddress({ ...baseOrder, shippingDistrict: "  " })).toBe("١٢ شارع التحرير, الجيزة, Giza, EG");
  });
});
