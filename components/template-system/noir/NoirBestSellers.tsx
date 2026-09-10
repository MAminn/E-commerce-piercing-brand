import type { HomepageFeaturedProductsContent } from "#root/shared/types/homepage-content";
import { useMinimalI18n } from "#root/lib/i18n/MinimalI18nContext";
import { NoirProductSection } from "./NoirProductSection";
import type { NoirProduct } from "./ProductCardNoir";

interface NoirBestSellersProps {
  content: HomepageFeaturedProductsContent;
  products?: NoirProduct[];
  isLoading?: boolean;
}

/**
 * NoirBestSellers — featured products section: uppercase title with
 * red underline accent + 4-up ProductCardNoir grid (mobile snap scroll
 * for LTR, 2-col grid for RTL — see NoirProductSection). Fed by the
 * featured products data from the landing props contract.
 */
export function NoirBestSellers({
  content,
  products = [],
  isLoading = false,
}: NoirBestSellersProps) {
  const { locale } = useMinimalI18n();
  const isAr = locale === "ar";

  if (!content.enabled) return null;

  const title =
    (isAr && content.titleAr ? content.titleAr : content.title) ||
    (isAr ? "الأكثر مبيعاً" : "Best Sellers");
  const viewAllText =
    isAr && content.viewAllTextAr ? content.viewAllTextAr : content.viewAllText;

  return (
    <NoirProductSection
      title={title}
      viewAllText={viewAllText}
      viewAllLink={content.viewAllLink || "/shop"}
      products={products}
      isLoading={isLoading}
      headingVariant='centered'
    />
  );
}
