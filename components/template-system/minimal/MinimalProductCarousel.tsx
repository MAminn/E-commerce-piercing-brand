import { useRef, useState, useEffect, useCallback } from "react";
import { cn } from "#root/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buttonClass } from "#root/components/storefront/Button";
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
    <section id={id} className={cn("perce-section", className)}>
      <div className='mx-auto max-w-[var(--perce-content-max)]'>
        {/* Heading row: title left, "view all" right on the same baseline.
            The previous centred title with a 2px underline bar read as a
            generic storefront; this reads as an editorial section head. */}
        {title && (
          <div className='mb-6 flex items-baseline justify-between gap-4 px-[var(--perce-gutter)] lg:mb-8'>
            <h2 className='t-h2 text-ink'>{title}</h2>
            {viewAllHref && (
              <a
                href={viewAllHref}
                className={buttonClass({ variant: "text", size: "sm", className: "hidden shrink-0 sm:inline-flex" })}>
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
            className='absolute start-2 top-[38%] z-10 hidden h-11 w-11 -translate-y-1/2 items-center justify-center border border-line bg-surface text-ink transition-colors hover:bg-surface-2 disabled:invisible md:flex'>
            <ChevronLeft size={20} strokeWidth={1.5} className='rtl:rotate-180' />
          </button>
          <button
            onClick={() => scroll("right")}
            disabled={!canScrollRight}
            tabIndex={-1}
            aria-hidden='true'
            className='absolute end-2 top-[38%] z-10 hidden h-11 w-11 -translate-y-1/2 items-center justify-center border border-line bg-surface text-ink transition-colors hover:bg-surface-2 disabled:invisible md:flex'>
            <ChevronRight size={20} strokeWidth={1.5} className='rtl:rotate-180' />
          </button>

          {/* Scrollable track */}
          <div
            ref={scrollRef}
            className='scrollbar-hide flex snap-x snap-mandatory gap-3 overflow-x-auto px-[var(--perce-gutter)] pb-2 md:gap-6'>
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
  return (
    <div className='mt-8 px-[var(--perce-gutter)]'>
      <a href={href} className={buttonClass({ variant: "secondary", size: "md", fullWidth: true })}>
        {text}
      </a>
    </div>
  );
}
