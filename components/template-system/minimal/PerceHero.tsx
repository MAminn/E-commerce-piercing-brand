import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "#root/lib/utils";
import type { HomepageHeroContent } from "#root/shared/types/homepage-content";
import { PerceHeroVideo } from "./PerceHeroVideo";

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
 * Percé hero — full-bleed campaign media with the copy overlaid.
 *
 * The image (or background video, with the image as its poster/fallback)
 * fills the whole hero; the headline, subtitle and CTA sit on top of it in
 * the lower-left, over a soft local scrim rather than a panel. Headline is the
 * H1 from the Brand Source of Truth by default ("Small pieces. Made to mix."),
 * editable in Dashboard > Homepage.
 *
 * - **Runs up behind the header.** The fixed header floats over the top of
 *   the frame (transparent until the page scrolls), so the media starts at
 *   the very top of the page; the copy sits low, well clear of it.
 * - **Sized by CSS, not by the media** (`.perce-hero-frame` in
 *   layouts/style.css): on phones it reaches down to the bottom nav, capped
 *   at 9:16 of the width so a 9:16 reel shows whole; from 768px it ends ~88%
 *   down the viewport. Nothing shifts while media loads.
 * - **Separate mobile and desktop media.** `mobileImageUrl` / the mobile video
 *   below 768px, the desktop ones above — different crops for different
 *   frame shapes, not one asset squeezed.
 * - **Readable over any frame**: white type on a lower-left scrim
 *   (`.perce-hero-scrim`) with a faint text halo; the rest of the media is
 *   left untouched.
 * - **LCP-correct**: the first slide is eager + high fetch priority and is
 *   never lazy-loaded; later slides are lazy.
 *
 * It degrades in both directions: media with no copy runs clean, without the
 * scrim; copy with no media renders as a typographic hero. No placeholder
 * imagery and no invented copy.
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

  // ── Typographic hero: no imagery uploaded yet ──
  if (!hasMedia) {
    return (
      <section
        className={cn(
          // Padding, not margin: the ground runs up behind the transparent
          // header instead of leaving a page-coloured strip under it.
          "perce-header-pad perce-hero-under-header bg-perce-ground text-perce-frame-ink",
          "flex min-h-[58vh] items-center",
          className,
        )}
        aria-label='Highlight'>
        <div className='perce-container py-16 text-center'>
          {title && <h1 className='perce-display text-perce-frame-ink text-balance'>{title}</h1>}
          {subtitle && (
            <p className='mx-auto mt-5 max-w-prose text-base leading-relaxed text-perce-frame-ink-muted'>
              {subtitle}
            </p>
          )}
          {hasCta && <HeroCta text={ctaText} href={ctaLink} onClick={handleCta} />}
        </div>
      </section>
    );
  }

  return (
    <section
      className={cn(
        "perce-hero-frame perce-hero-under-header relative w-full overflow-hidden bg-perce-ground",
        className,
      )}
      // The h1 names a hero with copy; bare media and carousels get a label.
      aria-label={total > 1 ? "Highlights" : hasCopy ? undefined : "Highlight"}
      // Carousel handlers live on the whole frame now that it is full-bleed.
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
                  // over it already names the campaign, so an invented
                  // description would only add noise for screen readers.
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

      {/* The header floats over the top of the frame: a short fade keeps the
          logo, links and icons readable over a bright frame. */}
      <div className='perce-hero-top-scrim pointer-events-none absolute inset-x-0 top-0 z-20' aria-hidden='true' />

      {hasCopy && (
        <>
          <div className='perce-hero-scrim pointer-events-none absolute inset-0 z-20' aria-hidden='true' />
          {/* Pointer events pass through to the slide link except on the copy itself. */}
          <div className='pointer-events-none absolute inset-x-0 bottom-0 z-30'>
            <div className='perce-container pb-10 sm:pb-12 md:pb-16 lg:pb-20'>
              <div className='perce-hero-copy pointer-events-auto max-w-xl text-perce-paper'>
                {title && <h1 className='perce-display text-balance'>{title}</h1>}
                {subtitle && (
                  <p className='mt-4 max-w-prose text-base leading-relaxed text-perce-paper/85'>
                    {subtitle}
                  </p>
                )}
                {hasCta && <HeroCta text={ctaText} href={ctaLink} onClick={handleCta} />}
              </div>
            </div>
          </div>
        </>
      )}

      {total > 1 && (
        <div
          className={cn(
            "absolute z-30 flex items-center gap-2",
            // Clear of the lower-left copy: bottom-right when there is text.
            hasCopy
              ? "bottom-6 right-(--perce-gutter) md:bottom-8"
              : "inset-x-0 bottom-4 justify-center",
          )}>
          {slides.map((slide, i) => (
            <button
              key={`dot-${slide.imageUrl}-${i}`}
              type='button'
              onClick={() => goTo(i)}
              className={cn(
                "h-2 rounded-full bg-perce-ink-inverse transition-all",
                i === current ? "w-6 opacity-90" : "w-2 opacity-50",
              )}
              style={{ transitionDuration: "var(--perce-duration)" }}
              aria-label={`Show highlight ${i + 1} of ${total}`}
              aria-current={i === current ? "true" : undefined}
            />
          ))}
        </div>
      )}
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
        "bg-perce-paper px-8 text-sm font-medium text-perce-ground",
        "transition-colors hover:bg-white",
      )}
      style={{ transitionDuration: "var(--perce-duration)" }}>
      {text}
    </a>
  );
}

PerceHero.displayName = "PerceHero";
