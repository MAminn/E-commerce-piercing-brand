import { useMemo } from "react";
import { usePageContext } from "vike-react/usePageContext";
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
import { useStorefrontCategories } from "#root/hooks/useStorefrontCategories";
import { storefrontCategoryNav } from "#root/shared/categories/tree";
import { useCatalogueListing } from "#root/hooks/useCatalogueListing";

/**
 * /categories/@slug – Generic dynamic category page.
 *
 * Resolves a category by its slug (or id), fetches its products and renders
 * the active sorting template. A main category lists its own products plus
 * every subcategory's, with tabs to narrow to one subcategory; a subcategory
 * lists its own. Hidden categories resolve to "not found" — see
 * storefrontCategoryNav in shared/categories/tree.ts.
 *
 * Runs on the same listing system as /shop (useCatalogueListing): page,
 * sort, search and filters live in the URL, so Back from a product returns
 * to the same page of the same filtered listing.
 */
export default function CategoryPage() {
  const pageContext = usePageContext();
  const slug = pageContext.routeParams?.slug as string;
  const { getTemplateId } = useTemplate();
  const layoutSettings = useLayoutSettings();

  const isMinimal = layoutSettings.header.navbarStyle === "minimal";

  const { categories, failed } = useStorefrontCategories();
  const nav = useMemo(
    () => (categories ? storefrontCategoryNav(categories, slug) : undefined),
    [categories, slug],
  );
  const notFound = failed || (categories !== null && !nav);
  const categoryId = nav?.current.id;
  const categoryName = nav?.current.name;
  // Stable key so the scope (and the product fetch) changes only when the set really does.
  const listingKey = nav?.listingIds.join(",");
  const scope = useMemo(
    () => (listingKey ? { categoryIds: listingKey.split(",") } : null),
    [listingKey],
  );

  const listing = useCatalogueListing({
    scope,
    categories,
    categoriesFailed: failed,
    allowCategories: false,
    pageSize: isMinimal ? PRODUCTS_PER_PAGE : 100,
    paged: isMinimal,
    originName: categoryName,
  });

  if (notFound) {
    return (
      <div className='perce-header-offset flex min-h-[60vh] items-center justify-center bg-perce-bg px-4'>
        <div className='max-w-md text-center'>
          <h1 className='perce-section-title'>Category not found</h1>
          <p className='mt-2 text-[length:var(--perce-text-body)] text-perce-ink-muted'>
            This collection does not exist, or it is no longer available.
          </p>
          <a
            href='/shop'
            className='perce-underline mt-6 inline-flex min-h-11 items-center text-[length:var(--perce-text-small)] font-medium text-perce-ink'>
            Browse all products
          </a>
        </div>
      </div>
    );
  }

  /* ── Minimal template path ────────────────────────────────────────── */
  if (isMinimal) {
    const navProps = categoryNavProps(nav);
    // Moving between sibling subcategories keeps the shopper's sort, search
    // and filters; only the page starts over.
    const tabs = navProps.subcategoryNav;
    const subcategoryNav = tabs && {
      ...tabs,
      allHref: listing.carryHref(tabs.allHref),
      items: tabs.items.map((item) => ({ ...item, href: listing.carryHref(item.href) })),
    };
    return (
      <MinimalCategoryPage
        products={listing.products}
        categoryName={categoryName}
        {...navProps}
        subcategoryNav={subcategoryNav}
        categoryId={categoryId}
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
      {/* Breadcrumb */}
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
            {nav && nav.current.id !== nav.main.id && (
              <>
                <a
                  href={`/categories/${encodeURIComponent(nav.main.slug)}`}
                  className='perce-underline-hover transition-colors hover:text-perce-ink'>
                  {nav.main.name}
                </a>
                <span aria-hidden>/</span>
              </>
            )}
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
