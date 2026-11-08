import { useState, useMemo, useCallback, useRef } from "react";
import { Heart, Plus } from "lucide-react";
import { useCart } from "#root/lib/context/CartContext";
import { useTracking } from "#root/frontend/contexts/TrackingContext";
import { trackAddToCartEvent } from "#root/frontend/tracking/add-to-cart-event";
import { useWishlist } from "#root/lib/hooks/useWishlist";
import { useMinimalI18n } from "#root/lib/i18n/MinimalI18nContext";
import { getProductUrl } from "#root/lib/utils/route-helpers";
import { cn } from "#root/lib/utils";
import { showCartToast, flyToCart } from "#root/components/ui/cart-toast";
import { needsNoPiercing } from "#root/shared/products/no-piercing";
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
  /** The product has option groups: cards send it to its page to choose them. */
  requiresOptions?: boolean;
  categoryName?: string | null;
  categories?: { id: string; name: string }[];
  description?: string | null;
  isNew?: boolean;
  tag?: string;
  /** Catalogue number, shown as "014"; null until the owner numbers the product. */
  catalogueNo?: number | null;
}

interface MinimalProductCardProps {
  product: MinimalProduct;
  /**
   * @deprecated The Object Index card has no quick-view affordance; the
   * product page is one tap away. Accepted so existing callers compile.
   */
  onQuickView?: (product: MinimalProduct) => void;
  className?: string;
}

function resolveImageUrl(url?: string | null): string {
  if (!url) return "/assets/placeholder-product.png";
  if (url.startsWith("http") || url.startsWith("/")) return url;
  return `/uploads/${url}`;
}

/**
 * Product card.
 *
 * The photograph sells the piece: a 4:5 frame on `surface-2` with no border,
 * radius or shadow, then the name and one price, the price paid. Nothing else
 * competes in the first scan. Desktop crossfades to a second photo on hover
 * when the product has one.
 *
 * The `+` is a small square inside the photo, bottom-end, 8px in, with a 44px
 * hit area — always visible on touch, on hover/focus from 1024px.
 *   - No option groups: it adds to the bag exactly as the old full-width bar
 *     did (same cart call, same AddToCart tracking, same toast).
 *   - Option groups (`requiresOptions`): it is a link to the product page,
 *     where the options are chosen. Nothing is added and no AddToCart fires
 *     from the card — a piece is never bagged with its options unchosen.
 * Sold out: the photo dims to 70%, the `+` is gone and a "Sold out" label
 * sits under the price.
 */
