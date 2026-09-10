import { useRef, useState, useEffect, useCallback } from "react";
import { cn } from "#root/lib/utils";
import { ChevronLeft, ChevronRight, ArrowRight } from "lucide-react";
import {
  MinimalProductCard,
  type MinimalProduct,
} from "#root/components/template-system/minimal/MinimalProductCard";
import { useMinimalI18n } from "#root/lib/i18n/MinimalI18nContext";

interface MinimalProductCarouselProps {
  products: MinimalProduct[];
  title?: string;
  viewAllHref?: string;
  viewAllText?: string;
  className?: string;
  onQuickView?: (product: MinimalProduct) => void;
  id?: string;
}

/**
 * Product carousel for the minimal template.
 * Uses MinimalProductCard with quick-view + wishlist icons.
 * Title has a centred underline decoration matching matchperfumes.com.
 */
export function MinimalProductCarousel({
  products,
  title,
  viewAllHref,
  viewAllText,
  className,
  onQuickView,
  id,
}: MinimalProductCarouselProps) {
  const { t } = useMinimalI18n();
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
    <section id={id} className={cn("py-12 sm:py-16 lg:py-20", className)}>
      <div className='max-w-[1400px] mx-auto'>
        {/* Section heading with underline */}
        {title && (
          <div className='text-center mb-10 sm:mb-14 px-4'>
            <h2 className='text-2xl sm:text-3xl font-light text-stone-900 tracking-tight inline-block relative pb-3'>
              {title}
              <span className='absolute bottom-0 left-1/4 right-1/4 h-[2px] bg-stone-900' />
            </h2>
          </div>
        )}

        {/* Nav arrows + carousel */}
        <div className='relative'>
          {/* Desktop arrows */}
          <button
            onClick={() => scroll("left")}
            disabled={!canScrollLeft}
            className='absolute -start-2 top-1/2 -translate-y-1/2 z-10 hidden md:flex w-9 h-9 items-center justify-center border border-stone-200 bg-white hover:border-stone-900 disabled:opacity-20 disabled:cursor-not-allowed transition-colors'
            aria-label='Scroll left'>
            <ChevronLeft className='w-4 h-4' />
          </button>
          <button
            onClick={() => scroll("right")}
            disabled={!canScrollRight}
            className='absolute -end-2 top-1/2 -translate-y-1/2 z-10 hidden md:flex w-9 h-9 items-center justify-center border border-stone-200 bg-white hover:border-stone-900 disabled:opacity-20 disabled:cursor-not-allowed transition-colors'
            aria-label='Scroll right'>
            <ChevronRight className='w-4 h-4' />
          </button>

          {/* Scrollable track */}
          <div
            ref={scrollRef}
            className='flex gap-4 sm:gap-6 overflow-x-auto scrollbar-hide snap-x snap-mandatory px-4 sm:px-6 lg:px-8 pb-2'>
            {products.map((product) => (
              <div
                key={product.id}
                data-card
                className='flex-none w-[220px] sm:w-[260px] lg:w-[280px] snap-start'>
                <MinimalProductCard
                  product={product}
                  onQuickView={onQuickView}
                  className='h-full'
                />
              </div>
            ))}
          </div>
        </div>

        {/* View all link */}
        {viewAllHref && (
          <ViewAllButton href={viewAllHref} text={viewAllText || t("view_all")} />
        )}
      </div>
    </section>
  );
}

function ViewAllButton({ href, text }: { href: string; text: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={cn(
        "mt-10 text-center transition-all duration-700 ease-out",
        isVisible
          ? "opacity-100 translate-y-0"
          : "opacity-0 translate-y-6",
      )}>
      <a
        href={href}
        className='group inline-flex items-center gap-2 px-8 py-3 border border-stone-900 text-sm font-light text-stone-900 tracking-widest uppercase hover:bg-stone-900 hover:text-white transition-all duration-300'>
        {text}
        <ArrowRight className='w-4 h-4 transition-transform duration-300 group-hover:translate-x-1' />
      </a>
    </div>
  );
}
