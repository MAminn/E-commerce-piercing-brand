// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * The PDP's mobile sticky Add to bag (product-perce / ProductPagePremium)
 * against the fixed mobile bottom nav.
 *
 * The bar used to appear only once the main button had scrolled ABOVE the
 * viewport. On a 650–760px in-app browser the main button sits under the
 * 64px nav: still "intersecting" the viewport, so no bar — and the tap landed
 * on the nav's Wishlist tab. Now the bar shows whenever the main button is
 * not fully usable (below the fold, under the nav, cut off, scrolled away)
 * and hides while it is, and the observer's root excludes the nav.
 */
vi.mock("#root/shared/trpc/client", () => ({
  trpc: {
    settings: { getProductPageContent: { query: async () => ({ success: true, result: {} }) } },
  },
}));
vi.mock("#root/components/ui/cart-toast", () => ({ showCartToast: () => {}, flyToCart: () => {} }));
vi.mock("#root/lib/hooks/useWishlist", () => ({ useWishlist: () => ({ toggle: () => {}, isWishlisted: () => false }) }));

import { ProductPagePremium } from "../ProductPagePremium";
import { MinimalI18nProvider } from "#root/lib/i18n/MinimalI18nContext";
import {
  BOTTOM_NAV_CLEARANCE,
  bottomNavOcclusion,
  isFullyUsable,
} from "#root/components/template-system/minimal/bottom-nav";

/* ── IntersectionObserver double ─────────────────────────────────────── */

type Entry = { isIntersecting: boolean; intersectionRatio: number };
const observers: Array<{ options?: IntersectionObserverInit; fire: (e: Entry) => void; target?: Element }> = [];

class FakeIO {
  private cb: IntersectionObserverCallback;
  private record: (typeof observers)[number];
  constructor(cb: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.cb = cb;
    this.record = { options, fire: (e) => this.cb([e as IntersectionObserverEntry], this as never) };
    observers.push(this.record);
  }
  observe(el: Element) {
    this.record.target = el;
  }
  disconnect() {}
  unobserve() {}
  takeRecords() {
    return [];
  }
}

const NAV_HEIGHT = 64;
function mountBottomNav() {
  const nav = document.createElement("nav");
  nav.setAttribute("data-perce-bottom-nav", "");
  nav.getBoundingClientRect = () =>
    ({ top: window.innerHeight - NAV_HEIGHT, height: NAV_HEIGHT, width: 390, bottom: window.innerHeight }) as DOMRect;
  document.body.appendChild(nav);
  return nav;
}

const product = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "triple-band-star-ear-cuff",
  name: "Triple Band Star Ear Cuff",
  price: 175,
  discountPrice: null,
  stock: 8,
  available: true,
  imageUrl: "/uploads/cuff.webp",
  images: [{ url: "/uploads/cuff.webp", isPrimary: true }],
  description: "A cuff.",
  categoryName: "Fake Piercings",
  specifications: [],
  variants: [],
};

const page = () => (
  <MinimalI18nProvider ssrLocale='en'>
    <ProductPagePremium product={product as never} onAddToCart={() => {}} />
  </MinimalI18nProvider>
);

const sticky = () => screen.getByTestId("sticky-add-to-bag");
const isShown = () => sticky().getAttribute("aria-hidden") === "false" && sticky().className.includes("translate-y-0");
const pdpObserver = () => {
  const o = observers.find((r) => r.target?.getAttribute("data-add-to-cart") === "true");
  if (!o) throw new Error("main Add to bag is not observed");
  return o;
};

beforeEach(() => {
  observers.length = 0;
  vi.stubGlobal("IntersectionObserver", FakeIO);
  Object.defineProperty(window, "innerHeight", { value: 700, configurable: true });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  for (const n of Array.from(document.querySelectorAll("[data-perce-bottom-nav]"))) n.remove();
});

describe("bottom-nav geometry", () => {
  it("measures how much of the viewport the nav covers", () => {
    expect(bottomNavOcclusion()).toBe(0);
    mountBottomNav();
    expect(bottomNavOcclusion()).toBe(NAV_HEIGHT);
  });

  it("a hidden nav (lg:hidden, /checkout) covers nothing", () => {
    const nav = mountBottomNav();
    nav.getBoundingClientRect = () => ({ top: 0, height: 0, width: 0, bottom: 0 }) as DOMRect;
    expect(bottomNavOcclusion()).toBe(0);
  });

  it("fully usable means entirely inside the nav-free viewport", () => {
    expect(isFullyUsable({ isIntersecting: true, intersectionRatio: 1 })).toBe(true);
    expect(isFullyUsable({ isIntersecting: true, intersectionRatio: 0.995 })).toBe(true);
    expect(isFullyUsable({ isIntersecting: true, intersectionRatio: 0.5 })).toBe(false); // half under the nav
    expect(isFullyUsable({ isIntersecting: false, intersectionRatio: 0 })).toBe(false); // below the fold / scrolled past
  });

  it("bars sit on top of the nav, safe area included", () => {
    expect(BOTTOM_NAV_CLEARANCE).toBe("calc(4rem + env(safe-area-inset-bottom))");
  });
});

describe("PDP sticky Add to bag", () => {
  it("never renders visible on the server", () => {
    const html = renderToStaticMarkup(page());
    expect(html).toContain('data-testid="sticky-add-to-bag"');
    expect(html).toContain('aria-hidden="true"');
  });

  it("observes the main button with the nav cut out of the root", () => {
    mountBottomNav();
    render(page());
    expect(pdpObserver().options?.rootMargin).toBe(`0px 0px -${NAV_HEIGHT}px 0px`);
  });

  it("shows on first load when the main button sits under the nav", () => {
    mountBottomNav();
    render(page());
    // Main button straddles the nav line: only part of it is in the nav-free root.
    act(() => pdpObserver().fire({ isIntersecting: true, intersectionRatio: 0.4 }));
    expect(isShown()).toBe(true);
  });

  it("shows while the main button is below the fold (not reached yet)", () => {
    mountBottomNav();
    render(page());
    act(() => pdpObserver().fire({ isIntersecting: false, intersectionRatio: 0 }));
    expect(isShown()).toBe(true);
  });

  it("hides while the main button is fully usable — never two usable buttons", () => {
    mountBottomNav();
    render(page());
    act(() => pdpObserver().fire({ isIntersecting: false, intersectionRatio: 0 }));
    expect(isShown()).toBe(true);
    act(() => pdpObserver().fire({ isIntersecting: true, intersectionRatio: 1 }));
    expect(isShown()).toBe(false);
    expect(sticky().className).toContain("pointer-events-none");
  });

  it("shows again once the main button is scrolled away above", () => {
    mountBottomNav();
    render(page());
    act(() => pdpObserver().fire({ isIntersecting: true, intersectionRatio: 1 }));
    act(() => pdpObserver().fire({ isIntersecting: false, intersectionRatio: 0 }));
    expect(isShown()).toBe(true);
  });

  it("rests on top of the nav", () => {
    render(page());
    expect(sticky().getAttribute("style")).toContain("calc(4rem + env(safe-area-inset-bottom))");
  });
});
