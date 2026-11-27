// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
/**
 * Quick view follows the shared sale rule: paid price, struck regular price
 * and percent off — and the line it adds (and the add-to-bag toast) carries
 * the regular price so the bag can strike it too.
 */
const addItem = vi.fn(() => true);
const showCartToast = vi.fn();
vi.mock("#root/lib/context/CartContext", () => ({ useCart: () => ({ addItem }) }));
vi.mock("#root/frontend/contexts/TrackingContext", () => ({ useTracking: () => ({ trackEvent: vi.fn() }) }));
vi.mock("#root/lib/hooks/useWishlist", () => ({ useWishlist: () => ({ toggle: vi.fn(), isWishlisted: () => false }) }));
vi.mock("#root/components/ui/cart-toast", () => ({ showCartToast: (item: unknown) => showCartToast(item) }));
import { QuickViewDialog } from "../QuickViewDialog";
import { MinimalI18nProvider } from "#root/lib/i18n/MinimalI18nContext";

const product = {
  id: "q1",
  name: "Crystal Eye Clip",
  price: 120,
  discountPrice: 96,
  stock: 5,
  available: true,
  imageUrl: "/uploads/eye.webp",
};
const open = (p: Record<string, unknown>) =>
  render(
    <MinimalI18nProvider>
      <QuickViewDialog product={p as never} open onClose={() => {}} />
    </MinimalI18nProvider>,
  );

afterEach(() => {
  cleanup();
  addItem.mockClear();
  showCartToast.mockClear();
});

describe("quick view sale price", () => {
  it("shows the paid price, the struck regular price and the percent off", () => {
    const view = open(product);
    expect(view.container.querySelector("[data-price-paid]")?.textContent).toMatch(/EGP\s96/);
    expect(view.container.querySelector("s[data-price-compare]")?.textContent).toMatch(/EGP\s120/);
    expect(view.container.querySelector("[data-price-badge]")?.textContent).toBe("−20%");
  });

  it("adds the line at the paid price with the regular price kept for the bag", () => {
    const view = open(product);
    const add = [...view.container.querySelectorAll("button")].find((b) => /add to bag/i.test(b.textContent ?? ""));
    if (!add) throw new Error("no add-to-bag button");
    fireEvent.click(add);
    expect(addItem).toHaveBeenCalledWith(expect.objectContaining({ price: 96, originalPrice: 120 }), 1, {});
    expect(showCartToast).toHaveBeenCalledWith(expect.objectContaining({ price: 96, originalPrice: 120 }));
  });

  it("no valid discount: one price, no strike, no badge, no regular price on the line", () => {
    const view = open({ ...product, discountPrice: null });
    expect(view.container.innerHTML).not.toMatch(/<s[ >]|data-price-badge/);
    const add = [...view.container.querySelectorAll("button")].find((b) => /add to bag/i.test(b.textContent ?? ""));
    if (!add) throw new Error("no add-to-bag button");
    fireEvent.click(add);
    expect(addItem).toHaveBeenCalledWith(expect.objectContaining({ price: 120, originalPrice: undefined }), 1, {});
  });
});
