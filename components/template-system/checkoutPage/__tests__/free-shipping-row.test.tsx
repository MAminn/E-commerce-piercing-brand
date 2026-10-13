import { describe, expect, it, vi } from "vitest";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("#root/shared/trpc/client", () => ({ trpc: {} }));
vi.mock("vike-react/usePageContext", () => ({
  usePageContext: () => ({ urlPathname: "/checkout" }),
}));

import { deriveShippingLine, summaryShippingAmount } from "#root/shared/shipping/checkout-shipping";
import type { ShippingQuoteResponse } from "#root/shared/shipping/quote";
import { MinimalI18nProvider } from "#root/lib/i18n/MinimalI18nContext";
import { CheckoutPageModernTemplate } from "../CheckoutPageModernTemplate";
import { CheckoutPageEditorialTemplate } from "../CheckoutPageEditorialTemplate";
import { CartPageMinimalTemplate } from "#root/components/template-system/cartPage/CartPageMinimalTemplate";
import { CartPageModernTemplate } from "#root/components/template-system/cartPage/CartPageModernTemplate";

/**
 * A free-shipping benefit (Pick Your Set, promo code or automatic offer)
 * makes the quoted fee 0. The summary row must then read "Free" / "مجاني" —
 * it used to disappear, because the pages only passed a fee when it was > 0.
 */
const cairo: ShippingQuoteResponse = {
  mode: "zones",
  quote: {
    available: true,
    provider: "manual_zone",
    method: "standard",
    amount: 70,
    currency: "EGP",
    rateSource: "governorate_rate",
    governorateCode: "CAI",
    governorateName: "Cairo",
  },
};
const sinai: ShippingQuoteResponse = {
  mode: "zones",
  quote: {
    available: false,
    provider: "manual_zone",
    reason: "destination_unavailable",
    governorateCode: "SSI",
    governorateName: "South Sinai",
  },
};
const freeShippingOffer = [{ freeShipping: true }];

describe("summaryShippingAmount — what the shipping row receives", () => {
  it("normal shipping → the governorate price", () => {
    expect(summaryShippingAmount(deriveShippingLine(cairo, []), "zones")).toBe(70);
  });

  it("bundle / promo-code / automatic-offer free shipping → 0 (rendered Free), never hidden", () => {
    expect(summaryShippingAmount(deriveShippingLine(cairo, [], { bundleFreeShipping: true }), "zones")).toBe(0);
    expect(summaryShippingAmount(deriveShippingLine(cairo, [], { promoFreeShipping: true }), "zones")).toBe(0);
    expect(summaryShippingAmount(deriveShippingLine(cairo, freeShippingOffer), "zones")).toBe(0);
  });

  it("losing the qualification returns the normal amount", () => {
    const qualified = deriveShippingLine(cairo, [], { bundleFreeShipping: true });
    const lost = deriveShippingLine(cairo, [], { bundleFreeShipping: false });
    expect(summaryShippingAmount(qualified, "zones")).toBe(0);
    expect(summaryShippingAmount(lost, "zones")).toBe(70);
  });

  it("unavailable and pending destinations get no amount (their own wording instead)", () => {
    expect(summaryShippingAmount(deriveShippingLine(sinai, [], { bundleFreeShipping: true }), "zones")).toBeUndefined();
    expect(summaryShippingAmount(deriveShippingLine(null, [], { promoFreeShipping: true }), "zones")).toBeUndefined();
  });

  it("a flat-mode store with no fee configured keeps showing no shipping row (unchanged)", () => {
    const flatZero: ShippingQuoteResponse = {
      mode: "flat",
      quote: { ...cairo.quote, provider: "flat", amount: 0, rateSource: "flat", governorateCode: null, governorateName: null } as ShippingQuoteResponse["quote"],
    };
    expect(summaryShippingAmount(deriveShippingLine(flatZero, []), "flat")).toBeUndefined();
    // …but a waived flat fee is still announced as Free.
    const flat45: ShippingQuoteResponse = { ...flatZero, quote: { ...flatZero.quote, amount: 45 } as ShippingQuoteResponse["quote"] };
    expect(summaryShippingAmount(deriveShippingLine(flat45, freeShippingOffer), "flat")).toBe(0);
  });
});

const items = [{ id: "p1", name: "Titanium stud", price: 150, quantity: 2 }];
const cartItems = [{ id: "p1", name: "Titanium stud", price: 150, quantity: 2, available: true }];
const freeTotals = { subtotal: 300, shipping: 0, grandTotal: 300, shippingStatus: "quoted" as const };
const paidTotals = { subtotal: 300, shipping: 70, grandTotal: 370, shippingStatus: "quoted" as const };
const unavailableTotals = { subtotal: 300, grandTotal: 300, shippingStatus: "unavailable" as const };

const html = (el: ReactElement, locale: "en" | "ar" = "en") =>
  renderToStaticMarkup(<MinimalI18nProvider ssrLocale={locale}>{el}</MinimalI18nProvider>);
/** The text of the row containing "Shipping"/"الشحن" and the value after it. */
const shippingRow = (markup: string) =>
  markup.replace(/<[^>]+>/g, "|").replace(/\|+/g, "|").match(/(Shipping|الشحن)\|([^|]+)/)?.[2];

describe("cart / checkout summary renders a waived fee as Free", () => {
  const surfaces: [string, (totals: Record<string, unknown>) => ReactElement][] = [
    ["Modern checkout", (totals) => createElement(CheckoutPageModernTemplate, { items, totals, currency: "EGP" } as never)],
    ["Editorial checkout", (totals) => createElement(CheckoutPageEditorialTemplate, { items, totals, currency: "EGP" } as never)],
    ["Modern cart", (totals) => createElement(CartPageModernTemplate, { items: cartItems, totals, currency: "EGP" } as never)],
    ["Minimal (Percé) cart", (totals) => createElement(CartPageMinimalTemplate, { items: cartItems, totals, currency: "EGP" } as never)],
  ];

  it.each(surfaces)("%s: free → 'Free', paid → the governorate amount", (_name, make) => {
    expect(shippingRow(html(make(freeTotals)))).toBe("Free");
    expect(shippingRow(html(make(paidTotals)))).toMatch(/70/);
  });

  it("Arabic storefront says مجاني", () => {
    expect(html(createElement(CheckoutPageModernTemplate, { items, totals: freeTotals, currency: "EGP" } as never), "ar")).toContain("مجاني");
    expect(html(createElement(CartPageMinimalTemplate, { items: cartItems, totals: freeTotals, currency: "EGP" } as never), "ar")).toContain("مجاني");
  });

  it("an unavailable destination stays unavailable (no Free row)", () => {
    const markup = html(createElement(CheckoutPageModernTemplate, { items, totals: unavailableTotals, currency: "EGP" } as never));
    expect(markup).toContain("Not available for this destination");
    expect(shippingRow(markup)).not.toBe("Free");
  });
});
