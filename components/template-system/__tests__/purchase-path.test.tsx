// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * Object Index purchase path: the price rule (one number, no strikethrough,
 * no Sale / New), the product page's purchase block, the bag (title, range
 * shipping row, collapsed promo, empty state, sticky bar) and checkout
 * (optional email, the mobile summary bar).
 */
vi.mock("#root/shared/trpc/client", () => ({
  trpc: {
    offer: { listActive: { query: async () => ({ success: true, result: [] }) } },
    settings: { getProductPageContent: { query: async () => ({ success: true, result: {} }) } },
  },
}));
vi.mock("vike-react/usePageContext", () => ({ usePageContext: () => ({ urlPathname: "/" }) }));
vi.mock("#root/components/ui/cart-toast", () => ({ showCartToast: () => {}, flyToCart: () => {} }));
vi.mock("#root/lib/hooks/useWishlist", () => ({ useWishlist: () => ({ toggle: () => {}, isWishlisted: () => false }) }));
vi.mock("#root/lib/context/CartContext", () => ({ useCart: () => ({ addItem: () => true }) }));
vi.mock("#root/frontend/contexts/TrackingContext", () => ({ useTracking: () => ({ trackEvent: () => {} }) }));

import { Price } from "#root/components/storefront/Price";
import { MinimalProductCard } from "../minimal/MinimalProductCard";
import { ProductPagePremium } from "../productPage/ProductPagePremium";
import { CartPageModernTemplate } from "../cartPage/CartPageModernTemplate";
import { CheckoutPageModernTemplate } from "../checkoutPage/CheckoutPageModernTemplate";

/* ── IntersectionObserver double: the test decides what is on screen ── */

let fireIO: (entry: { isIntersecting: boolean; intersectionRatio: number }) => void = () => {};
class FakeIO {
  constructor(private cb: IntersectionObserverCallback) {
    fireIO = (e) => this.cb([e as IntersectionObserverEntry], this as never);
  }
  observe() {}
  disconnect() {}
  unobserve() {}
  takeRecords() {
    return [];
  }
}

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", FakeIO);
  // jsdom has no scrollIntoView; checkout validation scrolls to the first error.
  Element.prototype.scrollIntoView = () => {};
});

/** Money renders with a no-break space ("EGP\u00a0180"); compare as plain text. */
const plain = (s: string | null | undefined) => (s ?? "").replace(/\u00a0/g, " ");
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const discounted = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "star-helix-stud",
  name: "Star Helix Stud",
  price: 240,
  discountPrice: 180,
  stock: 5,
  available: true,
  isNew: true,
  imageUrl: "/uploads/stud.webp",
};

describe("price rule", () => {
  it("Price renders one number — the price paid", () => {
    const html = plain(renderToStaticMarkup(createElement(Price, { amount: 180 })));
    expect(html).toContain("EGP 180");
    expect(html).not.toMatch(/<s[ >]|line-through/);
  });

  it("a discounted card shows only what you pay: no strikethrough, no Sale / New", () => {
    const html = plain(renderToStaticMarkup(createElement(MinimalProductCard, { product: discounted })));
    expect(html).toContain("EGP 180");
    expect(html).not.toContain("EGP 240");
    expect(html).not.toMatch(/<s[ >]|line-through/);
    expect(html).not.toMatch(/>\s*(Sale|New)\s*</i);
  });

  it("the PDP price and its related rail follow the same rule", () => {
    const html = renderToStaticMarkup(
      createElement(ProductPagePremium, {
        product: { ...discounted, images: [{ url: "/uploads/stud.webp", isPrimary: true }] },
        relatedProducts: [{ ...discounted, id: "22222222-2222-4222-8222-222222222222", name: "Related Hoop" }],
      } as never),
    );
    expect(html).toContain("Related Hoop");
    expect(html).not.toContain("EGP 240");
    expect(html).not.toMatch(/<s[ >]|line-through/);
  });
});

