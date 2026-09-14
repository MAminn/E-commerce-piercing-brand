import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "#root/lib/utils";
import type { HomepageHeroContent } from "#root/shared/types/homepage-content";

export interface ZeliHeroSlide {
  imageUrl: string;
  mobileImageUrl?: string;
  linkUrl?: string;
  alt?: string;
}

export interface ZeliHeroProps {
  hero: HomepageHeroContent;
  slides: ZeliHeroSlide[];
  /** Overrides navigation for admin preview contexts. */
  onCtaClick?: (link: string) => void;
  className?: string;
}

/**
 * ZELI hero.
 *
 * Replaces the generic `HeroCarousel` on the homepage. That component rendered
 * images and nothing else — in a store with hero images uploaded, the CMS
 * title, subtitle and CTA were never shown at all, so the homepage opened on a
 * bare 16:9 banner. On a 375px phone a 16:9 crop is ~211px tall, which is a
 * strip, not a campaign.
 *
 * What this does instead:
 *
 * - **Separate mobile and desktop compositions.** Mobile is a tall 4:5 portrait
 *   crop (a phone-shaped frame for a close-up ear shot); desktop is a wide
 *   cinematic frame capped so the hero never eats a whole laptop screen and
 *   traps the user above the fold. These are different crops of the same or
 *   different images, not one image squeezed.
 * - **Text lives beside the image, not on top of it, on desktop**, and below it
 *   on mobile. Overlaying type on jewelry photography hides exactly the detail
 *   the photo exists to sell, and guarantees an unpredictable contrast ratio
 *   against an image nobody has seen yet. The one exception is when the CMS
 *   supplies no text at all, where the image simply runs full-bleed.
 * - **LCP-correct**: the first slide is eager + high fetch priority and is
 *   never lazy-loaded; later slides are lazy. `aspect-ratio` on the frame
 *   reserves the box so there is no layout shift while it decodes.
 *
 * It degrades in both directions: images with no copy render as a clean
 * full-bleed image; copy with no images renders as a typographic hero. No
 * placeholder imagery and no invented copy.
 */
