import type { MouseEvent } from "react";
import { Link } from "#root/components/utils/Link";
import { ArrowRight } from "lucide-react";
import type { HomepageHeroContent } from "#root/shared/types/homepage-content";
import { STORE_NAME } from "#root/shared/config/branding";
import { useMinimalI18n } from "#root/lib/i18n/MinimalI18nContext";
import { cn } from "#root/lib/utils";
import {
  NOIR_ACCENT_BG_CLASSES,
  NOIR_DISPLAY_FONT_CLASSES,
} from "./noir-tokens";

interface NoirHeroProps {
  hero: HomepageHeroContent;
  onCtaClick?: (link: string) => void;
}

/**
 * NoirHero — cinematic hero inside a large rounded dark-glass container.
 * Eyebrow (store name, red tracked) → condensed uppercase display
 * headline → subcopy → solid-red primary CTA + outline secondary CTA.
 * Hero image renders as a composed panel on the end side (CMS
 * backgroundImage, mobile variant via <picture>); stacks below text on
 * mobile. Renders nothing when the section is disabled.
 */
export function NoirHero({ hero, onCtaClick }: NoirHeroProps) {
  const { t, locale } = useMinimalI18n();
  const isAr = locale === "ar";
  const track = isAr ? "" : "tracking-[0.3em]";

  if (!hero.enabled) return null;

  const desktopImage =
    hero.backgroundImage || hero.heroSlides?.[0]?.imageUrl || "";
  const mobileImage = hero.mobileBackgroundImage || desktopImage;
  const hasImage = Boolean(desktopImage);

  const handleCta = (link: string) => (e: MouseEvent<HTMLAnchorElement>) => {
    if (onCtaClick) {
      e.preventDefault();
      onCtaClick(link);
    }
  };

  const ctaLink = hero.ctaLink || "/shop";

  return (
    <section className='relative px-4 md:px-8 pt-6 md:pt-8 pb-3 md:pb-4 overflow-hidden'>
      <div className='relative mx-auto max-w-7xl'>
        <div
          className={cn(
            "relative grid items-stretch gap-0 rounded-2xl border border-white/10 overflow-hidden",
            "bg-linear-to-b from-[#121212] to-[#0a0a0a]",
            "shadow-[0_40px_120px_-40px_rgba(0,0,0,0.9)]",
            "min-h-120 md:min-h-140 md:max-h-160",
            hasImage ? "md:grid-cols-2" : "",
          )}>
          {/* Top-edge highlight — glass panel catchlight */}
          <div
            className='absolute inset-x-0 top-0 h-px z-10 pointer-events-none bg-linear-to-r from-transparent via-white/25 to-transparent'
            aria-hidden='true'
          />
          {/* Ambient red rim-light glow — inside the glass panel, bottom-start,
              bleeding under the column boundary */}
          <div
            className='pointer-events-none absolute z-0 -bottom-1/3 -start-1/5 w-[60%] aspect-square rounded-full blur-3xl'
            style={{
              background:
                "radial-gradient(circle, rgba(232,17,45,0.16) 0%, rgba(232,17,45,0.04) 45%, transparent 70%)",
            }}
            aria-hidden='true'
          />

          {/* ── Text panel ── */}
          <div
            className={cn(
              "relative z-10 flex flex-col justify-center px-6 py-12 md:px-12 md:py-14 gap-5 md:gap-6",
              !hasImage && "items-center text-center mx-auto max-w-3xl",
            )}>
            <div
              className={cn(
                "flex items-center gap-3",
                !hasImage && "justify-center",
              )}>
              <span className='w-8 h-px bg-[#E8112D]' aria-hidden='true' />
              <p
                className={cn(
                  "text-[11px] uppercase text-[#E8112D] font-medium",
                  track,
                  NOIR_DISPLAY_FONT_CLASSES,
                )}>
                {STORE_NAME}
              </p>
            </div>

            <h1
              className={cn(
                "uppercase text-white font-bold leading-[0.98] text-balance",
                "text-[clamp(2.5rem,5.5vw,4.5rem)]",
                isAr ? "" : "tracking-[0.01em]",
                NOIR_DISPLAY_FONT_CLASSES,
              )}>
              {hero.title}
            </h1>

            {hero.subtitle && (
              <p
                className={cn(
                  "uppercase text-[11px] md:text-xs leading-[1.9] max-w-[42ch] text-white/60",
                  isAr ? "" : "tracking-[0.16em]",
                  !hasImage && "mx-auto",
                )}>
                {hero.subtitle}
              </p>
            )}

            <div
              className={cn(
                "flex flex-col sm:flex-row gap-3 pt-2",
                !hasImage && "justify-center",
              )}>
              <a
                href={ctaLink}
                onClick={handleCta(ctaLink)}
                className={cn(
                  "group/cta inline-flex items-center justify-center gap-2 px-9 py-3.5 rounded-full",
                  "text-xs uppercase font-medium text-white transition-colors duration-300",
                  isAr ? "" : "tracking-[0.2em]",
                  NOIR_DISPLAY_FONT_CLASSES,
                  NOIR_ACCENT_BG_CLASSES,
                )}>
                {hero.ctaText || t("shop_now")}
                <ArrowRight
                  className='w-3.5 h-3.5 rtl:rotate-180 transition-transform duration-300 group-hover/cta:translate-x-1 rtl:group-hover/cta:-translate-x-1'
                  strokeWidth={1.5}
                />
              </a>
              <Link
                href='/shop'
                className={cn(
                  "inline-flex items-center justify-center gap-2 px-9 py-3.5 rounded-full",
                  "border border-white/25 text-xs uppercase font-medium text-white/80",
                  "hover:border-white/60 hover:text-white transition-colors duration-300",
                  isAr ? "" : "tracking-[0.2em]",
                  NOIR_DISPLAY_FONT_CLASSES,
                )}>
                {t("view_all")}
              </Link>
            </div>
          </div>

          {/* ── Image panel (stacks below text on mobile) ── */}
          {hasImage && (
            <div className='relative min-h-80 md:min-h-full bg-black order-last'>
              <picture>
                {mobileImage !== desktopImage && (
                  <source media='(max-width: 767px)' srcSet={mobileImage} />
                )}
                <img
                  src={desktopImage}
                  alt={hero.title}
                  className='absolute inset-0 w-full h-full object-cover'
                  fetchPriority='high'
                />
              </picture>
              {/* Dissolve the photo into the glass panel — no hard edge */}
              {/* Inline-start fade (desktop, side-by-side) — wide, matches surface */}
              <div
                className='absolute inset-y-0 start-0 w-[55%] pointer-events-none bg-linear-to-r rtl:bg-linear-to-l from-[#0e0e0e] to-transparent hidden md:block'
                aria-hidden='true'
              />
              {/* Top fade (mobile, stacked below text) */}
              <div
                className='absolute inset-x-0 top-0 h-[55%] pointer-events-none bg-linear-to-b from-[#0e0e0e] to-transparent md:hidden'
                aria-hidden='true'
              />
              {/* Bottom fade — matches container bottom surface */}
              <div
                className='absolute inset-x-0 bottom-0 h-[30%] pointer-events-none bg-linear-to-t from-[#0a0a0a] to-transparent'
                aria-hidden='true'
              />
              {/* Very subtle full-panel vignette */}
              <div
                className='absolute inset-0 pointer-events-none'
                style={{
                  background:
                    "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.35) 100%)",
                }}
                aria-hidden='true'
              />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
