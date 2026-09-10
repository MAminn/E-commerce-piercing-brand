import { useRef, useState, useEffect, useCallback } from "react";
import { cn } from "#root/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ProductCard } from "#root/components/shop/ProductCard";
import type { FeaturedProduct } from "#root/components/template-system/home/HomeFeaturedProducts";

interface ProductCarouselProps {
  products: FeaturedProduct[];
  title?: string;
  subtitle?: string;
  viewAllHref?: string;
  viewAllText?: string;
  className?: string;
}

/**
 * Horizontal scrollable product carousel with drag/touch support.
 * Matches the matchperfumes.com product slider sections.
 */
export function ProductCarousel({
  products,
  title,
  subtitle,
  viewAllHref,
  viewAllText = "View All",
  className,
}: ProductCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    checkScroll();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", checkScroll, { passive: true });
    window.addEventListener("resize", checkScroll);
    return () => {
      el.removeEventListener("scroll", checkScroll);
      window.removeEventListener("resize", checkScroll);
    };
  }, [checkScroll, products]);

  const scroll = (direction: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    const cardWidth = el.querySelector("[data-card]")?.clientWidth ?? 280;
    const gap = 24;
    const distance = (cardWidth + gap) * 2;
    el.scrollBy({
      left: direction === "right" ? distance : -distance,
      behavior: "smooth",
    });
  };

  if (!products.length) return null;

  return (
    <section className={cn("py-12 sm:py-16 lg:py-20", className)}>
      <div className='max-w-[1400px] mx-auto'>
        {/* Header row */}
        {(title || viewAllHref) && (
          <div className='flex items-end justify-between px-4 sm:px-6 lg:px-8 mb-8 sm:mb-10'>
            <div>
              {title && (
                <h2 className='text-2xl sm:text-3xl lg:text-4xl font-light text-stone-900 tracking-tight'>
                  {title}
                </h2>
              )}
              {subtitle && (
                <p className='mt-2 text-sm sm:text-base text-stone-500 font-light'>
                  {subtitle}
                </p>
              )}
            </div>
            <div className='flex items-center gap-3'>
              {viewAllHref && (
                <a
                  href={viewAllHref}
                  className='text-sm text-stone-600 hover:text-stone-900 font-light underline underline-offset-4 decoration-stone-300 hover:decoration-stone-900 transition-colors hidden sm:inline-block'>
                  {viewAllText}
                </a>
              )}
              {/* Desktop arrows */}
              <div className='hidden md:flex items-center gap-1.5'>
                <button
                  onClick={() => scroll("left")}
                  disabled={!canScrollLeft}
                  className='w-9 h-9 flex items-center justify-center border border-stone-200 hover:border-stone-900 disabled:opacity-20 disabled:cursor-not-allowed transition-colors'
                  aria-label='Scroll left'>
                  <ChevronLeft className='w-4 h-4' />
                </button>
                <button
                  onClick={() => scroll("right")}
                  disabled={!canScrollRight}
                  className='w-9 h-9 flex items-center justify-center border border-stone-200 hover:border-stone-900 disabled:opacity-20 disabled:cursor-not-allowed transition-colors'
                  aria-label='Scroll right'>
                  <ChevronRight className='w-4 h-4' />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Scrollable track */}
        <div
          ref={scrollRef}
          className='flex gap-4 sm:gap-6 overflow-x-auto scrollbar-hide snap-x snap-mandatory px-4 sm:px-6 lg:px-8 pb-2'>
          {products.map((product) => (
            <div
              key={product.id}
              data-card
              className='flex-none w-[220px] sm:w-[260px] lg:w-[280px] snap-start'>
              <ProductCard
                product={product}
                showVendor={false}
                showImage={true}
                imageSize='medium'
                className='h-full'
              />
            </div>
          ))}
        </div>

        {/* Mobile view-all link */}
        {viewAllHref && (
          <div className='mt-6 text-center sm:hidden'>
            <a
              href={viewAllHref}
              className='text-sm text-stone-600 hover:text-stone-900 font-light underline underline-offset-4'>
              {viewAllText}
            </a>
          </div>
        )}
      </div>
    </section>
  );
}
