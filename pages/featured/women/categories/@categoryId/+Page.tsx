import { useState, useEffect } from "react";
import { ErrorSection } from "#root/components/dashboard/ErrorSection";
import { usePageContext } from "vike-react/usePageContext";
import { trpc } from "#root/shared/trpc/client";
import { getStoreOwnerId } from "#root/shared/config/store";
import { getTemplateComponent } from "#root/components/template-system/templateConfig";
import { useTemplate } from "#root/frontend/contexts/TemplateContext";
import type {
  CategoryPageProduct,
  SortOption,
  CategoryFilters,
} from "#root/components/template-system/categoryPage/CategoryPageGridWithFilters";
import type { CategoryContent } from "#root/shared/types/category-content";
import { DEFAULT_CATEGORY_CONTENT } from "#root/shared/types/category-content";

const Page = () => {
  const ctx = usePageContext();
  const categoryId = ctx.routeParams.categoryId;
  const { getTemplateId } = useTemplate();

  const [products, setProducts] = useState<CategoryPageProduct[]>([]);
  const [categoryContent, setCategoryContent] = useState<CategoryContent>(
    DEFAULT_CATEGORY_CONTENT
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!categoryId) {
      setError("Invalid category id");
      setIsLoading(false);
      return;
    }

    const fetchData = async () => {
      setIsLoading(true);
      try {
        // Fetch products and category content in parallel
        const [productsResult, contentResult] = await Promise.all([
          trpc.product.search.query({
            categoryIds: [categoryId],
            limit: 100,
            includeOutOfStock: true,
          }),
          trpc.category.getContent.query({
            merchantId: getStoreOwnerId(),
            categoryId: categoryId,
          }),
        ]);

        if (productsResult.success && productsResult.result) {
          const mappedProducts: CategoryPageProduct[] =
            productsResult.result.items.map((item) => ({
              id: item.id,
              slug: item.slug,
              name: item.name,
              price: Number(item.price),
              discountPrice: item.discountPrice
                ? Number(item.discountPrice)
                : null,
              stock: item.stock,
              imageUrl: item.imageUrl ?? undefined,
              images: item.images ?? [],
              categoryName: item.categoryName || null,
              available: item.stock > 0,
              brand: undefined,
            }));
          setProducts(mappedProducts);
        } else {
          setError("Failed to fetch products");
        }

        if (contentResult.success && contentResult.content) {
          setCategoryContent(contentResult.content);
        }
      } catch (err) {
        console.error("Error fetching data:", err);
        setError("Failed to load category");
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [categoryId]);

  if (!categoryId) {
    return <ErrorSection error='Invalid category id' />;
  }

  if (error && !isLoading) {
    return <ErrorSection error={error} />;
  }

  const activeTemplateId =
    getTemplateId("categoryPage") ?? "category-grid-with-filters";
  const TemplateEntry = getTemplateComponent("categoryPage", activeTemplateId);

  if (!TemplateEntry) {
    return <div>Category page template not found.</div>;
  }

  const Template = TemplateEntry.component;

  return (
    <Template
      content={categoryContent}
      products={products}
      totalProducts={products.length}
      currentPage={1}
      productsPerPage={100}
      onSortChange={(sort: SortOption) => console.log("Sort changed:", sort)}
      onFilterChange={(filters: CategoryFilters) =>
        console.log("Filters changed:", filters)
      }
      onClearFilters={() => console.log("Clear filters")}
      onPageChange={(page: number) => console.log("Page changed:", page)}
    />
  );
};

export default Page;
