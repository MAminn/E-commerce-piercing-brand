/**
 * Template System
 *
 * Central export point for the template system.
 * Provides access to all template components, configurations, and utilities.
 */

// Export template configuration and helpers
export {
  templateConfig,
  getTemplateComponent,
  getTemplatesByCategory,
  templateExists,
  getTemplateIds,
} from "./templateConfig";

export type {
  TemplateCategory,
  TemplateEntry,
  TemplateConfig,
} from "./templateConfig";

// Export home components
export { HomeFeaturedProducts } from "./home/HomeFeaturedProducts";
export type {
  HomeFeaturedProductsProps,
  FeaturedProduct,
} from "./home/HomeFeaturedProducts";

export { ModernHomeTemplateV2 } from "./home/ModernHomeTemplateV2";
export type {
  ModernHomeTemplateV2Props,
  CategoryItem,
  FeatureItem,
} from "./home/ModernHomeTemplateV2";

// Export landing components
export { LandingTemplateModern } from "./landing/LandingTemplateModern";
export type { LandingTemplateModernProps } from "./landing/LandingTemplateModern";

export { LandingTemplateClassic } from "./landing/LandingTemplateClassic";
export type { LandingTemplateClassicProps } from "./landing/LandingTemplateClassic";

export { LandingTemplateEditorial } from "./landing/LandingTemplateEditorial";
export type { LandingTemplateEditorialProps } from "./landing/LandingTemplateEditorial";

export { LandingTemplateMinimal } from "./landing/LandingTemplateMinimal";
export type { LandingTemplateMinimalProps } from "./landing/LandingTemplateMinimal";

// Export product page components
export { ProductPageModernSplit } from "./productPage/ProductPageModernSplit";
export type {
  ProductPageModernSplitProps,
  ProductPageProduct,
  ProductImage,
  ProductFeature,
  ProductSpecification,
} from "./productPage/ProductPageModernSplit";

export { ProductPageClassic } from "./productPage/ProductPageClassic";
export type { ProductPageClassicProps } from "./productPage/ProductPageClassic";

export { ProductPageEditorial } from "./productPage/ProductPageEditorial";
export type { ProductPageEditorialProps } from "./productPage/ProductPageEditorial";

export { ProductPageTechnical } from "./productPage/ProductPageTechnical";
export type { ProductPageTechnicalProps } from "./productPage/ProductPageTechnical";

export { ProductPageMinimal } from "./productPage/ProductPageMinimal";
export type { ProductPageMinimalProps } from "./productPage/ProductPageMinimal";

// Export category page components
export { CategoryPageGridWithFilters } from "./categoryPage/CategoryPageGridWithFilters";
export type {
  CategoryPageGridWithFiltersProps,
  CategoryPageProduct,
  CategoryFilters,
  SortOption,
} from "./categoryPage/CategoryPageGridWithFilters";

export { CategoryGridClassic } from "./categoryPage/CategoryGridClassic";
export type { CategoryGridClassicProps } from "./categoryPage/CategoryGridClassic";

export { CategoryHeroSplit } from "./categoryPage/CategoryHeroSplit";
export type { CategoryHeroSplitProps } from "./categoryPage/CategoryHeroSplit";

export { CategoryMinimal } from "./categoryPage/CategoryMinimal";
export type { CategoryMinimalProps } from "./categoryPage/CategoryMinimal";

export { CategoryShowcase } from "./categoryPage/CategoryShowcase";
export type { CategoryShowcaseProps } from "./categoryPage/CategoryShowcase";

// Export sorting components
export { SortingMinimalTemplate } from "./sorting/SortingMinimalTemplate";
export type {
  SortingMinimalTemplateProps,
  SortingPageProduct,
} from "./sorting/SortingMinimalTemplate";

// Export cart page components
export { CartPageModernTemplate } from "./cartPage/CartPageModernTemplate";
export type {
  CartPageModernTemplateProps,
  CartPageCartItem,
  CartPageTotals,
} from "./cartPage/CartPageModernTemplate";

// Export checkout page components
export { CheckoutPageModernTemplate } from "./checkoutPage/CheckoutPageModernTemplate";
export type {
  CheckoutPageModernTemplateProps,
  CheckoutCustomerInfo,
  CheckoutAddress,
  CheckoutOrderSummaryItem,
  CheckoutTotals,
  PaymentMethodOption,
} from "./checkoutPage/CheckoutPageModernTemplate";

// Export search results components
export { SearchResultsGrid, SearchResultsMinimal } from "./searchResults";
export type {
  SearchResultsGridProps,
  SearchResultsMinimalProps,
  SearchResultProduct,
} from "./searchResults";
