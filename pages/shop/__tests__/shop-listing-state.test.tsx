// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * Shop / category browsing state lives in the URL. These drive the real
 * pages, hooks and filter UI through `window.history` the way a shopper
 * does: open page 3, open a product (the page unmounts), press Back (it
 * remounts) — and must land on page 3 with the same filters and sort.
 */

const EAR = "00000000-0000-4000-8000-0000000000e1";
const DAITH = "00000000-0000-4000-8000-0000000000d1";
const NOSE = "00000000-0000-4000-8000-0000000000a1";
const CATEGORIES = [
  { id: EAR, name: "Ear Piercings", slug: "ear-piercings", parentId: null, sortOrder: 0, hidden: false, showOnLanding: true, description: null, filename: null, productCount: 30 },
  { id: DAITH, name: "Daith", slug: "daith", parentId: EAR, sortOrder: 0, hidden: false, showOnLanding: true, description: null, filename: null, productCount: 6 },
  { id: NOSE, name: "Nose Piercings", slug: "nose-piercings", parentId: null, sortOrder: 1, hidden: false, showOnLanding: true, description: null, filename: null, productCount: 10 },
];
const TOTAL = 40; // 4 pages of 12

const search = vi.fn();
const facets = vi.fn();
vi.mock("#root/shared/trpc/client", () => ({
  trpc: {
    product: {
      search: { query: (input: unknown) => search(input) },
      facets: { query: (input: unknown) => facets(input) },
    },
    category: { view: { query: async () => ({ success: true, result: CATEGORIES }) } },
    homepage: { getContent: { query: async () => ({ success: true, result: {} }) } },
  },
}));

let routeSlug: string | undefined;
vi.mock("vike-react/usePageContext", () => ({
  usePageContext: () => ({
    urlPathname: window.location.pathname,
    urlParsed: { searchOriginal: window.location.search || null },
    routeParams: routeSlug ? { slug: routeSlug } : {},
  }),
}));
vi.mock("#root/frontend/contexts/LayoutSettingsContext", () => ({
  useLayoutSettings: () => ({ header: { navbarStyle: "minimal" } }),
}));
vi.mock("#root/frontend/contexts/TemplateContext", () => ({
  useTemplate: () => ({ getTemplateId: () => undefined }),
}));
vi.mock("#root/components/template-system/minimal/MinimalProductCard", () => ({
  MinimalProductCard: ({ product }: { product: { name: string; slug: string } }) => (
    <a href={`/shop/${product.slug}`}>
      <h3>{product.name}</h3>
    </a>
  ),
}));
vi.mock("#root/components/template-system/minimal/QuickViewDialog", () => ({ QuickViewDialog: () => null }));
vi.mock("#root/components/template-system/minimal/MinimalTestimonials", () => ({
  MinimalTestimonialsSection: () => null,
}));
vi.mock("#root/components/bundles/CategoryBundlesSection", () => ({ CategoryBundlesSection: () => null }));

import ShopPage from "../+Page";
import CategoryPage from "../../categories/@slug/+Page";
import { MinimalI18nProvider } from "#root/lib/i18n/MinimalI18nContext";
import { clearQueryCache } from "#root/hooks/useCachedQuery";

type SearchInput = { offset: number; limit: number; sortBy?: string; categoryIds?: string[]; includeOutOfStock?: boolean; search?: string; discountedOnly?: boolean; minPrice?: number };

function fakeSearch(input: SearchInput) {
  const empty = input.search === "nomatch";
  const total = empty ? 0 : TOTAL;
  const items = Array.from({ length: Math.max(0, Math.min(input.limit, total - input.offset)) }, (_, i) => {
    const n = input.offset + i + 1;
    return { id: `p${n}`, slug: `product-${n}`, name: `Product ${n}`, price: "100", discountPrice: null, stock: 3, imageUrl: null, images: [], categoryName: null };
  });
  return Promise.resolve({ success: true, result: { items, total } });
}
const FACETS = {
  total: TOTAL,
  price: { min: 75, max: 250 },
  inStock: { count: 35, of: 40 },
  onSale: { count: 4 },
  categories: { [EAR]: 30, [DAITH]: 6, [NOSE]: 10 },
};

const lastSearch = () => search.mock.calls.at(-1)?.[0] as SearchInput;
const names = () => screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
const activePage = () =>
  within(screen.getByRole("navigation", { name: "Pagination" })).getAllByText(/^\d+$/).find((el) => el.getAttribute("aria-current") === "page")?.textContent;

function go(url: string) {
  window.history.replaceState({}, "", url);
}
function renderShop() {
  return render(
    <MinimalI18nProvider ssrLocale="en">
      <ShopPage />
    </MinimalI18nProvider>,
  );
}
async function back() {
  await act(async () => {
    window.history.back();
    await new Promise((r) => setTimeout(r, 30));
  });
}

