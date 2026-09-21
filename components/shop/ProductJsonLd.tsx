import { STORE_CURRENCY, STORE_NAME } from "#root/shared/config/branding";
import { getPublicOrigin, toAbsoluteUrl } from "#root/shared/config/site-url";
import { getProductUrl } from "#root/lib/utils/route-helpers";

export interface ProductJsonLdProduct {
  id: string;
  slug?: string | null;
  name: string;
  description?: string | null;
  price: number;
  discountPrice?: number | string | null;
  stock?: number;
  imageUrl?: string;
  images?: Array<{ url: string }>;
}

function resolveImage(url: string | undefined): string | undefined {
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url)) return url;
  return toAbsoluteUrl(url.startsWith("/") ? url : `/uploads/${url}`);
}

/**
 * schema.org Product structured data for a product page.
 *
 * Price is the amount the shopper actually pays (the discount price when one
 * is live) and the currency is always the store currency — EGP. No brand
 * material, weight or rating fields are emitted: none of those are verified
 * for public claims, and structured data is a claim.
 */
export function ProductJsonLd({ product }: { product: ProductJsonLdProduct }) {
  const origin = getPublicOrigin();
  const discount =
    product.discountPrice == null || product.discountPrice === ""
      ? null
      : Number(product.discountPrice);
  const hasDiscount = discount != null && Number.isFinite(discount) && discount < product.price;
  const price = hasDiscount ? (discount as number) : product.price;
  const images = (
    product.images && product.images.length > 0
      ? product.images.map((i) => i.url)
      : [product.imageUrl]
  )
    .map((u) => resolveImage(u ?? undefined))
    .filter((u): u is string => Boolean(u));
  const inStock = (product.stock ?? 0) > 0;

  const data = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    ...(product.description ? { description: product.description } : {}),
    ...(images.length > 0 ? { image: images } : {}),
    url: `${origin}${getProductUrl(product)}`,
    brand: { "@type": "Brand", name: STORE_NAME },
    offers: {
      "@type": "Offer",
      url: `${origin}${getProductUrl(product)}`,
      priceCurrency: STORE_CURRENCY,
      price: Number(price.toFixed(2)),
      availability: inStock
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      seller: { "@type": "Organization", name: STORE_NAME },
    },
  };

  return (
    <script
      type='application/ld+json'
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
