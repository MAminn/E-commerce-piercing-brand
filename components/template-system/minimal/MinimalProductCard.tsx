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
  const { t } = useMinimalI18n();
  const [isAdding, setIsAdding] = useState(false);
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
      <div className='relative aspect-square bg-stone-50 overflow-hidden'>
        <Link href={productUrl} className='block w-full h-full'>
          <img
            ref={cardImageRef}
            src={displayImageUrl}
            alt={product.name}
            className={cn(
              "w-full h-full object-cover transition-transform duration-500 group-hover:scale-105",
              !imageLoaded && "opacity-0",
            )}
            loading='lazy'
            onLoad={() => setImageLoaded(true)}
          />
        </Link>

        {/* Tag badge (top-right) */}
        {tagText && (
          <span className='absolute top-3 end-3 bg-stone-900 text-white text-[10px] font-medium px-2.5 py-1 tracking-wide'>
            {tagText}
          </span>
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
            className='w-9 h-9 flex items-center justify-center bg-white rounded-full shadow-md hover:bg-stone-100 transition-colors'
            aria-label={t("quick_view")}>
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
              "w-9 h-9 flex items-center justify-center rounded-full shadow-md transition-colors",
              wishlisted
                ? "bg-red-50 text-red-500 hover:bg-red-100"
                : "bg-white text-stone-700 hover:bg-stone-100",
            )}
            aria-label={wishlisted ? t("removed_from_wishlist") : t("added_to_wishlist")}>
            <Heart
              className={cn("w-4 h-4", wishlisted && "fill-current")}
            />
          </button>
        </div>
      </div>

      {/* Product info */}
      <div className='pt-3 pb-1 text-center'>
        <Link href={productUrl}>
          <h3
            style={{ fontFamily: "var(--font-product-title)" }}
            className='text-sm font-normal text-stone-800 line-clamp-1 hover:text-stone-600 transition-colors'>
            {product.name}
          </h3>
        </Link>
        <div className='mt-1 flex items-center justify-center gap-2'>
          {originalPrice !== null && (
            <span
              style={{ fontFamily: "var(--font-price)" }}
              className='text-sm text-stone-400 line-through'>
              {originalPrice} {t("currency")}
            </span>
          )}
          <span
            style={{ fontFamily: "var(--font-price)" }}
            className={cn("text-sm font-medium", hasDiscount ? "text-red-600" : "text-stone-800")}>
            {displayPrice} {t("currency")}
          </span>
        </div>
      </div>

      {/* Add to cart button */}
      <div className='px-2 sm:px-3'>
        <button
          ref={addToCartBtnRef}
          type='button'
          onClick={handleAddToCart}
          disabled={!product.available || isAdding}
          data-add-to-cart='true'
          className='mt-1 w-full py-2.5 px-1.5 flex items-center justify-center gap-1 sm:gap-2 rounded-md border border-stone-900 text-stone-900 text-[10px] sm:text-xs font-medium uppercase hover:bg-stone-900 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap'>
          <span className='truncate'>
            {product.available ? t("add_to_cart") : t("out_of_stock")}
          </span>
          {product.available && <ShoppingBag className='w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0' />}
        </button>
      </div>
    </div>
  );
}
