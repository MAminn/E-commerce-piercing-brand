import { useState, useMemo, useCallback, useRef } from "react";
import { Eye, Heart, ShoppingBag } from "lucide-react";
import { Link } from "#root/components/utils/Link";
import { useCart } from "#root/lib/context/CartContext";
import { useTracking } from "#root/frontend/contexts/TrackingContext";
import { trackAddToCartEvent } from "#root/frontend/tracking/add-to-cart-event";
import { useWishlist } from "#root/lib/hooks/useWishlist";
import { useMinimalI18n } from "#root/lib/i18n/MinimalI18nContext";
import { getProductUrl } from "#root/lib/utils/route-helpers";
import { cn } from "#root/lib/utils";
import { showCartToast, flyToCart } from "#root/components/ui/cart-toast";
import { formatMoney } from "#root/shared/pricing/format-money";

interface ProductImage {
  url: string;
  isPrimary?: boolean;
}

export interface MinimalProduct {
  id: string;
  slug?: string | null;
  name: string;
  price: number;
  discountPrice?: number | string | null;
  stock: number;
  imageUrl?: string | null;
  images?: ProductImage[];
  available: boolean;
  categoryName?: string | null;
  categories?: { id: string; name: string }[];
  description?: string | null;
  isNew?: boolean;
  tag?: string;
}

interface MinimalProductCardProps {
  product: MinimalProduct;
  onQuickView?: (product: MinimalProduct) => void;
  className?: string;
}

function resolveImageUrl(url?: string | null): string {
  if (!url) return "/assets/placeholder-product.png";
  if (url.startsWith("http") || url.startsWith("/")) return url;
  return `/uploads/${url}`;
}

