import type React from "react";
import { useState, useRef, useEffect, useCallback } from "react";
import { VariantSelector } from "#root/components/shop/VariantSelector";
import { HomeFeaturedProducts } from "../home/HomeFeaturedProducts";
import type {
  ProductPageProduct,
  ProductImage,
  ProductPageModernSplitProps,
} from "./ProductPageModernSplit";
import type { FeaturedProduct } from "../home/HomeFeaturedProducts";
import {
  ShoppingBag,
  Banknote,
  Heart,
  Star,
  StarHalf,
  Minus,
  Plus,
  X,
  ChevronLeft,
  ChevronRight,
  Truck,
  ChevronDown,
  ZoomIn,
} from "lucide-react";
import { showCartToast } from "#root/components/ui/cart-toast";
import { trpc } from "#root/shared/trpc/client";
import { useMinimalI18n } from "#root/lib/i18n/MinimalI18nContext";
import { useWishlist } from "#root/lib/hooks/useWishlist";
import { formatMoney } from "#root/shared/pricing/format-money";
import { fillTemplate } from "#root/components/bundles/bundle-ui";
import { cn } from "#root/lib/utils";
import { ProductDecisionSummary } from "./ProductDecisionSummary";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ProductPagePremiumProps {
  product?: ProductPageProduct;
  relatedProducts?: FeaturedProduct[];
  showWishlist?: boolean;
  showSocialShare?: boolean;
  onAddToCart?: (
    product: ProductPageProduct,
    selectedOptions?: Record<string, string>,
    quantity?: number,
  ) => void;
  onAddToWishlist?: (product: ProductPageProduct) => void;
  onImageClick?: (imageUrl: string, index: number) => void;
  isLoading?: boolean;
  className?: string;
}

// ─── Mock / Defaults ────────────────────────────────────────────────────────

const DEFAULT_PRODUCT: ProductPageProduct = {
  id: "product-preview-mock-1",
  name: "Lumière Diamond Pendant",
  price: 2450.0,
  discountPrice: 1960.0,
  stock: 12,
  available: true,
  imageUrl:
    "https://images.unsplash.com/photo-1515562141589-67f0d569b6fc?w=800",
  images: [
    {
      url: "https://images.unsplash.com/photo-1515562141589-67f0d569b6fc?w=800",
      isPrimary: true,
    },
    {
      url: "https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=800",
    },
    {
      url: "https://images.unsplash.com/photo-1611591437281-460bfbe1220a?w=800",
    },
    {
      url: "https://images.unsplash.com/photo-1602751584552-8ba73aad10e1?w=800",
    },
  ],
  description:
    "A timeless pendant featuring a brilliant-cut diamond set in 18k white gold. The delicate chain complements the stone's natural radiance.",
  longDescription:
    "Handcrafted by our master jewelers, the Lumière pendant embodies refined elegance. Each stone is hand-selected for its exceptional brilliance, clarity, and fire. The 18k white gold setting is designed to maximize light entry.\n\nThe pendant hangs from an adjustable 16–18 inch cable chain with a secure lobster clasp. Every piece comes with a certificate of authenticity and is presented in our signature velvet box.",
  rating: 4.8,
  reviewCount: 47,
  sku: "LUM-DP-18WG",
  // No brand on the placeholder product: this object also renders on a live
  // product page for the instant before real data arrives, so it must not
  // claim a brand name of any kind.
  brand: undefined,
  categoryName: "Necklaces",
  specifications: [
    { label: "Metal", value: "18k White Gold" },
    { label: "Stone", value: "Natural Diamond, 0.50ct" },
    { label: "Clarity", value: "VS1" },
    { label: "Chain Length", value: '16–18" adjustable' },
    { label: "Weight", value: "3.2g" },
  ],
  features: [],
};

// ─── Collapsible Accordion ──────────────────────────────────────────────────

