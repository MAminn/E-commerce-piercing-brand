import { PreviewHost } from "./PreviewHost";
import { mockCategoryProducts, mockCategories } from "./mockData";

// Import actual category page templates
import { CategoryGridClassic } from "#root/components/template-system/categoryPage/CategoryGridClassic";
import { CategoryHeroSplit } from "#root/components/template-system/categoryPage/CategoryHeroSplit";
import { CategoryMinimal } from "#root/components/template-system/categoryPage/CategoryMinimal";
import { CategoryShowcase } from "#root/components/template-system/categoryPage/CategoryShowcase";
import { CategoryPageGridWithFilters } from "#root/components/template-system/categoryPage/CategoryPageGridWithFilters";

/**
 * Category page template previews - REAL template rendering with mock data
 */

const mockCategoryData = {
  id: "cat-clothing",
  name: "Clothing",
  displayName: "Clothing & Apparel",
  slug: "clothing",
  description: "Discover our curated collection of premium clothing",
  heroImage: "/placeholder-category-hero.jpg",
};

export function CategoryGridClassicPreview() {
  return (
    <PreviewHost>
      <CategoryGridClassic products={mockCategoryProducts} />
    </PreviewHost>
  );
}

export function CategoryHeroSplitPreview() {
  return (
    <PreviewHost>
      <CategoryHeroSplit products={mockCategoryProducts} />
    </PreviewHost>
  );
}

export function CategoryMinimalPreview() {
  return (
    <PreviewHost>
      <CategoryMinimal products={mockCategoryProducts} />
    </PreviewHost>
  );
}

export function CategoryShowcasePreview() {
  return (
    <PreviewHost>
      <CategoryShowcase products={mockCategoryProducts} />
    </PreviewHost>
  );
}

export function CategoryGridWithFiltersPreview() {
  return (
    <PreviewHost>
      <CategoryPageGridWithFilters products={mockCategoryProducts} />
    </PreviewHost>
  );
}