export function ZeliHero({
  hero,
  slides,
  onCtaClick,
  className,
}: ZeliHeroProps) {
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchStartX = useRef(0);

  const total = slides.length;
  const hasImages = total > 0;

  const title = hero.title?.trim() ?? "";
  const subtitle = hero.subtitle?.trim() ?? "";
  const ctaText = hero.ctaText?.trim() ?? "";
  const ctaLink = hero.ctaLink?.trim() ?? "";
  const hasCopy = Boolean(title || subtitle);
  const hasCta = Boolean(ctaText && ctaLink);

  const goTo = useCallback(
    (i: number) => setCurrent(((i % total) + total) % total),
    [total],
  );

  // Auto-advance. Paused on hover/focus, and skipped entirely for a single
  // slide or when the viewer prefers reduced motion.
  useEffect(() => {
    if (total <= 1 || paused) return;
    if (
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    const timer = setInterval(() => setCurrent((c) => (c + 1) % total), 6000);
    return () => clearInterval(timer);
  }, [total, paused]);

  if (!hero.enabled) return null;
  if (!hasImages && !hasCopy) return null;

  const handleCta = (e: React.MouseEvent) => {
    if (!onCtaClick) return;
    e.preventDefault();
    onCtaClick(ctaLink);
  };

  // ── Typographic hero: no imagery uploaded yet ──
  if (!hasImages) {
    return (
      <section
        className={cn(
          "zeli-header-offset bg-zeli-surface",
          "flex min-h-[58vh] items-center",
          className,
        )}
        aria-label='Highlight'>
        <div className='zeli-container py-16 text-center'>
          {title && <h1 className='zeli-display text-zeli-ink'>{title}</h1>}
          {subtitle && (
            <p className='mx-auto mt-5 max-w-prose text-base leading-relaxed text-zeli-ink-muted'>
              {subtitle}
            </p>
          )}
          {hasCta && <HeroCta text={ctaText} href={ctaLink} onClick={handleCta} />}
        </div>
      </section>
    );
  }

  const imageFrame = (
    <div
      className={cn(
        "relative w-full overflow-hidden bg-zeli-surface",
        // Portrait on phones, cinematic from md up. Two crops, one element.
        "aspect-[4/5] sm:aspect-[3/4] md:aspect-[16/9]",
        "md:max-h-[72vh]",
      )}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onTouchStart={(e) => {
        touchStartX.current = e.changedTouches[0]?.clientX ?? 0;
      }}
      onTouchEnd={(e) => {
        const diff = touchStartX.current - (e.changedTouches[0]?.clientX ?? 0);
        if (Math.abs(diff) > 50) goTo(current + (diff > 0 ? 1 : -1));
      }}
      {...(total > 1
        ? {
            role: "region",
            "aria-roledescription": "carousel",
            "aria-label": "Highlights",
          }
        : {})}>
      {slides.map((slide, i) => {
        const isActive = i === current;
        const Wrapper = slide.linkUrl ? "a" : "div";
        return (
          <div
            key={`${slide.imageUrl}-${i}`}
            className={cn(
              "absolute inset-0 transition-opacity duration-700 ease-out",
              isActive ? "z-10 opacity-100" : "z-0 opacity-0",
            )}
            aria-hidden={!isActive}
            // Keep hidden slides out of the tab order entirely.
            {...(isActive ? {} : { inert: true })}>
            <Wrapper
              {...(slide.linkUrl ? { href: slide.linkUrl } : {})}
              className='block h-full w-full'>
              <picture>
                {slide.mobileImageUrl && (
                  <source
                    media='(max-width: 767px)'
                    srcSet={slide.mobileImageUrl}
                  />
                )}
                <img
                  src={slide.imageUrl}
                  // Decorative when the slide carries no alt: the headline
                  // beside it already names the campaign, so an invented
                  // description would only add noise for screen readers.
                  alt={slide.alt ?? ""}
                  className='h-full w-full object-cover object-center'
                  loading={i === 0 ? "eager" : "lazy"}
                  fetchPriority={i === 0 ? "high" : "low"}
                  decoding={i === 0 ? "sync" : "async"}
                />
              </picture>
            </Wrapper>
          </div>
        );
      })}

      {total > 1 && (
        <div className='absolute inset-x-0 bottom-4 z-20 flex items-center justify-center gap-2'>
          {slides.map((slide, i) => (
            <button
              key={`dot-${slide.imageUrl}-${i}`}
              type='button'
              onClick={() => goTo(i)}
              className={cn(
                "h-2 rounded-full bg-zeli-ink-inverse transition-all",
                i === current ? "w-6 opacity-90" : "w-2 opacity-50",
              )}
              style={{ transitionDuration: "var(--zeli-duration)" }}
              aria-label={`Show highlight ${i + 1} of ${total}`}
              aria-current={i === current ? "true" : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );

  // ── Image with no copy: let it run full-bleed ──
  if (!hasCopy) {
    return (
      <section className={cn("zeli-header-offset", className)} aria-label='Highlight'>
        {imageFrame}
      </section>
    );
  }

  // ── Editorial split: image + copy, stacked on mobile ──
  return (
    <section className={cn("zeli-header-offset bg-zeli-bg", className)}>
      <div className='md:grid md:grid-cols-12 md:items-center'>
        <div className='md:col-span-7'>{imageFrame}</div>
        <div
          className={cn(
            "md:col-span-5",
            "px-[var(--zeli-gutter)] py-10 md:py-12 lg:px-12",
          )}>
          {title && (
            <h1 className='zeli-display text-zeli-ink text-balance'>{title}</h1>
          )}
          {subtitle && (
            <p className='mt-4 max-w-prose text-[0.9375rem] leading-relaxed text-zeli-ink-muted'>
              {subtitle}
            </p>
          )}
          {hasCta && <HeroCta text={ctaText} href={ctaLink} onClick={handleCta} />}
        </div>
      </div>
    </section>
  );
}

function HeroCta({
  text,
  href,
  onClick,
}: {
  text: string;
  href: string;
  onClick: (e: React.MouseEvent) => void;
}) {
  // A plain anchor rather than the shared <Link>: this needs the click event
  // to suppress navigation inside the admin template preview, and <Link>'s
  // onClick takes no arguments.
  return (
    <a
      href={href}
      onClick={onClick}
      className={cn(
        "mt-8 inline-flex min-h-11 items-center justify-center",
        "bg-zeli-accent px-8 text-[0.6875rem] font-medium uppercase",
        "tracking-[var(--zeli-tracking-label)] text-zeli-ink-inverse",
        "transition-colors hover:bg-zeli-accent-hover",
      )}
      style={{ transitionDuration: "var(--zeli-duration)" }}>
      {text}
    </a>
  );
}

ZeliHero.displayName = "ZeliHero";
