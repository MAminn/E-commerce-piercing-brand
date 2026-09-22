import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// The card renders <Link>, which reads the current path from the page context.
vi.mock("vike-react/usePageContext", () => ({
  usePageContext: () => ({ urlPathname: "/order-confirmation" }),
}));

import {
  deriveConfirmationView,
  isOrderReference,
  parsePaymentParam,
  type ConfirmationView,
  type OrderLookup,
  type OrderPaymentStatus,
} from "../confirmation-state";
import { OrderConfirmationCard } from "../OrderConfirmationCard";

const ORDER_ID = "0f1e2d3c-4b5a-4968-8778-6a5b4c3d2e1f";

const found = (paymentStatus: OrderPaymentStatus): OrderLookup => ({
  status: "found",
  order: { paymentStatus },
});

function view(input: {
  orderRef?: string | null;
  payment?: string | null;
  lookup: OrderLookup;
}): ConfirmationView {
  return deriveConfirmationView({
    orderRef: input.orderRef === undefined ? ORDER_ID : input.orderRef,
    paymentParam: parsePaymentParam(input.payment ?? null),
    lookup: input.lookup,
  });
}

const render = (
  v: ConfirmationView,
  extra: Partial<Parameters<typeof OrderConfirmationCard>[0]> = {},
) =>
  renderToStaticMarkup(
    createElement(OrderConfirmationCard, { view: v, ...extra }),
  );

// ─── Order reference parsing ────────────────────────────────────────────────

describe("isOrderReference", () => {
  it("accepts a UUID order id", () => {
    expect(isOrderReference(ORDER_ID)).toBe(true);
    expect(isOrderReference(ORDER_ID.toUpperCase())).toBe(true);
  });

  it("rejects anything that is not an order id", () => {
    for (const bad of [null, undefined, "", "   ", "123", "not-a-uuid", `${ORDER_ID}x`]) {
      expect(isOrderReference(bad)).toBe(false);
    }
  });
});

describe("parsePaymentParam", () => {
  it("normalises the values the gateways send back", () => {
    expect(parsePaymentParam(null)).toBe("none");
    expect(parsePaymentParam("success")).toBe("success");
    expect(parsePaymentParam("PENDING")).toBe("pending");
    expect(parsePaymentParam("canceled")).toBe("cancelled");
    expect(parsePaymentParam("cancelled")).toBe("cancelled");
    expect(parsePaymentParam("failed")).toBe("failed");
  });

  it("treats an unrecognised value as no claim at all", () => {
    expect(parsePaymentParam("paid-i-promise")).toBe("none");
  });
});

// ─── State derivation ───────────────────────────────────────────────────────

describe("deriveConfirmationView — missing order context", () => {
  it("a bare /order-confirmation visit is not-found, never 'placed'", () => {
    // The regression: with no query string at all the old page fell through
    // to its success branch because nothing marked it failed or pending.
    expect(view({ orderRef: null, lookup: { status: "missing" } })).toEqual({
      kind: "not-found",
    });
  });

  it("stays not-found even if the URL claims a successful payment", () => {
    expect(
      view({ orderRef: null, payment: "success", lookup: { status: "loading" } }),
    ).toEqual({ kind: "not-found" });
  });

  it("is not-found when the server has no such order", () => {
    expect(view({ payment: "success", lookup: { status: "missing" } })).toEqual({
      kind: "not-found",
    });
  });
});

describe("deriveConfirmationView — invalid order reference", () => {
  it("does not confirm an order id that is not a UUID", () => {
    expect(
      view({ orderRef: "not-a-uuid", lookup: { status: "loading" } }),
    ).toEqual({ kind: "not-found" });
  });

  it("does not confirm an empty order id carrying a total and email", () => {
    expect(view({ orderRef: "", lookup: { status: "loading" } })).toEqual({
      kind: "not-found",
    });
  });
});

