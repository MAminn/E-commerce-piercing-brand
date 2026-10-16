import { useState, useEffect, useMemo, useCallback } from "react";
import { trpc } from "#root/shared/trpc/client";
import { getTemplateComponent } from "#root/components/template-system/templateConfig";
import { resolveTemplateId } from "#root/shared/config/storefront";
import { useTemplate } from "#root/frontend/contexts/TemplateContext";
import { useLayoutSettings } from "#root/frontend/contexts/LayoutSettingsContext";
import type { SortingPageProduct } from "#root/components/template-system/sorting/SortingMinimalTemplate";
import { useSearchParams } from "#root/hooks/useSearchParams";
import {
  MinimalCategoryPage,
  PRODUCTS_PER_PAGE,
  categoryNavProps,
  type MinimalCategoryProduct,
} from "#root/components/template-system/minimal/MinimalCategoryPage";
import { getStoreOwnerId } from "#root/shared/config/store";
import { useStorefrontCategories } from "#root/hooks/useStorefrontCategories";
import { storefrontCategoryNav } from "#root/shared/categories/tree";
import type { HomepageContent } from "#root/shared/types/homepage-content";

/**
 * /shop – Canonical all-products collection page.
 *
 * Supports optional `?category=<slug|id>` filtering via URL query param
 * (used by CategoryStrip and breadcrumb links).
 * When the store uses the minimal navbar, renders the MinimalCategoryPage
 * with paginated grid, search, sort, and breadcrumbs (same UI as category pages).
 */