export function MinimalProductCard({ product, className }: MinimalProductCardProps) {
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

  // The first photo that is not the one on show, for the desktop hover.
  const secondImageUrl = useMemo(() => {
    const other = product.images?.find((img) => resolveImageUrl(img.url) !== displayImageUrl);
    return other ? resolveImageUrl(other.url) : null;
  }, [product.images, displayImageUrl]);

  const hasDiscount =
    product.discountPrice !== undefined &&
    product.discountPrice !== null &&
    product.discountPrice !== "" &&
    Number(product.discountPrice) < product.price;

  const displayPrice = hasDiscount ? Number(product.discountPrice) : product.price;

  const handleAddToCart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!product.available || product.requiresOptions) return;
      setIsAdding(true);
      try {
        flyToCart(addToCartBtnRef.current, displayImageUrl);
        const success = addItem(
          {
            id: product.id,
            slug: product.slug,
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

  // One short line of product fact, from real data only: an explicit tag,
  // else "No piercing needed" when the product's category says so. No New /
  // Sale badges and no struck-through price — the card shows what you pay.
  const factText = product.tag || (needsNoPiercing(product) ? t("product.no_piercing_needed") : null);

  const wishlisted = isWishlisted(product.id);
  const productUrl = getProductUrl(product);
  const soldOut = !product.available;

  // Mobile: always visible. From 1024px: on hover or keyboard focus.
  const revealOnDesktop =
    "lg:opacity-0 lg:transition-opacity lg:duration-[var(--perce-duration-fast)] lg:group-hover:opacity-100 lg:group-focus-within:opacity-100";

  return (
    <article className={cn("group flex flex-col", className)}>
      <div className='relative aspect-[4/5] overflow-hidden bg-surface-2'>
        {/* The title below is the card's one link in the tab order; the photo
            repeats it for pointer users (same href, tabIndex -1). */}
        <a href={productUrl} tabIndex={-1} className='block h-full w-full'>
          <img
            ref={(node) => {
              cardImageRef.current = node;
              if (node?.complete) setImageLoaded(true);
            }}
            src={displayImageUrl}
            alt={product.name}
            className={cn(
              "h-full w-full object-cover transition-opacity duration-[var(--perce-duration)]",
              !imageLoaded ? "opacity-0" : soldOut ? "opacity-70" : "opacity-100",
              secondImageUrl && !soldOut && "lg:group-hover:opacity-0",
            )}
            loading='lazy'
            decoding='async'
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageLoaded(true)}
          />
          {secondImageUrl && !soldOut && (
            <img
              src={secondImageUrl}
              alt=''
              className='absolute inset-0 hidden h-full w-full object-cover opacity-0 transition-opacity duration-[var(--perce-duration)] motion-reduce:transition-none lg:block lg:group-hover:opacity-100'
              loading='lazy'
              decoding='async'
            />
          )}
        </a>

        {/* Wishlist — quiet, top-end; stays shown once saved. On a stone square,
            because a bare ink heart disappears on a real photo's dark hair. */}
        <button
          type='button'
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            toggle(product.id);
          }}
          className={cn(
            "absolute end-2 top-2 flex h-8 w-8 items-center justify-center bg-surface/85 text-ink transition-colors hover:bg-ink hover:text-bg before:absolute before:-inset-1.5 before:content-[''] lg:h-9 lg:w-9 lg:before:-inset-1",
            !wishlisted && revealOnDesktop,
          )}
          aria-pressed={wishlisted}
          aria-label={`${t("nav.wishlist")}: ${product.name}`}>
          <Heart size={18} strokeWidth={1.5} aria-hidden className={cn(wishlisted && "fill-current")} />
        </button>

        {/* Options to choose: the same square, as a link to the product page. */}
        {!soldOut && product.requiresOptions && (
          <a
            href={productUrl}
            data-choose-options='true'
            aria-label={`${t("product.choose_options")}: ${product.name}`}
            className={cn(
              "absolute bottom-2 end-2 flex h-8 w-8 items-center justify-center bg-surface text-ink transition-colors hover:bg-ink hover:text-bg before:absolute before:-inset-1.5 before:content-[''] lg:h-9 lg:w-9 lg:before:-inset-1",
              revealOnDesktop,
            )}>
            <Plus size={18} strokeWidth={1.5} aria-hidden />
          </a>
        )}

        {/* Add to bag: a square 8px in, 44px hit area. */}
        {!soldOut && !product.requiresOptions && (
          <button
            ref={addToCartBtnRef}
            type='button'
            onClick={handleAddToCart}
            disabled={isAdding}
            data-add-to-cart='true'
            aria-label={`${t("product.add_to_bag")}: ${product.name}`}
            className={cn(
              "absolute bottom-2 end-2 flex h-8 w-8 items-center justify-center bg-surface text-ink transition-colors hover:bg-ink hover:text-bg before:absolute before:-inset-1.5 before:content-[''] disabled:cursor-wait lg:h-9 lg:w-9 lg:before:-inset-1",
              revealOnDesktop,
            )}>
            <Plus size={18} strokeWidth={1.5} aria-hidden />
          </button>
        )}
      </div>

      <div className='px-2 pt-2 text-start lg:px-0 lg:pt-3'>
        <h3 className='line-clamp-2 t-card-title text-ink' style={{ fontFamily: "var(--font-product-title)" }}>
          <a href={productUrl} className='hover:underline hover:decoration-1 hover:underline-offset-4'>
            {product.name}
          </a>
        </h3>
        <p className='mt-1 t-card-price text-ink' style={{ fontFamily: "var(--font-price)" }}>
          {formatMoney(displayPrice, { locale })}
        </p>
        {soldOut && <p className="mt-1 t-micro text-ink-2">{t("sold_out")}</p>}
        {!soldOut && factText && <p className='mt-1 t-micro text-ink-2'>{factText}</p>}
      </div>
    </article>
  );
}
