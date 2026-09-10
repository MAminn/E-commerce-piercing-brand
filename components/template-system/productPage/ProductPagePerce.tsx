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
  ShoppingCart,
  Heart,
  Star,
  StarHalf,
  Minus,
  Plus,
  X,
  ChevronLeft,
  ChevronRight,
  Truck,
  Shield,
  RotateCcw,
  ChevronDown,
  ZoomIn,
} from "lucide-react";
import { showCartToast } from "#root/components/ui/cart-toast";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ProductPagePerceProps {
  product?: ProductPageProduct;
  relatedProducts?: FeaturedProduct[];
  showWishlist?: boolean;
  showSocialShare?: boolean;
  onAddToCart?: (
    product: ProductPageProduct,
    selectedOptions?: Record<string, string>,
  ) => void;
  onAddToWishlist?: (product: ProductPageProduct) => void;
  onImageClick?: (imageUrl: string, index: number) => void;
  isLoading?: boolean;
  className?: string;
}

// ─── Mock / Defaults ────────────────────────────────────────────────────────

const DEFAULT_PRODUCT: ProductPageProduct = {
  id: "perce-mock-1",
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
  brand: "Percé",
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
  return (
    <div
      className='group relative w-full cursor-pointer overflow-hidden'
      onClick={onOpenLightbox}>
      <img src={src} alt={alt} draggable={false} className='block w-full' />
      {/* Click hint */}
      <div className='pointer-events-none absolute inset-0 flex items-end justify-center pb-5 opacity-0 transition-opacity duration-300 group-hover:opacity-100'>
        <span className='flex items-center gap-1.5 rounded-full bg-black/40 px-3.5 py-1.5 text-[11px] tracking-wider text-white/90 backdrop-blur-sm'>
          <ZoomIn size={13} />
          Click to expand
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
  discountPct,
}: {
  images: ProductImage[];
  onOpenLightbox: (index: number) => void;
  hasDiscount: boolean;
  discountPct: number;
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
        <div className='absolute left-4 top-3.5 z-10'>
          <span className='inline-block bg-stone-800 px-2.5 py-1 text-[10px] font-medium tracking-widest text-white uppercase'>
            Save {discountPct}%
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
              alt={`Product image ${i + 1}`}
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

export function ProductPagePerce({
  product = DEFAULT_PRODUCT,
  relatedProducts,
  showWishlist = true,
  onAddToCart,
  onAddToWishlist,
  onImageClick,
  isLoading = false,
  className = "",
}: ProductPagePerceProps) {
  // ── Image state
  const images: ProductImage[] = product.images?.length
    ? product.images
    : product.imageUrl
      ? [{ url: product.imageUrl, isPrimary: true }]
      : [];

  const [selectedIdx, setSelectedIdx] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [quantity, setQuantity] = useState(1);

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

  const [selectedVariants, setSelectedVariants] = useState<
    Record<string, string>
  >({});

  const allVariantsSelected =
    !product.variants?.length ||
    product.variants.every((v) => selectedVariants[v.name]);

  // ── Handlers
  const handleAddToCart = () => {
    // IMPORTANT: invoke parent first so the Meta Pixel `AddToCart` event
    // fires upstream BEFORE the visual toast is shown.
    onAddToCart?.(product, selectedVariants);
    showCartToast({
      name: product.name,
      price: hasDiscount
        ? Number(product.discountPrice)
        : Number(product.price),
      imageUrl: product.imageUrl || product.images?.[0]?.url || "",
    });
  };
  const handleWishlist = () => onAddToWishlist?.(product);

  if (isLoading) return <Skeleton />;

  return (
    <div className={`product-page-perce bg-white ${className}`}>
      {/* ── Breadcrumb ── */}
      <div className='mx-auto max-w-7xl px-4 sm:px-6 pt-4 sm:pt-6 pb-2 lg:px-10'>
        <nav className='flex items-center gap-1.5 text-[11px] sm:text-[12px] text-stone-400 overflow-x-auto scrollbar-hide'>
          <a
            href='/'
            className='shrink-0 transition-colors hover:text-stone-600'>
            Home
          </a>
          <span className='text-stone-300'>/</span>
          <a
            href='/shop'
            className='shrink-0 transition-colors hover:text-stone-600'>
            Collection
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
                  }}
                  hasDiscount={hasDiscount}
                  discountPct={discountPct}
                />
              )}

              {/* Desktop: Main image + thumbnails */}
              <div className='hidden sm:flex flex-col gap-1.5'>
                {/* Main image */}
                {currentImage && (
                  <div className='relative'>
                    {/* Sale badge */}
                    {hasDiscount && (
                      <div className='absolute left-3.5 top-3.5 z-10'>
                        <span className='inline-block bg-stone-800 px-2.5 py-1 text-[10px] font-medium tracking-widest text-white uppercase'>
                          Save {discountPct}%
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
                        className={`relative aspect-square w-17 shrink-0 overflow-hidden transition-all duration-200 ${
                          selectedIdx === i
                            ? "ring-1 ring-stone-800 ring-offset-1"
                            : "opacity-50 hover:opacity-85"
                        }`}>
                        <img
                          src={img.url}
                          alt={`Thumbnail ${i + 1}`}
                          className='absolute inset-0 h-full w-full object-cover'
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ── RIGHT: Product Info Column (5/12) ── */}
            <div className='lg:sticky lg:top-8 lg:col-span-5 flex flex-col pt-0 lg:pt-0'>
              {/* Category */}
              {product.categoryName && (
                <span className='mb-2.5 text-[11px] font-normal uppercase tracking-[0.18em] text-stone-400'>
                  {product.categoryName}
                </span>
              )}

              {/* Title */}
              <h1 className='mb-2 sm:mb-3 text-[1.3rem] font-light leading-[1.3] tracking-wide text-stone-900 sm:text-[1.75rem] lg:text-[1.85rem]'>
                {product.name}
              </h1>

              {/* Rating */}
              {product.rating !== undefined && product.rating > 0 && (
                <div className='mb-4'>
                  <StarRating
                    rating={product.rating}
                    count={product.reviewCount}
                  />
                </div>
              )}

              {/* Price */}
              <div className='mb-1 flex items-baseline gap-2.5'>
                <span className='text-base sm:text-lg font-light tracking-wide text-stone-900'>
                  EGP {Number(displayPrice).toFixed(2)}
                </span>
                {hasDiscount && (
                  <span className='text-[12px] sm:text-[13px] text-stone-400 line-through'>
                    EGP {Number(product.price).toFixed(2)}
                  </span>
                )}
              </div>

              {/* Shipping transparency (display-only) */}
              <p className='mb-3 sm:mb-5 text-[11px] sm:text-xs text-stone-400 tracking-wide'>
                + EGP 45 standard shipping · Free above EGP 300
              </p>

              {/* Availability */}
              <div className='mb-3 sm:mb-5 flex items-center gap-2'>
                {product.available && product.stock > 0 ? (
                  <>
                    <span className='h-1.5 w-1.5 rounded-full bg-emerald-500' />
                    <span className='text-[12px] tracking-wide text-stone-500'>
                      In Stock
                    </span>
                  </>
                ) : (
                  <>
                    <span className='h-1.5 w-1.5 rounded-full bg-stone-300' />
                    <span className='text-[12px] tracking-wide text-stone-400'>
                      Out of Stock
                    </span>
                  </>
                )}
              </div>

              {/* Divider */}
              <div className='mb-3 sm:mb-5 h-px bg-stone-200' />

              {/* Short Description */}
              {product.description && (
                <p className='mb-4 sm:mb-6 text-[13px] sm:text-[14px] leading-[1.75] sm:leading-[1.85] text-stone-500'>
                  {product.description}
                </p>
              )}

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
              <div className='mb-4 flex flex-col gap-2.5 sm:flex-row sm:items-center'>
                {/* Quantity */}
                <div className='flex h-12 items-center rounded-lg border border-stone-200/80'>
                  <button
                    type='button'
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    disabled={quantity <= 1}
                    className='flex h-full w-10 items-center justify-center rounded-l-lg text-stone-400 transition-colors hover:bg-stone-50 hover:text-stone-600 disabled:opacity-25'>
                    <Minus size={13} />
                  </button>
                  <span className='flex h-full w-10 items-center justify-center border-x border-stone-200/80 text-[13px] font-light text-stone-700'>
                    {quantity}
                  </span>
                  <button
                    type='button'
                    onClick={() =>
                      setQuantity(Math.min(product.stock, quantity + 1))
                    }
                    disabled={quantity >= product.stock}
                    className='flex h-full w-10 items-center justify-center rounded-r-lg text-stone-400 transition-colors hover:bg-stone-50 hover:text-stone-600 disabled:opacity-25'>
                    <Plus size={13} />
                  </button>
                </div>

                {/* Add to Bag */}
                <button
                  type='button'
                  onClick={handleAddToCart}
                  disabled={
                    !product.available ||
                    product.stock === 0 ||
                    !allVariantsSelected
                  }
                  className='flex h-12 p-4 flex-1 items-center justify-center gap-2.5 rounded-lg bg-stone-800 text-[11.5px] font-normal uppercase tracking-[0.18em] text-stone-100 transition-colors duration-200 hover:bg-stone-700 disabled:cursor-not-allowed disabled:bg-stone-200 disabled:text-stone-400'>
                  <ShoppingCart size={14} strokeWidth={1.5} />
                  Add to Bag
                </button>

                {/* Wishlist */}
                {showWishlist && (
                  <button
                    type='button'
                    onClick={handleWishlist}
                    className='flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-stone-200/80 text-stone-350 transition-colors duration-200 hover:border-stone-300 hover:text-stone-500'>
                    <Heart size={15} strokeWidth={1.5} />
                  </button>
                )}
              </div>

              {/* Trust indicators */}
              <div className='mb-5 sm:mb-7 flex flex-wrap items-center gap-3 sm:gap-5 border-t border-stone-100 pt-4 sm:pt-5'>
                <div className='flex items-center gap-1.5'>
                  <Truck size={13} className='text-stone-400' />
                  <span className='text-[10px] sm:text-[11px] tracking-wide text-stone-400'>
                    Free Shipping
                  </span>
                </div>
                <div className='flex items-center gap-1.5'>
                  <Shield size={13} className='text-stone-400' />
                  <span className='text-[10px] sm:text-[11px] tracking-wide text-stone-400'>
                    Secure Checkout
                  </span>
                </div>
                <div className='flex items-center gap-1.5'>
                  <RotateCcw size={13} className='text-stone-400' />
                  <span className='text-[10px] sm:text-[11px] tracking-wide text-stone-400'>
                    30-Day Returns
                  </span>
                </div>
              </div>

              {/* SKU */}
              {product.sku && (
                <p className='mb-7 text-[11px] tracking-wide text-stone-300'>
                  SKU: {product.sku}
                </p>
              )}

              {/* ── Accordion Information Sections ── */}
              <div className='border-t border-stone-200'>
                <AccordionSection title='Description' defaultOpen>
                  <div className='whitespace-pre-line'>
                    {product.longDescription || product.description || "—"}
                  </div>
                </AccordionSection>

                {product.specifications &&
                  product.specifications.length > 0 && (
                    <AccordionSection title='Materials & Details'>
                      <div className='space-y-2'>
                        {product.specifications.map((spec, i) => (
                          <div
                            key={i}
                            className='flex justify-between text-[13px]'>
                            <span className='text-stone-400'>{spec.label}</span>
                            <span className='text-stone-600'>{spec.value}</span>
                          </div>
                        ))}
                      </div>
                    </AccordionSection>
                  )}

                <AccordionSection title='Shipping & Returns'>
                  <div className='space-y-3'>
                    <p>
                      Complimentary standard shipping on all orders. Express
                      delivery available at checkout.
                    </p>
                    <p>
                      We accept returns of unworn items in original packaging
                      within 30 days. Contact our care team to initiate a
                      return.
                    </p>
                  </div>
                </AccordionSection>

                <AccordionSection title='Care Guide'>
                  <div className='space-y-3'>
                    <p>
                      Store in a cool, dry place away from direct sunlight.
                      Clean gently with a soft, lint-free cloth.
                    </p>
                    <p>
                      Avoid contact with perfumes, lotions, and chemicals.
                      Remove before swimming or exercising.
                    </p>
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
          <div className='mx-auto max-w-7xl px-6 lg:px-10'>
            <div className='mb-10 text-center'>
              <h2 className='text-[1.55rem] font-light tracking-wide text-stone-800 sm:text-[1.75rem]'>
                You May Also Love
              </h2>
              <p className='mt-2 text-[13px] text-stone-400'>
                Curated pieces to complement your collection
              </p>
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

      {/* ── Mobile Sticky Add-to-Cart Bar ── */}
      <div className='fixed bottom-0 left-0 right-0 z-40 border-t border-stone-200 bg-white/95 backdrop-blur-sm px-4 py-3 sm:hidden'>
        <div className='flex items-center gap-3'>
          <div className='flex-1 min-w-0'>
            <p className='text-[12px] font-light text-stone-500 truncate'>
              {product.name}
            </p>
            <p className='text-[14px] font-medium text-stone-900'>
              EGP {Number(displayPrice).toFixed(2)}
              {hasDiscount && (
                <span className='ml-1.5 text-[11px] text-stone-400 line-through font-light'>
                  EGP {Number(product.price).toFixed(2)}
                </span>
              )}
            </p>
          </div>
          <button
            type='button'
            onClick={handleAddToCart}
            disabled={
              !product.available || product.stock === 0 || !allVariantsSelected
            }
            className='flex h-11 items-center justify-center gap-2 rounded-lg bg-stone-800 px-6 text-[11px] font-normal uppercase tracking-[0.15em] text-stone-100 transition-colors hover:bg-stone-700 disabled:cursor-not-allowed disabled:bg-stone-200 disabled:text-stone-400'>
            <ShoppingCart size={14} strokeWidth={1.5} />
            Add to Bag
          </button>
        </div>
      </div>
    </div>
  );
}

ProductPagePerce.displayName = "ProductPagePerce";
