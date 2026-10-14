// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { TrackingEventName } from "#root/shared/types/pixel-tracking";

/**
 * The real /order-confirmation page and its Purchase event: it fires exactly
 * once, only after payment.verify returned the persisted order as placed, with
 * the order's stored total — and never for a missing, failed or pending order.
 */
const verify = vi.fn();
const trackEvent = vi.fn();

vi.mock("#root/shared/trpc/client", () => ({
  trpc: { payment: { verify: { query: (input: unknown) => verify(input) } } },
}));
vi.mock("#root/frontend/contexts/TrackingContext", () => ({ useTracking: () => ({ trackEvent }) }));
vi.mock("#root/lib/context/CartContext", () => ({ useCart: () => ({ clearCart: () => {} }) }));
vi.mock("vike-react/usePageContext", () => ({ usePageContext: () => ({ urlPathname: "/order-confirmation" }) }));

import OrderConfirmationPage from "../+Page";

const ORDER = "0f1e2d3c-4b5a-4968-8778-6a5b4c3d2e1f";

const visit = (query: string) => {
  window.history.replaceState(null, "", `/order-confirmation?${query}`);
  return render(<OrderConfirmationPage />);
};
const purchases = () => trackEvent.mock.calls.filter(([name]) => name === TrackingEventName.CHECKOUT_COMPLETED);
const verified = (paymentStatus: string, total = "983.75") => ({
  success: true,
  result: { id: ORDER, paymentStatus, total, status: "pending", paymentMethod: "cod" },
});
/** Let the verify promise and the effects it triggers settle. */
const settle = () => new Promise((r) => setTimeout(r, 20));

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  verify.mockReset();
  trackEvent.mockReset();
});
afterEach(cleanup);

describe("/order-confirmation Purchase", () => {
  it("a verified COD order emits exactly one Purchase with the PERSISTED total, not the URL's", async () => {
    verify.mockResolvedValue(verified("not_required", "983.75"));
    // Checkout stashes the persisted lines (order.create response) per order.
    sessionStorage.setItem(
      `checkout_items:${ORDER}`,
      JSON.stringify([{ itemId: "p1", itemName: "Stud", quantity: 6, price: 150 }]),
    );
    const view = visit(`id=${ORDER}&total=1.00&email=a%40b.c`);
    await waitFor(() => expect(purchases()).toHaveLength(1));

    const [, data] = purchases()[0]!;
    expect(data).toEqual({
      eventId: `purchase-${ORDER}`,
      ecommerce: {
        currency: "EGP",
        value: 983.75,
        transactionId: ORDER,
        items: [{ itemId: "p1", itemName: "Stud", quantity: 6, price: 150 }],
      },
    });

    // Re-render and the 4s verify poll: still one.
    view.rerender(<OrderConfirmationPage />);
    await settle();
    expect(purchases()).toHaveLength(1);
  });

  it("refreshing the confirmation page does not emit a second Purchase", async () => {
    verify.mockResolvedValue(verified("not_required"));
    visit(`id=${ORDER}`);
    await waitFor(() => expect(purchases()).toHaveLength(1));
    cleanup();

    // A reload is a fresh mount with the browser's storage intact.
    visit(`id=${ORDER}`);
    await settle();
    expect(verify).toHaveBeenCalledTimes(2);
    expect(purchases()).toHaveLength(1);
  });

  it("a paid online order fires once; a pending one waits and fires once when it is paid", async () => {
    verify.mockResolvedValueOnce(verified("pending")).mockResolvedValue(verified("paid"));
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      visit(`id=${ORDER}&payment=success`);
      await vi.advanceTimersByTimeAsync(50);
      expect(purchases()).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(4100); // next poll → paid
      await waitFor(() => expect(purchases()).toHaveLength(1));
      await vi.advanceTimersByTimeAsync(8200);
      expect(purchases()).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    ["the order does not exist", { success: false, error: "Order not found" }],
    ["the payment failed", verified("failed")],
    ["the payment is still pending", verified("pending")],
  ])("emits nothing when %s", async (_label, response) => {
    verify.mockResolvedValue(response);
    visit(`id=${ORDER}&total=983.75`);
    await settle();
    expect(verify).toHaveBeenCalled();
    expect(purchases()).toHaveLength(0);
  });

  it("emits nothing when verification itself fails", async () => {
    verify.mockRejectedValue(new Error("network"));
    visit(`id=${ORDER}&total=983.75`);
    await settle();
    expect(purchases()).toHaveLength(0);
  });

  it("a bare visit or a forged id never asks the server and never emits", async () => {
    visit("total=983.75");
    visit("id=not-an-order&total=983.75");
    await settle();
    expect(verify).not.toHaveBeenCalled();
    expect(purchases()).toHaveLength(0);
  });
});
