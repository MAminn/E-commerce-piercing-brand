import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
/**
 * Sale lines in the bag and at checkout (cart-modern / checkout-modern, the
 * live templates): a discounted line shows the price paid, the regular price
 * struck through and the percent off; a regular line shows one price. And
 * ordering waits while the bag's prices are being re-read.
 */
vi.mock("#root/shared/trpc/client", () => ({ trpc: {} }));
vi.mock("vike-react/usePageContext", () => ({
  usePageContext: () => ({ urlPathname: "/checkout", shippingFeeRange: { min: 80, max: 150 } }),
}));
import { CheckoutPageModernTemplate } from "../CheckoutPageModernTemplate";
import { CartPageModernTemplate } from "#root/components/template-system/cartPage/CartPageModernTemplate";

const plain = (s: string) => s.replace(/&nbsp;| /g, " ");
const sale = { id: "p1", name: "Crystal Eye Clip", price: 96, originalPrice: 120, quantity: 2 };
const regular = { id: "p2", name: "Four Crystal Hoop", price: 120, quantity: 1 };

const submitDisabled = (html: string): boolean[] =>
  [...html.matchAll(/<button[^>]*type="submit"[^>]*>[\s\S]*?<\/button>/g)]
    .filter((m) => /Place Order/i.test(m[0]))
    .map((m) => /<button[^>]*\bdisabled=""/.test(m[0]));

describe("checkout-modern order summary", () => {
  const html = (totals: Record<string, unknown> = {}) =>
    plain(
      renderToStaticMarkup(
        createElement(CheckoutPageModernTemplate, {
          items: [sale, regular],
          totals: { subtotal: 312, grandTotal: 392, shipping: 80, shippingStatus: "quoted", ...totals },
          currency: "EGP",
        } as never),
      ),
    );

  it("a sale line: line total paid, the regular line total struck, the percent off", () => {
    const out = html();
    const line = out.slice(out.indexOf("Crystal Eye Clip"), out.indexOf("Four Crystal Hoop"));
    expect(line).toMatch(/data-price-paid[^>]*>EGP 192</);
    expect(line).toMatch(/<s[^>]*>EGP 240<\/s>/);
    expect(line).toMatch(/data-price-badge[^>]*>−20%</);
  });

  it("a regular line shows one price and no badge", () => {
    const out = html();
    const start = out.indexOf("Four Crystal Hoop");
    const line = out.slice(start, out.indexOf("</li>", start));
    expect(line).toContain("EGP 120");
    expect(line).not.toMatch(/<s[ >]|data-price-badge/);
  });

  it("Place Order waits while the bag's prices are being re-read, then enables", () => {
    expect(submitDisabled(html({ pricesUpdating: true })).every((d) => d)).toBe(true);
    const ready = submitDisabled(html({ pricesUpdating: false }));
    expect(ready.length).toBeGreaterThan(0);
    expect(ready.every((d) => !d)).toBe(true);
  });
});

describe("cart-modern bag lines", () => {
  const out = plain(
    renderToStaticMarkup(
      createElement(CartPageModernTemplate, {
        items: [
          { ...sale, available: true, stock: 5 },
          { ...regular, available: true, stock: 5 },
        ],
        totals: { subtotal: 312, grandTotal: 312 },
        currency: "EGP",
      } as never),
    ),
  );

  it("a sale line: unit price paid with struck regular price and percent off; struck line total", () => {
    expect(out).toMatch(/data-cart-unit-sale[\s\S]*?data-price-paid[^>]*>EGP 96<[\s\S]*?<s[^>]*>EGP 120<\/s>[\s\S]*?−20%/);
    expect(out).toMatch(/data-price-paid[^>]*>EGP 192<[\s\S]*?<s[^>]*>EGP 240<\/s>/);
  });

  it("a regular line has no strike and no badge", () => {
    const start = out.indexOf("Four Crystal Hoop");
    const line = out.slice(start, start + 1500);
    expect(line).toContain("EGP 120");
    expect(line).not.toMatch(/<s[ >]|data-price-badge/);
  });
});
