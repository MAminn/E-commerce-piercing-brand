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
    <section id={id} className={cn("zeli-section", className)}>
      <div className='mx-auto max-w-[var(--zeli-content-max)]'>
        {/* Heading row: title left, "view all" right on the same baseline.
            The previous centred title with a 2px underline bar read as a
            generic storefront; this reads as an editorial section head. */}
        {title && (
          <div className='mb-7 flex items-baseline justify-between gap-4 px-[var(--zeli-gutter)] sm:mb-9'>
            <h2 className='zeli-section-title'>{title}</h2>
            {viewAllHref && (
              <a
                href={viewAllHref}
                className='zeli-underline-hover hidden shrink-0 text-[0.6875rem] font-medium uppercase tracking-[var(--zeli-tracking-label)] text-zeli-ink-muted hover:text-zeli-ink sm:inline-flex'>
                {viewAllText || t("view_all")}
              </a>
            )}
          </div>
        )}

        {/* Nav arrows + carousel */}
        <div className='relative'>
          {/* Desktop arrows */}
          <button
            onClick={() => scroll("left")}
            disabled={!canScrollLeft}
            tabIndex={-1}
            aria-hidden='true'
            className='absolute -start-2 top-[38%] z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center border border-zeli-line bg-zeli-bg transition-colors hover:border-zeli-accent disabled:opacity-20 md:flex'>
            <ChevronLeft className='w-4 h-4' />
          </button>
          <button
            onClick={() => scroll("right")}
            disabled={!canScrollRight}
            tabIndex={-1}
            aria-hidden='true'
            className='absolute -end-2 top-[38%] z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center border border-zeli-line bg-zeli-bg transition-colors hover:border-zeli-accent disabled:opacity-20 md:flex'>
            <ChevronRight className='w-4 h-4' />
          </button>

          {/* Scrollable track */}
          <div
            ref={scrollRef}
            className='scrollbar-hide flex snap-x snap-mandatory gap-3 overflow-x-auto px-[var(--zeli-gutter)] pb-2 sm:gap-5'>
            {products.map((product) => (
              <div
                key={product.id}
                data-card
                className='w-[168px] flex-none snap-start sm:w-[232px] lg:w-[288px]'>
                <MinimalProductCard
                  product={product}
                  onQuickView={onQuickView}
                  className='h-full'
                />
              </div>
            ))}
          </div>
        </div>

        {/* View all — mobile only. From sm up it sits on the heading row
            beside the title, so rendering both would duplicate the link. */}
        {viewAllHref && (
          <div className='sm:hidden'>
            <ViewAllButton href={viewAllHref} text={viewAllText || t("view_all")} />
          </div>
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
