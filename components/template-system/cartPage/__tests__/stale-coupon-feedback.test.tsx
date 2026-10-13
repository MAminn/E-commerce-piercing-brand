// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createElement, useState, type ComponentType } from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// The offer banner fetches active offers once effects run; none here.
vi.mock("#root/shared/trpc/client", () => ({
  trpc: { offer: { listActive: { query: async () => ({ success: true, result: [] }) } } },
}));
vi.mock("vike-react/usePageContext", () => ({
  usePageContext: () => ({ urlPathname: "/cart" }),
}));

import { CartPageModernTemplate } from "../CartPageModernTemplate";
import { CartPageMinimalTemplate } from "../CartPageMinimalTemplate";
import { CheckoutPageModernTemplate } from "#root/components/template-system/checkoutPage/CheckoutPageModernTemplate";
import { visibleCouponFeedback } from "#root/components/template-system/useCouponFeedback";

/**
 * Acceptance flow for a quantity-based code (PICK6):
 *   apply → success message + discount → the cart changes so the code no
 *   longer qualifies → CartContext drops the code and publishes a notice →
 *   the discount AND the success message disappear, the reason is shown →
 *   restoring the cart does not silently re-apply the code.
 *
 * The harness plays CartContext: it owns `appliedCoupon`, `couponNotice` and
 * the discount, exactly the props the real pages pass.
 */
const SUCCESS = '"PICK6" applied — 15% off + free shipping.';
const REASON =
  'Your promo code "PICK6" was removed: PICK6 needs exactly 6 eligible pieces. Your cart has 5 eligible pieces.';

let controls: { invalidate: () => void; restoreCart: () => void } = { invalidate: () => {}, restoreCart: () => {} };

function Harness({ Template }: { Template: ComponentType<Record<string, unknown>> }) {
  const [applied, setApplied] = useState<{ code: string; discountLabel: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [units, setUnits] = useState(6);
  controls = {
    invalidate: () => {
      setUnits(5);
      setApplied(null);
      setNotice(REASON);
    },
    restoreCart: () => setUnits(6),
  };
  const discount = applied ? 161.25 : undefined;
  return createElement(Template, {
    items: [{ id: "e", name: "Earring", price: 1075 / 6, quantity: units, available: true }],
    totals: { subtotal: 1075, discount, grandTotal: 1075 - (discount ?? 0), shippingStatus: "pending" },
    currency: "EGP",
    onApplyCoupon: async (code: string) => {
      setApplied({ code, discountLabel: "15% off + free shipping" });
      setNotice(null);
      return { success: true, message: SUCCESS };
    },
    appliedCoupon: applied,
    onRemoveCoupon: () => setApplied(null),
    couponNotice: notice,
    onDismissCouponNotice: () => setNotice(null),
  });
}

const templates: [string, ComponentType<Record<string, unknown>>][] = [
  ["Modern cart", CartPageModernTemplate as never],
  ["Minimal (Percé) cart", CartPageMinimalTemplate as never],
  ["Modern checkout", CheckoutPageModernTemplate as never],
];

describe.each(templates)("%s — promo message follows the code", (_name, Template) => {
  it("drops the success message when the code is invalidated, shows the reason, never re-applies", async () => {
    const user = userEvent.setup();
    render(createElement(Harness, { Template }));

    const [input] = screen.getAllByPlaceholderText(/code/i);
    const [apply] = screen.getAllByRole("button", { name: /apply/i });
    if (!input || !apply) throw new Error("coupon controls not rendered");
    await user.type(input, "PICK6");
    await user.click(apply);

    expect(screen.getAllByText(SUCCESS).length).toBeGreaterThan(0);

    act(() => controls.invalidate());

    expect(screen.queryByText(SUCCESS)).toBeNull();
    expect(screen.getAllByText(REASON).length).toBeGreaterThan(0);
    // No applied-code chip (and its saving) remains.
    expect(screen.queryByText(/saving/i)).toBeNull();

    act(() => controls.restoreCart());
    expect(screen.queryByText(SUCCESS)).toBeNull();
  });
});

describe("visibleCouponFeedback", () => {
  const success = { success: true, message: "applied" };
  const failure = { success: false, message: "nope" };
  it("hides a success line once no code is applied or a removal notice is up", () => {
    expect(visibleCouponFeedback(success, "PICK6", null)).toBe(success);
    expect(visibleCouponFeedback(success, null, null)).toBeNull();
    expect(visibleCouponFeedback(success, "PICK6", "removed")).toBeNull();
  });
  it("keeps an error for a code that was never applied", () => {
    expect(visibleCouponFeedback(failure, null, null)).toBe(failure);
  });
});
