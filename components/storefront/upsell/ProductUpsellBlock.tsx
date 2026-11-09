import { UpsellList } from "./UpsellList";
import type { UpsellProduct } from "./types";

/**
 * Compact upsell block under the product page's purchase controls.
 * Ported from Mach's `ProductUpsellBlock`.
 *
 * A short list rather than cards: it sits inside the purchase column, so it
 * must read as part of the buying decision, not as another shelf. Renders
 * nothing when the resolver returned nothing.
 */
export function ProductUpsellBlock({
  products,
  heading,
  className = "",
}: {
  products: UpsellProduct[];
  heading: string;
  className?: string;
}) {
  if (products.length === 0) return null;
  return (
    <section aria-label={heading} data-testid='product-upsell-block' className={className}>
      <h2 className='t-label text-ink'>{heading}</h2>
      <UpsellList products={products} className='mt-3' />
    </section>
  );
}
