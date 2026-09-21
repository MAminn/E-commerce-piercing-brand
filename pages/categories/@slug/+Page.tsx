import { useState, useEffect, useMemo, useCallback } from "react";
import { usePageContext } from "vike-react/usePageContext";
import { trpc } from "#root/shared/trpc/client";
import { getTemplateComponent } from "#root/components/template-system/templateConfig";
import { resolveTemplateId } from "#root/shared/config/storefront";
import { useTemplate } from "#root/frontend/contexts/TemplateContext";
import { useLayoutSettings } from "#root/frontend/contexts/LayoutSettingsContext";
import type { SortingPageProduct } from "#root/components/template-system/sorting/SortingMinimalTemplate";
import {
  MinimalCategoryPage,
  PRODUCTS_PER_PAGE,
  type MinimalCategoryProduct,
} from "#root/components/template-system/minimal/MinimalCategoryPage";

/**
 * /categories/@slug – Generic dynamic category page.
 *
 * Resolves a category by its slug, fetches products belonging to that category,
 * and renders the active sorting template.
 * When the store uses the minimal navbar, renders the dedicated MinimalCategoryPage
 * with paginated grid (3 rows × 4 cols) and translated breadcrumbs / controls.
 */
export default function CategoryPage() {
  const pageContext = usePageContext();
  const slug = pageContext.routeParams?.slug as string;
  const { getTemplateId } = useTemplate();
  const layoutSettings = useLayoutSettings();

  const isMinimal = layoutSettings.header.navbarStyle === "minimal";

  const [products, setProducts] = useState<SortingPageProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [categoryName, setCategoryName] = useState<string | undefined>(
    undefined,
  );
  const [categoryId, setCategoryId] = useState<string | undefined>(undefined);
  const [notFound, setNotFound] = useState(false);

  // Minimal-specific state
  const [currentPage, setCurrentPage] = useState(1);
  const [currentSort, setCurrentSort] = useState("featured");
  const [searchQuery, setSearchQuery] = useState("");
  const [totalProducts, setTotalProducts] = useState(0);

  // Resolve category slug → id + name
  useEffect(() => {
    if (!slug) return;

    let cancelled = false;

    const resolve = async () => {
      try {
        const result = await trpc.category.view.query();
        if (cancelled) return;

        if (result.success && result.result) {
          const match = result.result.find(
            (cat: { slug?: string; id: string; name: string }) =>
              cat.slug === slug,
          );
          if (match) {
            setCategoryId(match.id);
            setCategoryName(match.name);
            setNotFound(false);
          } else {
            setNotFound(true);
            setIsLoading(false);
          }
        }
      } catch (err) {
        console.error("Error resolving category:", err);
        setNotFound(true);
        setIsLoading(false);
      }
    };

    resolve();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  // Map sort value → server-side sortBy param
  const serverSort = useMemo(() => {
    if (currentSort === "price-asc") return "price-asc" as const;
    if (currentSort === "price-desc") return "price-desc" as const;
    if (currentSort === "newest") return "newest" as const;
    return undefined;
  }, [currentSort]);

  // Fetch products for resolved category
  useEffect(() => {
    if (!categoryId) return;

    let cancelled = false;

    const fetchProducts = async () => {
      setIsLoading(true);
      try {
        const result = await trpc.product.search.query({
          categoryIds: [categoryId],
          limit: isMinimal ? PRODUCTS_PER_PAGE : 100,
          offset: isMinimal ? (currentPage - 1) * PRODUCTS_PER_PAGE : 0,
          includeOutOfStock: true,
          search: isMinimal && searchQuery ? searchQuery : undefined,
          sortBy: isMinimal ? serverSort : undefined,
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
        console.error("Error fetching category products:", err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchProducts();
    return () => {
      cancelled = true;
    };
  }, [categoryId, isMinimal, currentPage, serverSort, searchQuery]);

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
    const totalPages = Math.ceil(totalProducts / PRODUCTS_PER_PAGE);
    return (
      <MinimalCategoryPage
        products={products as MinimalCategoryProduct[]}
        categoryName={categoryName}
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
            <span aria-current='page' className='truncate text-perce-ink'>
              {categoryName}
            </span>
          </div>
        </nav>
      )}
      <Template
        products={products}
        isLoading={isLoading}
        onSortChange={() => {}}
        onOpenFilters={() => {}}
        defaultSort='featured'
      />
    </div>
  );
}
