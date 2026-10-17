import { useEffect, useMemo, useState } from "react";
import { trpc } from "#root/shared/trpc/client";
import { getTemplateComponent } from "#root/components/template-system/templateConfig";
import { resolveTemplateId } from "#root/shared/config/storefront";
import { useTemplate } from "#root/frontend/contexts/TemplateContext";
import { useLayoutSettings } from "#root/frontend/contexts/LayoutSettingsContext";
import type { SortingPageProduct } from "#root/components/template-system/sorting/SortingMinimalTemplate";
import {
  MinimalCategoryPage,
  PRODUCTS_PER_PAGE,
  categoryNavProps,
} from "#root/components/template-system/minimal/MinimalCategoryPage";
import { getStoreOwnerId } from "#root/shared/config/store";
import { useStorefrontCategories } from "#root/hooks/useStorefrontCategories";
import { storefrontCategoryNav } from "#root/shared/categories/tree";
import type { HomepageContent } from "#root/shared/types/homepage-content";
import { type ListingScope, useCatalogueListing } from "#root/hooks/useCatalogueListing";
import { useLocationSearch } from "#root/hooks/useListingUrlState";

/**
 * /shop – Canonical all-products collection page.
 *
 * Every piece of browsing state is in the URL (see
 * shared/products/listing-params.ts): `?category=` (one or more slugs — the
 * CategoryStrip and breadcrumb links use it), price, stock, sale, search,
 * sort and page. Opening a product and pressing Back returns to exactly this
 * listing. `?section=offers|featured|newarrivals` narrows to a homepage
 * section and is carried through every filter change.
 */

const KNOWN_SECTIONS = new Set(["offers", "featured", "newarrivals"]);
const NO_SCOPE: ListingScope = {};
/** Resolved homepage sections, so a remount (Back) needs no second request. */
const sectionScopes = new Map<string, ListingScope>();

function sectionScope(sectionParam: string, content: HomepageContent): ListingScope {
  if (sectionParam === "offers") {
    const ids = content.discountedProducts?.productIds;
    return ids && ids.length > 0 ? { productIds: ids } : { discountedOnly: true };
  }
  if (sectionParam === "featured") {
    const ids = content.featuredProducts?.productIds;
    // No special filter for featured without productIds — shows all
    return ids && ids.length > 0 ? { productIds: ids } : NO_SCOPE;
  }
  const ids = content.newArrivals?.productIds;
  return ids && ids.length > 0 ? { productIds: ids } : { defaultSort: "newest" };
}

/** The homepage section's scope; null while it resolves. */
function useSectionScope(sectionParam: string | null, landingTemplateId: string): ListingScope | null {
  const section = sectionParam && KNOWN_SECTIONS.has(sectionParam) ? sectionParam : null;
  const [, setResolvedAt] = useState(0);

  useEffect(() => {
    if (!section || sectionScopes.has(section)) return;
    let cancelled = false;
    trpc.homepage.getContent
      .query({ merchantId: getStoreOwnerId(), templateId: landingTemplateId })
      .then((result) => {
        sectionScopes.set(
          section,
          result.success && result.result
            ? sectionScope(section, result.result as HomepageContent)
            : NO_SCOPE,
        );
      })
      .catch((err) => {
        console.error("Error resolving section:", err);
        sectionScopes.set(section, NO_SCOPE);
      })
      .finally(() => {
        if (!cancelled) setResolvedAt(Date.now());
      });
    return () => {
      cancelled = true;
    };
  }, [section, landingTemplateId]);

  if (!section) return NO_SCOPE;
  return sectionScopes.get(section) ?? null;
}

export default function ShopPage() {
  const { getTemplateId } = useTemplate();
  const layoutSettings = useLayoutSettings();
  const isMinimal = layoutSettings.header.navbarStyle === "minimal";

  const { search } = useLocationSearch();
  const sectionParam = useMemo(() => new URLSearchParams(search).get("section"), [search]);
  const scope = useSectionScope(
    sectionParam,
    resolveTemplateId("landing", getTemplateId("landing")),
  );

  // Same resolution as /categories/[slug]: a main category includes its
  // subcategories' products. An unknown or hidden category falls back to
  // the unfiltered shop instead of an endless skeleton.
  const { categories, failed: categoriesFailed } = useStorefrontCategories();
  const listing = useCatalogueListing({
    scope,
    categories,
    categoriesFailed,
    allowCategories: true,
    pageSize: isMinimal ? PRODUCTS_PER_PAGE : 100,
    paged: isMinimal,
  });

  // One category picked (e.g. arriving from the homepage "Shop by placement"
  // strip): the page is named after it. Several, or none: "Shop".
  const single = listing.selectedCategories.length === 1 ? listing.selectedCategories[0] : undefined;
  const nav = useMemo(
    () => (single && categories ? storefrontCategoryNav(categories, single.ref) : undefined),
    [single, categories],
  );
  const categoryName = nav?.current.name;

  /* ── Minimal template path ────────────────────────────────────────── */
  if (isMinimal) {
    // The Category filter replaces the subcategory tabs here.
    const { subcategoryNav: _tabs, ...navProps } = categoryNavProps(nav);
    return (
      <MinimalCategoryPage
        products={listing.products}
        categoryName={categoryName}
        {...navProps}
        categoryId={nav?.current.id}
        isLoading={listing.isLoading}
        isRefreshing={listing.isRefreshing}
        loadFailed={listing.failed}
        onRetry={listing.retry}
        totalProducts={listing.total}
        currentPage={listing.listing.page}
        totalPages={listing.totalPages}
        pageHref={listing.pageHref}
        onPageChange={listing.actions.setPage}
        onSortChange={listing.actions.setSort}
        onSearchChange={listing.actions.setSearch}
        currentSort={listing.listing.sort}
        currentSearch={listing.listing.q}
        filters={listing.filterModel}
      />
    );
  }

  /* ── Default / other template path ────────────────────────────────── */
  const activeTemplateId = resolveTemplateId(
    "sorting",
    getTemplateId("sorting"),
  );
  const TemplateEntry = getTemplateComponent("sorting", activeTemplateId);

  if (!TemplateEntry) {
    return <div>Sorting template not found.</div>;
  }

  const Template = TemplateEntry.component;

  return (
    <div>
      {/* Breadcrumb when filtering by category */}
      {categoryName && (
        <nav
          aria-label='Breadcrumb'
          data-shop-breadcrumb
          className='perce-container pt-6'>
          <div className='mb-4 flex items-center gap-2 text-[length:var(--perce-text-small)] text-perce-ink-muted'>
            <a
              href='/shop'
              className='perce-underline-hover transition-colors hover:text-perce-ink'>
              All Products
            </a>
            <span aria-hidden>/</span>
            <span aria-current='page' className='truncate text-perce-ink'>
              {categoryName}
            </span>
          </div>
        </nav>
      )}
      <Template
        products={listing.products as SortingPageProduct[]}
        isLoading={listing.isLoading}
        onSortChange={() => {}}
        onOpenFilters={() => {}}
        defaultSort='featured'
      />
    </div>
  );
}
