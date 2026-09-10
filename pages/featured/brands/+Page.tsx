import { useState, useEffect } from "react";
import { trpc } from "#root/shared/trpc/client";
import { getTemplateComponent } from "#root/components/template-system/templateConfig";
import { useTemplate } from "#root/frontend/contexts/TemplateContext";
import type { SortingPageProduct } from "#root/components/template-system/sorting/SortingMinimalTemplate";

export default function BrandsPage() {
  const [products, setProducts] = useState<SortingPageProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOption, setSortOption] = useState("featured");
  const { getTemplateId } = useTemplate();

  useEffect(() => {
    const fetchProducts = async () => {
      setIsLoading(true);
      try {
        const result = await trpc.product.search.query({
          limit: 100,
          includeOutOfStock: true,
        });

        if (result.success && result.result) {
          const mappedProducts: SortingPageProduct[] = result.result.items.map(
            (p) => ({
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
  }, []);

  const activeTemplateId = getTemplateId("sorting") ?? "sorting-minimal";
  const TemplateEntry = getTemplateComponent("sorting", activeTemplateId);

  if (!TemplateEntry) {
    return <div>Sorting template not found.</div>;
  }

  const Template = TemplateEntry.component;

  return (
    <Template
      products={products}
      isLoading={isLoading}
      onSearchChange={setSearchQuery}
      onSortChange={setSortOption}
      onOpenFilters={() => console.log("Filters clicked")}
      defaultSort={sortOption}
    />
  );
}
