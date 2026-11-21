// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * The WhatsApp opt-in on the REAL /checkout page + live `checkout-modern`
 * template. The server's `checkoutOptIn` decides per mode (off / shadow:
 * hidden; pilot: only an allow-listed number; live: everyone) and is asked
 * again as the phone changes. The page must: hide the box unless the server
 * says so (and on any failure), never pre-tick it, drop a tick as soon as the
 * box hides, and send `whatsappOptIn: true` ONLY for a visible, ticked box.
 * Same harness as checkout-governorate-ssr.test.tsx.
 */
const optIn = vi.fn();
const createOrder = vi.fn();
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

const ALLOWED = "01009990001";
const OTHER = "01009990002";
/** What a pilot server answers: only the allow-listed number gets the box. */
const pilotServer = (input?: { phone?: string }) => Promise.resolve({ enabled: (input?.phone ?? "").replace(/\D/g, "").endsWith("1009990001") });

const optInBox = () => document.getElementById("whatsappOptIn") as HTMLInputElement | null;
const type = (id: string, value: string) => fireEvent.change(document.getElementById(id) as HTMLInputElement, { target: { value } });

async function fillAndSubmit(phone: string) {
  await screen.findByLabelText(/phone/i);
  type("fullName", "Mona Test");
  type("phoneNumber", phone);
  type("address", "12 Road 9, Maadi");
  type("city", "Cairo");
}
async function submit() {
  const button = screen.getAllByRole("button").find((b) => b.getAttribute("type") === "submit" && /place order/i.test(b.textContent ?? ""));
  expect(button, "Place order button").toBeTruthy();
  await act(async () => {
    fireEvent.click(button as HTMLElement);
  });
  await waitFor(() => expect(createOrder).toHaveBeenCalledTimes(1));
  return createOrder.mock.calls[0]?.[0] as { whatsappOptIn?: boolean; customerPhone?: string };
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(
    "cart",
    JSON.stringify([{ id: "p1", name: "Star Stud", price: 150, quantity: 1, stock: 5, available: true, selectedOptions: {} }]),
  );
  optIn.mockReset();
  createOrder.mockReset();
  createOrder.mockResolvedValue({ success: false, error: "stopped by test" });
});
afterEach(cleanup);

describe("checkout — WhatsApp opt-in", () => {
  it("off / shadow (server says no): never rendered, and the order says whatsappOptIn=false", async () => {
    optIn.mockResolvedValue({ enabled: false });
    render(tree());
    await fillAndSubmit(ALLOWED);
    await waitFor(() => expect(optIn).toHaveBeenCalledWith({ phone: ALLOWED }));
    expect(optInBox()).toBeNull();
    expect((await submit()).whatsappOptIn).toBe(false);
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

  it("live (server says yes): shown under the phone field, NOT pre-ticked; unticked → false", async () => {
    optIn.mockResolvedValue({ enabled: true });
    render(tree());
    await waitFor(() => expect(optInBox()).not.toBeNull());
    expect(optInBox()?.checked).toBe(false);
    expect(screen.getByText(/order confirmation and updates to this number on WhatsApp/i)).toBeTruthy();
    await fillAndSubmit(OTHER);
    expect((await submit()).whatsappOptIn).toBe(false);
  });

  it("live: only an explicit tick sends whatsappOptIn=true", async () => {
    optIn.mockResolvedValue({ enabled: true });
    render(tree());
    await fillAndSubmit(OTHER);
    await waitFor(() => expect(optInBox()).not.toBeNull());
    fireEvent.click(optInBox() as HTMLInputElement);
    expect(optInBox()?.checked).toBe(true);
    expect(await submit()).toMatchObject({ whatsappOptIn: true, customerPhone: OTHER });
  });

  it("pilot: hidden for other numbers, shown (unticked) for an allow-listed one; the allow-list alone never opts in", async () => {
    optIn.mockImplementation(pilotServer);
    render(tree());
    await fillAndSubmit(OTHER);
    await waitFor(() => expect(optIn).toHaveBeenCalledWith({ phone: OTHER }));
    expect(optInBox()).toBeNull();

    type("phoneNumber", ALLOWED);
    await waitFor(() => expect(optInBox()).not.toBeNull());
    expect(optInBox()?.checked).toBe(false);
    // Allow-listed but not ticked → no consent.
    expect((await submit()).whatsappOptIn).toBe(false);
  });

  it("pilot: a tick is dropped the moment the number stops qualifying, and is not restored", async () => {
    optIn.mockImplementation(pilotServer);
    render(tree());
    await fillAndSubmit(ALLOWED);
    await waitFor(() => expect(optInBox()).not.toBeNull());
    fireEvent.click(optInBox() as HTMLInputElement);
    expect(optInBox()?.checked).toBe(true);

    type("phoneNumber", OTHER);
    await waitFor(() => expect(optInBox()).toBeNull());
    type("phoneNumber", ALLOWED);
    await waitFor(() => expect(optInBox()).not.toBeNull());
    expect(optInBox()?.checked).toBe(false);
    expect((await submit()).whatsappOptIn).toBe(false);
  });
});
