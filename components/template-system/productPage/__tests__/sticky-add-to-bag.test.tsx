// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * The PDP's mobile sticky Add to bag (product-perce / ProductPagePremium).
 *
 * PR #1: the bar shows whenever the main button is not fully usable (below
 * the fold, cut off, scrolled away) and hides while it is — never two usable
 * Add to bag buttons at once.
 *
 * Object Index: the fixed mobile bottom nav is gone (its destinations moved
 * to the header and menu), so the bar now sits on the viewport's bottom edge
 * with its content padded above the home indicator, and the observer watches
 * the whole viewport.
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
  STICKY_BAR_BOTTOM,
  STICKY_BAR_PADDING_BOTTOM,
  isFullyUsable,
} from "#root/components/template-system/minimal/sticky-bar";

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
});

describe("sticky bar geometry", () => {
  it("there is no bottom nav to rest on", () => {
    render(page());
    expect(document.querySelector("[data-perce-bottom-nav]")).toBeNull();
  });

  it("fully usable means entirely inside the viewport", () => {
    expect(isFullyUsable({ isIntersecting: true, intersectionRatio: 1 })).toBe(true);
    expect(isFullyUsable({ isIntersecting: true, intersectionRatio: 0.995 })).toBe(true);
    expect(isFullyUsable({ isIntersecting: true, intersectionRatio: 0.5 })).toBe(false); // cut off by the fold
    expect(isFullyUsable({ isIntersecting: false, intersectionRatio: 0 })).toBe(false); // below the fold / scrolled past
  });

  it("bars sit on the viewport edge and pad above the home indicator", () => {
    expect(STICKY_BAR_BOTTOM).toBe("0px");
    expect(STICKY_BAR_PADDING_BOTTOM).toContain("env(safe-area-inset-bottom)");
  });
});

describe("PDP sticky Add to bag", () => {
  it("never renders visible on the server", () => {
    const html = renderToStaticMarkup(page());
    expect(html).toContain('data-testid="sticky-add-to-bag"');
    expect(html).toContain('aria-hidden="true"');
  });

  it("observes the main button against the whole viewport", () => {
    render(page());
    expect(pdpObserver().options?.rootMargin).toBeUndefined();
  });

  it("shows on first load when the main button is only partly on screen", () => {
    render(page());
    act(() => pdpObserver().fire({ isIntersecting: true, intersectionRatio: 0.4 }));
    expect(isShown()).toBe(true);
  });

  it("shows while the main button is below the fold (not reached yet)", () => {
    render(page());
    act(() => pdpObserver().fire({ isIntersecting: false, intersectionRatio: 0 }));
    expect(isShown()).toBe(true);
  });

  it("hides while the main button is fully usable — never two usable buttons", () => {
    render(page());
    act(() => pdpObserver().fire({ isIntersecting: false, intersectionRatio: 0 }));
    expect(isShown()).toBe(true);
    act(() => pdpObserver().fire({ isIntersecting: true, intersectionRatio: 1 }));
    expect(isShown()).toBe(false);
    expect(sticky().className).toContain("pointer-events-none");
  });

  it("shows again once the main button is scrolled away above", () => {
    render(page());
    act(() => pdpObserver().fire({ isIntersecting: true, intersectionRatio: 1 }));
    act(() => pdpObserver().fire({ isIntersecting: false, intersectionRatio: 0 }));
    expect(isShown()).toBe(true);
  });

  it("rests on the viewport edge with the safe area as padding", () => {
    render(page());
    const style = sticky().getAttribute("style") ?? "";
    expect(style).toContain("bottom: 0px");
    expect(style).toContain("safe-area-inset-bottom");
  });
});
