import { cn } from "#root/lib/utils";
import { useMinimalI18n } from "#root/lib/i18n/MinimalI18nContext";
import { getProductUrl } from "#root/lib/utils/route-helpers";
import { productPlacement } from "#root/shared/categories/placements";
import { useStorefrontCategories } from "#root/hooks/useStorefrontCategories";
import { buttonClass } from "./Button";
import { IndexLine, indexFields } from "./IndexLine";

export interface FeaturedObjectProduct {
  id: string;
  slug?: string | null;
  name: string;
  price: number;
  discountPrice?: number | string | null;
  catalogueNo?: number | null;
  imageUrl?: string | null;
  images?: { url: string; isPrimary?: boolean }[];
  categoryName?: string | null;
  categories?: { id: string; name: string }[];
}

function resolveImageUrl(url?: string | null): string | null {
  if (!url) return null;
  if (url.startsWith("http") || url.startsWith("/")) return url;
  return `/uploads/${url}`;
}

/** The price paid: the discount price when it is real, else the price. */
function paidPrice(p: Pick<FeaturedObjectProduct, "price" | "discountPrice">): number {
  const d = p.discountPrice === null || p.discountPrice === undefined || p.discountPrice === "" ? Number.NaN : Number(p.discountPrice);
  return Number.isFinite(d) && d < p.price ? d : p.price;
}

/**
 * One object, large — the homepage's featured piece, and what a module with
 * a single product becomes instead of one card alone in a four-column grid.
 *
 * From 1024px the photograph takes 7/12 and the index 5/12; below, the
 * photograph runs full width with the index under it. The index is the
 * piece's name and its full index line (catalogue number, measures,
 * placement, price — each only when the product has it), then "View piece".
 */
export function FeaturedObject({
  product,
  headingAs: Heading = "h2",
  className,
}: {
  product: FeaturedObjectProduct;
  headingAs?: "h2" | "h3";
  className?: string;
}) {
  const { t, locale } = useMinimalI18n();
  const { categories } = useStorefrontCategories();
  const href = getProductUrl(product);
  const primary = product.images?.find((i) => i.isPrimary) ?? product.images?.[0];
  const image = resolveImageUrl(primary?.url ?? product.imageUrl);
  const { title } = indexFields(product);
  const placement = productPlacement(product, categories);

  return (
    <article
      data-featured-object
      className={cn("grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-end lg:gap-6", className)}>
      {/* The photo repeats the heading's link for pointer users (same href,
          out of the tab order), as on the product card. */}
      <a
        href={href}
        tabIndex={-1}
        className='-mx-[var(--perce-gutter)] block aspect-[4/5] overflow-hidden bg-surface-2 md:mx-0 lg:col-span-7'>
        {image && (
          <img
            src={image}
            alt={product.name}
            loading='lazy'
            decoding='async'
            className='h-full w-full object-cover transition-transform duration-[var(--perce-duration-slow)] ease-out motion-reduce:transition-none lg:hover:scale-[1.02]'
          />
        )}
      </a>
      <div className='lg:col-span-5 lg:pb-2'>
        <Heading className='t-h2 text-ink'>
          <a href={href} className='hover:underline hover:decoration-1 hover:underline-offset-4'>
            {title}
          </a>
        </Heading>
        <IndexLine
          variant='full'
          showPrice
          locale={locale}
          className='mt-3'
          product={{ name: product.name, catalogueNo: product.catalogueNo, price: paidPrice(product), placement }}
        />
        <a href={href} className={buttonClass({ variant: "text", size: "md", className: "mt-6" })}>
          {t("home.view_piece")}
        </a>
      </div>
    </article>
  );
}