beforeAll(() => {
  // Radix (popper, slider) measures elements.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as never;
  window.scrollTo = vi.fn() as never;
  Element.prototype.scrollIntoView = vi.fn();
  window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as never;
});

beforeEach(() => {
  clearQueryCache();
  routeSlug = undefined;
  search.mockReset().mockImplementation(fakeSearch);
  facets.mockReset().mockResolvedValue({ success: true, result: FACETS });
  go("/shop");
});
afterEach(() => cleanup());

describe("shop browsing state survives product navigation", () => {
  it("1. page 3 → product → Back restores page 3", async () => {
    go("/shop?page=3");
    const first = renderShop();
    await screen.findByText("Product 25");
    expect(lastSearch().offset).toBe(24);
    expect(activePage()).toBe("3");

    // Opening a product unmounts the listing; Back remounts it on the same URL.
    first.unmount();
    renderShop();
    // From the cache: the grid is there on the first render, so the saved
    // scroll position has the same page height to land on.
    expect(screen.getByText("Product 25")).toBeTruthy();
    expect(activePage()).toBe("3");
    expect(window.location.search).toBe("?page=3");
  });

  it("2. filter + sort → page 2 → product → Back restores the exact state", async () => {
    renderShop();
    await screen.findByText("Product 1");

    fireEvent.click(screen.getByRole("button", { name: "In stock", exact: true } as never));
    fireEvent.change(screen.getByLabelText("Sort by"), { target: { value: "price-asc" } });
    await screen.findByText("Product 1");
    fireEvent.click(within(screen.getByRole("navigation", { name: "Pagination" })).getByText("2"));
    await screen.findByText("Product 13");
    expect(window.location.search).toBe("?inStock=1&sort=price-asc&page=2");
    expect(lastSearch()).toMatchObject({ offset: 12, sortBy: "price-asc", includeOutOfStock: false });

    cleanup();
    renderShop();
    expect(screen.getByText("Product 13")).toBeTruthy();
    expect((screen.getByLabelText("Sort by") as HTMLSelectElement).value).toBe("price-asc");
    expect(screen.getByRole("button", { name: "In stock", exact: true } as never).getAttribute("aria-pressed")).toBe("true");
  });

  it("3. a filtered, paginated URL rebuilds the same listing on refresh", async () => {
    go("/shop?category=nose-piercings&minPrice=80&maxPrice=200&onSale=1&sort=newest&page=2");
    renderShop();
    await screen.findByText("Product 13");
    expect(lastSearch()).toMatchObject({
      offset: 12,
      sortBy: "newest",
      categoryIds: [NOSE],
      minPrice: 80,
      maxPrice: 200,
      discountedOnly: true,
    });
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Nose Piercings");
    const chips = within(screen.getByTestId("active-filters"));
    expect(chips.getByRole("button", { name: "Remove filter: Nose Piercings" })).toBeTruthy();
    expect(chips.getByRole("button", { name: /Remove filter: EGP\s80 – EGP\s200/ })).toBeTruthy();
  });

  it("4. Back and Forward walk through page changes on the same page", async () => {
    renderShop();
    await screen.findByText("Product 1");
    const next = () => fireEvent.click(within(screen.getByRole("navigation", { name: "Pagination" })).getByText("Next"));
    next();
    await screen.findByText("Product 13");
    next();
    await screen.findByText("Product 25");
    expect(window.location.search).toBe("?page=3");

    await back();
    await waitFor(() => expect(activePage()).toBe("2"));
    expect(screen.getByText("Product 13")).toBeTruthy();
    await act(async () => {
      window.history.forward();
      await new Promise((r) => setTimeout(r, 30));
    });
    await waitFor(() => expect(activePage()).toBe("3"));
  });

  it("5. changing a filter returns to page 1; the page link keeps it", async () => {
    go("/shop?page=3&sort=price-desc");
    renderShop();
    await screen.findByText("Product 25");
    fireEvent.click(screen.getByRole("button", { name: "On sale", exact: true } as never));
    await screen.findByText("Product 1");
    expect(window.location.search).toBe("?onSale=1&sort=price-desc");
    const link = within(screen.getByRole("navigation", { name: "Pagination" })).getByText("2").closest("a");
    expect(link?.getAttribute("href")).toBe("/shop?onSale=1&sort=price-desc&page=2");
    expect(link?.getAttribute("data-vike")).toBe("false");
  });

  it("6. clearing filters keeps the sort and drops everything else", async () => {
    go("/shop?category=ear-piercings&inStock=1&onSale=1&q=hoop&sort=newest&page=2");
    renderShop();
    await screen.findByText("Product 13");
    fireEvent.click(within(screen.getByTestId("active-filters")).getByRole("button", { name: "Clear all" }));
    await screen.findByText("Product 1");
    expect(window.location.search).toBe("?sort=newest");
  });

  it("7. mobile drawer: opens, keeps a draft, Escape discards, Show applies", async () => {
    renderShop();
    await screen.findByText("Product 1");
    const open = () => fireEvent.click(screen.getByRole("button", { name: /^Filter/ }));

    open();
    const drawer = await screen.findByRole("dialog", { name: "Filter" });
    fireEvent.click(within(drawer).getByLabelText(/^Nose Piercings/));
    expect(window.location.search).toBe(""); // still a draft
    fireEvent.keyDown(drawer, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(window.location.search).toBe("");

    open();
    const again = await screen.findByRole("dialog", { name: "Filter" });
    expect((within(again).getByLabelText(/^Nose Piercings/) as HTMLInputElement).checked).toBe(false);
    fireEvent.click(within(again).getByLabelText(/^Nose Piercings/));
    fireEvent.click(within(again).getByLabelText(/^In stock/));
    await waitFor(() => expect(within(again).getByRole("button", { name: /^Show 40 products/ })).toBeTruthy());
    fireEvent.click(within(again).getByRole("button", { name: /^Show/ }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(window.location.search).toBe("?category=nose-piercings&inStock=1");
    expect(screen.getByRole("button", { name: /^Filter/ }).textContent).toContain("2");
  });

  it("8. malformed parameters fall back to the default listing", async () => {
    go("/shop?page=-3&sort=best-selling&minPrice=abc&maxPrice=1e99&inStock=maybe&category=nope,%3Cscript%3E");
    renderShop();
    await screen.findByText("Product 1");
    expect(lastSearch()).toMatchObject({ offset: 0, sortBy: undefined, includeOutOfStock: true, categoryIds: undefined });
    expect(lastSearch().minPrice).toBeUndefined();
    expect(screen.queryByTestId("active-filters")).toBeNull();
  });

  it("8b. a page past the end lands on the last real page", async () => {
    go("/shop?page=40");
    renderShop();
    await waitFor(() => expect(window.location.search).toBe("?page=4"));
    await screen.findByText("Product 37");
  });

  it("9. an empty result offers Clear filters", async () => {
    go("/shop?q=nomatch&onSale=1");
    renderShop();
    await screen.findByRole("heading", { name: "No products found" });
    expect(screen.getByText("No products match these filters.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    await screen.findByText("Product 1");
    expect(window.location.search).toBe("");
  });

  it("10. category pages keep page and sort through product → Back, and tabs carry them", async () => {
    routeSlug = "ear-piercings";
    go("/categories/ear-piercings?page=2&sort=newest&category=nose-piercings");
    const first = render(
      <MinimalI18nProvider ssrLocale="en">
        <CategoryPage />
      </MinimalI18nProvider>,
    );
    await screen.findByText("Product 13");
    // The route owns the category: a stray ?category= is ignored.
    expect(lastSearch()).toMatchObject({ offset: 12, sortBy: "newest", categoryIds: [EAR, DAITH] });
    const tab = screen.getByRole("link", { name: "Daith" });
    expect(tab.getAttribute("href")).toBe("/categories/daith?sort=newest");

    first.unmount();
    render(
      <MinimalI18nProvider ssrLocale="en">
        <CategoryPage />
      </MinimalI18nProvider>,
    );
    expect(screen.getByText("Product 13")).toBeTruthy();
    expect(activePage()).toBe("2");
    // No Category filter on a category page (its tabs do that job).
    expect(screen.queryByRole("button", { name: /^Category/ })).toBeNull();
  });

  it("New Arrivals without picked products: the sort control says Newest, and Featured stays choosable", async () => {
    go("/shop?section=newarrivals");
    renderShop();
    await screen.findByText("Product 1");
    expect((screen.getByLabelText("Sort by") as HTMLSelectElement).value).toBe("newest");
    expect(lastSearch().sortBy).toBe("newest");

    fireEvent.change(screen.getByLabelText("Sort by"), { target: { value: "featured" } });
    await waitFor(() => expect(window.location.search).toBe("?section=newarrivals&sort=featured"));
    await waitFor(() => expect(lastSearch().sortBy).toBeUndefined());
    expect((screen.getByLabelText("Sort by") as HTMLSelectElement).value).toBe("featured");
  });

  it("does not refetch the counts when only the page changes", async () => {
    renderShop();
    await screen.findByText("Product 1");
    const before = facets.mock.calls.length;
    fireEvent.click(within(screen.getByRole("navigation", { name: "Pagination" })).getByText("Next"));
    await screen.findByText("Product 13");
    expect(facets.mock.calls.length).toBe(before);
    expect(names()).toHaveLength(12);
  });
});
