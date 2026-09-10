import { PreviewHost } from "../previews/PreviewHost";
import {
  mockCategoryProducts,
  mockProduct,
  mockRelatedProducts,
} from "../previews/mockData";
import { ProductPageNoir } from "./ProductPageNoir";
import { SortingNoirTemplate } from "./SortingNoirTemplate";
import type { ProductPageProduct } from "../productPage/ProductPageModernSplit";
import type { SortingPageProduct } from "../sorting/SortingMinimalTemplate";

/**
 * Admin previews for the Noir product/sorting templates — real
 * template renders with mock data (LandingNoirPreview pattern).
 * previewMode keeps the <html data-noir-chrome> side effect off
 * inside the dashboard.
 */

export function ProductPageNoirPreview() {
  return (
    <PreviewHost>
      <ProductPageNoir
        product={mockProduct as ProductPageProduct}
        relatedProducts={mockRelatedProducts}
        previewMode
      />
    </PreviewHost>
  );
}

export function SortingNoirPreview() {
  return (
    <PreviewHost>
      <SortingNoirTemplate
        products={mockCategoryProducts as SortingPageProduct[]}
        previewMode
      />
    </PreviewHost>
  );
}
