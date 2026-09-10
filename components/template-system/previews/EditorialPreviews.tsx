import { PreviewHost } from "./PreviewHost";
import {
  mockHomepageContent,
  mockCategoryProducts,
  mockProduct,
  mockRelatedProducts,
  mockCartItems,
  mockCartTotals,
} from "./mockData";

/* ---- Template imports ---- */
import { LandingTemplateEditorial } from "#root/components/template-system/landing/LandingTemplateEditorial";
import { ProductPageEditorial } from "#root/components/template-system/productPage/ProductPageEditorial";
import { SortingEditorialTemplate } from "#root/components/template-system/sorting/SortingEditorialTemplate";
import { CartPageEditorialTemplate } from "#root/components/template-system/cartPage/CartPageEditorialTemplate";
import { CheckoutPageEditorialTemplate } from "#root/components/template-system/checkoutPage/CheckoutPageEditorialTemplate";
import { SearchResultsEditorial } from "#root/components/template-system/searchResults/SearchResultsEditorial";

/**
 * Editorial template family previews — each wraps the real template
 * inside a PreviewHost ErrorBoundary with mock data.
 */

export function SortingEditorialPreview() {
  return (
    <PreviewHost>
      <SortingEditorialTemplate products={mockCategoryProducts} />
    </PreviewHost>
  );
}

export function CartPageEditorialPreview() {
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
      <CartPageEditorialTemplate items={cartItems} totals={mockCartTotals} />
    </PreviewHost>
  );
}

export function CheckoutPageEditorialPreview() {
  const orderItems = mockCartItems.map((item) => ({
    id: item.id,
    name: item.name,
    price: item.price,
    quantity: item.quantity,
  }));

  return (
    <PreviewHost>
      <CheckoutPageEditorialTemplate
        items={orderItems}
        totals={mockCartTotals}
      />
    </PreviewHost>
  );
}

export function SearchResultsEditorialPreview() {
  return (
    <PreviewHost>
      <SearchResultsEditorial
        searchQuery="sneakers"
        products={mockCategoryProducts}
        totalResults={mockCategoryProducts.length}
      />
    </PreviewHost>
  );
}
