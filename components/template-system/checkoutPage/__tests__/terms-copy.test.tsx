import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MinimalI18nProvider } from "#root/lib/i18n/MinimalI18nContext";
import { translations, type Locale } from "#root/lib/i18n/translations";
import type { TranslationOverrides } from "#root/shared/types/layout-settings";

// Static markup only: the offer banner's tRPC fetch never fires (no effects
// run in renderToStaticMarkup), but the module must import cleanly.
vi.mock("#root/shared/trpc/client", () => ({ trpc: {} }));
vi.mock("vike-react/usePageContext", () => ({
  usePageContext: () => ({ urlPathname: "/checkout" }),
}));

import {
  CheckoutPageModernTemplate,
  type CheckoutTotals,
} from "../CheckoutPageModernTemplate";

const items = [{ id: "p1", name: "Titanium stud", price: 150, quantity: 2 }];
const totals: CheckoutTotals = { subtotal: 300, grandTotal: 300 };

function render(overrides?: TranslationOverrides, ssrLocale: Locale = "en") {
  return renderToStaticMarkup(
    createElement(MinimalI18nProvider, {
      overrides,
      ssrLocale,
      children: createElement(CheckoutPageModernTemplate, {
        items,
        totals,
        currency: "EGP",
      }),
    }),
  );
}

describe("checkout terms-and-conditions line — no published policy", () => {
  it("ships no default English agreement claim", () => {
    expect(translations.en["checkout.terms"]).toBe("");
  });

  it("ships no default Arabic agreement claim", () => {
    expect(translations.ar["checkout.terms"]).toBe("");
  });

  it("renders no agreement sentence on an unconfigured store (English)", () => {
    const html = render();
    expect(html).not.toMatch(/you agree to our/i);
    expect(html).not.toMatch(/terms\s*(&amp;|and)\s*conditions/i);
    // The raw key must never leak into the page either.
    expect(html).not.toContain("checkout.terms");
  });

  it("renders no agreement sentence on an unconfigured store (Arabic)", () => {
    const html = render(undefined, "ar");
    expect(html).not.toContain("الشروط والأحكام");
    expect(html).not.toContain("توافق على");
    expect(html).not.toContain("checkout.terms");
  });

  it("adds no link to a terms page that does not exist", () => {
    const html = render();
    expect(html).not.toMatch(/href="\/terms"/);
    // /links is the link-tree page the old copy pointed at; no terms
    // sentence means no link to it from the place-order block.
    expect(html).not.toMatch(/you agree[\s\S]{0,120}href="\/links"/i);
  });
});

describe("checkout terms-and-conditions line — administrator-supplied copy", () => {
  it("renders the exact English copy an admin published", () => {
    const copy = "By placing your order you accept the Percé return policy.";
    const html = render({ en: { "checkout.terms": copy }, ar: {} });
    expect(html).toContain(copy);
  });

  it("renders the exact Arabic copy an admin published", () => {
    const copy = "بإتمام الطلب أنتِ توافقين على سياسة الإرجاع.";
    const html = render({ en: {}, ar: { "checkout.terms": copy } }, "ar");
    expect(html).toContain(copy);
  });

  it("treats whitespace-only copy as no copy at all", () => {
    const html = render({ en: { "checkout.terms": "   " }, ar: {} });
    // No empty paragraph in the place-order block claiming anything.
    expect(html).not.toMatch(/you agree to our/i);
    expect(html).not.toContain("checkout.terms");
  });
});
