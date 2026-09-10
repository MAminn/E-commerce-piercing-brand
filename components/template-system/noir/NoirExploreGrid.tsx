import type {
  HomepageDiscountedProductsContent,
  HomepageNewArrivalsContent,
} from "#root/shared/types/homepage-content";
import { useMinimalI18n } from "#root/lib/i18n/MinimalI18nContext";
import { NoirProductSection } from "./NoirProductSection";
import type { NoirProduct } from "./ProductCardNoir";

interface NoirExploreGridProps {
  newArrivalsContent?: HomepageNewArrivalsContent;
  newArrivals?: NoirProduct[];
  newArrivalsLoading?: boolean;
  discountedContent?: HomepageDiscountedProductsContent;
  discountedProducts?: NoirProduct[];
}

/**
 * NoirExploreGrid — second products section. Prefers the CMS
 * new-arrivals section (when enabled with data); falls back to the
 * discounted-products section (when enabled with data). Uses the same
 * enable flags the CMS content carries. Renders nothing when neither
 * is available.
 */
export function NoirExploreGrid({
  newArrivalsContent,
  newArrivals = [],
  newArrivalsLoading = false,
  discountedContent,
  discountedProducts = [],
}: NoirExploreGridProps) {
  const { locale } = useMinimalI18n();
  const isAr = locale === "ar";

  const showNewArrivals =
    newArrivalsContent?.enabled &&
    (newArrivals.length > 0 || newArrivalsLoading);
  const showDiscounted =
    !showNewArrivals &&
    discountedContent?.enabled &&
    discountedProducts.length > 0;

  if (showNewArrivals && newArrivalsContent) {
    const title =
      (isAr && newArrivalsContent.titleAr
        ? newArrivalsContent.titleAr
        : newArrivalsContent.title) || (isAr ? "وصل حديثاً" : "New Arrivals");
    return (
      <NoirProductSection
        title={title}
        viewAllText={
          isAr && newArrivalsContent.viewAllTextAr
            ? newArrivalsContent.viewAllTextAr
            : newArrivalsContent.viewAllText
        }
        viewAllLink={newArrivalsContent.viewAllLink || "/shop"}
        products={newArrivals}
        isLoading={newArrivalsLoading}
      />
    );
  }

  if (showDiscounted && discountedContent) {
    const title =
      (isAr && discountedContent.titleAr
        ? discountedContent.titleAr
        : discountedContent.title) || (isAr ? "عروض" : "On Sale");
    return (
      <NoirProductSection
        title={title}
        viewAllText={
          isAr && discountedContent.viewAllTextAr
            ? discountedContent.viewAllTextAr
            : discountedContent.viewAllText
        }
        viewAllLink={discountedContent.viewAllLink || "/shop"}
        products={discountedProducts}
      />
    );
  }

  return null;
}
