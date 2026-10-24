// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";

/**
 * Checkout's Governorate field from the very first render, through the REAL
 * CartProvider + /checkout page + live `checkout-modern` template.
 *
 * Percé prices shipping per governorate. The server render (and the first
 * client render) used to assume flat shipping until `shipping.quote`
 * answered, so Governorate was drawn "(optional)" with no hint, then flipped
 * to required and grew a hint line — a layout shift on every checkout visit.
 * Now the store's expected mode is used until the quote lands, and the hint /
 * unavailable / error messages share one reserved line.
 */
const quote = vi.fn();
vi.mock("#root/shared/trpc/client", () => ({
  trpc: {
    shipping: { quote: { query: (input: unknown) => quote(input) } },
    payment: { methods: { query: async () => ({ methods: [{ id: "cod", label: "Cash on Delivery", description: "" }] }) } },
    bundle: { evaluateSelection: { query: async () => ({ success: true, result: { ok: false } }) } },
    offer: {
      evaluate: { query: async () => ({ success: true, result: [] }) },
      listActive: { query: async () => ({ success: true, result: [] }) },
    },
    cartCapture: { sync: { mutate: async () => ({ success: true }) } },
    promoCode: { validate: { query: async () => ({ success: false }) } },
  },
}));
vi.mock("#root/frontend/contexts/TemplateContext", () => ({
  useTemplate: () => ({ getTemplateId: () => "checkout-modern" }),
}));
vi.mock("#root/frontend/contexts/TrackingContext", () => ({ useTracking: () => ({ trackEvent: () => {} }) }));
vi.mock("vike-react/usePageContext", () => ({ usePageContext: () => ({ urlPathname: "/checkout" }) }));
vi.mock("vike/client/router", () => ({ navigate: () => {} }));

import CheckoutPage from "../+Page";
import { CartProvider } from "#root/lib/context/CartContext";
import { MinimalI18nProvider } from "#root/lib/i18n/MinimalI18nContext";
import { EXPECTED_SHIPPING_MODE } from "#root/shared/config/storefront";

const zonesPending = {
  success: true,
  result: {
    mode: "zones",
    quote: { available: false, provider: "rules", reason: "destination_required", governorateCode: null, governorateName: null },
  },
};
const flatQuoted = {
  success: true,
  result: { mode: "flat", quote: { available: true, provider: "flat", fee: 85, governorateCode: null, governorateName: null } },
};

const tree = () => (
  <MinimalI18nProvider ssrLocale='en'>
    <CartProvider>
      <CheckoutPage />
    </CartProvider>
  </MinimalI18nProvider>
);

/** The <label> for the governorate select. */
const governorateLabelHtml = (html: string) => html.match(/<label[^>]*for="state"[^>]*>[\s\S]*?<\/label>/)?.[0] ?? "";

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(
    "cart",
    JSON.stringify([{ id: "p1", name: "Star Stud", price: 150, quantity: 1, stock: 5, available: true, selectedOptions: {} }]),
  );
  quote.mockReset();
  quote.mockResolvedValue(zonesPending);
});
afterEach(cleanup);

describe("checkout governorate — first render", () => {
  it("the store expects zone pricing", () => {
    expect(EXPECTED_SHIPPING_MODE).toBe("zones");
  });

  it("server render: Governorate is required, never '(optional)', with its hint line reserved", () => {
    const html = renderToString(tree());
    expect(governorateLabelHtml(html)).toContain("Governorate");
    expect(governorateLabelHtml(html)).not.toContain("(optional)");
    expect(html).toMatch(/<select[^>]*id="state"[^>]*required=""/);
    expect(html).toContain('data-testid="governorate-status"');
    expect(html).toContain("Select your governorate to see the shipping fee.");
  });

  it("hydrated + zones quote: nothing flips (still required, same hint)", async () => {
    const { container } = render(tree());
    await waitFor(() => expect(quote).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText("Select your governorate to see the shipping fee.")).toBeTruthy());
    const label = container.querySelector('label[for="state"]');
    expect(label?.textContent).not.toContain("(optional)");
    expect(container.querySelector("select#state")?.hasAttribute("required")).toBe(true);
  });

  it("the live quote still wins: a store in flat mode renders Governorate optional", async () => {
    quote.mockResolvedValue(flatQuoted);
    const { container } = render(tree());
    await waitFor(() => expect(container.querySelector('label[for="state"]')?.textContent).toContain("(optional)"));
    expect(container.querySelector("select#state")?.hasAttribute("required")).toBe(false);
  });

  it("the status line stays in the layout once the hint is gone", async () => {
    const { container } = render(tree());
    const slot = await screen.findByTestId("governorate-status");
    expect(slot.className).toContain("min-h-4");
    // The hint, the unavailable notice and the error all live inside it.
    expect(slot.contains(container.querySelector("#state-error"))).toBe(true);
  });
});