export function MinimalProductCard({
  product,
  onQuickView,
  className,
}: MinimalProductCardProps) {
  const { addItem } = useCart();
  const { trackEvent } = useTracking();
  const { toggle, isWishlisted } = useWishlist();
  const { t, locale } = useMinimalI18n();
  const [isAdding, setIsAdding] = useState(false);
  // Starts false and flips on load, which fades the image in. A browser that
  // serves the image from cache can finish decoding before React attaches the
  // handler, so `onLoad` never fires and the card renders a permanently
  // invisible product. The ref callback below re-checks `complete` to cover
  // that case.
  const [imageLoaded, setImageLoaded] = useState(false);
  const cardImageRef = useRef<HTMLImageElement>(null);
  const addToCartBtnRef = useRef<HTMLButtonElement>(null);

  const displayImageUrl = useMemo(() => {
    if (product.images && product.images.length > 0) {
      const primary = product.images.find((img) => img.isPrimary);
      return resolveImageUrl((primary || product.images[0])?.url);
    }
    return resolveImageUrl(product.imageUrl);
  }, [product.images, product.imageUrl]);

  const hasDiscount =
    product.discountPrice !== undefined &&
    product.discountPrice !== null &&
    product.discountPrice !== "" &&
    Number(product.discountPrice) < product.price;

  const displayPrice = hasDiscount ? Number(product.discountPrice) : product.price;
  const originalPrice = hasDiscount ? product.price : null;

  const handleAddToCart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!product.available) return;
      setIsAdding(true);
      try {
        flyToCart(addToCartBtnRef.current, displayImageUrl);
        const success = addItem(
          {
            id: product.id,
            name: product.name,
            price: displayPrice,
            imageUrl: displayImageUrl,
            stock: product.stock,
            categoryName: product.categoryName ?? undefined,
            originalPrice: hasDiscount ? product.price : undefined,
          },
          1,
          {},
        );
        if (success) {
          trackAddToCartEvent(trackEvent, {
            id: product.id,
            name: product.name,
            price: displayPrice,
            categoryName: product.categoryName,
          });
        }
        showCartToast({
          name: product.name,
          price: displayPrice,
          imageUrl: displayImageUrl,
        });
      } catch {
        // silent
      } finally {
        setIsAdding(false);
      }
    },
    [product, displayPrice, displayImageUrl, addItem, trackEvent, hasDiscount],
  );

  // Determine tag text
  const tagText = product.tag || (product.isNew ? t("new") : hasDiscount ? t("sale") : null);

  const wishlisted = isWishlisted(product.id);
  const productUrl = getProductUrl(product);

  return (
    <div className={cn("group flex flex-col", className)}>
      {/* Image container */}
      <div className='relative aspect-[4/5] overflow-hidden bg-perce-surface'>
        <Link href={productUrl} className='block w-full h-full'>
          <img
            ref={(node) => {
              cardImageRef.current = node;
              if (node?.complete) setImageLoaded(true);
            }}
            src={displayImageUrl}
            alt={product.name}
            className={cn(
              "w-full h-full object-cover transition-transform duration-500 group-hover:scale-105",
              !imageLoaded && "opacity-0",
            )}
            loading='lazy'
            decoding='async'
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageLoaded(true)}
          />
        </Link>

        {/* Tag badge (top-right) */}
        {tagText && (
          <span className='absolute start-3 top-3 bg-perce-bg/95 px-2.5 py-1 text-xs font-medium text-perce-ink'>
            {tagText}
          </span>
        )}

        {/* Sold out — stated on the image itself. Previously the only signal
            was a disabled button below the fold of the card. */}
        {!product.available && (
          <div className='absolute inset-0 flex items-center justify-center bg-perce-bg/55'>
            <span className='bg-perce-bg px-3 py-1.5 text-xs font-medium text-perce-ink'>
              {t("out_of_stock")}
            </span>
          </div>
        )}

        {/* Action icons (bottom-center, appear on hover) */}
        <div className='absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-300'>
          <button
            type='button'
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onQuickView?.(product);
            }}
            className='w-11 h-11 md:w-9 md:h-9 flex items-center justify-center bg-white rounded-full shadow-md hover:bg-perce-surface transition-colors'
            aria-label={`${t("quick_view")}: ${product.name}`}>
            <Eye className='w-4 h-4 text-stone-700' />
          </button>
          <button
            type='button'
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              toggle(product.id);
            }}
            className={cn(
              "w-11 h-11 md:w-9 md:h-9 flex items-center justify-center rounded-full shadow-md transition-colors",
              wishlisted
                ? "bg-red-50 text-red-500 hover:bg-red-100"
                : "bg-white text-perce-ink-secondary hover:bg-perce-surface",
            )}
            aria-pressed={wishlisted}
            aria-label={`${t("nav.wishlist")}: ${product.name}`}>
            <Heart
              className={cn("w-4 h-4", wishlisted && "fill-current")}
            />
          </button>
        </div>
      </div>

      {/* Product info */}
      <div className='pb-1 pt-3 text-start'>
        <Link href={productUrl}>
          <h3
            style={{ fontFamily: "var(--font-product-title)" }}
            className='line-clamp-1 text-[0.8125rem] font-normal text-perce-ink transition-colors hover:text-perce-ink-muted'>
            {product.name}
          </h3>
        </Link>
        <div className='mt-1.5 flex items-baseline gap-2'>
          {originalPrice !== null && (
            <span
              style={{ fontFamily: "var(--font-price)" }}
              className='text-sm text-perce-ink-subtle line-through'>
              {formatMoney(originalPrice, { locale })}
            </span>
          )}
          <span
            style={{ fontFamily: "var(--font-price)" }}
            className={cn(
              "text-sm font-medium",
              hasDiscount ? "text-perce-sale" : "text-perce-ink",
            )}>
            {formatMoney(displayPrice, { locale })}
          </span>
        </div>
      </div>

      {/* Add to cart */}
      <div>
        <button
          ref={addToCartBtnRef}
          type='button'
          onClick={handleAddToCart}
          disabled={!product.available || isAdding}
          data-add-to-cart='true'
          className='perce-underline-hover mt-2 inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap text-xs font-medium text-perce-ink-muted transition-colors hover:text-perce-ink disabled:cursor-not-allowed disabled:opacity-40 sm:text-[11px]'>
          <span className='truncate'>
            {product.available ? t("add_to_cart") : t("out_of_stock")}
          </span>
          {product.available && <ShoppingBag className='w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0' />}
        </button>
      </div>
    </div>
  );
}
