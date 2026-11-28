// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  CONFIRMATION_CHOICE_TEXT,
  CURRENT_WHATSAPP_CONSENT_VERSION,
  MANDATORY_CHOICE_CONSENT_VERSION,
  WHATSAPP_CONSENT_REQUIRED_MESSAGE,
  WHATSAPP_CONSENT_TEXTS,
} from "#root/shared/whatsapp/consent-text";

/**
 * WhatsApp at checkout on the REAL /checkout page, with both checkout
 * templates. The server's `checkoutOptIn` decides per mode (off / shadow:
 * hidden; pilot: only an allow-listed number; live: everyone) and whether a
 * choice is required (WHATSAPP_CHECKOUT_CONSENT_REQUIRED). The page must:
 *   - hide everything unless the server says so (and on any lookup failure);
 *   - show it for cash on delivery only;
 *   - switch OFF: an optional opt-in checkbox, never pre-ticked;
 *   - switch ON (checkout-v3): a required choice "On WhatsApp" (the explicit
 *     opt-in) / "By phone call" (no WhatsApp), nothing preselected; no order
 *     until one is chosen (inline error in the checkout language);
 *   - send whatsappOptIn=true ONLY for the ticked box or the WhatsApp choice,
 *     and the channel for the choice;
 *   - drop a tick / choice as soon as the block hides;
 *   - when the server refuses an order for a missing choice (e.g. the lookup
 *     failed), show the choice so the shopper can pick and resubmit.
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
/** What a pilot server answers with the switch on: only the allow-listed number gets the choice. */
const pilotServer = (input?: { phone?: string }) => {
  const enabled = (input?.phone ?? "").replace(/\D/g, "").endsWith("1009990001");
  return Promise.resolve({ enabled, required: enabled });
};
/** What the server answers in live with WHATSAPP_CHECKOUT_CONSENT_REQUIRED=true / unset. */
const LIVE_REQUIRED = { enabled: true, required: true };
const LIVE_OPTIONAL = { enabled: true, required: false };
const EN_ERR = /Please choose how we should confirm your order/;
const AR_ERR = /يرجى اختيار طريقة تأكيد طلبك/;

type Sent = {
  whatsappOptIn?: boolean;
  whatsappConfirmationChannel?: string;
  whatsappConsentVersion?: string;
  whatsappConsentLocale?: string;
  customerPhone?: string;
  paymentMethod?: string;
};

// checkout-modern ids
const optInBox = () => document.getElementById("whatsappOptIn") as HTMLInputElement | null;
const waRadio = () => document.getElementById("whatsappChannel") as HTMLInputElement | null;
const phoneRadio = () => document.getElementById("whatsappChannel-phone") as HTMLInputElement | null;
const choiceBlock = () => document.querySelector("[data-testid=whatsapp-confirmation-choice]");
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

describe("checkout — WhatsApp hidden (off / shadow / failures)", () => {
  it("off / shadow (server says no): nothing rendered, the order goes through with whatsappOptIn=false", async () => {
    optIn.mockResolvedValue({ enabled: false, required: false });
    render(tree());
    await fill(ALLOWED);
    await waitFor(() => expect(optIn).toHaveBeenCalledWith({ phone: ALLOWED }));
    expect(optInBox()).toBeNull();
    expect(choiceBlock()).toBeNull();
    const sent = await submit();
    expect(sent.whatsappOptIn).toBe(false);
    expect(sent.whatsappConfirmationChannel).toBeUndefined();
  });

  it("a failed lookup hides it and checkout still renders", async () => {
    optIn.mockRejectedValue(new Error("network down"));
    render(tree());
    await phoneField();
    await waitFor(() => expect(optIn).toHaveBeenCalled());
    expect(optInBox()).toBeNull();
    expect(choiceBlock()).toBeNull();
  });

  it("a synchronous throw while building the call hides it and checkout still renders", async () => {
    optIn.mockImplementation(() => {
      throw new TypeError("trpc client not ready");
    });
    render(tree());
    await phoneField();
    expect(optInBox()).toBeNull();
  });
});

