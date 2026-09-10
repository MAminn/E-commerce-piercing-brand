import { PreviewHost } from "./PreviewHost";
import {
  mockHomepageContent,
  mockVendor,
  mockCategoryProducts,
  mockCartItems,
  mockCartTotals,
} from "./mockData";

// Import actual templates
import { HomeFeaturedProducts } from "#root/components/template-system/home/HomeFeaturedProducts";
import { ModernHomeTemplateV2 } from "#root/components/template-system/home/ModernHomeTemplateV2";
import { SearchResultsGrid } from "#root/components/template-system/searchResults/SearchResultsGrid";
import { SearchResultsMinimal } from "#root/components/template-system/searchResults/SearchResultsMinimal";
import { SortingMinimalTemplate } from "#root/components/template-system/sorting/SortingMinimalTemplate";
import { CartPageModernTemplate } from "#root/components/template-system/cartPage/CartPageModernTemplate";
import { CheckoutPageModernTemplate } from "#root/components/template-system/checkoutPage/CheckoutPageModernTemplate";

/**
 * Other template previews - REAL template rendering with mock data
 */

export function HomeFeaturedProductsPreview() {
  return (
    <PreviewHost>
      <HomeFeaturedProducts products={mockCategoryProducts} />
    </PreviewHost>
  );
}

export function ModernHomeTemplateV2Preview() {
  return (
    <PreviewHost>
      <ModernHomeTemplateV2 featuredProducts={mockCategoryProducts} />
    </PreviewHost>
  );
}

export function SearchResultsGridPreview() {
  return (
    <PreviewHost>
      <SearchResultsGrid
        searchQuery='sneakers'
        products={mockCategoryProducts}
        totalResults={mockCategoryProducts.length}
      />
    </PreviewHost>
  );
}

export function SearchResultsMinimalPreview() {
  return (
    <PreviewHost>
      <SearchResultsMinimal
        searchQuery='sneakers'
        products={mockCategoryProducts}
        totalResults={mockCategoryProducts.length}
      />
    </PreviewHost>
  );
}

export function SortingMinimalPreview() {
  return (
    <PreviewHost>
      <SortingMinimalTemplate products={mockCategoryProducts} />
    </PreviewHost>
  );
}

export function CartPageModernPreview() {
  // Convert mockCartItems to CartPageCartItem format
  const cartItems = mockCartItems.map((item) => ({
    id: item.id,
    name: item.name,
    price: item.price,
    quantity: item.quantity,
    imageUrl: item.imageUrl,
    variant: item.selectedOptions
      ? Object.entries(item.selectedOptions)
          .map(([k, v]) => `${k}: ${v}`)
          .join(", ")
      : null,
    stock: item.stock,
    available: true,
  }));

  return (
    <PreviewHost>
      <CartPageModernTemplate items={cartItems} totals={mockCartTotals} />
    </PreviewHost>
  );
}

export function CheckoutPageModernPreview() {
  const cartItems = mockCartItems.map((item) => ({
    id: item.id,
    name: item.name,
    price: item.price,
    quantity: item.quantity,
    imageUrl: item.imageUrl,
  }));

  return (
    <PreviewHost>
      <CheckoutPageModernTemplate items={cartItems} totals={mockCartTotals} />
    </PreviewHost>
  );
}
