import { useState, useEffect } from "react";
import { trpc } from "#root/shared/trpc/client";
import { getTemplateComponent } from "#root/components/template-system/templateConfig";
import { useTemplate } from "#root/frontend/contexts/TemplateContext";
import type { SortingPageProduct } from "#root/components/template-system/sorting/SortingMinimalTemplate";
import { useSearchParams } from "#root/hooks/useSearchParams";

const Page = () => {
  const [products, setProducts] = useState<SortingPageProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOption, setSortOption] = useState("featured");
  const { getTemplateId } = useTemplate();
  const searchParams = useSearchParams();

  // Get category from URL params (supports both slug and id)
  const categoryParam = searchParams.get("category");
  const [categoryId, setCategoryId] = useState<string | undefined>(undefined);
  const [categoryName, setCategoryName] = useState<string | undefined>(
    undefined,
  );

  // Resolve category slug to ID if needed
  useEffect(() => {
    if (!categoryParam) {
      setCategoryId(undefined);
      setCategoryName(undefined);
      return;
    }

    const fetchCategoryId = async () => {
      try {
        const result = await trpc.category.view.query();
        if (result.success && result.result) {
          const category = result.result.find(
            (cat: any) =>
              cat.slug === categoryParam || cat.id === categoryParam,
          );
          if (category) {
            setCategoryId(category.id);
            setCategoryName(category.name);
          }
        }
      } catch (err) {
        console.error("Error fetching category:", err);
      }
    };

    fetchCategoryId();
  }, [categoryParam]);

  useEffect(() => {
    const fetchProducts = async () => {
      setIsLoading(true);
      try {
        const result = await trpc.product.search.query({
          limit: 100,
          includeOutOfStock: true,
          categoryIds: categoryId ? [categoryId] : undefined,
        });

        if (result.success && result.result) {
          const resolveImagePath = (
            url: string | null | undefined,
          ): string | undefined => {
            if (!url) return undefined;
            if (
              url.startsWith("http") ||
              url.startsWith("/uploads/") ||
              url.startsWith("/assets/")
            )
              return url;
            return `/uploads/${url}`;
          };

          const mappedProducts: SortingPageProduct[] = result.result.items.map(
            (p) => ({
              id: p.id,
              slug: p.slug,
              name: p.name,
              price: Number(p.price),
              discountPrice: p.discountPrice ? Number(p.discountPrice) : null,
              stock: p.stock,
              imageUrl: resolveImagePath(p.imageUrl),
              images: p.images?.map((img) => ({
                ...img,
                url: resolveImagePath(img.url) ?? img.url,
              })),
              categoryName: p.categoryName || null,
              available: p.stock > 0,
            }),
          );
          setProducts(mappedProducts);
        }
      } catch (err) {
        console.error("Error fetching products:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchProducts();
  }, [categoryId]);

  const activeTemplateId = getTemplateId("sorting") ?? "sorting-minimal";
  const TemplateEntry = getTemplateComponent("sorting", activeTemplateId);

  if (!TemplateEntry) {
    return <div>Sorting template not found.</div>;
  }

  const Template = TemplateEntry.component;

  return (
    <div>
      {categoryName && (
        <div className='container mx-auto px-4 sm:px-6 lg:px-8 pt-6'>
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
        onSearchChange={setSearchQuery}
        onSortChange={setSortOption}
        onOpenFilters={() => console.log("Filters clicked")}
        defaultSort={sortOption}
      />
    </div>
  );
};

export default Page;
