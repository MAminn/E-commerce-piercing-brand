import { useState, useEffect, useCallback, useRef } from "react";
import { cn } from "#root/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";

export interface HeroSlide {
  imageUrl: string;
  mobileImageUrl?: string;
  linkUrl?: string;
  alt?: string;
}

interface HeroCarouselProps {
  slides: HeroSlide[];
  /** Auto-play interval in ms (default 5000) */
  interval?: number;
  /** Use object-contain instead of object-cover (for constrained containers) */
  contain?: boolean;
  /** Let the carousel height be determined by the image (no fixed aspect ratio) */
  autoHeight?: boolean;
  className?: string;
}

/**
 * Full-width hero image carousel with auto-play, swipe, and fade transitions.
 * Modelled after matchperfumes.com hero slider.
 */
export function HeroCarousel({
  slides,
  interval = 5000,
  contain = false,
  autoHeight = false,
  className,
}: HeroCarouselProps) {
  const [current, setCurrent] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);

  const total = slides.length;

  const goTo = useCallback(
    (index: number) => {
      setCurrent(((index % total) + total) % total);
    },
    [total],
  );

  const next = useCallback(() => goTo(current + 1), [current, goTo]);
  const prev = useCallback(() => goTo(current - 1), [current, goTo]);

  // Auto-play
  useEffect(() => {
    if (isPaused || total <= 1) return;
    const timer = setInterval(next, interval);
    return () => clearInterval(timer);
  }, [next, interval, isPaused, total]);

  // Touch / swipe handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.changedTouches[0]?.clientX ?? 0;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    touchEndX.current = e.changedTouches[0]?.clientX ?? 0;
    const diff = touchStartX.current - touchEndX.current;
    if (Math.abs(diff) > 50) {
      diff > 0 ? next() : prev();
    }
  };

  if (!slides.length) return null;

  return (
    <div
      className={cn(
        "relative w-full overflow-hidden",
        !autoHeight && "aspect-[16/9] max-h-[650px]",
        className,
      )}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      role='region'
      aria-roledescription='carousel'
      aria-label='Hero slideshow'>
      {/* Slides */}
      {slides.map((slide, i) => (
        <div
          key={i}
          className={cn(
            "w-full transition-opacity duration-700 ease-in-out",
            autoHeight
              ? i === current ? "relative opacity-100 z-10" : "absolute inset-0 opacity-0 z-0"
              : i === current ? "absolute inset-0 opacity-100 z-10" : "absolute inset-0 opacity-0 z-0",
          )}
          aria-hidden={i !== current}>
          {(() => {
            const Inner = slide.linkUrl ? "a" : "div";
            const innerProps = slide.linkUrl ? { href: slide.linkUrl } : {};
            return (
              <Inner {...innerProps} className={cn('block w-full', !autoHeight && 'h-full')}>
                {/* Desktop image */}
                <img
                  src={slide.imageUrl}
                  alt={slide.alt || `Slide ${i + 1}`}
                  className={cn(
                    "w-full",
                    autoHeight ? "" : "h-full",
                    !autoHeight && (contain ? "object-contain" : "object-cover"),
                    slide.mobileImageUrl ? "!hidden md:!block" : "",
                  )}
                  style={autoHeight ? { display: 'block', width: '100%', height: 'auto' } : undefined}
                  loading={i === 0 ? "eager" : "lazy"}
                />
                {/* Mobile image (fallback to desktop) */}
                {slide.mobileImageUrl && (
                  <img
                    src={slide.mobileImageUrl}
                    alt={slide.alt || `Slide ${i + 1}`}
                    className={cn(
                      "w-full block md:!hidden",
                      autoHeight ? "" : "h-full",
                      !autoHeight && (contain ? "object-contain" : "object-cover"),
                    )}
                    style={autoHeight ? { display: 'block', width: '100%', height: 'auto' } : undefined}
                    loading={i === 0 ? "eager" : "lazy"}
                  />
                )}
              </Inner>
            );
          })()}
        </div>
      ))}

      {/* Navigation arrows */}
      {total > 1 && (
        <>
          <button
            onClick={prev}
            className='absolute left-3 sm:left-6 top-1/2 -translate-y-1/2 z-20 hidden md:flex w-10 h-10 sm:w-12 sm:h-12 items-center justify-center bg-white/20 backdrop-blur-sm hover:bg-white/40 transition-colors rounded-full'
            aria-label='Previous slide'>
            <ChevronLeft className='w-5 h-5 sm:w-6 sm:h-6 text-white' />
          </button>
          <button
            onClick={next}
            className='absolute right-3 sm:right-6 top-1/2 -translate-y-1/2 z-20 hidden md:flex w-10 h-10 sm:w-12 sm:h-12 items-center justify-center bg-white/20 backdrop-blur-sm hover:bg-white/40 transition-colors rounded-full'
            aria-label='Next slide'>
            <ChevronRight className='w-5 h-5 sm:w-6 sm:h-6 text-white' />
          </button>
        </>
      )}

      {/* Dot indicators */}
      {total > 1 && (
        <div className='absolute bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2'>
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              className={cn(
                "rounded-full transition-all duration-300",
                i === current
                  ? "w-6 h-2 bg-white"
                  : "w-2 h-2 bg-white/50 hover:bg-white/80",
              )}
              aria-label={`Go to slide ${i + 1}`}
              aria-current={i === current ? "true" : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}
