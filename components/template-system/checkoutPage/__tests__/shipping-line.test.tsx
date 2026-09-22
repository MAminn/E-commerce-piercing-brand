import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Static markup only: the offer banner's tRPC fetch never fires (no effects
// run in renderToStaticMarkup), but the module must import cleanly.
vi.mock("#root/shared/trpc/client", () => ({ trpc: {} }));
// The Editorial template renders the site chrome, whose links read the page path.
vi.mock("vike-react/usePageContext", () => ({
  usePageContext: () => ({ urlPathname: "/checkout" }),
}));

import { CheckoutPageModernTemplate, type CheckoutTotals } from "../CheckoutPageModernTemplate";
import { CheckoutPageEditorialTemplate } from "../CheckoutPageEditorialTemplate";
import { CartPageMinimalTemplate } from "#root/components/template-system/cartPage/CartPageMinimalTemplate";
import { CartPageModernTemplate } from "#root/components/template-system/cartPage/CartPageModernTemplate";

const items = [{ id: "p1", name: "Titanium stud", price: 150, quantity: 2 }];
const cartItems = [{ id: "p1", name: "Titanium stud", price: 150, quantity: 2, available: true }];

const render = (totals: CheckoutTotals, extra: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    createElement(CheckoutPageModernTemplate, { items, totals, currency: "EGP", ...extra }),
  );

/**
 * Disabled state of every "Place Order" button (desktop + mobile render it
 * twice). The Editorial chrome also has a newsletter submit; it is not one.
 */
const submitDisabled = (html: string): boolean[] =>
  [...html.matchAll(/<button[^>]*type="submit"[^>]*>[\s\S]*?<\/button>/g)]
    .filter((m) => /Place Order/i.test(m[0]))
    .map((m) => /<button[^>]*\bdisabled=""/.test(m[0]));

describe("checkout shipping line — Modern template", () => {
  it("shows 'Calculated at checkout' with the goods total before a destination is chosen", () => {
    const html = render({ subtotal: 300, grandTotal: 300, shippingStatus: "pending" }, { governorateRequired: true });
    expect(html).toContain("Calculated at checkout");
    expect(html).toContain("Select your governorate to see the shipping fee.");
    expect(html).not.toContain("Not available for this destination");
    // Pending never disables the button: validation points at the field instead.
    expect(submitDisabled(html).every((d) => d === false)).toBe(true);
  });

  it("shows the exact fee and the recalculated total once quoted", () => {
    const html = render(
      { subtotal: 300, shipping: 60, grandTotal: 360, shippingStatus: "quoted" },
      { governorateRequired: true, governorateCode: "CAI" },
    );
    expect(html).not.toContain("Calculated at checkout");
    expect(html).toMatch(/EGP(&nbsp;| | )60/);
    expect(html).toMatch(/EGP(&nbsp;| | )360/);
    expect(submitDisabled(html).every((d) => d === false)).toBe(true);
  });

  it("marks an unavailable destination and disables every Place Order button", () => {
    const html = render(
      { subtotal: 300, grandTotal: 300, shippingStatus: "unavailable" },
      { governorateRequired: true, governorateCode: "SSI" },
    );
    expect(html).toContain("Not available for this destination");
    expect(html).toContain("We don&#x27;t deliver to this governorate yet.");
    const states = submitDisabled(html);
    expect(states.length).toBeGreaterThan(0);
    expect(states.every((d) => d === true)).toBe(true);
  });

  it("renders the canonical governorate list as a required <select> in zones mode", () => {
    const html = render({ subtotal: 300, grandTotal: 300, shippingStatus: "pending" }, { governorateRequired: true });
    expect(html).toMatch(/<select[^>]*id="state"[^>]*required=""/);
    expect(html).toContain('<option value="CAI">Cairo</option>');
    expect(html).toContain('<option value="ALX">Alexandria</option>');
    expect((html.match(/<option value="[A-Z]{3}">/g) ?? []).length).toBe(27);
  });

  it("keeps the governorate optional in flat mode and shows the flat fee as before", () => {
    const html = render({ subtotal: 300, shipping: 45, grandTotal: 345, shippingStatus: "quoted" });
    expect(html).toMatch(/<select[^>]*id="state"/);
    expect(html).not.toMatch(/<select[^>]*id="state"[^>]*required=""/);
    expect(html).toContain("(optional)");
    expect(html).not.toContain("Calculated at checkout");
    expect(html).toMatch(/EGP(&nbsp;| | )45/);
  });

  it("carries no unsupported promotional shipping copy", () => {
    const html = render({ subtotal: 300, grandTotal: 300, shippingStatus: "pending" }, { governorateRequired: true });
    expect(html).not.toMatch(/free shipping with 2\+ items/i);
    expect(html).not.toMatch(/free exchanges/i);
  });
});

