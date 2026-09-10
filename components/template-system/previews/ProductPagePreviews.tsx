import { PreviewHost } from "./PreviewHost";
import { mockProduct, mockRelatedProducts } from "./mockData";

// Import actual product page templates
import { ProductPageClassic } from "#root/components/template-system/productPage/ProductPageClassic";
import { ProductPageEditorial } from "#root/components/template-system/productPage/ProductPageEditorial";
import { ProductPageTechnical } from "#root/components/template-system/productPage/ProductPageTechnical";
import { ProductPageMinimal } from "#root/components/template-system/productPage/ProductPageMinimal";
import { ProductPageModernSplit } from "#root/components/template-system/productPage/ProductPageModernSplit";
import { ProductPagePerce } from "#root/components/template-system/productPage/ProductPagePerce";

/**
 * Product page template previews - REAL template rendering with mock data
 */

export function ProductPageClassicPreview() {
  return (
    <PreviewHost>
      <ProductPageClassic
        product={mockProduct}
        relatedProducts={mockRelatedProducts}
      />
    </PreviewHost>
  );
}

export function ProductPageEditorialPreview() {
  return (
    <PreviewHost>
      <ProductPageEditorial
        product={mockProduct}
        relatedProducts={mockRelatedProducts}
      />
    </PreviewHost>
  );
}

export function ProductPageTechnicalPreview() {
  return (
    <PreviewHost>
      <ProductPageTechnical
        product={mockProduct}
        relatedProducts={mockRelatedProducts}
      />
    </PreviewHost>
  );
}

export function ProductPageMinimalPreview() {
  return (
    <PreviewHost>
      <ProductPageMinimal
        product={mockProduct}
        relatedProducts={mockRelatedProducts}
      />
    </PreviewHost>
  );
}

export function ProductPageModernSplitPreview() {
  return (
    <PreviewHost>
      <ProductPageModernSplit
        product={mockProduct}
        relatedProducts={mockRelatedProducts}
      />
    </PreviewHost>
  );
}

export function ProductPagePercePreview() {
  return (
    <PreviewHost>
      <ProductPagePerce
        product={mockProduct}
        relatedProducts={mockRelatedProducts}
      />
    </PreviewHost>
  );
}
