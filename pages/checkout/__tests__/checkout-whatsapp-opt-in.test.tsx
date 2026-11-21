// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

/**
 * The WhatsApp opt-in on the REAL /checkout page + live `checkout-modern`
 * template: hidden unless the server says the feature is on, hidden when the
 * lookup fails, and never pre-ticked. Same harness as
 * checkout-governorate-ssr.test.tsx.
 */
const optIn = vi.fn();
vi.mock("#root/shared/trpc/client", () => ({
  trpc: {
    whatsappConfirmation: { checkoutOptIn: { query: () => optIn() } },
    shipping: {
      quote: {
        query: async () => ({
          success: true,
          result: { mode: "flat", quote: { available: true, provider: "flat", fee: 85, governorateCode: null, governorateName: null } },
        }),
      },
    },
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

const tree = () => (
  <MinimalI18nProvider ssrLocale='en'>
    <CartProvider>
      <CheckoutPage />
    </CartProvider>
  </MinimalI18nProvider>
);

const optInBox = () => document.getElementById("whatsappOptIn") as HTMLInputElement | null;

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(
    "cart",
    JSON.stringify([{ id: "p1", name: "Star Stud", price: 150, quantity: 1, stock: 5, available: true, selectedOptions: {} }]),
  );
  optIn.mockReset();
});
afterEach(cleanup);

describe("checkout — WhatsApp opt-in", () => {
  it("off: the checkbox is never rendered", async () => {
    optIn.mockResolvedValue({ enabled: false });
    render(tree());
    await waitFor(() => expect(optIn).toHaveBeenCalled());
    await screen.findByLabelText(/phone/i);
    expect(optInBox()).toBeNull();
  });

  it("a failed lookup hides it and checkout still renders", async () => {
    optIn.mockRejectedValue(new Error("network down"));
    render(tree());
    await screen.findByLabelText(/phone/i);
    await waitFor(() => expect(optIn).toHaveBeenCalled());
    expect(optInBox()).toBeNull();
  });

  it("a synchronous throw while building the call hides it and checkout still renders", async () => {
    optIn.mockImplementation(() => {
      throw new TypeError("trpc client not ready");
    });
    render(tree());
    await screen.findByLabelText(/phone/i);
    expect(optInBox()).toBeNull();
  });

  it("on: shown under the phone field, NOT pre-ticked", async () => {
    optIn.mockResolvedValue({ enabled: true });
    render(tree());
    await waitFor(() => expect(optInBox()).not.toBeNull());
    expect(optInBox()?.checked).toBe(false);
    expect(screen.getByText(/order confirmation and updates to this number on WhatsApp/i)).toBeTruthy();
  });
});
