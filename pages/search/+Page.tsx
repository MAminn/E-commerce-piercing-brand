"use client";

import { useEffect, useState, useCallback } from "react";
import { trpc } from "#root/shared/trpc/client";
import { useTemplate } from "#root/frontend/contexts/TemplateContext";
import { getTemplateComponent } from "#root/components/template-system/templateConfig";
import type { SearchResultProduct } from "#root/components/template-system";
import { navigate } from "vike/client/router";
import { Loader2 } from "lucide-react";

const PAGE_SIZE = 12;

export default function SearchPage() {
  const searchParams =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search)
      : null;
  const queryParam = searchParams?.get("q") ?? "";

  const [searchTerm, setSearchTerm] = useState(queryParam);
  const [products, setProducts] = useState<SearchResultProduct[]>([]);
  const [totalResults, setTotalResults] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortBy, setSortBy] = useState("newest");
  const [isLoading, setIsLoading] = useState(false);
  const { getTemplateId } = useTemplate();

  const fetchResults = useCallback(
    async (query: string, page: number, sort: string) => {
      if (!query.trim()) {
        setProducts([]);
        setTotalResults(0);
        return;
      }

      setIsLoading(true);
      try {
        const res = await trpc.product.search.query({
          search: query.trim(),
          limit: PAGE_SIZE,
          offset: (page - 1) * PAGE_SIZE,
          sortBy: sort as "newest" | "price-asc" | "price-desc",
        });

        if (res.success && res.result) {
          const mapped: SearchResultProduct[] = (res.result.items ?? []).map(
            (p: any) => ({
              id: p.id,
              slug: p.slug,
              name: p.name,
              price: typeof p.price === "string" ? Number.parseFloat(p.price) : p.price,
              discountPrice: p.discountPrice
                ? typeof p.discountPrice === "string"
                  ? Number.parseFloat(p.discountPrice)
                  : p.discountPrice
                : undefined,
              stock: p.stock ?? 0,
              imageUrl: p.imageUrl ?? p.images?.[0] ?? undefined,
              categoryName: p.categoryName ?? p.categories?.[0]?.name ?? undefined,
              available: p.available ?? (p.stock ?? 0) > 0,
            }),
          );
          setProducts(mapped);
          setTotalResults(res.result.total ?? 0);
        }
      } catch (err) {
        console.error("[Search] Failed:", err);
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  // Fetch on mount and when query/page/sort changes
  useEffect(() => {
    fetchResults(queryParam, currentPage, sortBy);
  }, [queryParam, currentPage, sortBy, fetchResults]);

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
  };

  const handleSearchSubmit = () => {
    if (searchTerm.trim()) {
      setCurrentPage(1);
      navigate(`/search?q=${encodeURIComponent(searchTerm.trim())}`);
    }
  };

  const handleSortChange = (value: string) => {
    setSortBy(value);
    setCurrentPage(1);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const totalPages = Math.ceil(totalResults / PAGE_SIZE);

  // Get template component
  const templateId = getTemplateId("searchResults");
  const Template = getTemplateComponent(
    "searchResults",
    templateId || "search-results-grid",
  );

  if (!Template) {
    return <div className="p-8">Search template not found</div>;
  }

  return (
    <div className="min-h-screen bg-white pt-8 md:pt-12">
      <Template.component
        searchQuery={queryParam}
        products={products}
        totalResults={totalResults}
        isLoading={isLoading}
        searchTerm={searchTerm}
        onSearchChange={handleSearchChange}
        sortBy={sortBy}
        onSortChange={handleSortChange}
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={handlePageChange}
      />
    </div>
  );
}
