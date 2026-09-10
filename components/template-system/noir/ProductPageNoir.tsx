import { useMemo, useState } from "react";
import {
  ArrowRight,
  Minus,
  Plus,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  Star,
  Truck,
} from "lucide-react";
import { Link } from "#root/components/utils/Link";
import type { ProductPageProduct } from "../productPage/ProductPageModernSplit";
import type { FeaturedProduct } from "../home/HomeFeaturedProducts";
import { useMinimalI18n } from "#root/lib/i18n/MinimalI18nContext";
import { cn } from "#root/lib/utils";
import { NoirChrome } from "./NoirChrome";
import { NoirImagePlaceholder } from "./ProductCardNoir";
import { NoirProductSection } from "./NoirProductSection";
import { NoirVariantSelector } from "./NoirVariantSelector";
import { formatNoirPrice } from "./format-price";
import {
  NOIR_ACCENT_BG_CLASSES,
  NOIR_CARD_CLASSES,
  NOIR_DISPLAY_FONT_CLASSES,
  NOIR_MONO_FONT_CLASSES,
  NOIR_TEXT_MUTED_CLASSES,
  NOIR_TEXT_SECONDARY_CLASSES,
} from "./noir-tokens";

/* ------------------------------------------------------------------ */
/*  Types — exact productPage template contract                        */
/*  (pages/featured/products/@productId/+Page.tsx, route /shop/@id)    */
/* ------------------------------------------------------------------ */

export interface ProductPageNoirProps {
  product?: ProductPageProduct;
  relatedProducts?: FeaturedProduct[];
  isLoading?: boolean;
  showWishlist?: boolean;
  onAddToCart?: (
    product: ProductPageProduct,
    selectedOptions?: Record<string, string>,
  ) => void;
  onAddToWishlist?: (product: ProductPageProduct) => void;
  onImageClick?: (imageUrl: string, index: number) => void;
  className?: string;
  /** Admin preview mode — disables the <html> chrome side effect */
  previewMode?: boolean;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function resolveImageUrl(url?: string | null): string {
  if (!url) return "";
  if (url.startsWith("http") || url.startsWith("/")) return url;
  return `/uploads/${url}`;
}

function Stars({ rating }: { rating: number }) {
  return (
    <div className='flex items-center gap-0.5'>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={cn(
            "w-3.5 h-3.5",
            i <= Math.round(rating)
              ? "fill-[#E8112D] text-[#E8112D]"
              : "text-white/15",
          )}
          strokeWidth={1.5}
        />
      ))}
    </div>
  );
}

