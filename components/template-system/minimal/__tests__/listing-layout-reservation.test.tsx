// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * /shop and /categories/[slug] (MinimalCategoryPage) hold their toolbar
 * geometry from the first render:
 *
 *   • the result-count line is always in the layout — blank while loading,
 *     the API's own total once it answers;
 *   • the phone Filters button is drawn before `product.facets` answers,
 *     disabled, and becomes the working button when it does.
 *
 * Behaviour is unchanged: same count wording, same drawer, same filters.
 */
vi.mock("#root/components/template-system/minimal/MinimalProductCard", () => ({
  MinimalProductCard: ({ product }: { product: { name: string } }) => <div data-testid='card'>{product.name}</div>,
}));
vi.mock("#root/components/template-system/minimal/QuickViewDialog", () => ({ QuickViewDialog: () => null }));
vi.mock("#root/components/template-system/minimal/MinimalTestimonials", () => ({ MinimalTestimonialsSection: () => null }));
vi.mock("#root/components/bundles/CategoryBundlesSection", () => ({ CategoryBundlesSection: () => null }));
vi.mock("vike-react/usePageContext", () => ({ usePageContext: () => ({ urlPathname: "/shop" }) }));

import { MinimalCategoryPage, type MinimalCategoryPageProps } from "../MinimalCategoryPage";
import type { FilterModel } from "../listing/ListingFilters";
import { MinimalI18nProvider } from "#root/lib/i18n/MinimalI18nContext";

const noFilters = { categories: [], minPrice: null, maxPrice: null, inStock: false, onSale: false };
const model = (facets: FilterModel["facets"]): FilterModel => ({
  filters: noFilters as never,
  q: "",
  facets,
  categoryOptions: [],
  selectedCategories: [],
  refToId: () => undefined,
  onChange: () => {},
  onClearAll: () => {},
  onClearSearch: () => {},
  facetsInputFor: () => null,
});
const FACETS = {
  price: { min: 75, max: 375 },
  inStock: { count: 140, of: 155 },
  onSale: { count: 12 },
  categories: [],
} as unknown as FilterModel["facets"];

const props = (over: Partial<MinimalCategoryPageProps> = {}): MinimalCategoryPageProps => ({
  products: [],
  isLoading: true,
  totalProducts: 0,
  currentPage: 1,
  totalPages: 1,
  onPageChange: () => {},
  onSortChange: () => {},
  onSearchChange: () => {},
  currentSort: "featured",
  currentSearch: "",
  filters: model(null),
  ...over,
});

const page = (p: MinimalCategoryPageProps) => (
  <MinimalI18nProvider ssrLocale='en'>
    <MinimalCategoryPage {...p} />
  </MinimalI18nProvider>
);

// The drawer's price slider measures itself; jsdom has no ResizeObserver.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

afterEach(cleanup);

describe("listing toolbar reservation", () => {
  it("server render already contains the count line and a disabled Filters button", () => {
    const html = renderToStaticMarkup(page(props()));
    expect(html).toContain('data-testid="results-count"');
    const filterButton = html.match(/<button[^>]*aria-haspopup="dialog"[^>]*>/)?.[0] ?? "";
    expect(filterButton).not.toBe("");
    expect(filterButton).toContain('disabled=""');
  });

  it("the count line is blank (but present) while loading, then shows the API total", () => {
    const view = render(page(props()));
    const line = screen.getByTestId("results-count");
    expect(line.textContent).toBe(" ");

    view.rerender(
      page(props({ isLoading: false, totalProducts: 155, products: [{ id: "1", name: "Stud" } as never], filters: model(FACETS) })),
    );
    expect(screen.getByTestId("results-count")).toBe(line); // same node — nothing inserted
    expect(line.textContent).toMatch(/155/);
  });

  it("the Filters button is the same node before and after facets, and works once they land", () => {
    const view = render(page(props()));
    const before = screen.getByRole("button", { name: /filter/i });
    expect((before as HTMLButtonElement).disabled).toBe(true);

    view.rerender(page(props({ isLoading: false, totalProducts: 1, products: [{ id: "1", name: "Stud" } as never], filters: model(FACETS) })));
    const after = screen.getByRole("button", { name: /filter/i });
    expect(after).toBe(before);
    expect((after as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(after);
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("a listing without a filter model shows no Filters button (unchanged)", () => {
    render(page(props({ filters: undefined })));
    expect(screen.queryByRole("button", { name: /filter/i })).toBeNull();
  });

  it("a failed load keeps the line but states no count", () => {
    render(page(props({ isLoading: false, loadFailed: true })));
    expect(screen.getByTestId("results-count").textContent).toBe(" ");
  });
});
