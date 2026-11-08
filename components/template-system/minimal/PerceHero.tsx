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
 * The campaign media runs full width (image, or background video with the
 * image as its poster/fallback), with the headline, subtitle and one CTA set
 * over its lower edge on a soft fade, so the jewellery above stays clear.
 * Headline is the H1 from the Brand Source of Truth by default ("Small pieces.
 * Made to mix."), editable in Dashboard > Homepage.
 *
 * - **Sized by CSS, not by the media** (`.perce-hero-frame` in
 *   layouts/style.css): tall on phones, stopping short of the fold; a wide
 *   frame from 768px. Nothing shifts while media loads.
 * - **Separate mobile and desktop media.** `mobileImageUrl` / the mobile video
 *   below 768px, the desktop ones above — different crops for different
 *   frame shapes, not one asset squeezed.
 * - **LCP-correct**: the first slide is eager + high fetch priority and is
 *   never lazy-loaded; later slides are lazy.
 * - Several slides: a numbered index in the frame (01 02 03), not dots.
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

  /* dir='auto': copy the owner wrote in English on the Arabic store keeps its
     own direction, so its full stop stays at the end of the sentence. */
  const copy = (overMedia: boolean) =>
    (hasCopy || hasCta) && (
      <div className={cn("perce-container", overMedia ? "pb-6 lg:pb-12" : "pb-8 pt-8 lg:pb-12 lg:pt-12")}>
        <div className='max-w-3xl'>
          {title && (
            <h1 dir='auto' className={cn("t-display text-balance lg:text-[4.5rem]", overMedia ? "text-bg" : "text-ink")}>
              {title}
            </h1>
          )}
          {subtitle && (
            <p dir='auto' className={cn("mt-3 max-w-prose t-body lg:mt-4", overMedia ? "text-bg/85" : "text-ink-2")}>
              {subtitle}
            </p>
          )}
          {hasCta && <HeroCta text={ctaText} href={ctaLink} onClick={handleCta} overMedia={overMedia} />}
        </div>
      </div>
    );

  // ── Typographic hero: no imagery uploaded yet ──
  if (!hasMedia) {
    return (
      <section className={cn("bg-bg", className)} aria-label='Highlight'>
        <div className='pt-8 lg:pt-16'>{copy(false)}</div>
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

        {(hasCopy || hasCta) && (
          <>
            <div
              aria-hidden
              className='pointer-events-none absolute inset-x-0 bottom-0 z-30 h-2/3 bg-gradient-to-t from-ink/75 via-ink/30 to-transparent'
            />
            {/* Above the media; only the CTA takes the pointer, so the slide's own
                link still works everywhere else. */}
            <div className='pointer-events-none absolute inset-x-0 bottom-0 z-40'>{copy(true)}</div>
          </>
        )}

        {total > 1 && (
          <div className='absolute end-[var(--perce-gutter)] top-3 z-40 flex gap-1 bg-bg/90'>
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
        )}
      </div>
    </section>
  );
}

function HeroCta({
  text,
  href,
  onClick,
  overMedia,
}: {
  text: string;
  href: string;
  onClick: (e: React.MouseEvent) => void;
  overMedia: boolean;
}) {
  // A plain anchor rather than the shared <Link>: this needs the click event
  // to suppress navigation inside the admin template preview, and <Link>'s
  // onClick takes no arguments.
  return (
    <a
      href={href}
      onClick={onClick}
      className={buttonClass({
        variant: "primary",
        size: "lg",
        className: cn("mt-5 lg:mt-8", overMedia && "pointer-events-auto bg-bg text-ink hover:bg-surface"),
      })}>
      {text}
    </a>
  );
}

PerceHero.displayName = "PerceHero";
