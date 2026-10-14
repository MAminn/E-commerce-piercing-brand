// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cleanup, render, screen } from "@testing-library/react";

/**
 * Arabic product page: every system CTA and label — Add to bag, the zoom
 * hint, the related-products rail heading, its cards' "Add" and its "View all
 * products" link — is Arabic. Product names, descriptions and category names
 * stay as the catalogue stores them (no machine translation).
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
vi.mock("#root/lib/context/CartContext", () => ({ useCart: () => ({ addItem: () => true, items: [] }) }));
vi.mock("#root/frontend/contexts/TrackingContext", () => ({ useTracking: () => ({ trackEvent: () => {} }) }));
vi.mock("#root/frontend/contexts/LayoutSettingsContext", () => ({
  useLayoutSettings: () => ({ header: { navbarStyle: "minimal" } }),
}));
vi.mock("#root/frontend/contexts/TemplateContext", () => ({
  useTemplate: () => ({ getActiveTemplate: () => "default-productCard" }),
}));
vi.mock("#root/components/ui/cart-toast", () => ({ showCartToast: () => {}, flyToCart: () => {} }));
vi.mock("vike-react/usePageContext", () => ({ usePageContext: () => ({ urlPathname: "/featured/products/x" }) }));
vi.mock("vike/client/router", () => ({ navigate: () => {} }));

import { ProductPagePremium } from "../ProductPagePremium";
import { ProductPageMinimal } from "../ProductPageMinimal";
import { MinimalI18nProvider } from "#root/lib/i18n/MinimalI18nContext";

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
  description: "Stacked look without a piercing.",
  categoryName: "Fake Piercings",
  categories: [{ id: "c1", name: "Fake Piercings" }],
  specifications: [],
  features: [],
  variants: [],
};
const related = [
  { id: "r1", slug: "r1", name: "Opal Daith Ring", price: 160, stock: 3, available: true, imageUrl: "/a.webp" },
];

/** Visible text + labels, minus catalogue content and money. */
const systemText = (root: ParentNode) => {
  let all = root.textContent ?? "";
  for (const el of root.querySelectorAll("[aria-label],[placeholder]")) {
    all += ` ${el.getAttribute("aria-label") ?? ""} ${el.getAttribute("placeholder") ?? ""}`;
  }
  for (const content of [product.name, product.description, "Fake Piercings", "Opal Daith Ring"]) {
    all = all.split(content).join(" ");
  }
  return all.replace(/EGP|ج\.م\.?/g, " ");
};

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("Arabic product page — system CTAs", () => {
  it("Premium: Add to bag, zoom hint, related heading, card Add and View all products are Arabic", () => {
    render(
      <MinimalI18nProvider ssrLocale='ar'>
        {createElement(ProductPagePremium, { product, relatedProducts: related } as never)}
      </MinimalI18nProvider>,
    );
    expect(screen.getAllByText("أضيفي إلى الحقيبة").length).toBeGreaterThan(0);
    expect(screen.getByText("اضغطي للتكبير")).toBeTruthy();
    expect(screen.getByText("قد يعجبك أيضاً")).toBeTruthy();
    expect(screen.getByText("أضيفي")).toBeTruthy();
    expect(screen.getByRole("link", { name: /عرض كل المنتجات/ })).toBeTruthy();

    const text = systemText(document.body);
    for (const english of ["Add to bag", "Click to expand", "View All Products", "View all products", "You may also like"]) {
      expect(text).not.toContain(english);
    }
    expect(text).not.toMatch(/\bAdd\b/);
  });

  it("the catalogue content itself is preserved, not translated", () => {
    render(
      <MinimalI18nProvider ssrLocale='ar'>
        {createElement(ProductPagePremium, { product, relatedProducts: related } as never)}
      </MinimalI18nProvider>,
    );
    expect(screen.getAllByText(product.name).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Opal Daith Ring").length).toBeGreaterThan(0);
  });

  it("Minimal: no English interface text in the purchase area", () => {
    const html = renderToStaticMarkup(
      <MinimalI18nProvider ssrLocale='ar'>{createElement(ProductPageMinimal, { product } as never)}</MinimalI18nProvider>,
    );
    const host = document.createElement("div");
    host.innerHTML = html;
    expect(host.textContent).toContain("إضافة للسلة");
    expect(systemText(host)).not.toMatch(/[A-Za-z]{3,}/);
  });

  it("English is unchanged", () => {
    render(
      <MinimalI18nProvider ssrLocale='en'>
        {createElement(ProductPagePremium, { product, relatedProducts: related } as never)}
      </MinimalI18nProvider>,
    );
    expect(screen.getAllByText("Add to bag").length).toBeGreaterThan(0);
    expect(screen.getByText("Click to expand")).toBeTruthy();
    expect(screen.getByText("Add")).toBeTruthy();
    expect(screen.getByRole("link", { name: /View all products/ })).toBeTruthy();
  });
});
