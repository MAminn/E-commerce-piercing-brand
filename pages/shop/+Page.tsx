import { useState, useEffect, useMemo, useCallback } from "react";
import { trpc } from "#root/shared/trpc/client";
import { getTemplateComponent } from "#root/components/template-system/templateConfig";
import { useTemplate } from "#root/frontend/contexts/TemplateContext";
import { useLayoutSettings } from "#root/frontend/contexts/LayoutSettingsContext";
import type { SortingPageProduct } from "#root/components/template-system/sorting/SortingMinimalTemplate";
import { useSearchParams } from "#root/hooks/useSearchParams";
import {
  MinimalCategoryPage,
  PRODUCTS_PER_PAGE,
  type MinimalCategoryProduct,
} from "#root/components/template-system/minimal/MinimalCategoryPage";
import { getStoreOwnerId } from "#root/shared/config/store";
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
  const [categoryId, setCategoryId] = useState<string | undefined>(undefined);
  const [categoryName, setCategoryName] = useState<string | undefined>(
    undefined,
  );

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

  // Resolve category slug/id when present
  useEffect(() => {
    if (!categoryParam) {
      setCategoryId(undefined);
      setCategoryName(undefined);
      return;
    }

    // Reset to prevent stale categoryId from blocking the fetch guard
    // until the new categoryParam resolves
    setCategoryId(undefined);
    setCategoryName(undefined);
    setCurrentPage(1);

    let cancelled = false;

    const resolve = async () => {
      try {
        const result = await trpc.category.view.query();
        if (cancelled) return;
        if (result.success && result.result) {
          const match = result.result.find(
            (cat: { slug?: string; id: string; name: string }) =>
              cat.slug === categoryParam || cat.id === categoryParam,
          );
          if (match) {
            setCategoryId(match.id);
            setCategoryName(match.name);
          }
        }
      } catch (err) {
        console.error("Error resolving category:", err);
      }
    };

    resolve();
    return () => {
      cancelled = true;
    };
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
          templateId: getTemplateId("landing") || "landing-minimal",
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
    if (categoryParam && !categoryId) return;
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
          categoryIds: categoryId ? [categoryId] : undefined,
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
    categoryParam,
    categoryId,
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
  const activeTemplateId = getTemplateId("sorting") ?? "sorting-minimal";
  const TemplateEntry = getTemplateComponent("sorting", activeTemplateId);

  if (!TemplateEntry) {
    return <div>Sorting template not found.</div>;
  }

  const Template = TemplateEntry.component;

  return (
    <div>
      {/* Breadcrumb when filtering by category */}
      {categoryName && (
        <div
          data-shop-breadcrumb
          className='container mx-auto px-4 sm:px-6 lg:px-8 pt-6'>
          <div className='flex items-center gap-2 text-sm text-stone-600 mb-4'>
            <a href='/shop' className='hover:text-stone-900 transition-colors'>
              All Products
            </a>
            <span>/</span>
            <span className='text-stone-900 font-medium'>{categoryName}</span>
          </div>
        </div>
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
