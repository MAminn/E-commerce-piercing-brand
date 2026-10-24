// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * EntryPopup repairs for the pre-2 Nov batch. The offer itself — fields,
 * discount, timing, reshow and claim rules — is NOT under test here and must
 * not change; only:
 *
 *   • it never opens on /cart or /checkout (a trigger there waits for an
 *     ordinary page);
 *   • on touch devices the email field is not auto-focused, so the keyboard
 *     does not cover the popup on open; mouse devices keep the old focus;
 *   • the claimed code has an explicit Copy action with feedback, and is not
 *     applied to the cart.
 */
let pathname = "/shop";
vi.mock("vike-react/usePageContext", () => ({ usePageContext: () => ({ urlPathname: pathname }) }));

const claim = vi.fn();
const CONFIG = {
  enabled: true,
  imageUrl: "",
  titleEn: "A little gift for you. 5% OFF.",
  titleAr: "هدية ليك",
  descriptionEn: "Enter your email & phone number to get 5% off your first order.",
  descriptionAr: "",
  submitLabelEn: "Get my 5% off",
  submitLabelAr: "",
  successMessageEn: "Your gift is ready! Use code {{code}} for 5% off your first order.",
  successMessageAr: "",
  dismissLabelEn: "Maybe later",
  dismissLabelAr: "",
  dismissHref: "",
  collectPhone: true,
  phoneRequired: true,
  triggerDelaySeconds: 15,
  triggerScrollPercent: 0,
  triggerExitIntent: false,
  reshowAfterDays: 7,
};
vi.mock("#root/shared/trpc/client", () => ({
  trpc: {
    popup: {
      getPublicConfig: { query: async () => ({ success: true, result: CONFIG }) },
      claim: { mutate: (input: unknown) => claim(input) },
    },
  },
}));
vi.mock("#root/lib/cart-session", () => ({ getCartSessionToken: () => "session-token-1" }));

import { EntryPopup, isPopupSuppressedPath } from "../EntryPopup";
import { MinimalI18nProvider } from "#root/lib/i18n/MinimalI18nContext";

const setPointer = (coarse: boolean) => {
  window.matchMedia = ((query: string) => ({
    matches: query === "(pointer: coarse)" ? coarse : false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
};

const renderPopup = () =>
  render(
    <MinimalI18nProvider ssrLocale='en'>
      <EntryPopup />
    </MinimalI18nProvider>,
  );

/** Lets the config fetch resolve, then fires the 15s timer. */
async function elapseTrigger() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  await act(async () => {
    vi.advanceTimersByTime(15_000);
  });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  localStorage.clear();
  pathname = "/shop";
  setPointer(false);
  claim.mockReset();
  claim.mockResolvedValue({ success: true, result: { code: "PERCE-5OFF-7Q2" } });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("isPopupSuppressedPath", () => {
  it("suppresses the cart and checkout, including sub-paths and trailing slashes", () => {
    for (const p of ["/cart", "/cart/", "/checkout", "/checkout/", "/checkout/payment"]) {
      expect(isPopupSuppressedPath(p), p).toBe(true);
    }
  });
  it("leaves every other page alone", () => {
    for (const p of ["/", "/shop", "/shop/star-stud", "/categories/ear-piercings", "/offers", "/cartier", "/checkouts"]) {
      expect(isPopupSuppressedPath(p), p).toBe(false);
    }
  });
});

describe("route suppression", () => {
  it.each(["/cart", "/checkout"])("does not open on %s", async (path) => {
    pathname = path;
    renderPopup();
    await elapseTrigger();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens on an ordinary page after the configured delay", async () => {
    renderPopup();
    await elapseTrigger();
    expect(await screen.findByRole("dialog")).toBeTruthy();
  });

  it("a trigger that fired on the cart opens once the shopper is on an ordinary page", async () => {
    pathname = "/cart";
    const view = renderPopup();
    await elapseTrigger();
    expect(screen.queryByRole("dialog")).toBeNull();
    pathname = "/shop";
    view.rerender(
      <MinimalI18nProvider ssrLocale='en'>
        <EntryPopup />
      </MinimalI18nProvider>,
    );
    expect(await screen.findByRole("dialog")).toBeTruthy();
  });
});

describe("autofocus", () => {
  it("touch devices: the email field is not focused on open (no keyboard)", async () => {
    setPointer(true);
    renderPopup();
    await elapseTrigger();
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    expect(document.activeElement).not.toBe(screen.getByPlaceholderText("Email address"));
    expect(document.activeElement?.tagName).not.toBe("INPUT");
  });

  it("touch devices: focus lands on the dialog itself", async () => {
    setPointer(true);
    renderPopup();
    await elapseTrigger();
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(document.activeElement).toBe(dialog));
  });

  it("mouse/keyboard devices keep Radix's own autofocus (first tabbable control)", async () => {
    // In a browser that is the email field: the CSS `[&>button]:hidden` hides
    // the close buttons before it. jsdom applies no CSS, so here the first
    // tabbable is the close button — what matters is that focus moved to a
    // control, not to the dialog container as on touch devices.
    setPointer(false);
    renderPopup();
    await elapseTrigger();
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    expect(document.activeElement).not.toBe(dialog);
  });
});

describe("claimed code", () => {
  async function claimCode() {
    renderPopup();
    await elapseTrigger();
    await screen.findByRole("dialog");
    fireEvent.change(screen.getByPlaceholderText("Email address"), { target: { value: "a@example.com" } });
    fireEvent.change(screen.getByPlaceholderText("Phone number"), { target: { value: "01012345678" } });
    fireEvent.click(screen.getByRole("button", { name: "Get my 5% off" }));
    await screen.findByTestId("popup-claimed-code");
  }

  it("claims exactly as before (same payload) and shows the code", async () => {
    await claimCode();
    expect(claim).toHaveBeenCalledWith({
      email: "a@example.com",
      phone: "01012345678",
      cartSessionToken: "session-token-1",
    });
    expect(screen.getByTestId("popup-claimed-code").textContent).toBe("PERCE-5OFF-7Q2");
    expect(localStorage.getItem("promoCode")).toBeNull(); // not applied to the cart
  });

  it("Copy puts the code on the clipboard and says so", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    await claimCode();
    fireEvent.click(screen.getByRole("button", { name: "Copy code" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy());
    expect(writeText).toHaveBeenCalledWith("PERCE-5OFF-7Q2");
  });

  it("falls back, then tells the shopper to long-press when copying is impossible", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockRejectedValue(new Error("blocked")) },
      configurable: true,
    });
    const execCommand = vi.fn(() => false);
    Object.defineProperty(document, "execCommand", { value: execCommand, configurable: true });
    await claimCode();
    fireEvent.click(screen.getByRole("button", { name: "Copy code" }));
    await waitFor(() => expect(screen.getByText(/Press and hold the code to copy it/)).toBeTruthy());
    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(screen.getByTestId("popup-claimed-code").className).toContain("select-all");
  });
});