describe("checkout shipping line — Editorial template", () => {
  const renderEditorial = (totals: CheckoutTotals, extra: Record<string, unknown> = {}) =>
    renderToStaticMarkup(
      createElement(CheckoutPageEditorialTemplate, { items, totals, currency: "EGP", ...extra }),
    );

  it("pending → 'Calculated at checkout'; unavailable → blocked", () => {
    const pending = renderEditorial({ subtotal: 300, grandTotal: 300, shippingStatus: "pending" }, { governorateRequired: true });
    expect(pending).toContain("Calculated at checkout");
    expect(submitDisabled(pending).every((d) => d === false)).toBe(true);

    const blocked = renderEditorial(
      { subtotal: 300, grandTotal: 300, shippingStatus: "unavailable" },
      { governorateRequired: true, governorateCode: "SSI" },
    );
    expect(blocked).toContain("Not available for this destination");
    expect(submitDisabled(blocked).every((d) => d === true)).toBe(true);
  });

  it("quoted → the fee is printed", () => {
    const html = renderEditorial(
      { subtotal: 300, shipping: 75, grandTotal: 375, shippingStatus: "quoted" },
      { governorateRequired: true, governorateCode: "ALX" },
    );
    expect(html).toContain("EGP 75.00");
    expect(html).not.toContain("Calculated at checkout");
  });
});

describe("cart page shipping line before a destination is known", () => {
  it("Minimal (Percé) cart says 'Calculated at checkout' only in the pending state", () => {
    const pending = renderToStaticMarkup(
      createElement(CartPageMinimalTemplate, {
        items: cartItems,
        totals: { subtotal: 300, grandTotal: 300, shippingStatus: "pending" },
      }),
    );
    expect(pending).toContain("Calculated at checkout");

    // Flat mode with a configured fee: the numeric line, as before.
    const flat = renderToStaticMarkup(
      createElement(CartPageMinimalTemplate, {
        items: cartItems,
        totals: { subtotal: 300, shipping: 45, grandTotal: 345, shippingStatus: "quoted" },
      }),
    );
    expect(flat).not.toContain("Calculated at checkout");
    expect(flat).toMatch(/EGP(&nbsp;| | )45/);

    // Flat mode at 0 (today's production value): no shipping line at all, as before.
    const zero = renderToStaticMarkup(
      createElement(CartPageMinimalTemplate, {
        items: cartItems,
        totals: { subtotal: 300, grandTotal: 300, shippingStatus: "quoted" },
      }),
    );
    expect(zero).not.toContain("Calculated at checkout");
    expect(zero).not.toMatch(/>Shipping</);
  });

  it("Modern cart shows the pending copy too", () => {
    const html = renderToStaticMarkup(
      createElement(CartPageModernTemplate, {
        items: cartItems,
        totals: { subtotal: 300, grandTotal: 300, shippingStatus: "pending" },
      }),
    );
    expect(html).toContain("Calculated at checkout");
  });
});
