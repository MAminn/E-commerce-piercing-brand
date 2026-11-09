import type { FeaturedProduct } from "#root/components/template-system/home/HomeFeaturedProducts";
import type { UpsellSource } from "#root/shared/upsell/select";

/**
 * One recommended product as `upsell.forProduct` returns it: Percé's
 * `FeaturedProduct` (so it can be drawn by any Percé product surface) plus the
 * resolver's `variantCount`. `requiresOptions` is set from the same count.
 */
export type UpsellProduct = FeaturedProduct & {
  /** Option groups the product carries; > 0 means it needs a selection first. */
  variantCount?: number;
};

/**
 * One product page's upsell answer, as resolved by the server
 * (`upsell.forProduct`). Both the product-page block and the post-add sheet
 * draw from this one object — neither surface decides eligibility itself.
 */
export interface ProductUpsells {
  /** Server-ordered pool; may hold more than `limit` as replacements. */
  items: UpsellProduct[];
  /** How many each surface shows. */
  limit: number;
  productPage: boolean;
  postAdd: boolean;
  source: UpsellSource;
}

/** What the post-add sheet repeats back about the product just added. */
export interface PostAddMainItem {
  id: string;
  name: string;
  /** Unit price actually charged (option modifiers included). */
  price: number;
  quantity: number;
  imageUrl?: string | null;
  selectedOptions?: Record<string, string>;
}