describe("deriveConfirmationView — successful orders", () => {
  it("COD: a verified not_required order is placed, with no payment claim", () => {
    expect(view({ lookup: found("not_required") })).toEqual({
      kind: "placed",
      paid: false,
    });
  });

  it("online: a verified paid order is placed and reports the payment", () => {
    expect(view({ payment: "success", lookup: found("paid") })).toEqual({
      kind: "placed",
      paid: true,
    });
  });

  it("a paid order beats a stale ?payment=cancelled link", () => {
    expect(view({ payment: "cancelled", lookup: found("paid") })).toEqual({
      kind: "placed",
      paid: true,
    });
  });
});

describe("deriveConfirmationView — pending orders", () => {
  it("shows pending while the gateway has not confirmed yet", () => {
    expect(view({ payment: "success", lookup: found("pending") })).toEqual({
      kind: "pending",
    });
  });

  it("shows pending for ?payment=pending", () => {
    expect(view({ payment: "pending", lookup: found("pending") })).toEqual({
      kind: "pending",
    });
  });

  it("shows pending for a processing payment", () => {
    expect(view({ lookup: found("processing") })).toEqual({ kind: "pending" });
  });

  it("shows loading, not a confirmation, while the lookup is in flight", () => {
    expect(view({ payment: "success", lookup: { status: "loading" } })).toEqual({
      kind: "loading",
    });
  });
});

describe("deriveConfirmationView — failed and cancelled orders", () => {
  it("reports a cancelled return as cancelled", () => {
    expect(view({ payment: "cancelled", lookup: found("pending") })).toEqual({
      kind: "failed",
      reason: "cancelled",
    });
  });

  it("reports a failed return as failed", () => {
    expect(view({ payment: "failed", lookup: found("pending") })).toEqual({
      kind: "failed",
      reason: "failed",
    });
  });

  it("reports a stored failed payment even without a payment param", () => {
    expect(view({ lookup: found("failed") })).toEqual({
      kind: "failed",
      reason: "failed",
    });
  });
});

// ─── Rendering ──────────────────────────────────────────────────────────────

describe("OrderConfirmationCard rendering", () => {
  it("renders a neutral not-found state with no success wording", () => {
    const html = render({ kind: "not-found" });
    expect(html).toContain("Order not found");
    expect(html).not.toContain("Order placed");
    expect(html).not.toContain("Your order has been received");
    expect(html).not.toContain("Payment received");
  });

  it("hides the order number, total and email on a not-found state", () => {
    const html = render(
      { kind: "not-found" },
      { shortId: "", orderTotal: "4321", customerEmail: "spoof@example.com" },
    );
    expect(html).not.toContain("Order number");
    expect(html).not.toContain("Total");
    expect(html).not.toContain("4,321");
    expect(html).not.toContain("spoof@example.com");
  });

  it("renders the loading state without any confirmation wording", () => {
    const html = render({ kind: "loading" });
    expect(html).toContain("Checking your order");
    expect(html).not.toContain("Order placed");
    expect(html).not.toContain("Order not found");
  });

  it("renders a COD placement without claiming a payment was taken", () => {
    const html = render(
      { kind: "placed", paid: false },
      { shortId: "0F1E2D3C", orderTotal: "250", customerEmail: "a@b.com" },
    );
    expect(html).toContain("Order placed");
    expect(html).toContain("Your order has been received");
    expect(html).not.toContain("Payment received");
    expect(html).toContain("0F1E2D3C");
    expect(html).toContain("a@b.com");
  });

  it("renders a paid placement with the payment confirmation", () => {
    const html = render({ kind: "placed", paid: true });
    expect(html).toContain("Order placed");
    expect(html).toContain("Payment received");
  });

  it("renders the pending state", () => {
    const html = render({ kind: "pending" }, { shortId: "0F1E2D3C" });
    expect(html).toContain("Payment pending");
    expect(html).toContain("Awaiting payment");
    expect(html).not.toContain("Order placed");
  });

  it("renders the failed state", () => {
    const html = render({ kind: "failed", reason: "failed" });
    expect(html).toContain("Payment failed");
    expect(html).toContain("The payment did not go through");
    expect(html).not.toContain("Order placed");
  });

  it("renders the cancelled state", () => {
    const html = render({ kind: "failed", reason: "cancelled" });
    expect(html).toContain("Payment cancelled");
    expect(html).toContain("The payment was cancelled");
    expect(html).not.toContain("Order placed");
  });
});