describe("checkout — switch OFF (default): optional opt-in checkbox, as before", () => {
  it("modern: shown, never pre-ticked, NOT required — an unticked order goes through with false; a tick sends true (v2)", async () => {
    optIn.mockResolvedValue(LIVE_OPTIONAL);
    render(tree());
    await fill(OTHER);
    await waitFor(() => expect(optInBox()).not.toBeNull());
    expect(choiceBlock()).toBeNull();
    expect(optInBox()?.checked).toBe(false);
    expect(optInBox()?.getAttribute("aria-required")).toBeNull();
    expect(screen.getByText(WHATSAPP_CONSENT_TEXTS[CURRENT_WHATSAPP_CONSENT_VERSION].en)).toBeTruthy();
    expect(await submit()).toMatchObject({ whatsappOptIn: false });
    expect(screen.queryByText(EN_ERR)).toBeNull();
    fireEvent.click(optInBox() as HTMLInputElement);
    const sent = await submit();
    expect(sent).toMatchObject({ whatsappOptIn: true, whatsappConsentVersion: CURRENT_WHATSAPP_CONSENT_VERSION });
    expect(sent.whatsappConfirmationChannel).toBeUndefined();
  });

  it("editorial: shown, NOT required — an unticked order goes through", async () => {
    templateId = "checkout-editorial";
    optIn.mockResolvedValue(LIVE_OPTIONAL);
    render(tree());
    const box = () => document.getElementById("checkout-whatsapp-opt-in") as HTMLInputElement | null;
    await waitFor(() => expect(box()).not.toBeNull());
    expect(choiceBlock()).toBeNull();
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

describe("checkout — switch ON: required confirmation-channel choice (checkout-v3, modern)", () => {
  it("shows the contractual notice and two choices, nothing preselected; no choice blocks the order", async () => {
    optIn.mockResolvedValue(LIVE_REQUIRED);
    render(tree());
    await waitFor(() => expect(choiceBlock()).not.toBeNull());
    expect(optInBox()).toBeNull(); // no checkbox in this mode
    expect(waRadio()?.checked).toBe(false);
    expect(phoneRadio()?.checked).toBe(false);
    const en = CONFIRMATION_CHOICE_TEXT.en;
    for (const text of [en.legend, en.notice, en.whatsapp, en.phone, en.fallback]) expect(screen.getByText(text), text).toBeTruthy();
    // The WhatsApp option is the recorded consent text, word for word.
    expect(en.whatsapp).toBe(WHATSAPP_CONSENT_TEXTS[MANDATORY_CHOICE_CONSENT_VERSION].en);
    await fill(OTHER);
    expect(await pressPlaceOrder()).toBeNull();
    expect(createOrder).not.toHaveBeenCalled();
    expect(await screen.findByText(EN_ERR)).toBeTruthy();
    expect(waRadio()?.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(waRadio());
  });

  it("choosing WhatsApp: whatsappOptIn=true, channel whatsapp, version checkout-v3", async () => {
    optIn.mockResolvedValue(LIVE_REQUIRED);
    render(tree());
    await fill(OTHER);
    await waitFor(() => expect(waRadio()).not.toBeNull());
    fireEvent.click(waRadio() as HTMLInputElement);
    expect(await submit()).toMatchObject({
      whatsappOptIn: true,
      whatsappConfirmationChannel: "whatsapp",
      whatsappConsentVersion: MANDATORY_CHOICE_CONSENT_VERSION,
      whatsappConsentLocale: "en",
      customerPhone: OTHER,
      paymentMethod: "cod",
    });
  });

  it("choosing a phone call: whatsappOptIn=false, channel phone — never consent", async () => {
    optIn.mockResolvedValue(LIVE_REQUIRED);
    render(tree());
    await fill(OTHER);
    await waitFor(() => expect(phoneRadio()).not.toBeNull());
    fireEvent.click(phoneRadio() as HTMLInputElement);
    expect(await submit()).toMatchObject({ whatsappOptIn: false, whatsappConfirmationChannel: "phone" });
    // Changing one's mind to WhatsApp sends the opt-in instead.
    fireEvent.click(waRadio() as HTMLInputElement);
    expect(await submit()).toMatchObject({ whatsappOptIn: true, whatsappConfirmationChannel: "whatsapp" });
  });

  it("Arabic: Arabic notice and options; the Arabic error; the language is sent", async () => {
    optIn.mockResolvedValue(LIVE_REQUIRED);
    render(tree("ar"));
    await fill(OTHER);
    await waitFor(() => expect(choiceBlock()).not.toBeNull());
    const ar = CONFIRMATION_CHOICE_TEXT.ar;
    for (const text of [ar.legend, ar.notice, ar.whatsapp, ar.phone, ar.fallback]) expect(screen.getByText(text), text).toBeTruthy();
    expect(await pressPlaceOrder()).toBeNull();
    expect(await screen.findByText(AR_ERR)).toBeTruthy();
    fireEvent.click(waRadio() as HTMLInputElement);
    expect(await submit()).toMatchObject({ whatsappOptIn: true, whatsappConfirmationChannel: "whatsapp", whatsappConsentLocale: "ar" });
  });

  it("card payment: the choice is hidden (no WhatsApp for a paid order), a choice is dropped, and it does not block", async () => {
    optIn.mockResolvedValue(LIVE_REQUIRED);
    methods.mockResolvedValue({ methods: [...COD_ONLY.methods, { id: "paymob", label: "Card", description: "" }] });
    render(tree());
    await fill(OTHER);
    type("email", "mona@example.test");
    await waitFor(() => expect(waRadio()).not.toBeNull());
    fireEvent.click(waRadio() as HTMLInputElement);
    const card = document.querySelector("input[name='paymentMethod'][value='paymob']") as HTMLInputElement;
    await waitFor(() => expect(card).toBeTruthy());
    fireEvent.click(card);
    await waitFor(() => expect(choiceBlock()).toBeNull());
    const sent = await submit();
    expect(sent).toMatchObject({ whatsappOptIn: false, paymentMethod: "paymob" });
    expect(sent.whatsappConfirmationChannel).toBeUndefined();
    // Back to COD: the choice is back, empty, and required again.
    fireEvent.click(document.querySelector("input[name='paymentMethod'][value='cod']") as HTMLInputElement);
    await waitFor(() => expect(waRadio()).not.toBeNull());
    expect(waRadio()?.checked).toBe(false);
    expect(phoneRadio()?.checked).toBe(false);
    expect(await pressPlaceOrder()).toBeNull();
  });

  it("pilot: hidden (not required) for other numbers; required for an allow-listed one — the allow-list alone never opts in", async () => {
    optIn.mockImplementation(pilotServer);
    render(tree());
    await fill(OTHER);
    await waitFor(() => expect(optIn).toHaveBeenCalledWith({ phone: OTHER }));
    expect(choiceBlock()).toBeNull();
    expect((await submit()).whatsappOptIn).toBe(false);
    type("phoneNumber", ALLOWED);
    await waitFor(() => expect(choiceBlock()).not.toBeNull());
    expect(await pressPlaceOrder()).toBeNull();
    fireEvent.click(waRadio() as HTMLInputElement);
    expect(await submit()).toMatchObject({ whatsappOptIn: true, customerPhone: ALLOWED });
  });

  it("pilot: a choice is dropped the moment the number stops qualifying, and is not restored", async () => {
    optIn.mockImplementation(pilotServer);
    render(tree());
    await fill(ALLOWED);
    await waitFor(() => expect(waRadio()).not.toBeNull());
    fireEvent.click(waRadio() as HTMLInputElement);
    expect(waRadio()?.checked).toBe(true);
    type("phoneNumber", OTHER);
    await waitFor(() => expect(choiceBlock()).toBeNull());
    type("phoneNumber", ALLOWED);
    await waitFor(() => expect(waRadio()).not.toBeNull());
    expect(waRadio()?.checked).toBe(false);
    expect(await pressPlaceOrder()).toBeNull();
  });

  it("server refusal (lookup failed): the choice appears empty with the checkout's own message; picking places the order", async () => {
    optIn.mockRejectedValue(new Error("network down"));
    createOrder.mockResolvedValueOnce({ success: false, error: WHATSAPP_CONSENT_REQUIRED_MESSAGE });
    render(tree());
    await fill(OTHER);
    await waitFor(() => expect(optIn).toHaveBeenCalled());
    expect(choiceBlock()).toBeNull();
    expect((await submit()).whatsappOptIn).toBe(false);
    await waitFor(() => expect(choiceBlock()).not.toBeNull());
    expect(waRadio()?.checked).toBe(false);
    expect(screen.getAllByText(EN_ERR).length).toBeGreaterThan(0);
    expect(screen.queryByText(WHATSAPP_CONSENT_REQUIRED_MESSAGE)).toBeNull();
    fireEvent.click(phoneRadio() as HTMLInputElement);
    expect(await submit()).toMatchObject({ whatsappOptIn: false, whatsappConfirmationChannel: "phone" });
  });

  it("Arabic server refusal: Arabic error, not the raw server text", async () => {
    optIn.mockRejectedValue(new Error("network down"));
    createOrder.mockResolvedValueOnce({ success: false, error: WHATSAPP_CONSENT_REQUIRED_MESSAGE });
    render(tree("ar"));
    await fill(OTHER);
    await waitFor(() => expect(optIn).toHaveBeenCalled());
    await submit();
    await waitFor(() => expect(choiceBlock()).not.toBeNull());
    expect(screen.getAllByText(AR_ERR).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Please choose/)).toBeNull();
    fireEvent.click(waRadio() as HTMLInputElement);
    expect(await submit()).toMatchObject({ whatsappOptIn: true, whatsappConsentLocale: "ar" });
  });
});

describe("checkout — switch ON: required confirmation-channel choice (checkout-v3, editorial)", () => {
  const wa = () => document.getElementById("checkout-whatsapp-channel") as HTMLInputElement | null;
  const phone = () => document.getElementById("checkout-whatsapp-channel-phone") as HTMLInputElement | null;
  const formOf = () => document.getElementById("checkout-phone")?.closest("form") as HTMLFormElement;
  const submitForm = async () => {
    const before = createOrder.mock.calls.length;
    await act(async () => {
      fireEvent.submit(formOf());
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    return createOrder.mock.calls.length > before ? (createOrder.mock.calls.at(-1)?.[0] as Sent) : null;
  };
  const fillEditorial = async () => {
    await waitFor(() => expect(document.getElementById("checkout-phone")).not.toBeNull());
    type("checkout-name", "Mona Test");
    type("checkout-phone", OTHER);
    type("checkout-address1", "12 Road 9, Maadi");
    type("checkout-city", "Cairo");
  };

  it("no choice blocks with an inline error (focus on the first option); each choice is sent as such", async () => {
    templateId = "checkout-editorial";
    optIn.mockResolvedValue(LIVE_REQUIRED);
    render(tree());
    await waitFor(() => expect(wa()).not.toBeNull());
    expect(document.getElementById("checkout-whatsapp-opt-in")).toBeNull();
    expect(wa()?.checked).toBe(false);
    expect(phone()?.checked).toBe(false);
    expect(screen.getByText(CONFIRMATION_CHOICE_TEXT.en.whatsapp)).toBeTruthy();
    await fillEditorial();
    expect(await submitForm()).toBeNull();
    expect(document.getElementById("checkout-whatsapp-channel-error")?.textContent).toMatch(EN_ERR);
    expect(document.activeElement).toBe(wa());
    fireEvent.click(phone() as HTMLInputElement);
    expect(await submitForm()).toMatchObject({ whatsappOptIn: false, whatsappConfirmationChannel: "phone" });
    fireEvent.click(wa() as HTMLInputElement);
    expect(await submitForm()).toMatchObject({
      whatsappOptIn: true,
      whatsappConfirmationChannel: "whatsapp",
      whatsappConsentVersion: MANDATORY_CHOICE_CONSENT_VERSION,
    });
  });

  it("Arabic: inline error and server refusal are Arabic", async () => {
    templateId = "checkout-editorial";
    optIn.mockRejectedValue(new Error("network down"));
    createOrder.mockResolvedValueOnce({ success: false, error: WHATSAPP_CONSENT_REQUIRED_MESSAGE });
    render(tree("ar"));
    await fillEditorial();
    await waitFor(() => expect(optIn).toHaveBeenCalled());
    await act(async () => {
      fireEvent.submit(formOf());
    });
    await waitFor(() => expect(createOrder).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(wa()).not.toBeNull());
    expect(screen.getAllByText(AR_ERR).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Please choose/)).toBeNull();
    expect(await submitForm()).toBeNull();
    await waitFor(() => expect(document.getElementById("checkout-whatsapp-channel-error")).not.toBeNull());
    expect(document.getElementById("checkout-whatsapp-channel-error")?.textContent).toMatch(AR_ERR);
    fireEvent.click(wa() as HTMLInputElement);
    expect(await submitForm()).toMatchObject({ whatsappOptIn: true, whatsappConsentLocale: "ar" });
  });

  it("off / shadow: nothing shown and nothing blocks", async () => {
    templateId = "checkout-editorial";
    optIn.mockResolvedValue({ enabled: false, required: false });
    render(tree());
    await fillEditorial();
    await waitFor(() => expect(optIn).toHaveBeenCalled());
    expect(wa()).toBeNull();
    expect(document.getElementById("checkout-whatsapp-opt-in")).toBeNull();
    expect(await submitForm()).toMatchObject({ whatsappOptIn: false });
  });
});
