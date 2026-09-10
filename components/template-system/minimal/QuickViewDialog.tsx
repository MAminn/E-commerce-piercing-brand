import { useState, useMemo, useCallback } from "react";
import { X, ChevronLeft, ChevronRight, Heart, Share2, Check } from "lucide-react";
import { useCart } from "#root/lib/context/CartContext";
import { useTracking } from "#root/frontend/contexts/TrackingContext";
import { trackAddToCartEvent } from "#root/frontend/tracking/add-to-cart-event";
import { useWishlist } from "#root/lib/hooks/useWishlist";
import { useMinimalI18n } from "#root/lib/i18n/MinimalI18nContext";
import { cn } from "#root/lib/utils";
import { showCartToast } from "#root/components/ui/cart-toast";
import type { MinimalProduct } from "./MinimalProductCard";

interface QuickViewDialogProps {
  product: MinimalProduct | null;
  open: boolean;
  onClose: () => void;
}

function resolveImageUrl(url?: string | null): string {
  if (!url) return "/assets/placeholder-product.png";
  if (url.startsWith("http") || url.startsWith("/")) return url;
  return `/uploads/${url}`;
}

export function QuickViewDialog({ product, open, onClose }: QuickViewDialogProps) {
  const { addItem } = useCart();
  const { trackEvent } = useTracking();
  const { toggle, isWishlisted } = useWishlist();
  const { t } = useMinimalI18n();
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [quantity, setQuantity] = useState(1);

  const images = useMemo(() => {
    if (!product) return [];
    if (product.images && product.images.length > 0) {
      return product.images.map((img) => resolveImageUrl(img.url));
    }
    return [resolveImageUrl(product.imageUrl)];
  }, [product]);

  const hasDiscount =
    product &&
    product.discountPrice !== undefined &&
    product.discountPrice !== null &&
    product.discountPrice !== "" &&
    Number(product.discountPrice) < product.price;

  const displayPrice = product
    ? hasDiscount
      ? Number(product.discountPrice)
      : product.price
    : 0;

  const handleAddToCart = useCallback(() => {
    if (!product || !product.available) return;
    const success = addItem(
      {
        id: product.id,
        name: product.name,
        price: displayPrice,
        imageUrl: images[0] || "",
        stock: product.stock,
        categoryName: product.categoryName ?? undefined,
      },
      quantity,
      {},
    );
    if (success) {
      trackAddToCartEvent(trackEvent, {
        id: product.id,
        name: product.name,
        price: displayPrice,
        quantity,
        categoryName: product.categoryName,
      });
    }
    showCartToast({
      name: product.name,
      price: displayPrice,
      imageUrl: images[0] || "",
    });
    onClose();
  }, [product, displayPrice, images, quantity, addItem, trackEvent, onClose]);

  if (!open || !product) return null;

  const wishlisted = isWishlisted(product.id);

  return (
    <div
      className='fixed inset-0 z-[20000] flex items-center justify-center bg-black/50 backdrop-blur-sm'
      onClick={onClose}
      role='dialog'
      aria-modal='true'>
      <div
        className='relative bg-white w-[95vw] max-w-[800px] max-h-[90vh] overflow-y-auto shadow-xl'
        onClick={(e) => e.stopPropagation()}>
        {/* Close button */}
        <button
          type='button'
          onClick={onClose}
          className='absolute top-3 end-3 z-10 w-8 h-8 flex items-center justify-center bg-white rounded-full shadow hover:bg-stone-100 transition-colors'
          aria-label={t("close")}>
          <X className='w-4 h-4' />
        </button>

        <div className='flex flex-col md:flex-row'>
          {/* Image gallery */}
          <div className='relative md:w-1/2 aspect-square bg-stone-50'>
            <img
              src={images[currentImageIndex] || ""}
              alt={product.name}
              className='w-full h-full object-cover'
            />
            {images.length > 1 && (
              <>
                <button
                  type='button'
                  onClick={() =>
                    setCurrentImageIndex((prev) =>
                      prev === 0 ? images.length - 1 : prev - 1,
                    )
                  }
                  className='absolute start-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center bg-white/80 hover:bg-white rounded-full shadow transition-colors'
                  aria-label='Previous image'>
                  <ChevronLeft className='w-4 h-4' />
                </button>
                <button
                  type='button'
                  onClick={() =>
                    setCurrentImageIndex((prev) =>
                      prev === images.length - 1 ? 0 : prev + 1,
                    )
                  }
                  className='absolute end-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center bg-white/80 hover:bg-white rounded-full shadow transition-colors'
                  aria-label='Next image'>
                  <ChevronRight className='w-4 h-4' />
                </button>
              </>
            )}

            {/* Tag */}
            {product.tag || product.isNew ? (
              <span className='absolute top-3 start-3 bg-stone-900 text-white text-[10px] font-medium px-2.5 py-1 tracking-wide'>
                {product.tag || t("new")}
              </span>
            ) : null}
          </div>

          {/* Product details */}
          <div className='md:w-1/2 p-6 flex flex-col'>
            {/* Share + Wishlist icons */}
            <div className='flex items-center gap-3 mb-4'>
              <button
                type='button'
                onClick={() => {
                  if (navigator.share) {
                    navigator.share({ title: product.name, url: window.location.href });
                  }
                }}
                className='p-1.5 text-stone-400 hover:text-stone-700 transition-colors'>
                <Share2 className='w-4 h-4' />
              </button>
              <button
                type='button'
                onClick={() => toggle(product.id)}
                className={cn(
                  "p-1.5 transition-colors",
                  wishlisted ? "text-red-500" : "text-stone-400 hover:text-stone-700",
                )}>
                <Heart className={cn("w-4 h-4", wishlisted && "fill-current")} />
              </button>
            </div>

            {/* Name */}
            <h2 className='text-lg font-normal text-stone-900 mb-1'>
              {product.name}
            </h2>

            {/* Tax note */}
            {/* <p className='text-xs text-stone-400 mb-2'>{t("price_includes_tax")}</p> */}

            {/* Price */}
            <div className='flex items-center gap-2 mb-4'>
              {hasDiscount && (
                <span className='text-base text-stone-400 line-through'>
                  {product.price} {t("currency")}
                </span>
              )}
              <span className={cn("text-base font-semibold", hasDiscount ? "text-red-600" : "text-stone-900")}>
                {displayPrice} {t("currency")}
              </span>
            </div>

            {/* Availability */}
            {product.available && (
              <div className='flex items-center gap-1.5 text-green-600 text-sm mb-4'>
                <Check className='w-4 h-4' />
                {t("in_stock")}
              </div>
            )}

            {/* Description (truncated) */}
            {product.description && (
              <div className='mb-4'>
                <p className='text-sm text-stone-600 leading-relaxed line-clamp-4'>
                  {product.description}
                </p>
              </div>
            )}

            {/* Divider */}
            <div className='border-t border-stone-100 my-3' />

            {/* Quantity + Add to cart */}
            <div className='flex items-center gap-3 mt-auto'>
              <div className='flex items-center border border-stone-200'>
                <button
                  type='button'
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className='w-9 h-9 flex items-center justify-center text-stone-500 hover:text-stone-900 transition-colors'>
                  −
                </button>
                <span className='w-10 text-center text-sm text-stone-900'>{quantity}</span>
                <button
                  type='button'
                  onClick={() => setQuantity((q) => q + 1)}
                  className='w-9 h-9 flex items-center justify-center text-stone-500 hover:text-stone-900 transition-colors'>
                  +
                </button>
              </div>
              <button
                type='button'
                onClick={handleAddToCart}
                disabled={!product.available}
                data-add-to-cart='true'
                className='flex-1 py-2.5 bg-stone-900 text-white text-xs font-medium tracking-wide uppercase hover:bg-stone-800 transition-colors disabled:opacity-40'>
                {product.available ? t("add_to_cart") : t("out_of_stock")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
