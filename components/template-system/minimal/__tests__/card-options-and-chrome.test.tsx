// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

/**
 * Final calls before push:
 *   • the card's "+" adds directly only when there is nothing to choose; a
 *     product with options goes to its page — no cart call, no AddToCart;
 *   • the header always shows the lowercase "percé" wordmark, whatever logo
 *     image the CMS holds;
 *   • the desktop sticky bag bar reserves its height while it is visible.
 */
const addItem = vi.fn(() => true);
const trackEvent = vi.fn();
let cartState = { addItem, totalItems: 0, total: 0, appliedOffers: [], subtotal: 0, discount: 0 };
vi.mock("#root/lib/context/CartContext", () => ({ useCart: () => cartState }));
vi.mock("#root/frontend/contexts/TrackingContext", () => ({ useTracking: () => ({ trackEvent }) }));
vi.mock("#root/components/ui/cart-toast", () => ({ showCartToast: () => {}, flyToCart: () => {} }));
vi.mock("#root/lib/hooks/useWishlist", () => ({ useWishlist: () => ({ toggle: () => {}, isWishlisted: () => false }) }));
vi.mock("vike-react/usePageContext", () => ({ usePageContext: () => ({ urlPathname: "/shop", urlParsed: { search: {} } }) }));
vi.mock("vike/client/router", () => ({ navigate: () => {} }));
vi.mock("#root/shared/trpc/client", () => ({
  trpc: {
    category: { view: { query: async () => ({ success: false }) } },
    bundle: { listLive: { query: async () => ({ success: true, result: [] }) } },
    offer: { listActive: { query: async () => ({ success: true, result: [] }) } },
  },
}));

import { MinimalProductCard } from "../MinimalProductCard";
import { MinimalNavbar } from "../MinimalNavbar";
import { StickyCartBar } from "#root/components/ui/StickyCartBar";
import { LayoutSettingsContext } from "#root/frontend/contexts/LayoutSettingsContext";
import { DEFAULT_LAYOUT_SETTINGS } from "#root/shared/types/layout-settings";

const product = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "seamless-ring-8mm",
  name: "Seamless ring 8mm",
  price: 140,
  discountPrice: 110,
  stock: 9,
  available: true,
};

beforeEach(() => {
  addItem.mockClear();
  trackEvent.mockClear();
  cartState = { addItem, totalItems: 0, total: 0, appliedOffers: [], subtotal: 0, discount: 0 };
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  document.documentElement.style.removeProperty("--perce-sticky-bar-h");
});

describe("product card +", () => {
  it("no options: adds to the bag and tracks one AddToCart", () => {
    render(<MinimalProductCard product={{ ...product, requiresOptions: false }} />);
    fireEvent.click(screen.getByRole("button", { name: `Add to bag: ${product.name}` }));
    expect(addItem).toHaveBeenCalledTimes(1);
    expect(addItem).toHaveBeenCalledWith(expect.objectContaining({ id: product.id, price: 110 }), 1, {});
    expect(trackEvent).toHaveBeenCalledTimes(1);
  });

  it("options to choose: a link to the product page — nothing added, nothing tracked", () => {
    render(<MinimalProductCard product={{ ...product, requiresOptions: true }} />);
    expect(screen.queryByRole("button", { name: /^Add to bag/ })).toBeNull();
    const link = screen.getByRole("link", { name: `Choose options: ${product.name}` });
    expect(link.getAttribute("href")).toBe("/shop/seamless-ring-8mm");
    expect(link.hasAttribute("data-add-to-cart")).toBe(false);
    fireEvent.click(link);
    expect(addItem).not.toHaveBeenCalled();
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it("prices print whole pounds without decimals", () => {
    render(<MinimalProductCard product={product} />);
    expect(document.body.textContent).toMatch(/EGP\s110(?![.\d])/);
    expect(document.body.textContent).not.toMatch(/\.00/);
  });
});

describe("product card wishlist", () => {
  it("sits on a stone square like the +, so it stays legible on any photo", () => {
    render(<MinimalProductCard product={{ ...product, requiresOptions: false }} />);
    const heart = screen.getByRole("button", { name: `Wishlist: ${product.name}` });
    expect(heart.className).toContain("bg-surface");
  });

  it("the first scan is the name and one price: no catalogue number or measure line", () => {
    const { container } = render(<MinimalProductCard product={{ ...product, catalogueNo: 14, requiresOptions: false }} />);
    const text = container.textContent ?? "";
    expect(text).toContain("Seamless ring 8mm");
    expect(text).not.toContain("014");
    expect(text).not.toContain("8 mm");
    expect(container.querySelector("[data-index-line]")).toBeNull();
    expect(container.querySelector("a[href='/shop/seamless-ring-8mm'] img")).toBeTruthy();
  });
});

describe("header wordmark", () => {
  it("renders the lowercase percé wordmark even when the CMS holds a logo image", () => {
    const settings = {
      ...DEFAULT_LAYOUT_SETTINGS,
      header: { ...DEFAULT_LAYOUT_SETTINGS.header, logoUrl: "/uploads/layout/light-logo.png", logoText: "Something" },
    };
    render(
      <LayoutSettingsContext.Provider value={settings}>
        <MinimalNavbar />
      </LayoutSettingsContext.Provider>,
    );
    const mark = screen.getByTestId("header-wordmark");
    expect(mark.textContent).toBe("percé");
    expect(mark.getAttribute("href")).toBe("/");
    expect(mark.className).toContain("text-ink");
    expect(document.querySelector('img[src="/uploads/layout/light-logo.png"]')).toBeNull();
  });
});

describe("desktop sticky bag bar", () => {
  it("reserves its height while visible and releases it when it goes", async () => {
    vi.useFakeTimers();
    cartState = { ...cartState, totalItems: 2, total: 200, subtotal: 200 };
    const view = render(<StickyCartBar desktopOnly />);
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(document.documentElement.style.getPropertyValue("--perce-sticky-bar-h")).toMatch(/^\d+px$/);
    view.unmount();
    expect(document.documentElement.style.getPropertyValue("--perce-sticky-bar-h")).toBe("");
  });
});