function AccordionSection({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [measuredHeight, setMeasuredHeight] = useState<number | undefined>(
    defaultOpen ? undefined : 0,
  );

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;

    if (open) {
      setMeasuredHeight(el.scrollHeight);
      const id = setTimeout(() => setMeasuredHeight(undefined), 320);
      return () => clearTimeout(id);
    }

    // Collapse: set explicit height then animate to 0
    setMeasuredHeight(el.scrollHeight);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => setMeasuredHeight(0)),
    );
  }, [open]);

  return (
    <div className='border-b border-stone-200 last:border-b-0'>
      <button
        type='button'
        onClick={() => setOpen((v) => !v)}
        className='flex w-full items-center justify-between py-5 text-left transition-colors hover:text-stone-600'>
        <span className='text-[13px] font-normal uppercase tracking-[0.14em] text-stone-800'>
          {title}
        </span>
        <ChevronDown
          size={15}
          className={`text-stone-400 transition-transform duration-300 ease-out ${open ? "rotate-180" : ""}`}
        />
      </button>
      <div
        ref={bodyRef}
        style={{
          height: measuredHeight !== undefined ? `${measuredHeight}px` : "auto",
        }}
        className='overflow-hidden transition-[height] duration-300 ease-out'>
        <div className='pb-6 text-[14px] leading-[1.8] text-stone-500'>
          {children}
        </div>
      </div>
    </div>
  );
}

// ─── Fullscreen Lightbox ────────────────────────────────────────────────────

