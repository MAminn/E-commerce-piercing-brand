// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  CURRENT_WHATSAPP_CONSENT_VERSION,
  WHATSAPP_CONSENT_REQUIRED_MESSAGE,
  WHATSAPP_CONSENT_TEXTS,
} from "#root/shared/whatsapp/consent-text";

/**
 * The REQUIRED WhatsApp acknowledgment on the REAL /checkout page, with both
 * checkout templates. The server's `checkoutOptIn` decides per mode (off /
 * shadow: hidden; pilot: only an allow-listed number; live: everyone) and is
 * asked again as the phone changes. The page must:
 *   - hide the box unless the server says so (and on any lookup failure);
 *   - show it for cash on delivery only, never pre-ticked;
 *   - REFUSE to submit while a shown box is unticked (inline error, no order);
 *   - send `whatsappOptIn: true` + the consent text version and language ONLY
 *     for a visible, ticked box;
 *   - drop a tick as soon as the box hides;
 *   - when the server refuses an order for a missing tick (e.g. the lookup
 *     failed), show the box so the shopper can tick it and resubmit.
 * Same harness as checkout-governorate-ssr.test.tsx.
 */
const optIn = vi.fn();
const createOrder = vi.fn();
const methods = vi.fn();
let templateId = "checkout-modern";
vi.mock("#root/shared/trpc/client", () => ({
  trpc: {
    whatsappConfirmation: { checkoutOptIn: { query: (input?: { phone?: string }) => optIn(input) } },
    order: { create: { mutate: (input: unknown) => createOrder(input) } },
    shipping: {
      quote: {
        query: async () => ({
          success: true,
          result: { mode: "flat", quote: { available: true, provider: "flat", fee: 85, governorateCode: null, governorateName: null } },
        }),
      },
    },
    payment: { methods: { query: () => methods() } },
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
  useTemplate: () => ({ getTemplateId: () => templateId }),
}));
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

const ALLOWED = "01009990001";
const OTHER = "01009990002";
const COD_ONLY = { methods: [{ id: "cod", label: "Cash on Delivery", description: "" }] };
/** What a pilot server answers: only the allow-listed number gets the box. */
const pilotServer = (input?: { phone?: string }) => {
  const enabled = (input?.phone ?? "").replace(/\D/g, "").endsWith("1009990001");
  return Promise.resolve({ enabled, required: enabled });
};
/** What the server answers in live with WHATSAPP_CHECKOUT_CONSENT_REQUIRED=true / unset. */
const LIVE_REQUIRED = { enabled: true, required: true };
const LIVE_OPTIONAL = { enabled: true, required: false };

type Sent = { whatsappOptIn?: boolean; whatsappConsentVersion?: string; whatsappConsentLocale?: string; customerPhone?: string; paymentMethod?: string };

const optInBox = () => document.getElementById("whatsappOptIn") as HTMLInputElement | null;
const type = (id: string, value: string) => fireEvent.change(document.getElementById(id) as HTMLInputElement, { target: { value } });
const placeOrderButton = () =>
  screen.getAllByRole("button").find((b) => b.getAttribute("type") === "submit" && /place order|إتمام الطلب/i.test(b.textContent ?? "")) as HTMLElement;

const phoneField = () => waitFor(() => expect(document.getElementById("phoneNumber")).not.toBeNull());
async function fill(phone: string) {
  await phoneField();
  type("fullName", "Mona Test");
  type("phoneNumber", phone);
  type("address", "12 Road 9, Maadi");
  type("city", "Cairo");
}
/** Press "Place order"; resolves with what order.create received, or null if it was not called. */
async function pressPlaceOrder(): Promise<Sent | null> {
  const before = createOrder.mock.calls.length;
  await act(async () => {
    fireEvent.click(placeOrderButton());
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  return createOrder.mock.calls.length > before ? (createOrder.mock.calls.at(-1)?.[0] as Sent) : null;
}
async function submit(): Promise<Sent> {
  const before = createOrder.mock.calls.length;
  await act(async () => {
    fireEvent.click(placeOrderButton());
  });
  await waitFor(() => expect(createOrder.mock.calls.length).toBe(before + 1));
  return createOrder.mock.calls.at(-1)?.[0] as Sent;
}

beforeEach(() => {
  // jsdom has no scrollIntoView; validation scrolls to the first invalid field.
  Element.prototype.scrollIntoView = vi.fn();
  // ...nor IntersectionObserver (the editorial template's reveal animations).
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    },
  );
  templateId = "checkout-modern";
  localStorage.clear();
  localStorage.setItem(
    "cart",
    JSON.stringify([{ id: "p1", name: "Star Stud", price: 150, quantity: 1, stock: 5, available: true, selectedOptions: {} }]),
  );
  optIn.mockReset();
  createOrder.mockReset();
  createOrder.mockResolvedValue({ success: false, error: "stopped by test" });
  methods.mockReset();
  methods.mockResolvedValue(COD_ONLY);
});
afterEach(cleanup);

describe("checkout — required WhatsApp acknowledgment (checkout-modern)", () => {
  it("off / shadow (server says no): never rendered, the order goes through with whatsappOptIn=false", async () => {
    optIn.mockResolvedValue({ enabled: false });
    render(tree());
    await fill(ALLOWED);
    await waitFor(() => expect(optIn).toHaveBeenCalledWith({ phone: ALLOWED }));
    expect(optInBox()).toBeNull();
    expect((await submit()).whatsappOptIn).toBe(false);
  });

  it("a failed lookup hides it and checkout still renders", async () => {
    optIn.mockRejectedValue(new Error("network down"));
    render(tree());
    await phoneField();
    await waitFor(() => expect(optIn).toHaveBeenCalled());
    expect(optInBox()).toBeNull();
  });

  it("a synchronous throw while building the call hides it and checkout still renders", async () => {
    optIn.mockImplementation(() => {
      throw new TypeError("trpc client not ready");
    });
    render(tree());
    await phoneField();
    expect(optInBox()).toBeNull();
  });

  it("live: shown under the phone with the exact consent text, NOT pre-ticked, and an unticked box blocks the order", async () => {
    optIn.mockResolvedValue(LIVE_REQUIRED);
    render(tree());
    await waitFor(() => expect(optInBox()).not.toBeNull());
    expect(optInBox()?.checked).toBe(false);
    expect(optInBox()?.getAttribute("aria-required")).toBe("true");
    expect(screen.getByText(WHATSAPP_CONSENT_TEXTS[CURRENT_WHATSAPP_CONSENT_VERSION].en)).toBeTruthy();
    expect(WHATSAPP_CONSENT_TEXTS[CURRENT_WHATSAPP_CONSENT_VERSION].en).toMatch(/Percé.*WhatsApp/);
    await fill(OTHER);
    // Pressing "Place order" without the tick: no order, an inline error, focus on the box.
    expect(await pressPlaceOrder()).toBeNull();
    expect(createOrder).not.toHaveBeenCalled();
    expect(await screen.findByText(/tick this box to place your order/i)).toBeTruthy();
    expect(optInBox()?.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(optInBox());
    // Tick it → the order goes through with the evidence fields.
    fireEvent.click(optInBox() as HTMLInputElement);
    expect(await submit()).toMatchObject({
      whatsappOptIn: true,
      whatsappConsentVersion: CURRENT_WHATSAPP_CONSENT_VERSION,
      whatsappConsentLocale: "en",
      customerPhone: OTHER,
      paymentMethod: "cod",
    });
  });

  it("live, Arabic: the Arabic consent text is shown and its language is sent", async () => {
    optIn.mockResolvedValue(LIVE_REQUIRED);
    render(tree("ar"));
    await waitFor(() => expect(optInBox()).not.toBeNull());
    expect(screen.getByText(WHATSAPP_CONSENT_TEXTS[CURRENT_WHATSAPP_CONSENT_VERSION].ar)).toBeTruthy();
    await fill(OTHER);
    fireEvent.click(optInBox() as HTMLInputElement);
    expect(await submit()).toMatchObject({ whatsappOptIn: true, whatsappConsentLocale: "ar" });
  });

  it("card payment: the box is hidden (nothing is sent on WhatsApp for a paid order), a tick is dropped, and it does not block", async () => {
    optIn.mockResolvedValue(LIVE_REQUIRED);
    methods.mockResolvedValue({ methods: [...COD_ONLY.methods, { id: "paymob", label: "Card", description: "" }] });
    render(tree());
    await fill(OTHER);
    type("email", "mona@example.test");
    await waitFor(() => expect(optInBox()).not.toBeNull());
    fireEvent.click(optInBox() as HTMLInputElement);
    const card = document.querySelector("input[name='paymentMethod'][value='paymob']") as HTMLInputElement;
    await waitFor(() => expect(card).toBeTruthy());
    fireEvent.click(card);
    await waitFor(() => expect(optInBox()).toBeNull());
    expect(await submit()).toMatchObject({ whatsappOptIn: false, paymentMethod: "paymob" });
    // Back to COD: the box is back, unticked, and required again.
    fireEvent.click(document.querySelector("input[name='paymentMethod'][value='cod']") as HTMLInputElement);
    await waitFor(() => expect(optInBox()).not.toBeNull());
    expect(optInBox()?.checked).toBe(false);
    expect(await pressPlaceOrder()).toBeNull();
  });

  it("pilot: hidden (not required) for other numbers; required for an allow-listed one — the allow-list alone never opts in", async () => {
    optIn.mockImplementation(pilotServer);
    render(tree());
    await fill(OTHER);
    await waitFor(() => expect(optIn).toHaveBeenCalledWith({ phone: OTHER }));
    expect(optInBox()).toBeNull();
    expect((await submit()).whatsappOptIn).toBe(false);

    type("phoneNumber", ALLOWED);
    await waitFor(() => expect(optInBox()).not.toBeNull());
    expect(optInBox()?.checked).toBe(false);
    expect(await pressPlaceOrder()).toBeNull();
    fireEvent.click(optInBox() as HTMLInputElement);
    expect(await submit()).toMatchObject({ whatsappOptIn: true, customerPhone: ALLOWED });
  });

  it("pilot: a tick is dropped the moment the number stops qualifying, and is not restored", async () => {
    optIn.mockImplementation(pilotServer);
    render(tree());
    await fill(ALLOWED);
    await waitFor(() => expect(optInBox()).not.toBeNull());
    fireEvent.click(optInBox() as HTMLInputElement);
    expect(optInBox()?.checked).toBe(true);

    type("phoneNumber", OTHER);
    await waitFor(() => expect(optInBox()).toBeNull());
    type("phoneNumber", ALLOWED);
    await waitFor(() => expect(optInBox()).not.toBeNull());
    expect(optInBox()?.checked).toBe(false);
    expect(await pressPlaceOrder()).toBeNull();
  });

  it("the server refuses an order for a missing tick (lookup had failed): the box appears, unticked, and the order goes through once ticked", async () => {
    optIn.mockRejectedValue(new Error("network down"));
    createOrder.mockResolvedValueOnce({ success: false, error: WHATSAPP_CONSENT_REQUIRED_MESSAGE });
    render(tree());
    await fill(OTHER);
    await waitFor(() => expect(optIn).toHaveBeenCalled());
    expect(optInBox()).toBeNull();
    expect((await submit()).whatsappOptIn).toBe(false);
    await waitFor(() => expect(optInBox()).not.toBeNull());
    expect(optInBox()?.checked).toBe(false);
    // The checkout's own (English) message, not the server's raw wording.
    expect(screen.getAllByText(/Please tick this box to place your order/).length).toBeGreaterThan(0);
    expect(screen.queryByText(WHATSAPP_CONSENT_REQUIRED_MESSAGE)).toBeNull();
    fireEvent.click(optInBox() as HTMLInputElement);
    expect(await submit()).toMatchObject({ whatsappOptIn: true, whatsappConsentVersion: CURRENT_WHATSAPP_CONSENT_VERSION });
  });
});

describe("checkout — rollout switch off (WHATSAPP_CHECKOUT_CONSENT_REQUIRED unset): optional, as before", () => {
  it("modern: shown, never pre-ticked, NOT required — an unticked order goes through with false; a tick sends true", async () => {
    optIn.mockResolvedValue(LIVE_OPTIONAL);
    render(tree());
    await fill(OTHER);
    await waitFor(() => expect(optInBox()).not.toBeNull());
    expect(optInBox()?.checked).toBe(false);
    expect(optInBox()?.getAttribute("aria-required")).toBeNull();
    expect(await submit()).toMatchObject({ whatsappOptIn: false });
    expect(screen.queryByText(/tick this box/i)).toBeNull();
    fireEvent.click(optInBox() as HTMLInputElement);
    expect(await submit()).toMatchObject({ whatsappOptIn: true, whatsappConsentVersion: CURRENT_WHATSAPP_CONSENT_VERSION });
  });

  it("editorial: shown, NOT required — an unticked order goes through", async () => {
    templateId = "checkout-editorial";
    optIn.mockResolvedValue(LIVE_OPTIONAL);
    render(tree());
    const box = () => document.getElementById("checkout-whatsapp-opt-in") as HTMLInputElement | null;
    await waitFor(() => expect(box()).not.toBeNull());
    type("checkout-name", "Mona Test");
    type("checkout-phone", OTHER);
    type("checkout-address1", "12 Road 9, Maadi");
    type("checkout-city", "Cairo");
    await act(async () => {
      fireEvent.submit(box()?.form as HTMLFormElement);
    });
    await waitFor(() => expect(createOrder).toHaveBeenCalledTimes(1));
    expect(createOrder.mock.calls[0]?.[0]).toMatchObject({ whatsappOptIn: false });
  });
});

describe("checkout — Arabic: a consent refusal is shown in Arabic (C3)", () => {
  it("modern, Arabic, cached-page recovery: the lookup failed, the server refuses, the Arabic error and the box appear; ticking places the order", async () => {
    optIn.mockRejectedValue(new Error("network down"));
    createOrder.mockResolvedValueOnce({ success: false, error: WHATSAPP_CONSENT_REQUIRED_MESSAGE });
    render(tree("ar"));
    await fill(OTHER);
    await waitFor(() => expect(optIn).toHaveBeenCalled());
    expect(optInBox()).toBeNull();
    expect((await submit()).whatsappOptIn).toBe(false);
    await waitFor(() => expect(optInBox()).not.toBeNull());
    expect(screen.getAllByText(/يرجى تحديد هذا المربع لإتمام طلبك/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Please tick/)).toBeNull();
    expect(screen.getByText(WHATSAPP_CONSENT_TEXTS[CURRENT_WHATSAPP_CONSENT_VERSION].ar)).toBeTruthy();
    // Forced box is required: an unticked retry is blocked in Arabic, a tick goes through.
    expect(await pressPlaceOrder()).toBeNull();
    fireEvent.click(optInBox() as HTMLInputElement);
    expect(await submit()).toMatchObject({ whatsappOptIn: true, whatsappConsentLocale: "ar" });
  });

  it("modern, Arabic: the inline error for an unticked required box is Arabic", async () => {
    optIn.mockResolvedValue(LIVE_REQUIRED);
    render(tree("ar"));
    await fill(OTHER);
    await waitFor(() => expect(optInBox()).not.toBeNull());
    expect(await pressPlaceOrder()).toBeNull();
    expect(await screen.findByText(/يرجى تحديد هذا المربع لإتمام طلبك/)).toBeTruthy();
  });

  it("editorial, Arabic: inline error and server refusal are Arabic", async () => {
    templateId = "checkout-editorial";
    optIn.mockRejectedValue(new Error("network down"));
    createOrder.mockResolvedValueOnce({ success: false, error: WHATSAPP_CONSENT_REQUIRED_MESSAGE });
    render(tree("ar"));
    const box = () => document.getElementById("checkout-whatsapp-opt-in") as HTMLInputElement | null;
    await waitFor(() => expect(document.getElementById("checkout-phone")).not.toBeNull());
    type("checkout-name", "Mona Test");
    type("checkout-phone", OTHER);
    type("checkout-address1", "12 Road 9, Maadi");
    type("checkout-city", "Cairo");
    await waitFor(() => expect(optIn).toHaveBeenCalled());
    const form = document.getElementById("checkout-phone")?.closest("form") as HTMLFormElement;
    await act(async () => {
      fireEvent.submit(form);
    });
    await waitFor(() => expect(createOrder).toHaveBeenCalledTimes(1));
    // Server refusal → Arabic page error + the box.
    await waitFor(() => expect(box()).not.toBeNull());
    expect(screen.getAllByText(/يرجى تحديد هذا المربع لإتمام طلبك/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Please tick/)).toBeNull();
    // Unticked retry → the template's inline Arabic error, no order.
    await act(async () => {
      fireEvent.submit(form);
    });
    expect(createOrder).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(document.getElementById("checkout-whatsapp-opt-in-error")).not.toBeNull());
    expect(document.getElementById("checkout-whatsapp-opt-in-error")?.textContent).toMatch(/يرجى تحديد هذا المربع لإتمام طلبك/);
    fireEvent.click(box() as HTMLInputElement);
    await act(async () => {
      fireEvent.submit(form);
    });
    await waitFor(() => expect(createOrder).toHaveBeenCalledTimes(2));
    expect(createOrder.mock.calls[1]?.[0]).toMatchObject({ whatsappOptIn: true, whatsappConsentLocale: "ar" });
  });
});

describe("checkout — required WhatsApp acknowledgment (checkout-editorial)", () => {
  const box = () => document.getElementById("checkout-whatsapp-opt-in") as HTMLInputElement | null;
  const submitForm = async () => {
    const before = createOrder.mock.calls.length;
    await act(async () => {
      fireEvent.submit(box()?.form ?? (document.querySelector("form") as HTMLFormElement));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    return createOrder.mock.calls.length > before ? (createOrder.mock.calls.at(-1)?.[0] as Sent) : null;
  };

  it("live: unticked blocks with an inline error; ticked sends the consent", async () => {
    templateId = "checkout-editorial";
    optIn.mockResolvedValue(LIVE_REQUIRED);
    render(tree());
    await waitFor(() => expect(box()).not.toBeNull());
    expect(box()?.checked).toBe(false);
    expect(screen.getByText(WHATSAPP_CONSENT_TEXTS[CURRENT_WHATSAPP_CONSENT_VERSION].en)).toBeTruthy();
    type("checkout-name", "Mona Test");
    type("checkout-phone", OTHER);
    type("checkout-address1", "12 Road 9, Maadi");
    type("checkout-city", "Cairo");
    expect(await submitForm()).toBeNull();
    expect((await screen.findByRole("alert")).textContent).toMatch(/tick this box/i);
    expect(document.activeElement).toBe(box());
    fireEvent.click(box() as HTMLInputElement);
    expect(await submitForm()).toMatchObject({ whatsappOptIn: true, whatsappConsentVersion: CURRENT_WHATSAPP_CONSENT_VERSION, customerPhone: OTHER });
  });

  it("off / shadow: no box and nothing blocks", async () => {
    templateId = "checkout-editorial";
    optIn.mockResolvedValue({ enabled: false });
    render(tree());
    await waitFor(() => expect(document.getElementById("checkout-phone")).not.toBeNull());
    type("checkout-name", "Mona Test");
    type("checkout-phone", OTHER);
    type("checkout-address1", "12 Road 9, Maadi");
    type("checkout-city", "Cairo");
    await waitFor(() => expect(optIn).toHaveBeenCalled());
    expect(box()).toBeNull();
    expect(await submitForm()).toMatchObject({ whatsappOptIn: false });
  });
});