export default function ShopPage() {
  const [products, setProducts] = useState<SortingPageProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sortOption, setSortOption] = useState("featured");
  const { getTemplateId } = useTemplate();
  const layoutSettings = useLayoutSettings();
  const searchParams = useSearchParams();

  const isMinimal = layoutSettings.header.navbarStyle === "minimal";

  // Optional category filter from query string
  const categoryParam = searchParams.get("category");
  const sectionParam = searchParams.get("section"); // offers | featured | newarrivals
  // Same resolution as /categories/[slug]: a main category includes its
  // subcategories' products. An unknown or hidden category falls back to
  // the unfiltered shop — it used to leave the grid on a skeleton forever,
  // because the fetch waited for an id that would never resolve.
  const { categories, failed: categoriesFailed } = useStorefrontCategories();
  const nav = useMemo(
    () =>
      categoryParam && categories
        ? storefrontCategoryNav(categories, categoryParam)
        : undefined,
    [categories, categoryParam],
  );
  const categoryResolving =
    !!categoryParam && categories === null && !categoriesFailed;
  const categoryId = nav?.current.id;
  const categoryName = nav?.current.name;
  const listingKey = nav?.listingIds.join(",");

  // Section-specific filter data from homepage CMS content
  const [sectionProductIds, setSectionProductIds] = useState<
    string[] | undefined
  >(undefined);
  const [sectionDiscountedOnly, setSectionDiscountedOnly] = useState<
    boolean | undefined
  >(undefined);
  const [sectionSortBy, setSectionSortBy] = useState<"newest" | undefined>(
    undefined,
  );
  const [sectionReady, setSectionReady] = useState(!sectionParam); // true immediately if no section param

  // Minimal-specific state
  const [currentPage, setCurrentPage] = useState(1);
  const [currentSort, setCurrentSort] = useState("featured");
  const [searchQuery, setSearchQuery] = useState("");
  const [totalProducts, setTotalProducts] = useState(0);

  // A different category starts from page one.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on navigation only
  useEffect(() => {
    setCurrentPage(1);
  }, [categoryParam]);

  // Resolve section filter from homepage CMS content
  useEffect(() => {
    if (!sectionParam) {
      setSectionReady(true);
      return;
    }

    let cancelled = false;

    const resolveSection = async () => {
      try {
        const merchantId = getStoreOwnerId();
        const result = await trpc.homepage.getContent.query({
          merchantId,
          templateId: resolveTemplateId("landing", getTemplateId("landing")),
        });
        if (cancelled) return;

        if (result.success && result.result) {
          const content = result.result as HomepageContent;
          if (sectionParam === "offers") {
            const ids = content.discountedProducts?.productIds;
            if (ids && ids.length > 0) {
              setSectionProductIds(ids);
            } else {
              setSectionDiscountedOnly(true);
            }
          } else if (sectionParam === "featured") {
            const ids = content.featuredProducts?.productIds;
            if (ids && ids.length > 0) {
              setSectionProductIds(ids);
            }
            // No special filter for featured without productIds — shows all
          } else if (sectionParam === "newarrivals") {
            const ids = content.newArrivals?.productIds;
            if (ids && ids.length > 0) {
              setSectionProductIds(ids);
            } else {
              setSectionSortBy("newest");
            }
          }
        }
      } catch (err) {
        console.error("Error resolving section:", err);
      } finally {
        if (!cancelled) setSectionReady(true);
      }
    };

    resolveSection();
    return () => {
      cancelled = true;
    };
  }, [sectionParam]);

  // Map sort value → server-side sortBy param
  const serverSort = useMemo(() => {
    if (currentSort === "price-asc") return "price-asc" as const;
    if (currentSort === "price-desc") return "price-desc" as const;
    if (currentSort === "newest") return "newest" as const;
    return undefined;
  }, [currentSort]);

  // Fetch products (all or filtered by category / section)
  useEffect(() => {
    // Wait for category resolution if param is present
    if (categoryResolving) return;
    // Wait for section resolution if param is present
    if (sectionParam && !sectionReady) return;

    let cancelled = false;

    const fetchProducts = async () => {
      setIsLoading(true);
      try {
        // Determine effective sort: user-selected sort overrides section default
        const effectiveSort = serverSort ?? sectionSortBy ?? undefined;

        const result = await trpc.product.search.query({
          limit: isMinimal ? PRODUCTS_PER_PAGE : 100,
          offset: isMinimal ? (currentPage - 1) * PRODUCTS_PER_PAGE : 0,
          includeOutOfStock: true,
          categoryIds: listingKey ? listingKey.split(",") : undefined,
          search: isMinimal && searchQuery ? searchQuery : undefined,
          sortBy: isMinimal ? effectiveSort : undefined,
          productIds:
            sectionProductIds && sectionProductIds.length > 0
              ? sectionProductIds
              : undefined,
          discountedOnly: sectionDiscountedOnly || undefined,
        });

        if (cancelled) return;

        if (result.success && result.result) {
          const mapped: SortingPageProduct[] = result.result.items.map((p) => ({
            id: p.id,
            slug: p.slug,
            name: p.name,
            price: Number(p.price),
            discountPrice: p.discountPrice ? Number(p.discountPrice) : null,
            stock: p.stock,
            imageUrl: p.imageUrl ?? undefined,
            images: p.images,
            categoryName: p.categoryName || null,
            available: p.stock > 0,
          }));
          setProducts(mapped);
          setTotalProducts(result.result.total ?? mapped.length);
        }
      } catch (err) {
        console.error("Error fetching products:", err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchProducts();
    return () => {
      cancelled = true;
    };
  }, [
    categoryResolving,
    listingKey,
    isMinimal,
    currentPage,
    serverSort,
    searchQuery,
    sectionParam,
    sectionReady,
    sectionProductIds,
    sectionDiscountedOnly,
    sectionSortBy,
  ]);

  // Debounced search for minimal template
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(debouncedSearch);
      setCurrentPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [debouncedSearch]);

  const handleSortChange = useCallback((sort: string) => {
    setCurrentSort(sort);
    setCurrentPage(1);
  }, []);

  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  /* ── Minimal template path ────────────────────────────────────────── */
  if (isMinimal) {
    const totalPages = Math.ceil(totalProducts / PRODUCTS_PER_PAGE);
    return (
      <MinimalCategoryPage
        products={products as MinimalCategoryProduct[]}
        categoryName={categoryName}
        {...categoryNavProps(nav)}
        categoryId={categoryId}
        isLoading={isLoading}
        totalProducts={totalProducts}
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={handlePageChange}
        onSortChange={handleSortChange}
        onSearchChange={setDebouncedSearch}
        currentSort={currentSort}
        currentSearch={debouncedSearch}
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
        products={products}
        isLoading={isLoading}
        onSortChange={setSortOption}
        onOpenFilters={() => {}}
        defaultSort={sortOption}
      />
    </div>
  );
}