function GallerySkeleton() {
  return (
    <div className='space-y-4'>
      <div className='aspect-square bg-white/5 rounded-xl animate-pulse' />
      <div className='flex gap-3'>
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className='w-16 h-16 bg-white/5 rounded-md animate-pulse'
          />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

/**
 * ProductPageNoir — Demo 5 "Noir" product detail page.
 *
 * Gallery (vertical thumb rail desktop / horizontal strip mobile,
 * red active border) | breadcrumb, condensed uppercase title, price
 * via formatNoirPrice, rating only when real review data exists,
 * NoirVariantSelector, qty stepper, red ADD TO CART, generic trust
 * row (no invented claims), related products via NoirProductSection.
 */
export function ProductPageNoir({
  product,
  relatedProducts = [],
  isLoading = false,
  onAddToCart,
  onImageClick,
  className = "",
  previewMode = false,
}: ProductPageNoirProps) {
  const { t, locale } = useMinimalI18n();
  const isAr = locale === "ar";
  const track = isAr ? "" : "tracking-[0.18em]";

  const [selectedImage, setSelectedImage] = useState(0);
  const [imageError, setImageError] = useState<Record<number, boolean>>({});
  const [quantity, setQuantity] = useState(1);
  const [selectedVariants, setSelectedVariants] = useState<
    Record<string, string>
  >({});

  // Gallery images: images[] first, imageUrl fallback
  const images = useMemo(() => {
    if (product?.images && product.images.length > 0) return product.images;
    if (product?.imageUrl) return [{ url: product.imageUrl, isPrimary: true }];
    return [];
  }, [product]);

  if (isLoading && !product) {
    return (
      <NoirChrome previewMode={previewMode}>
        <div className='mx-auto max-w-7xl px-4 md:px-8 py-10 grid md:grid-cols-2 gap-10'>
          <GallerySkeleton />
          <div className='space-y-4'>
            <div className='h-3 w-1/3 bg-white/5 rounded animate-pulse' />
            <div className='h-8 w-3/4 bg-white/5 rounded animate-pulse' />
            <div className='h-5 w-1/4 bg-white/5 rounded animate-pulse' />
            <div className='h-24 w-full bg-white/5 rounded animate-pulse' />
            <div className='h-12 w-full bg-white/5 rounded animate-pulse' />
          </div>
        </div>
      </NoirChrome>
    );
  }

  if (!product) {
    return (
      <NoirChrome previewMode={previewMode}>
        <div className='mx-auto max-w-7xl px-4 md:px-8 py-24 text-center space-y-4'>
          <p className={cn("text-sm", NOIR_TEXT_SECONDARY_CLASSES)}>
            {isAr ? "المنتج غير موجود" : "Product not found"}
          </p>
          <Link
            href='/shop'
            className={cn(
              "inline-flex items-center gap-2 px-8 py-3 border border-white/20 rounded-md",
              "text-xs uppercase text-white/80 hover:border-white/50 hover:text-white transition-colors duration-300",
              track,
              NOIR_DISPLAY_FONT_CLASSES,
            )}>
            {t("view_all")}
          </Link>
        </div>
      </NoirChrome>
    );
  }

  const hasDiscount =
    product.discountPrice !== undefined &&
    product.discountPrice !== null &&
    product.discountPrice !== "" &&
    Number(product.discountPrice) < product.price;
  const displayPrice = hasDiscount
    ? Number(product.discountPrice)
    : product.price;

  const hasRating = typeof product.rating === "number" && product.rating > 0;

  const allVariantsSelected =
    !product.variants?.length ||
    product.variants.every((v) => selectedVariants[v.name]);

  const canAddToCart = product.available && allVariantsSelected;

  const handleAddToCart = () => {
    if (!canAddToCart) return;
    // Contract adds a single unit per call (matches ProductPageClassic)
    onAddToCart?.(product, selectedVariants);
  };

  const handleThumbClick = (index: number) => {
    setSelectedImage(index);
    onImageClick?.(resolveImageUrl(images[index]?.url), index);
  };

  const mainImageUrl = resolveImageUrl(images[selectedImage]?.url);
  const mainImageBroken = images.length === 0 || imageError[selectedImage];

  const trustItems = [
    {
      Icon: Truck,
      title: isAr ? "شحن سريع" : "Fast shipping",
      subtext: isAr ? "توصيل إلى باب منزلك" : "Delivered to your door",
    },
    {
      Icon: RefreshCw,
      title: isAr ? "إرجاع سهل" : "Easy returns",
      subtext: isAr ? "عملية إرجاع بسيطة" : "Simple return process",
    },
    {
      Icon: ShieldCheck,
      title: isAr ? "دفع آمن" : "Secure checkout",
      subtext: isAr ? "معاملات محمية" : "Protected transactions",
    },
  ];

  const longText = product.longDescription || null;
  const hasSpecs =
    Array.isArray(product.specifications) && product.specifications.length > 0;

  return (
    <NoirChrome previewMode={previewMode}>
      <div
        className={cn(
          "mx-auto max-w-7xl px-4 md:px-8 py-8 md:py-12",
          className,
        )}>
        <div className='grid md:grid-cols-2 gap-10 lg:gap-16 items-start'>
          {/* ── Gallery ── */}
          <div className='flex flex-col-reverse md:flex-row gap-4'>
            {/* Thumbnail rail — vertical desktop / horizontal strip mobile */}
            {images.length > 1 && (
              <div className='flex md:flex-col gap-3 overflow-x-auto md:overflow-visible scrollbar-hide shrink-0'>
                {images.map((img, index) => (
                  <button
                    key={img.url + index}
                    type='button'
                    onClick={() => handleThumbClick(index)}
                    aria-label={`${product.name} ${index + 1}`}
                    className={cn(
                      "w-16 h-16 shrink-0 rounded-md overflow-hidden bg-black border transition-colors duration-200",
                      index === selectedImage
                        ? "border-[#E8112D]"
                        : "border-white/10 hover:border-white/30",
                    )}>
                    {imageError[index] ? (
                      <NoirImagePlaceholder />
                    ) : (
                      <img
                        src={resolveImageUrl(img.url)}
                        alt=''
                        className='w-full h-full object-cover'
                        loading='lazy'
                        onError={() =>
                          setImageError((prev) => ({ ...prev, [index]: true }))
                        }
                      />
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* Main image */}
            <div className='flex-1'>
              <div className='relative'>
                {/* Soft radial glow behind the panel — staged/lit feel */}
                <div
                  className='pointer-events-none absolute inset-0 z-0 scale-110 opacity-70 blur-2xl'
                  style={{
                    background:
                      "radial-gradient(circle at 50% 45%, rgba(232,17,45,0.14) 0%, transparent 62%)",
                  }}
                  aria-hidden='true'
                />
                <div className='relative z-10 aspect-square bg-black border border-white/10 rounded-xl overflow-hidden'>
                  {mainImageBroken ? (
                    <NoirImagePlaceholder />
                  ) : (
                    <img
                      src={mainImageUrl}
                      alt={product.name}
                      className='w-full h-full object-cover'
                      fetchPriority='high'
                      onError={() =>
                        setImageError((prev) => ({
                          ...prev,
                          [selectedImage]: true,
                        }))
                      }
                    />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ── Info column ── */}
          <div className='space-y-6 md:sticky md:top-24 md:self-start'>
            {/* Breadcrumb */}
            <nav
              className={cn(
                "flex items-center gap-2 text-xs",
                NOIR_MONO_FONT_CLASSES,
                NOIR_TEXT_MUTED_CLASSES,
              )}
              aria-label='Breadcrumb'>
              <Link
                href='/'
                className='hover:text-white transition-colors duration-200'>
                {isAr ? "الرئيسية" : "Home"}
              </Link>
              <span aria-hidden='true'>/</span>
              <Link
                href='/shop'
                className='hover:text-white transition-colors duration-200'>
                {isAr ? "تسوق" : "Shop"}
              </Link>
              <span aria-hidden='true'>/</span>
              <span className='text-white/70 truncate max-w-40'>
                {product.name}
              </span>
            </nav>

            {/* Title */}
            <h1
              className={cn(
                "uppercase font-bold text-white leading-none text-[clamp(1.9rem,3.5vw,3rem)]",
                isAr ? "" : "tracking-[0.02em]",
                NOIR_DISPLAY_FONT_CLASSES,
              )}>
              {product.name}
            </h1>

            {/* Rating — only when real review data exists */}
            {hasRating && (
              <div className='flex items-center gap-2'>
                <Stars rating={product.rating as number} />
                <span className='text-sm text-white font-medium'>
                  {(product.rating as number).toFixed(1)}
                </span>
                {typeof product.reviewCount === "number" &&
                  product.reviewCount > 0 && (
                    <span className={cn("text-xs", NOIR_TEXT_MUTED_CLASSES)}>
                      ({product.reviewCount})
                    </span>
                  )}
              </div>
            )}

            {/* Price */}
            <div className='flex items-baseline gap-3'>
              <span className='text-3xl font-semibold text-white'>
                {formatNoirPrice(displayPrice)}
              </span>
              {hasDiscount && (
                <span
                  className={cn(
                    "text-lg line-through",
                    NOIR_TEXT_MUTED_CLASSES,
                  )}>
                  {formatNoirPrice(product.price)}
                </span>
              )}
            </div>

            {/* Stock status — from real stock data */}
            <div
              className={cn(
                "flex items-center gap-2 text-[11px] uppercase",
                NOIR_MONO_FONT_CLASSES,
                product.available ? "text-white/70" : "text-[#E8112D]",
              )}>
              <span
                className={cn(
                  "inline-block w-1.5 h-1.5 rounded-full",
                  product.available ? "bg-[#E8112D]" : "bg-white/30",
                )}
                aria-hidden='true'
              />
              {product.available ? t("in_stock") : t("out_of_stock")}
            </div>

            {/* Short description */}
            {product.description && (
              <p
                className={cn(
                  "text-sm leading-relaxed max-w-prose",
                  NOIR_TEXT_SECONDARY_CLASSES,
                )}>
                {product.description}
              </p>
            )}

            <div className='w-full h-px bg-white/10' />

            {/* Variants */}
            {product.variants && product.variants.length > 0 && (
              <NoirVariantSelector
                variants={product.variants}
                selectedVariants={selectedVariants}
                onVariantChange={(name, value) =>
                  setSelectedVariants((prev) => ({ ...prev, [name]: value }))
                }
              />
            )}

            {/* Quantity + Add to cart */}
            <div className='flex flex-col sm:flex-row gap-3'>
              <div className='flex items-center border border-white/15 rounded-md self-start'>
                <button
                  type='button'
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  disabled={quantity <= 1}
                  aria-label={isAr ? "تقليل الكمية" : "Decrease quantity"}
                  className='p-3.5 text-white/70 hover:text-white disabled:opacity-30 transition-colors duration-200'>
                  <Minus className='w-4 h-4' />
                </button>
                <span
                  className={cn(
                    "px-5 py-2.5 border-x border-white/15 min-w-14 text-center text-sm text-white",
                    NOIR_MONO_FONT_CLASSES,
                  )}>
                  {quantity}
                </span>
                <button
                  type='button'
                  onClick={() => setQuantity((q) => q + 1)}
                  disabled={
                    !product.available || quantity >= (product.stock || 0)
                  }
                  aria-label={isAr ? "زيادة الكمية" : "Increase quantity"}
                  className='p-3.5 text-white/70 hover:text-white disabled:opacity-30 transition-colors duration-200'>
                  <Plus className='w-4 h-4' />
                </button>
              </div>

              <button
                type='button'
                onClick={handleAddToCart}
                disabled={!canAddToCart}
                className={cn(
                  "group/cta flex-1 inline-flex items-center justify-center gap-2 px-8 py-4 rounded-md",
                  "text-xs uppercase font-medium text-white transition-all duration-300",
                  "disabled:opacity-40 disabled:cursor-not-allowed",
                  "hover:shadow-[0_10px_40px_-12px_rgba(232,17,45,0.6)]",
                  track,
                  NOIR_DISPLAY_FONT_CLASSES,
                  NOIR_ACCENT_BG_CLASSES,
                )}>
                <ShoppingBag className='w-4 h-4' strokeWidth={1.5} />
                {t("add_to_cart")}
              </button>
            </div>

            {/* Secondary CTA */}
            <Link
              href='/shop'
              className={cn(
                "flex w-full items-center justify-center gap-2 px-8 py-3.5 rounded-md",
                "border border-white/20 text-xs uppercase font-medium text-white/80",
                "hover:border-white/50 hover:text-white transition-colors duration-300",
                track,
                NOIR_DISPLAY_FONT_CLASSES,
              )}>
              {isAr ? "استكشف المجموعة" : "Explore the collection"}
              <ArrowRight
                className='w-3.5 h-3.5 rtl:rotate-180'
                strokeWidth={1.5}
              />
            </Link>

            {/* Trust row — generic claims only */}
            <div className='grid grid-cols-3 gap-4 pt-2'>
              {trustItems.map(({ Icon, title, subtext }) => (
                <div
                  key={title}
                  className='flex flex-col items-center text-center gap-2'>
                  <Icon className='w-6 h-6 text-[#E8112D]' strokeWidth={1.5} />
                  <p
                    className={cn(
                      "text-[10px] uppercase font-semibold text-white",
                      isAr ? "" : "tracking-[0.14em]",
                      NOIR_DISPLAY_FONT_CLASSES,
                    )}>
                    {title}
                  </p>
                  <p
                    className={cn(
                      "text-[11px] leading-snug",
                      NOIR_TEXT_MUTED_CLASSES,
                    )}>
                    {subtext}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Long description / specifications ── */}
        {(longText || hasSpecs) && (
          <div className='mt-14 md:mt-20 grid md:grid-cols-2 gap-6'>
            {longText && (
              <div className={cn("p-6 md:p-8", NOIR_CARD_CLASSES)}>
                <h2
                  className={cn(
                    "text-sm uppercase font-semibold text-white mb-4",
                    track,
                    NOIR_DISPLAY_FONT_CLASSES,
                  )}>
                  {t("description")}
                </h2>
                <p
                  className={cn(
                    "text-sm leading-relaxed whitespace-pre-line",
                    NOIR_TEXT_SECONDARY_CLASSES,
                  )}>
                  {longText}
                </p>
              </div>
            )}
            {hasSpecs && (
              <div className={cn("p-6 md:p-8", NOIR_CARD_CLASSES)}>
                <h2
                  className={cn(
                    "text-sm uppercase font-semibold text-white mb-4",
                    track,
                    NOIR_DISPLAY_FONT_CLASSES,
                  )}>
                  {isAr ? "المواصفات" : "Specifications"}
                </h2>
                <dl className='divide-y divide-white/10'>
                  {product.specifications?.map((spec) => (
                    <div
                      key={spec.label}
                      className='flex items-baseline justify-between gap-4 py-2.5'>
                      <dt className={cn("text-xs", NOIR_TEXT_MUTED_CLASSES)}>
                        {spec.label}
                      </dt>
                      <dd className='text-xs text-white/80 text-end'>
                        {spec.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Related products ── */}
      {relatedProducts.length > 0 && (
        <NoirProductSection
          title={isAr ? "قد يعجبك أيضاً" : "You May Also Like"}
          viewAllText={t("view_all")}
          viewAllLink='/shop'
          products={relatedProducts.filter((p) => p.id !== product.id)}
        />
      )}
    </NoirChrome>
  );
}

ProductPageNoir.displayName = "ProductPageNoir";
