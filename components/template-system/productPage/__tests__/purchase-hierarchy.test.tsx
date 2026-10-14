// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Product page conversion hierarchy, for both live product templates:
 * the purchase decision (price, stock, summary, quantity, Add to bag,
 * reassurance) comes BEFORE the long-form description, and standalone
 * purchase always works — including for a piece that is also in a set.
 */
vi.mock("#root/shared/trpc/client", () => ({
  trpc: {
    settings: {
      getProductPageContent: { query: async () => ({ success: true, result: {} }) },
      getVariantPresets: { query: async () => ({ success: true, result: [] }) },
    },
    homepage: { getContent: { query: async () => ({ success: false }) } },
    product: { getReviews: { query: async () => ({ success: true, result: { reviews: [], averageRating: 0, totalReviews: 0 } }) } },
  },
}));
const addItem = vi.fn(() => true);
vi.mock("#root/lib/context/CartContext", () => ({ useCart: () => ({ addItem, items: [] }) }));
vi.mock("#root/frontend/contexts/TrackingContext", () => ({ useTracking: () => ({ trackEvent: () => {} }) }));
vi.mock("#root/frontend/contexts/LayoutSettingsContext", () => ({
  useLayoutSettings: () => ({ header: { navbarStyle: "minimal" } }),
}));
vi.mock("#root/components/ui/cart-toast", () => ({ showCartToast: () => {}, flyToCart: () => {} }));
vi.mock("vike-react/usePageContext", () => ({ usePageContext: () => ({ urlPathname: "/featured/products/x" }) }));
vi.mock("vike/client/router", () => ({ navigate: () => {} }));

import { ProductPagePremium } from "../ProductPagePremium";
import { ProductPageMinimal } from "../ProductPageMinimal";
import { MinimalI18nProvider } from "#root/lib/i18n/MinimalI18nContext";

const LONG = "A long story about this piece. ".repeat(40);
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
  description: LONG,
  categoryName: "Fake Piercings",
  categories: [{ id: "c1", name: "Fake Piercings" }, { id: "c2", name: "Ear" }],
  specifications: [],
  features: [],
  variants: [],
};

const ssr = (Template: typeof ProductPagePremium | typeof ProductPageMinimal, locale: "en" | "ar" = "en") =>
  renderToStaticMarkup(
    <MinimalI18nProvider ssrLocale={locale}>{createElement(Template as never, { product } as never)}</MinimalI18nProvider>,
  );

beforeEach(() => {
  cleanup();
  localStorage.clear();
  addItem.mockClear();
});

describe.each([
  ["Premium (product-perce)", ProductPagePremium],
  ["Minimal (product-minimal)", ProductPageMinimal],
])("%s product page", (_name, Template) => {
  it("puts price, stock, summary, Add to bag and reassurance before the description", () => {
    const html = ssr(Template);
    const at = (needle: string) => {
      const i = html.indexOf(needle);
      expect(i, needle).toBeGreaterThan(-1);
      return i;
    };
    const price = at("EGP");
    const summary = at('data-testid="decision-summary"');
    const addToBag = at('data-add-to-cart="true"');
    const reassurance = at('data-testid="purchase-reassurance"');
    const description = at("A long story about this piece.");
    expect(price).toBeLessThan(summary);
    expect(summary).toBeLessThan(addToBag);
    expect(addToBag).toBeLessThan(reassurance);
    expect(reassurance).toBeLessThan(description);
  });

  it("the decision summary states only real data", () => {
    const html = ssr(Template);
    expect(html).toContain("Fake Piercings · Ear");
    expect(html).toContain("No piercing needed");
    expect(html).not.toMatch(/hypoallergenic|lifetime|premium materials/i);
  });

  it("the long description appears exactly once", () => {
    const html = ssr(Template);
    expect(html.split("A long story about this piece.").length - 1).toBe(40);
  });

  it("speaks Arabic", () => {
    const html = ssr(Template, "ar");
    expect(html).toContain("لا يحتاج إلى ثقب");
    expect(html).toContain("الدفع عند الاستلام");
  });
});

describe("Premium product page — standalone purchase", () => {
  it("adds the chosen quantity (the stepper used to be ignored)", async () => {
    const user = userEvent.setup();
    const onAddToCart = vi.fn();
    render(createElement(ProductPagePremium, { product: product as never, onAddToCart }));
    await user.click(screen.getByRole("button", { name: "Increase quantity" }));
    await user.click(screen.getByRole("button", { name: "Increase quantity" }));
    const [main] = screen.getAllByRole("button", { name: /Add to bag/ });
    await user.click(main!);
    expect(onAddToCart).toHaveBeenCalledWith(expect.objectContaining({ id: product.id }), {}, 3);
  });

  it("wishlist is a real toggle, not a console.log", async () => {
    const user = userEvent.setup();
    render(createElement(ProductPagePremium, { product: product as never }));
    const heart = screen.getByRole("button", { name: "Save to wishlist" });
    expect(heart.getAttribute("aria-pressed")).toBe("false");
    await user.click(heart);
    expect(heart.getAttribute("aria-pressed")).toBe("true");
  });

  it("the sticky bar starts hidden — never two Add to bag buttons on first view", () => {
    render(createElement(ProductPagePremium, { product: product as never }));
    const sticky = screen.getByTestId("sticky-add-to-bag");
    expect(sticky.getAttribute("aria-hidden")).toBe("true");
    expect(sticky.className).toContain("translate-y-[200%]");
  });

  it("out of stock: no purchase, honestly labelled", () => {
    render(createElement(ProductPagePremium, { product: { ...product, stock: 0, available: false } as never }));
    const [button] = screen.getAllByRole("button", { name: /out of stock/i });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByTestId("sticky-add-to-bag")).toBeNull();
  });
});

describe("Minimal product page — standalone purchase", () => {
  // jsdom has no IntersectionObserver; every browser the store supports does.
  beforeEach(() => {
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
  });

  it("Add to cart puts the piece in the bag with the chosen quantity", async () => {
    const user = userEvent.setup();
    render(createElement(ProductPageMinimal, { product: product as never }));
    await user.click(screen.getByRole("button", { name: "Increase quantity" }));
    const button = document.querySelector('[data-add-to-cart="true"]') as HTMLButtonElement;
    await user.click(button);
    expect(addItem).toHaveBeenCalledWith(expect.objectContaining({ id: product.id, price: 175 }), 2, {});
  });

  it("no fabricated 'New' badge on an in-stock product", () => {
    const html = ssr(ProductPageMinimal);
    expect(html).not.toMatch(/>New</);
  });
});
