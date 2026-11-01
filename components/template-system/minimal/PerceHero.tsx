import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "#root/lib/utils";
import type { HomepageHeroContent } from "#root/shared/types/homepage-content";
import { PerceHeroVideo } from "./PerceHeroVideo";
import { buttonClass } from "#root/components/storefront/Button";

export interface PerceHeroSlide {
  imageUrl: string;
  mobileImageUrl?: string;
  linkUrl?: string;
  alt?: string;
}

export interface PerceHeroVideoSource {
  src: string;
  mobileSrc?: string;
}

export interface PerceHeroProps {
  hero: HomepageHeroContent;
  slides: PerceHeroSlide[];
  /**
   * Background video for the hero frame. When set, the frame shows the first
   * slide as a still poster (no carousel) and the video plays over it.
   */
  video?: PerceHeroVideoSource;
  /** Overrides navigation for admin preview contexts. */
  onCtaClick?: (link: string) => void;
  className?: string;
}

/**
 * Percé hero — Object Index.
 *
 * The campaign media is one clean frame (image, or background video with
 * the image as its poster/fallback): no scrim, no overlaid type, nothing
 * drawn over the jewellery. The headline, subtitle and CTA are set below it
 * on stone, as the first lines of the index. Headline is the H1 from the
 * Brand Source of Truth by default ("Small pieces. Made to mix."), editable
 * in Dashboard > Homepage.
 *
 * - **Sized by CSS, not by the media** (`.perce-hero-frame` in
 *   layouts/style.css): 4:5 on phones, capped so the headline under it stays
 *   on screen; a wide frame from 768px. Nothing shifts while media loads.
 * - **Separate mobile and desktop media.** `mobileImageUrl` / the mobile video
 *   below 768px, the desktop ones above — different crops for different
 *   frame shapes, not one asset squeezed.
 * - **LCP-correct**: the first slide is eager + high fetch priority and is
 *   never lazy-loaded; later slides are lazy.
 * - Several slides: a numbered index under the frame (01 02 03), not dots.
 *
 * It degrades in both directions: media with no copy runs clean; copy with
 * no media renders as a typographic hero. No placeholder imagery and no
 * invented copy.
 */
export function PerceHero({
  hero,
  slides: allSlides,
  video,
  onCtaClick,
  className,
}: PerceHeroProps) {
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchStartX = useRef(0);

  const hasVideo = Boolean(video?.src);
  // With a video the frame holds one still — the poster/fallback — rather
  // than a carousel cycling invisibly underneath it.
  const slides = hasVideo ? allSlides.slice(0, 1) : allSlides;
  const total = slides.length;
  const hasImages = total > 0;
  const hasMedia = hasImages || hasVideo;

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
  if (!hasMedia && !hasCopy) return null;

  const handleCta = (e: React.MouseEvent) => {
    if (!onCtaClick) return;
    e.preventDefault();
    onCtaClick(ctaLink);
  };

  const copy = (hasCopy || hasCta) && (
    <div className='perce-container pb-16 pt-8 lg:pb-24 lg:pt-12'>
      <div className='max-w-2xl'>
        {title && <h1 className='t-display text-balance text-ink'>{title}</h1>}
        {subtitle && <p className='mt-4 max-w-prose t-body text-ink-2'>{subtitle}</p>}
        {hasCta && <HeroCta text={ctaText} href={ctaLink} onClick={handleCta} />}
      </div>
    </div>
  );

  // ── Typographic hero: no imagery uploaded yet ──
  if (!hasMedia) {
    return (
      <section className={cn("bg-bg", className)} aria-label='Highlight'>
        <div className='pt-8 lg:pt-16'>{copy}</div>
      </section>
    );
  }

  return (
    <section
      className={cn("bg-bg", className)}
      // The h1 names a hero with copy; bare media and carousels get a label.
      aria-label={total > 1 ? "Highlights" : hasCopy ? undefined : "Highlight"}
      {...(total > 1
        ? {
            role: "region",
            "aria-roledescription": "carousel",
          }
        : {})}>
      <div
        className='perce-hero-frame relative overflow-hidden bg-surface-2'
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
        }}>
        {slides.map((slide, i) => {
          const isActive = i === current;
          const Wrapper = slide.linkUrl ? "a" : "div";
          return (
            <div
              key={`${slide.imageUrl}-${i}`}
              className={cn(
                "absolute inset-0 transition-opacity duration-[var(--perce-duration-slow)]",
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
                    // under it already names the campaign.
                    alt={slide.alt ?? ""}
                    className='perce-hero-media h-full w-full object-cover'
                    loading={i === 0 ? "eager" : "lazy"}
                    fetchPriority={i === 0 ? "high" : "low"}
                    decoding={i === 0 ? "sync" : "async"}
                  />
                </picture>
              </Wrapper>
            </div>
          );
        })}

        {video?.src && <PerceHeroVideo src={video.src} mobileSrc={video.mobileSrc} />}
      </div>

      {total > 1 && (
        <div className='perce-container'>
          <div className='flex justify-end gap-1 border-b border-line'>
            {slides.map((slide, i) => (
              <button
                key={`index-${slide.imageUrl}-${i}`}
                type='button'
                onClick={() => goTo(i)}
                className={cn(
                  "inline-flex h-11 min-w-11 items-center justify-center t-micro tabular-nums transition-colors",
                  i === current
                    ? "text-ink underline decoration-1 underline-offset-4"
                    : "text-ink-2 hover:text-ink",
                )}
                aria-label={`Show highlight ${i + 1} of ${total}`}
                aria-current={i === current ? "true" : undefined}>
                {String(i + 1).padStart(2, "0")}
              </button>
            ))}
          </div>
        </div>
      )}

      {copy}
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
    <a href={href} onClick={onClick} className={buttonClass({ variant: "primary", size: "lg", className: "mt-8" })}>
      {text}
    </a>
  );
}

PerceHero.displayName = "PerceHero";
