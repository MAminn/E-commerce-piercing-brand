// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CURRENT_WHATSAPP_CONSENT_VERSION, WHATSAPP_CONSENT_TEXTS } from "#root/shared/whatsapp/consent-text";

/**
 * Black Friday pricing and the WhatsApp acknowledgment together, on the REAL
 * /checkout page + live checkout-modern template + real CartProvider:
 *   - a bag saved before the sale is re-priced to the live sale price (struck
 *     regular price + % badge) while Place order waits;
 *   - the WhatsApp box sits next to it unchanged: never pre-ticked, required
 *     only when the server says so (WHATSAPP_CHECKOUT_CONSENT_REQUIRED), never
 *     shown for a card payment;
 *   - the order payload carries identities and quantities only (the server
 *     prices the order), plus the consent fields.
 */
const optIn = vi.fn();
const createOrder = vi.fn();
const live = new Map<string, { id: string; price: string; discountPrice: string | null }>();
vi.mock("#root/shared/trpc/client", () => ({
  trpc: {
    whatsappConfirmation: { checkoutOptIn: { query: (input?: { phone?: string }) => optIn(input) } },
    order: { create: { mutate: (input: unknown) => createOrder(input) } },
    product: {
      getByIds: {
        query: async ({ ids }: { ids: string[] }) => ({ success: true, result: ids.flatMap((id) => (live.has(id) ? [live.get(id)] : [])) }),
      },
      getById: { query: async () => ({ success: false }) },
    },
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
vi.mock("#root/frontend/contexts/TemplateContext", () => ({ useTemplate: () => ({ getTemplateId: () => "checkout-modern" }) }));
vi.mock("#root/frontend/contexts/TrackingContext", () => ({ useTracking: () => ({ trackEvent: () => {} }) }));
vi.mock("vike-react/usePageContext", () => ({ usePageContext: () => ({ urlPathname: "/checkout" }) }));
vi.mock("vike/client/router", () => ({ navigate: () => {} }));

import CheckoutPage from "../+Page";
import { CartProvider } from "#root/lib/context/CartContext";
import { MinimalI18nProvider } from "#root/lib/i18n/MinimalI18nContext";

const tree = (locale: "en" | "ar" = "en") => (
  <MinimalI18nProvider ssrLocale={locale}>
    <CartProvider>
      <CheckoutPage />
    </CartProvider>
  </MinimalI18nProvider>
);
const PHONE = "01009990002";
const box = () => document.getElementById("whatsappOptIn") as HTMLInputElement | null;
const type = (id: string, value: string) => fireEvent.change(document.getElementById(id) as HTMLInputElement, { target: { value } });
const placeButton = () =>
  screen.getAllByRole("button").find((b) => b.getAttribute("type") === "submit" && /place order|إتمام الطلب/i.test(b.textContent ?? "")) as HTMLButtonElement;
async function fill() {
  await waitFor(() => expect(document.getElementById("phoneNumber")).not.toBeNull());
  type("fullName", "Mona Test");
  type("phoneNumber", PHONE);
  type("address", "12 Road 9, Maadi");
  type("city", "Cairo");
}
async function press() {
  const before = createOrder.mock.calls.length;
  await act(async () => {
    fireEvent.click(placeButton());
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  return createOrder.mock.calls.length > before ? (createOrder.mock.calls.at(-1)?.[0] as Record<string, unknown>) : null;
}
/** The bag line shows the live sale: paid price, struck regular price, percent badge. */
async function expectSaleLine() {
  await waitFor(() => expect(document.querySelector("[data-price-badge]")?.textContent).toMatch(/20%/));
  const struck = [...document.querySelectorAll("s")].map((s) => s.textContent ?? "");
  // Line of 2: regular 2 × 120 = 240 struck; 2 × 96 = 192 paid.
  expect(struck.some((t) => /240/.test(t))).toBe(true);
  expect(document.querySelector("[data-price-paid]")?.textContent).toMatch(/192/);
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  localStorage.clear();
  live.clear();
  // Saved BEFORE the sale: 120 EGP, no original price. Live: 96 (20% off 120).
  live.set("p1", { id: "p1", price: "120.00", discountPrice: "96.00" });
  localStorage.setItem("cart", JSON.stringify([{ id: "p1", name: "Crystal Eye Clip", price: 120, quantity: 2, stock: 5, available: true, selectedOptions: {} }]));
  optIn.mockReset();
  createOrder.mockReset();
  createOrder.mockResolvedValue({ success: false, error: "stopped by test" });
});
afterEach(cleanup);

describe("checkout — Black Friday sale line + WhatsApp acknowledgment", () => {
  it("switch ON: re-priced sale line shown; unticked blocks; ticked order carries consent and no client prices", async () => {
    optIn.mockResolvedValue({ enabled: true, required: true });
    render(tree());
    await fill();
    await expectSaleLine();
    await waitFor(() => expect(box()).not.toBeNull());
    expect(box()?.checked).toBe(false);
    await waitFor(() => expect(placeButton().disabled).toBe(false));
    expect(await press()).toBeNull();
    expect(await screen.findByText(/tick this box to place your order/i)).toBeTruthy();
    fireEvent.click(box() as HTMLInputElement);
    const sent = await press();
    expect(sent).toMatchObject({
      paymentMethod: "cod",
      whatsappOptIn: true,
      whatsappConsentVersion: CURRENT_WHATSAPP_CONSENT_VERSION,
      items: [{ productId: "p1", quantity: 2 }],
    });
    // The server prices the order: no unit price travels from the browser.
    expect(JSON.stringify(sent?.items)).not.toMatch(/"price"/);
  });

  it("switch OFF (default): same sale line; the box is optional and an unticked COD order goes through", async () => {
    optIn.mockResolvedValue({ enabled: true, required: false });
    render(tree());
    await fill();
    await expectSaleLine();
    await waitFor(() => expect(box()).not.toBeNull());
    await waitFor(() => expect(placeButton().disabled).toBe(false));
    expect(await press()).toMatchObject({ whatsappOptIn: false, items: [{ productId: "p1", quantity: 2 }] });
  });

  it("Arabic, switch ON: Arabic consent text and Arabic error next to the sale line", async () => {
    optIn.mockResolvedValue({ enabled: true, required: true });
    render(tree("ar"));
    await fill();
    await expectSaleLine();
    await waitFor(() => expect(box()).not.toBeNull());
    expect(screen.getByText(WHATSAPP_CONSENT_TEXTS[CURRENT_WHATSAPP_CONSENT_VERSION].ar)).toBeTruthy();
    await waitFor(() => expect(placeButton().disabled).toBe(false));
    expect(await press()).toBeNull();
    expect(await screen.findByText(/يرجى تحديد هذا المربع لإتمام طلبك/)).toBeTruthy();
    fireEvent.click(box() as HTMLInputElement);
    expect(await press()).toMatchObject({ whatsappOptIn: true, whatsappConsentLocale: "ar" });
  });

  it("off / shadow: no box; the sale checkout is unchanged", async () => {
    optIn.mockResolvedValue({ enabled: false, required: false });
    render(tree());
    await fill();
    await expectSaleLine();
    await waitFor(() => expect(optIn).toHaveBeenCalled());
    expect(box()).toBeNull();
    await waitFor(() => expect(placeButton().disabled).toBe(false));
    expect(await press()).toMatchObject({ whatsappOptIn: false });
  });
});