function Lightbox({
  images,
  startIndex,
  onClose,
}: {
  images: ProductImage[];
  startIndex: number;
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(startIndex);
  const [zoomed, setZoomed] = useState(false);
  const [origin, setOrigin] = useState({ x: 50, y: 50 });

  const prev = () => setIdx((i) => (i > 0 ? i - 1 : images.length - 1));
  const next = () => setIdx((i) => (i < images.length - 1 ? i + 1 : 0));

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") {
        prev();
        setZoomed(false);
      }
      if (e.key === "ArrowRight") {
        next();
        setZoomed(false);
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images.length, onClose]);

  const handleImageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (zoomed) {
      setZoomed(false);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    setOrigin({
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    });
    setZoomed(true);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!zoomed) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setOrigin({
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    });
  };

  return (
    <div className='fixed inset-0 z-50000 flex items-center justify-center bg-black/95 backdrop-blur-sm'>
      {/* Close */}
      <button
        type='button'
        onClick={onClose}
        className='absolute right-5 top-5 z-20 flex h-10 w-10 items-center justify-center rounded-full text-white/60 transition hover:bg-white/10 hover:text-white'>
        <X size={20} />
      </button>

      {/* Arrows */}
      {images.length > 1 && (
        <>
          <button
            type='button'
            onClick={() => {
              prev();
              setZoomed(false);
            }}
            className='absolute left-4 z-20 flex h-12 w-12 items-center justify-center rounded-full text-white/50 transition hover:bg-white/10 hover:text-white md:left-8'>
            <ChevronLeft size={26} />
          </button>
          <button
            type='button'
            onClick={() => {
              next();
              setZoomed(false);
            }}
            className='absolute right-4 z-20 flex h-12 w-12 items-center justify-center rounded-full text-white/50 transition hover:bg-white/10 hover:text-white md:right-8'>
            <ChevronRight size={26} />
          </button>
        </>
      )}

      {/* Image container with zoom */}
      <div
        className={`relative max-h-[88vh] max-w-[92vw] select-none ${zoomed ? "cursor-zoom-out" : "cursor-zoom-in"}`}
        onClick={handleImageClick}
        onMouseMove={handleMouseMove}>
        <img
          src={images[idx]?.url}
          alt={`Image ${idx + 1}`}
          draggable={false}
          className='max-h-[88vh] max-w-[92vw] object-contain transition-transform duration-300 ease-out'
          style={
            zoomed
              ? {
                  transform: "scale(2.2)",
                  transformOrigin: `${origin.x}% ${origin.y}%`,
                }
              : { transform: "scale(1)" }
          }
        />
      </div>

      {/* Dot indicators */}
      {images.length > 1 && (
        <div className='absolute bottom-5 flex gap-2'>
          {images.map((_, i) => (
            <button
              key={i}
              type='button'
              onClick={() => {
                setIdx(i);
                setZoomed(false);
              }}
              className={`h-1.5 rounded-full transition-all duration-200 ${
                i === idx
                  ? "w-6 bg-white"
                  : "w-1.5 bg-white/35 hover:bg-white/55"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Zoomable Main Image ────────────────────────────────────────────────────

function MainImage({
  src,
  alt,
  onOpenLightbox,
}: {
  src: string;
  alt: string;
  onOpenLightbox: () => void;
}) {
  const { t } = useMinimalI18n();
  return (
    <div
      className='group relative w-full cursor-pointer overflow-hidden'
      onClick={onOpenLightbox}>
      <img src={src} alt={alt} draggable={false} className='block w-full' />
      {/* Click hint */}
      <div className='pointer-events-none absolute inset-0 flex items-end justify-center pb-5 opacity-0 transition-opacity duration-300 group-hover:opacity-100'>
        <span className='flex items-center gap-1.5 rounded-full bg-black/40 px-3.5 py-1.5 text-[11px] tracking-wider text-white/90 backdrop-blur-sm'>
          <ZoomIn size={13} />
          {t("product.click_to_expand")}
        </span>
      </div>
    </div>
  );
}

// ─── Star Rating ────────────────────────────────────────────────────────────

function StarRating({ rating, count }: { rating: number; count?: number }) {
  const stars = [];
  const full = Math.floor(rating);
  const half = rating % 1 >= 0.25;

  for (let i = 0; i < full; i++)
    stars.push(
      <Star
        key={`f${i}`}
        className='h-3.5 w-3.5 fill-stone-700 text-stone-700'
      />,
    );
  if (half)
    stars.push(
      <StarHalf
        key='h'
        className='h-3.5 w-3.5 fill-stone-700 text-stone-700'
      />,
    );
  for (let i = 0; i < 5 - Math.ceil(rating); i++)
    stars.push(<Star key={`e${i}`} className='h-3.5 w-3.5 text-stone-300' />);

  return (
    <div className='flex items-center gap-2'>
      <div className='flex gap-0.5'>{stars}</div>
      {count !== undefined && (
        <span className='text-[12px] text-stone-400'>
          {rating.toFixed(1)} ({count})
        </span>
      )}
    </div>
  );
}

// ─── Loading Skeleton ───────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className='bg-white py-6 lg:py-14'>
      <div className='mx-auto max-w-7xl px-4 sm:px-6 lg:px-10'>
        <div className='grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-14'>
          <div className='lg:col-span-7 space-y-1.5'>
            <div className='aspect-square sm:aspect-auto sm:h-120 animate-pulse rounded bg-stone-100' />
            <div className='flex gap-1.5'>
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className='aspect-square w-16 sm:w-18 animate-pulse rounded bg-stone-100'
                />
              ))}
            </div>
          </div>
          <div className='lg:col-span-5 space-y-4 sm:space-y-5 pt-1 lg:pt-2'>
            <div className='h-3 w-20 animate-pulse rounded bg-stone-100' />
            <div className='h-7 w-3/4 animate-pulse rounded bg-stone-100' />
            <div className='h-4 w-28 animate-pulse rounded bg-stone-100' />
            <div className='h-5 w-24 animate-pulse rounded bg-stone-100' />
            <div className='my-4 h-px bg-stone-100' />
            <div className='space-y-2'>
              <div className='h-3 w-full animate-pulse rounded bg-stone-100' />
              <div className='h-3 w-5/6 animate-pulse rounded bg-stone-100' />
            </div>
            <div className='h-12 w-full animate-pulse rounded bg-stone-100' />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Mobile Image Carousel ──────────────────────────────────────────────────

function MobileImageCarousel({
  images,
  onOpenLightbox,
  hasDiscount,
  saveLabel,
}: {
  images: ProductImage[];
  onOpenLightbox: (index: number) => void;
  hasDiscount: boolean;
  discountPct: number;
  saveLabel: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIdx, setActiveIdx] = useState(0);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const scrollLeft = el.scrollLeft;
    const width = el.clientWidth;
    const newIdx = Math.round(scrollLeft / width);
    setActiveIdx(newIdx);
  }, []);

  return (
    <div className='relative -mx-4 sm:hidden'>
      {/* Sale badge */}
      {hasDiscount && (
        <div className='absolute start-4 top-3.5 z-10'>
          <span className='inline-block bg-stone-800 px-2.5 py-1 text-[10px] font-medium tracking-widest text-white uppercase'>
            {saveLabel}
          </span>
        </div>
      )}

      {/* Horizontal scroll container */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className='flex snap-x snap-mandatory overflow-x-auto scrollbar-hide'
        style={{ WebkitOverflowScrolling: "touch" }}>
        {images.map((img, i) => (
          <div
            key={i}
            className='w-full shrink-0 snap-center'
            onClick={() => onOpenLightbox(i)}>
            <img
              src={img.url}
              alt=''
              className='w-full aspect-square object-cover'
              loading={i === 0 ? "eager" : "lazy"}
            />
          </div>
        ))}
      </div>

      {/* Dot indicators */}
      {images.length > 1 && (
        <div className='absolute bottom-3 left-0 right-0 flex justify-center gap-1.5'>
          {images.map((_, i) => (
            <button
              key={i}
              type='button'
              onClick={() => {
                scrollRef.current?.scrollTo({
                  left: i * (scrollRef.current?.clientWidth || 0),
                  behavior: "smooth",
                });
              }}
              className={`h-1.5 rounded-full transition-all duration-200 ${
                i === activeIdx ? "w-5 bg-stone-800" : "w-1.5 bg-stone-400/50"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

/**
 * Purchase-first hierarchy: gallery → category → name → price → stock →
 * decision summary → options → quantity + Add to bag → reassurance, and only
 * then the long-form Description / Specifications / Shipping & Returns / Care
 * Guide. The short description used to sit above the quantity and Add to Bag
 * controls, pushing them below the first useful phone viewport; it now opens
 * the Description section instead (shown once, never duplicated).
 *
 * Standalone purchase is always available here, whether or not the product
 * also belongs to a Pick Your Set campaign.
 */
export function ProductPagePremium({
  product = DEFAULT_PRODUCT,
  relatedProducts,
  showWishlist = true,
  onAddToCart,
  onAddToWishlist,
  onImageClick,
  isLoading = false,
  className = "",
}: ProductPagePremiumProps) {
  const { t, locale } = useMinimalI18n();
  const { toggle: toggleWishlist, isWishlisted } = useWishlist();
  // ── Image state
  const images: ProductImage[] = product.images?.length
    ? product.images
    : product.imageUrl
      ? [{ url: product.imageUrl, isPrimary: true }]
      : [];

  const [selectedIdx, setSelectedIdx] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [quantity, setQuantity] = useState(1);

  // ── Admin-authored shipping/returns copy (Dashboard > Settings).
  // Both stay empty strings until an admin publishes real policy text; the
  // Shipping & Returns accordion is omitted entirely while they are.
  const [shippingText, setShippingText] = useState("");
  const [returnsText, setReturnsText] = useState("");

  useEffect(() => {
    let cancelled = false;
    trpc.settings.getProductPageContent
      .query()
      .then((res) => {
        if (cancelled || !res.success || !res.result) return;
        const isAr = locale === "ar";
        setShippingText(
          ((isAr && res.result.shippingTextAr) || res.result.shippingText)?.trim() ?? "",
        );
        setReturnsText(
          ((isAr && res.result.returnsTextAr) || res.result.returnsText)?.trim() ?? "",
        );
      })
      .catch(() => {
        // No policy copy available — the section simply stays hidden rather
        // than falling back to a promise nobody agreed to.
      });
    return () => {
      cancelled = true;
    };
  }, [locale]);

  // ── Sticky Add to bag (phones): only once the main button has scrolled out
  // of view, so the page never shows two Add to bag buttons at once.
  const addToBagRef = useRef<HTMLButtonElement>(null);
  const [showSticky, setShowSticky] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-observe when the button remounts (skeleton → product, product → product)
  useEffect(() => {
    const btn = addToBagRef.current;
    if (!btn || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        // Only once it has gone ABOVE the viewport — not while the shopper is
        // still looking at the gallery and the button is below the fold.
        if (entry) setShowSticky(!entry.isIntersecting && entry.boundingClientRect.top < 0);
      },
      { threshold: 0 },
    );
    observer.observe(btn);
    return () => observer.disconnect();
  }, [product.id, isLoading]);

  const currentImage = images[selectedIdx] || images[0];

  // ── Price computation
  const hasDiscount =
    product.discountPrice != null &&
    typeof product.discountPrice === "number" &&
    product.discountPrice < product.price;

  const discountPct = hasDiscount
    ? Math.round(
        ((product.price - Number(product.discountPrice)) / product.price) * 100,
      )
    : 0;

  const displayPrice = hasDiscount
    ? Number(product.discountPrice)
    : product.price;
  const money = (amount: number) => formatMoney(amount, { locale: locale === "ar" ? "ar" : "en" });

  const [selectedVariants, setSelectedVariants] = useState<
    Record<string, string>
  >({});

  const allVariantsSelected =
    !product.variants?.length ||
    product.variants.every((v) => selectedVariants[v.name]);

  const inStock = product.available && product.stock > 0;
  const canAdd = inStock && allVariantsSelected;
  const wishlisted = isWishlisted(product.id);

  // ── Handlers
  const handleAddToCart = () => {
    if (!canAdd) return;
    // IMPORTANT: invoke parent first so the Meta Pixel `AddToCart` event
    // fires upstream BEFORE the visual toast is shown. The chosen quantity
    // travels with it — it used to be dropped, so the stepper did nothing.
    onAddToCart?.(product, selectedVariants, quantity);
    showCartToast({
      name: product.name,
      price: displayPrice,
      imageUrl: product.imageUrl || product.images?.[0]?.url || "",
    });
  };
  const handleWishlist = () => {
    toggleWishlist(product.id);
    onAddToWishlist?.(product);
  };

  if (isLoading) return <Skeleton />;

  const longCopy = product.longDescription?.trim();
  const shortCopy = product.description?.trim();

  return (
    <div className={`product-page-premium bg-white ${className}`}>
      {/* ── Breadcrumb ── */}
      <div className='mx-auto max-w-7xl px-4 sm:px-6 pt-4 sm:pt-6 pb-2 lg:px-10'>
        <nav className='flex items-center gap-1.5 text-[11px] sm:text-[12px] text-stone-400 overflow-x-auto scrollbar-hide'>
          <a
            href='/'
            className='shrink-0 transition-colors hover:text-stone-600'>
            {t("product.home")}
          </a>
          <span className='text-stone-300'>/</span>
          <a
            href='/shop'
            className='shrink-0 transition-colors hover:text-stone-600'>
            {t("product.shop")}
          </a>
          {product.categoryName && (
            <>
              <span className='text-stone-300'>/</span>
              <span className='text-stone-500 truncate'>
                {product.categoryName}
              </span>
            </>
          )}
        </nav>
      </div>

      {/* ────────────────── Product Section ────────────────── */}
      <section className='pb-24 sm:pb-16 lg:pb-24'>
        <div className='mx-auto max-w-7xl px-4 sm:px-6 lg:px-10'>
          <div className='grid grid-cols-1 items-start gap-5 sm:gap-8 lg:grid-cols-12 lg:gap-14'>
            {/* ── LEFT: Media Column (7/12) ── */}
            <div className='lg:col-span-7'>
              {/* Mobile swipeable image carousel */}
              {images.length > 0 && (
                <MobileImageCarousel
                  images={images}
                  onOpenLightbox={(idx) => {
                    setSelectedIdx(idx);
                    setLightboxOpen(true);
                    onImageClick?.(images[idx]?.url ?? "", idx);
                  }}
                  hasDiscount={hasDiscount}
                  discountPct={discountPct}
                  saveLabel={fillTemplate(t("product.save_pct"), { percent: discountPct })}
                />
              )}

              {/* Desktop: Main image + thumbnails */}
              <div className='hidden sm:flex flex-col gap-1.5'>
                {/* Main image */}
                {currentImage && (
                  <div className='relative'>
                    {/* Sale badge */}
                    {hasDiscount && (
                      <div className='absolute start-3.5 top-3.5 z-10'>
                        <span className='inline-block bg-stone-800 px-2.5 py-1 text-[10px] font-medium tracking-widest text-white uppercase'>
                          {fillTemplate(t("product.save_pct"), { percent: discountPct })}
                        </span>
                      </div>
                    )}
                    <MainImage
                      src={currentImage.url}
                      alt={product.name}
                      onOpenLightbox={() => setLightboxOpen(true)}
                    />
                  </div>
                )}

                {/* Thumbnails — tight to image */}
                {images.length > 1 && (
                  <div className='flex gap-1.5 overflow-x-auto scrollbar-hide'>
                    {images.map((img, i) => (
                      <button
                        key={i}
                        type='button'
                        onClick={() => setSelectedIdx(i)}
                        aria-label={`${product.name} ${i + 1}`}
                        className={`relative aspect-square w-17 shrink-0 overflow-hidden transition-all duration-200 ${
                          selectedIdx === i
                            ? "ring-1 ring-stone-800 ring-offset-1"
                            : "opacity-50 hover:opacity-85"
                        }`}>
                        <img
                          src={img.url}
                          alt=''
                          className='absolute inset-0 h-full w-full object-cover'
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ── RIGHT: Product Info Column (5/12) ── */}
            <div className='lg:sticky lg:top-8 lg:col-span-5 flex flex-col'>
              {/* Category */}
              {product.categoryName && (
                <span className='mb-2 text-[11px] font-normal uppercase tracking-[0.18em] text-stone-500'>
                  {product.categoryName}
                </span>
              )}

              {/* Title */}
              <h1 className='mb-2 text-[1.35rem] font-light leading-[1.3] tracking-wide text-stone-900 sm:text-[1.75rem] lg:text-[1.85rem]'>
                {product.name}
              </h1>

              {/* Rating */}
              {product.rating !== undefined && product.rating > 0 && (
                <div className='mb-3'>
                  <StarRating
                    rating={product.rating}
                    count={product.reviewCount}
                  />
                </div>
              )}

              {/* Price */}
              <div className='mb-1.5 flex items-baseline gap-2.5'>
                <span className='text-lg sm:text-xl font-normal tracking-wide text-stone-900'>
                  {money(displayPrice)}
                </span>
                {hasDiscount && (
                  <span className='text-[13px] text-stone-400 line-through'>
                    {money(product.price)}
                  </span>
                )}
              </div>

              {/* No shipping teaser here. A hardcoded "+ EGP 45 standard
                  shipping · Free above EGP 300" line used to sit under the
                  price; neither figure was backed by anything — shipping is
                  priced per governorate at checkout and there is no global
                  free-shipping threshold. Shipping policy copy lives in the
                  admin-authored Shipping & Returns content. */}

              {/* Availability */}
              <div className='mb-4 flex items-center gap-2'>
                <span className={cn("h-1.5 w-1.5 rounded-full", inStock ? "bg-emerald-500" : "bg-stone-300")} />
                <span className={cn("text-[12px] tracking-wide", inStock ? "text-stone-600" : "text-stone-400")}>
                  {inStock ? t("in_stock") : t("out_of_stock")}
                </span>
              </div>

              {/* Decision summary — short, real product facts only */}
              <ProductDecisionSummary product={product} className='mb-4 border-y border-stone-200 py-3' />

              {/* Variant Selector */}
              {product.variants && product.variants.length > 0 && (
                <VariantSelector
                  variants={product.variants}
                  selectedVariants={selectedVariants}
                  onVariantChange={(name, value) =>
                    setSelectedVariants((prev) => ({ ...prev, [name]: value }))
                  }
                  className='mb-4'
                />
              )}

              {/* Quantity + Add to Bag row */}
              <div className='mb-3 flex items-stretch gap-2'>
                {/* Quantity */}
                <div className='flex h-12 shrink-0 items-center border border-stone-300'>
                  <button
                    type='button'
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    disabled={quantity <= 1 || !inStock}
                    aria-label={t("product.decrease")}
                    className='flex h-full w-10 items-center justify-center text-stone-600 transition-colors hover:bg-stone-50 disabled:opacity-30'>
                    <Minus size={14} />
                  </button>
                  <span className='flex h-full w-9 items-center justify-center text-[14px] tabular-nums text-stone-800' aria-live='polite'>
                    {quantity}
                  </span>
                  <button
                    type='button'
                    onClick={() =>
                      setQuantity(Math.min(product.stock, quantity + 1))
                    }
                    disabled={quantity >= product.stock || !inStock}
                    aria-label={t("product.increase")}
                    className='flex h-full w-10 items-center justify-center text-stone-600 transition-colors hover:bg-stone-50 disabled:opacity-30'>
                    <Plus size={14} />
                  </button>
                </div>

                {/* Add to Bag */}
                <button
                  ref={addToBagRef}
                  type='button'
                  onClick={handleAddToCart}
                  disabled={!canAdd}
                  data-add-to-cart='true'
                  className='flex h-12 min-w-0 flex-1 items-center justify-center gap-2 bg-stone-900 px-4 text-[13px] font-medium tracking-wide text-white transition-colors duration-200 hover:bg-stone-700 disabled:cursor-not-allowed disabled:bg-stone-200 disabled:text-stone-400'>
                  <ShoppingBag size={16} strokeWidth={1.75} />
                  {inStock ? t("product.add_to_bag") : t("out_of_stock")}
                </button>

                {/* Wishlist — secondary */}
                {showWishlist && (
                  <button
                    type='button'
                    onClick={handleWishlist}
                    aria-pressed={wishlisted}
                    aria-label={t("product.wishlist")}
                    className={cn(
                      "flex h-12 w-12 shrink-0 items-center justify-center border transition-colors duration-200",
                      wishlisted
                        ? "border-stone-800 text-stone-900"
                        : "border-stone-300 text-stone-500 hover:border-stone-500 hover:text-stone-700",
                    )}>
                    <Heart size={16} strokeWidth={1.5} className={cn(wishlisted && "fill-current")} />
                  </button>
                )}
              </div>

              {/* Purchase reassurance — store facts only: cash on delivery is
                  always offered (shared/config/payment.ts) and every shipping
                  destination is an Egyptian governorate. No invented free
                  shipping or return windows. */}
              <ul className='mb-6 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[12px] text-stone-500' data-testid='purchase-reassurance'>
                <li className='flex items-center gap-1.5'>
                  <Banknote size={14} className='text-stone-400' aria-hidden />
                  {t("product.reassure_cod")}
                </li>
                <li className='flex items-center gap-1.5'>
                  <Truck size={14} className='text-stone-400' aria-hidden />
                  {t("product.reassure_delivery")}
                </li>
              </ul>

              {/* SKU */}
              {product.sku && (
                <p className='mb-5 text-[11px] tracking-wide text-stone-400'>
                  SKU: {product.sku}
                </p>
              )}

              {/* ── Long-form information, after the purchase decision ── */}
              <div className='border-t border-stone-200' data-testid='product-details'>
                {(shortCopy || longCopy) && (
                  <AccordionSection title={t("product.description")} defaultOpen>
                    <div className='space-y-3 whitespace-pre-line'>
                      {shortCopy && <p>{shortCopy}</p>}
                      {longCopy && longCopy !== shortCopy && <p>{longCopy}</p>}
                    </div>
                  </AccordionSection>
                )}

                {product.specifications &&
                  product.specifications.length > 0 && (
                    <AccordionSection title={t("product.specifications")}>
                      <div className='space-y-2'>
                        {product.specifications.map((spec, i) => (
                          <div
                            key={i}
                            className='flex justify-between gap-4 text-[13px]'>
                            <span className='text-stone-400'>{spec.label}</span>
                            <span className='text-stone-600'>{spec.value}</span>
                          </div>
                        ))}
                      </div>
                    </AccordionSection>
                  )}

                {/* Shipping & Returns — admin-authored, never invented.
                    This section used to hardcode "Complimentary standard
                    shipping on all orders" and a 30-day return window, which
                    are policies this store has not set. It now renders only
                    what an admin wrote in Dashboard > Settings > Product page
                    content, and disappears completely when that is empty. */}
                {(shippingText || returnsText) && (
                  <AccordionSection title={t("product.shipping_returns")}>
                    <div className='space-y-3 whitespace-pre-line'>
                      {shippingText && <p>{shippingText}</p>}
                      {returnsText && <p>{returnsText}</p>}
                    </div>
                  </AccordionSection>
                )}

                {/* Care Guide — generic handling advice that makes no claim
                    about this store's products, materials or durability. */}
                <AccordionSection title={t("product.care_guide")}>
                  <div className='space-y-3'>
                    <p>{t("product.care_1")}</p>
                    <p>{t("product.care_2")}</p>
                  </div>
                </AccordionSection>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ────────────────── Related Products ────────────────── */}
      {relatedProducts && relatedProducts.length > 0 && (
        <section className='border-t border-stone-100 bg-stone-50/50 py-14 lg:py-20'>
          <div className='mx-auto max-w-7xl px-4 sm:px-6 lg:px-10'>
            <div className='mb-8 text-center'>
              <h2 className='text-[1.4rem] font-light tracking-wide text-stone-800 sm:text-[1.75rem]'>
                {t("product.related")}
              </h2>
            </div>
            <HomeFeaturedProducts
              title=''
              products={relatedProducts}
              showViewAllButton
              viewAllHref='/shop'
              maxProducts={4}
            />
          </div>
        </section>
      )}

      {/* ────────────────── Lightbox ────────────────── */}
      {lightboxOpen && images.length > 0 && (
        <Lightbox
          images={images}
          startIndex={selectedIdx}
          onClose={() => setLightboxOpen(false)}
        />
      )}

      {/* ── Mobile sticky Add to bag ──
          Appears only after the main button has scrolled away, and sits ABOVE
          the fixed mobile bottom nav (h-16 + safe area) instead of under it. */}
      {inStock && (
        <div
          style={{
            bottom: "calc(4rem + env(safe-area-inset-bottom))",
            zIndex: "var(--perce-z-sticky)",
          }}
          aria-hidden={!showSticky}
          data-testid='sticky-add-to-bag'
          className={cn(
            "fixed inset-x-0 border-t border-stone-200 bg-white/95 px-4 py-2.5 backdrop-blur-sm transition-transform duration-300 sm:hidden",
            showSticky ? "translate-y-0" : "pointer-events-none translate-y-[200%]",
          )}>
          <div className='flex items-center gap-3'>
            <div className='min-w-0 flex-1'>
              <p className='truncate text-[12px] text-stone-500'>{product.name}</p>
              <p className='text-[14px] font-medium text-stone-900'>
                {money(displayPrice)}
                {quantity > 1 && <span className='ms-1.5 text-[12px] font-normal text-stone-500'>× {quantity}</span>}
              </p>
            </div>
            <button
              type='button'
              onClick={handleAddToCart}
              disabled={!canAdd}
              tabIndex={showSticky ? 0 : -1}
              className='flex h-11 shrink-0 items-center justify-center gap-2 bg-stone-900 px-5 text-[13px] font-medium text-white transition-colors hover:bg-stone-700 disabled:cursor-not-allowed disabled:bg-stone-200 disabled:text-stone-400'>
              <ShoppingBag size={15} strokeWidth={1.75} />
              {t("product.add_to_bag")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

ProductPagePremium.displayName = "ProductPagePremium";
