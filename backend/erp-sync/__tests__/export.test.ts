import { describe, expect, it } from "vitest";

import { bearerTokenOf, configuredErpToken, erpTokenMatches, MIN_ERP_TOKEN_LENGTH } from "../auth";
import { buildOrderExport, canonicalJson, orderVersion } from "../export-service";

const TOKEN = "x".repeat(MIN_ERP_TOKEN_LENGTH);

describe("ERP export auth", () => {
  it("stays disabled without a token or with a short one", () => {
    expect(configuredErpToken({} as NodeJS.ProcessEnv)).toBeNull();
    expect(configuredErpToken({ ERP_SYNC_TOKEN: "   " } as NodeJS.ProcessEnv)).toBeNull();
    expect(configuredErpToken({ ERP_SYNC_TOKEN: "short-secret" } as NodeJS.ProcessEnv)).toBeNull();
    expect(configuredErpToken({ ERP_SYNC_TOKEN: ` ${TOKEN} ` } as NodeJS.ProcessEnv)).toBe(TOKEN);
  });

  it("parses only Bearer authorization", () => {
    expect(bearerTokenOf(undefined)).toBeNull();
    expect(bearerTokenOf("Basic abc")).toBeNull();
    expect(bearerTokenOf("Bearer   abc ")).toBe("abc");
    expect(bearerTokenOf("bearer abc")).toBe("abc");
  });

  it("compares tokens exactly", () => {
    expect(erpTokenMatches(TOKEN, TOKEN)).toBe(true);
    expect(erpTokenMatches(`${TOKEN}y`, TOKEN)).toBe(false);
    expect(erpTokenMatches(null, TOKEN)).toBe(false);
    expect(erpTokenMatches("", TOKEN)).toBe(false);
  });
});

describe("canonicalJson", () => {
  it("is independent of key order and drops undefined", () => {
    expect(canonicalJson({ b: 1, a: { d: [1, { y: 2, x: 1 }], c: null }, u: undefined })).toBe(
      canonicalJson({ a: { c: null, d: [1, { x: 1, y: 2 }] }, b: 1 }),
    );
  });
});

const at = (s: string) => new Date(s);

function fixture() {
  const order = {
    id: "0190a000-0000-7000-8000-000000000001",
    orderNumber: 10042,
    userId: null,
    customerName: "Mona A.",
    customerEmail: "mona@example.test",
    customerPhone: "+201000000000",
    shippingAddress: "12 Secret Street",
    shippingCity: "Nasr City",
    shippingState: "Cairo",
    shippingDistrict: "",
    shippingPostalCode: "",
    shippingCountry: "EG",
    shippingGovernorateCode: "CAI",
    subtotal: "445.00",
    shipping: "70.00",
    shippingQuote: { freeShippingApplied: false },
    tax: "0",
    discount: "45.00",
    promoCodeId: null,
    total: "470.00",
    status: "pending",
    notes: "ring the bell twice",
    paymentMethod: "cod",
    paymentStatus: "not_required",
    paymentSessionId: null,
    paymentTransactionId: null,
    paymentGatewayData: null,
    createdAt: at("2026-11-01T10:00:00Z"),
    updatedAt: null,
    fincartTrackingNumber: null,
    fincartStatus: null,
    fincartSubStatus: null,
    fincartRejectionReason: null,
    fincartSupportNote: null,
    fincartReturnTrackingNumber: null,
    fincartStatusUpdatedDate: null,
    fincartWebhookData: null,
    bostaDeliveryId: null,
    bostaTrackingNumber: null,
    bostaStatus: null,
    bostaStatusCode: null,
    bostaWebhookData: null,
    bostaStatusUpdatedAt: null,
    bostaSyncStatus: null,
    bostaSyncError: null,
    bostaSyncedAt: null,
    bostaSyncAttemptedAt: null,
    archivedAt: null,
    stockRestored: false,
  } as never;
  const items = [
    {
      id: "0190a000-0000-7000-8000-0000000000b2",
      orderId: "0190a000-0000-7000-8000-000000000001",
      productId: "0190a000-0000-7000-8000-0000000000p2",
      vendorId: "v",
      vendorName: null,
      quantity: 1,
      price: "250.00",
      discountPrice: "195.00",
      name: "Hoop (Gold)",
      internalCode: "ER002",
      createdAt: at("2026-11-01T10:00:01Z"),
      orderBundleId: null,
      selectedOptions: { Colour: "Gold" },
    },
    {
      id: "0190a000-0000-7000-8000-0000000000b1",
      orderId: "0190a000-0000-7000-8000-000000000001",
      productId: "0190a000-0000-7000-8000-0000000000p1",
      vendorId: "v",
      vendorName: null,
      quantity: 2,
      price: "125.00",
      // A "sale" price above the regular price is not a sale — the checkout rule ignores it.
      discountPrice: "140.00",
      name: "Stud",
      internalCode: null,
      createdAt: at("2026-11-01T10:00:00Z"),
      orderBundleId: null,
      selectedOptions: null,
    },
  ] as never[];
  const logs = [
    { orderId: "x", action: "created", oldStatus: null, newStatus: "pending", createdAt: at("2026-11-01T10:00:02Z") },
  ] as never[];
  return { order, items, logs };
}

describe("buildOrderExport", () => {
  it("exports amounts as decimal strings and lines with the checkout's unit price", () => {
    const { order, items, logs } = fixture();
    const e = buildOrderExport(order, items, [], logs);
    expect(e.amounts).toEqual({ subtotal: "445.00", discount: "45.00", shipping: "70.00", tax: "0.00", total: "470.00" });
    expect(e.lines.map((l) => [l.internalCode, l.quantity, l.unitPrice])).toEqual([
      [null, 2, "125.00"],
      ["ER002", 1, "195.00"],
    ]);
    const lineSum = e.lines.reduce((s, l) => s + Number(l.unitPrice) * l.quantity, 0);
    expect(lineSum.toFixed(2)).toBe(e.amounts.subtotal);
    expect(e.courier.provider).toBeNull();
    expect(e.events).toEqual([{ action: "created", oldStatus: null, newStatus: "pending", at: "2026-11-01T10:00:02.000Z" }]);
  });

  it("never exports the email, street address, or notes", () => {
    const { order, items, logs } = fixture();
    const json = JSON.stringify(buildOrderExport(order, items, [], logs));
    expect(json).not.toContain("mona@example.test");
    expect(json).not.toContain("Secret Street");
    expect(json).not.toContain("ring the bell");
  });

  it("identifies the courier from the populated integration fields", () => {
    const { order, items, logs } = fixture();
    const bosta = buildOrderExport(
      { ...(order as object), bostaTrackingNumber: "BT1", bostaStatus: "Returned to business", bostaStatusCode: "48" } as never,
      items,
      [],
      logs,
    );
    expect(bosta.courier).toMatchObject({ provider: "bosta", trackingNumber: "BT1", rawStatusCode: "48" });
  });

  it("has a stable version that changes with the content", () => {
    const { order, items, logs } = fixture();
    const v1 = orderVersion(buildOrderExport(order, items, [], logs));
    expect(orderVersion(buildOrderExport(order, [...items].reverse(), [], logs))).toBe(v1);
    const delivered = orderVersion(buildOrderExport({ ...(order as object), status: "delivered" } as never, items, [], logs));
    expect(delivered).not.toBe(v1);
    // Customer email is not exported, so editing it is not a change the ERP sees.
    expect(orderVersion(buildOrderExport({ ...(order as object), customerEmail: "x@y.z" } as never, items, [], logs))).toBe(v1);
  });
});
