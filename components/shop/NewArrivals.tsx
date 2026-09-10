import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "#root/components/utils/Link";
import { cn } from "#root/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getProductUrl } from "#root/lib/utils/route-helpers";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface NewArrivalProduct {
  id: string;
  slug?: string | null;
  name: string;
  price: number;
  discountPrice?: number | null;
  stock: number;
  imageUrl?: string;
  images?: { url: string; isPrimary?: boolean }[];
  categoryName?: string | null;
  available: boolean;
}

export interface NewArrivalsProps {
  products?: NewArrivalProduct[];
  isLoading?: boolean;
  title?: string;
  maxProducts?: number;
  className?: string;
  /** When false, hides the built-in header row (title + nav arrows). Defaults to true. */
  showHeader?: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function resolveImageUrl(product: NewArrivalProduct): string | null {
  if (product.images && product.images.length > 0) {
    const primary = product.images.find((img) => img.isPrimary);
    const img = primary || product.images[0];
    if (img?.url) {
      return img.url.startsWith("http") || img.url.startsWith("/")
        ? img.url
        : `/uploads/${img.url}`;
    }
  }
  if (product.imageUrl) {
    return product.imageUrl.startsWith("http") ||
      product.imageUrl.startsWith("/")
      ? product.imageUrl
      : `/uploads/${product.imageUrl}`;
  }
  return null;
}

function formatPrice(value: number): string {
  return `EGP ${value.toFixed(2).replace(".", ",")}`;
}

// ─── Badge logic ─────────────────────────────────────────────────────────────

type BadgeType = "new" | "back-in-stock" | "sold-out";

function getBadge(product: NewArrivalProduct): {
  label: string;
  type: BadgeType;
} | null {
  if (!product.available || product.stock <= 0) {
    return { label: "SOLD OUT", type: "sold-out" };
  }
  // All items in "new arrivals" get the NEW IN badge by default
  return { label: "NEW IN", type: "new" };
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function NewArrivalsSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className='flex gap-0 overflow-hidden'>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className='shrink-0 w-[72vw] sm:w-[42vw] lg:w-[22%] border-r border-stone-100 last:border-r-0'>
          <div className='aspect-3/4 bg-stone-50 animate-pulse' />
          <div className='px-5 py-4 space-y-2.5'>
            <div className='h-3 w-20 bg-stone-100 animate-pulse' />
            <div className='h-3 w-32 bg-stone-100 animate-pulse' />
            <div className='h-3 w-16 bg-stone-100 animate-pulse' />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Product Card ────────────────────────────────────────────────────────────

function NewArrivalCard({ product }: { product: NewArrivalProduct }) {
  const imageUrl = resolveImageUrl(product);
  const badge = getBadge(product);
  const hasDiscount =
    product.discountPrice != null && product.discountPrice < product.price;

  return (
    <Link
      href={getProductUrl(product)}
      className={cn(
        "group relative block shrink-0 snap-start",
        "w-[72vw] sm:w-[42vw] lg:w-[22%]",

        "focus:outline-none",
      )}>
      {/* Image area */}
      <div className='relative aspect-3/4 bg-stone-50 overflow-hidden'>
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={product.name}
            loading='lazy'
            className={cn(
              "w-full h-full object-cover object-center",
              "transition-transform duration-700 ease-out",
              "group-hover:scale-[1.03]",
            )}
          />
        ) : (
          <div className='w-full h-full flex items-center justify-center'>
            <span className='text-stone-200 text-[11px] uppercase tracking-[0.2em] font-light'>
              No image
            </span>
          </div>
        )}

        {/* Badge — top left */}
        {badge && (
          <span
            className={cn(
              "absolute top-4 left-4",
              "text-[10px] uppercase tracking-[0.18em] font-light leading-none",
              "px-2.5 py-1.5",
              badge.type === "sold-out"
                ? "text-stone-400 bg-white/80"
                : "text-stone-600 bg-white/80",
            )}>
            {badge.label}
          </span>
        )}

        {/* Wishlist placeholder — top right (visual only) */}
        <button
          type='button'
          aria-label='Add to wishlist'
          className={cn(
            "absolute top-4 right-4",
            "w-8 h-8 flex items-center justify-center",
            "text-stone-300 hover:text-stone-500 transition-colors duration-300",
          )}
          onClick={(e) => e.preventDefault()}>
          <svg
            xmlns='http://www.w3.org/2000/svg'
            viewBox='0 0 24 24'
            fill='none'
            stroke='currentColor'
            strokeWidth='1.2'
            className='w-4.5 h-4.5'>
            <path d='M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z' />
          </svg>
        </button>
      </div>

      {/* Info area */}
      <div className='px-5 py-4 space-y-1.5'>
        {/* Product name */}
        <h3 className='text-[12px] sm:text-[13px] text-stone-800 font-normal leading-snug tracking-wide line-clamp-2'>
          {product.name}
        </h3>

        {/* Category — subtle */}
        {product.categoryName && (
          <p className='text-[10px] text-stone-400 font-light tracking-wide uppercase'>
            {product.categoryName}
          </p>
        )}

        {/* Price */}
        <div className='flex items-center gap-2 pt-0.5'>
          {hasDiscount ? (
            <>
              <span className='text-[12px] text-stone-800 font-normal tracking-wide'>
                {formatPrice(product.discountPrice!)}
              </span>
              <span className='text-[11px] text-stone-300 line-through font-light tracking-wide'>
                {formatPrice(product.price)}
              </span>
            </>
          ) : (
            <span className='text-[12px] text-stone-800 font-normal tracking-wide'>
              {formatPrice(product.price)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function NewArrivals({
  products = [],
  isLoading = false,
  title = "NEW IN",
  maxProducts = 8,
  className,
  showHeader = true,
}: NewArrivalsProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const displayed = useMemo(
    () => products.slice(0, maxProducts),
    [products, maxProducts],
  );

  // Check scroll state
  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  }, []);

  useEffect(() => {
    updateScrollState();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateScrollState, { passive: true });
    window.addEventListener("resize", updateScrollState);
    return () => {
      el.removeEventListener("scroll", updateScrollState);
      window.removeEventListener("resize", updateScrollState);
    };
  }, [updateScrollState, displayed]);

  const scroll = useCallback((direction: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    const amount = el.clientWidth * 0.75;
    el.scrollBy({
      left: direction === "left" ? -amount : amount,
      behavior: "smooth",
    });
  }, []);

  if (!isLoading && displayed.length === 0) {
    return null;
  }

  return (
    <section className={cn("bg-white", className)}>
      <div className='container mx-auto px-6 sm:px-8 lg:px-12'>
        {/* Section header */}
        {showHeader && (
          <div className='flex items-center justify-between mb-8 sm:mb-10'>
            <h2 className='text-base sm:text-lg font-medium text-stone-900 tracking-wide uppercase'>
              {title}
            </h2>

            {/* Navigation arrows */}
            <div className='flex items-center gap-1'>
              <button
                type='button'
                aria-label='Scroll left'
                disabled={!canScrollLeft}
                onClick={() => scroll("left")}
                className={cn(
                  "w-8 h-8 flex items-center justify-center transition-colors duration-200",
                  canScrollLeft
                    ? "text-stone-600 hover:text-stone-900"
                    : "text-stone-200 cursor-default",
                )}>
                <ChevronLeft className='w-4 h-4' strokeWidth={1.5} />
              </button>
              <button
                type='button'
                aria-label='Scroll right'
                disabled={!canScrollRight}
                onClick={() => scroll("right")}
                className={cn(
                  "w-8 h-8 flex items-center justify-center transition-colors duration-200",
                  canScrollRight
                    ? "text-stone-600 hover:text-stone-900"
                    : "text-stone-200 cursor-default",
                )}>
                <ChevronRight className='w-4 h-4' strokeWidth={1.5} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Scrollable product strip — full-bleed */}
      <div className='container mx-auto px-6 sm:px-8 lg:px-12'>
        {isLoading ? (
          <NewArrivalsSkeleton />
        ) : (
          <div
            ref={scrollRef}
            className='overflow-x-auto overflow-y-hidden scrollbar-hide snap-x snap-mandatory'>
            <div className='flex gap-4 w-full'>
              {displayed.map((product) => (
                <NewArrivalCard key={product.id} product={product} />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

NewArrivals.displayName = "NewArrivals";