describe("product page purchase block", () => {
  const html = () =>
    renderToStaticMarkup(
      createElement(ProductPagePremium, {
        product: { ...discounted, categoryName: "Ear", images: [{ url: "/uploads/stud.webp" }] },
      } as never),
    );

  it("states the delivery fee range and names the care row 'Care'", () => {
    expect(html()).toContain("Cash on delivery");
    expect(html()).toContain("Delivery EGP 70–150 by governorate");
    expect(html()).toMatch(/>Care<svg/);
    expect(html()).not.toContain("Care Guide");
  });

  it("has no Category row and no visible Quantity label; the stepper still names itself", () => {
    expect(html()).not.toMatch(/<dt[^>]*>Category</);
    expect(html()).not.toMatch(/<p[^>]*>Quantity</);
    expect(html()).toContain('role="group" aria-label="Quantity"');
  });

  it("puts the stepper and Add to bag in one row below 768px", () => {
    render(createElement(ProductPagePremium, { product: discounted } as never));
    const stepper = screen.getByRole("group", { name: "Quantity" });
    const row = stepper.parentElement as HTMLElement;
    expect(row.className).toMatch(/\bflex\b/);
    expect(row.className).toMatch(/md:flex-col/);
    expect(row.className).not.toMatch(/(^| )flex-col/);
    expect(within(row).getByRole("button", { name: "Add to bag" })).toBeTruthy();
  });
});

const bagItems = [{ id: "a", href: "/shop/star-helix-stud", name: "Star Helix Stud", price: 180, quantity: 1, available: true }];
const bagTotals = { subtotal: 180, grandTotal: 180, shippingStatus: "pending" as const };

describe("bag (cart-modern)", () => {
  it("is titled Bag and always shows the shipping range", () => {
    render(createElement(CartPageModernTemplate, { items: bagItems, totals: bagTotals }));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/^Bag/);
    expect(screen.getByTestId("shipping-line").textContent).toContain("EGP 70–150, set at checkout");
  });

  it("keeps the promo field behind 'Have a code?' until asked, then focuses it", () => {
    render(createElement(CartPageModernTemplate, { items: bagItems, totals: bagTotals, onApplyCoupon: async () => ({ success: true, message: "ok" }) }));
    expect(screen.queryByPlaceholderText(/code/i)).toBeNull();
    const toggle = screen.getByRole("button", { name: "Have a code?" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    const input = screen.getByPlaceholderText(/code/i);
    expect(document.activeElement).toBe(input);
  });

  it("shows an applied code even while the field is collapsed", () => {
    render(
      createElement(CartPageModernTemplate, {
        items: bagItems,
        totals: { ...bagTotals, discount: 18, grandTotal: 162 },
        appliedCoupon: { code: "PICK6", discountLabel: "10% off" },
        onRemoveCoupon: () => {},
      }),
    );
    expect(screen.getByRole("button", { name: "Have a code?" })).toBeTruthy();
    expect(screen.getByText("PICK6")).toBeTruthy();
  });

  it("empty: 'Your bag is empty.' and a Shop all text link", () => {
    render(createElement(CartPageModernTemplate, { items: [], totals: { subtotal: 0, grandTotal: 0 } }));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Your bag is empty.");
    const link = screen.getByRole("link", { name: "Shop all" });
    expect(link.getAttribute("href")).toBe("/shop");
    expect(screen.queryByTestId("cart-sticky-checkout")).toBeNull();
  });

  it("the sticky bar appears only while the summary checkout button is off screen", () => {
    render(createElement(CartPageModernTemplate, { items: bagItems, totals: bagTotals }));
    const bar = screen.getByTestId("cart-sticky-checkout");
    // Before any observation: hidden (never two checkout buttons on first paint).
    expect(bar.getAttribute("aria-hidden")).toBe("true");
    act(() => fireIO({ isIntersecting: false, intersectionRatio: 0 }));
    expect(bar.getAttribute("aria-hidden")).toBe("false");
    act(() => fireIO({ isIntersecting: true, intersectionRatio: 0.5 }));
    expect(bar.getAttribute("aria-hidden")).toBe("false");
    act(() => fireIO({ isIntersecting: true, intersectionRatio: 1 }));
    expect(bar.getAttribute("aria-hidden")).toBe("true");
    expect(bar.className).toContain("pointer-events-none");
  });

  it("the sticky bar's side padding is the page gutter", () => {
    render(createElement(CartPageModernTemplate, { items: bagItems, totals: bagTotals }));
    const bar = screen.getByTestId("cart-sticky-checkout");
    expect(bar.className).toContain("px-[var(--perce-gutter)]");
    expect(bar.className).not.toMatch(/(^| )px-4( |$)/);
  });

  it("there is one checkout button in the summary at every width", () => {
    render(createElement(CartPageModernTemplate, { items: bagItems, totals: bagTotals }));
    expect(screen.getByTestId("cart-summary-checkout").className).not.toMatch(/(^| )hidden( |$)/);
  });
});

describe("checkout", () => {
  const checkout = (over: Record<string, unknown> = {}) => {
    const onSubmit = vi.fn();
    render(
      createElement(CheckoutPageModernTemplate, {
        items: [{ id: "a", name: "Star Helix Stud", price: 180, quantity: 2 }],
        itemCount: 2,
        totals: { subtotal: 360, grandTotal: 360, shipping: 70, shippingStatus: "quoted" },
        onSubmit,
        ...over,
      } as never),
    );
    const fill = (id: string, value: string) => fireEvent.change(document.getElementById(id) as HTMLElement, { target: { value } });
    fill("fullName", "Nour Adel");
    fill("phoneNumber", "01012345678");
    fill("address", "12 Road 9, Maadi");
    fill("city", "Cairo");
    return onSubmit;
  };
  const submit = () => fireEvent.submit(document.querySelector("form") as HTMLFormElement);

  it("email is optional for cash on delivery", () => {
    const onSubmit = checkout();
    expect(screen.getByText("(optional)", { selector: "label[for='email'] span" })).toBeTruthy();
    submit();
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({ email: "", paymentMethod: "cod" });
  });

  it("a typed email must still be valid, and is sent trimmed", () => {
    const onSubmit = checkout();
    fireEvent.change(document.getElementById("email") as HTMLElement, { target: { value: "nope" } });
    submit();
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.change(document.getElementById("email") as HTMLElement, { target: { value: "  nour@example.com " } });
    submit();
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({ email: "nour@example.com" });
  });

  it("a card payment still needs an email", () => {
    const onSubmit = checkout({
      paymentMethods: [
        { id: "cod", label: "Cash on delivery", description: "" },
        { id: "paymob", label: "Card", description: "" },
      ],
    });
    fireEvent.click(screen.getByRole("radio", { name: /Card/ }));
    expect(document.querySelector("label[for='email'] span")).toBeNull();
    submit();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(document.getElementById("email-error")?.textContent).toBe("Email is needed for card payments");
  });

  it("phones get a collapsed summary bar at the top: item count + total, opens and closes", () => {
    checkout();
    const bar = screen.getByTestId("checkout-mobile-summary");
    const form = document.querySelector("form") as HTMLFormElement;
    // At the top: before the form.
    expect(bar.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const toggle = within(bar).getByRole("button", { name: /Order summary/i });
    expect(plain(toggle.textContent)).toContain("2 items");
    expect(plain(toggle.textContent)).toContain("EGP 360");
    const panel = document.getElementById("checkout-summary-panel") as HTMLElement;
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(panel.hidden).toBe(true);
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(panel.hidden).toBe(false);
    expect(within(panel).getByText("Star Helix Stud")).toBeTruthy();
    fireEvent.click(toggle);
    expect(panel.hidden).toBe(true);
    // Only one summary toggle on the page.
    expect(screen.getAllByRole("button", { name: /Order summary/i })).toHaveLength(1);
  });
});
