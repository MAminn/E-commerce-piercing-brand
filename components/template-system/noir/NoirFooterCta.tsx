import type { MouseEvent } from "react";
import { ArrowRight } from "lucide-react";
import type { HomepageFooterCtaContent } from "#root/shared/types/homepage-content";
import { useMinimalI18n } from "#root/lib/i18n/MinimalI18nContext";
import { cn } from "#root/lib/utils";
import {
  NOIR_ACCENT_BG_CLASSES,
  NOIR_DISPLAY_FONT_CLASSES,
  NOIR_TEXT_SECONDARY_CLASSES,
} from "./noir-tokens";

interface NoirFooterCtaProps {
  footerCta: HomepageFooterCtaContent;
  onCtaClick?: (link: string) => void;
}

/**
 * NoirFooterCta — full-width closing CTA band mapped from the CMS
 * footerCta fields. Renders nothing when disabled.
 */
export function NoirFooterCta({ footerCta, onCtaClick }: NoirFooterCtaProps) {
  const { locale } = useMinimalI18n();
  const isAr = locale === "ar";
  const track = isAr ? "" : "tracking-[0.2em]";

  if (!footerCta.enabled) return null;

  const link = footerCta.ctaLink || "/shop";
  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (onCtaClick) {
      e.preventDefault();
      onCtaClick(link);
    }
  };

  return (
    <section className='relative overflow-hidden border-t border-white/10 bg-black'>
      {/* Ambient red glow anchored bottom-center */}
      <div
        className='pointer-events-none absolute -bottom-1/3 start-1/2 -translate-x-1/2 w-[70vw] max-w-3xl aspect-square rounded-full opacity-40 blur-3xl'
        style={{
          background:
            "radial-gradient(circle, rgba(232,17,45,0.18) 0%, transparent 68%)",
        }}
        aria-hidden='true'
      />
      <div className='relative mx-auto max-w-4xl px-4 md:px-8 py-20 md:py-32 text-center space-y-7'>
        <div className='w-10 h-0.5 bg-[#E8112D] mx-auto' aria-hidden='true' />
        <h2
          className={cn(
            "uppercase font-bold text-white mx-auto leading-[0.95] text-[clamp(2.25rem,5.5vw,4.5rem)]",
            isAr ? "" : "tracking-[0.02em]",
            NOIR_DISPLAY_FONT_CLASSES,
          )}>
          {footerCta.title}
        </h2>
        {footerCta.subtitle && (
          <p
            className={cn(
              "text-sm md:text-base leading-relaxed max-w-xl mx-auto",
              NOIR_TEXT_SECONDARY_CLASSES,
            )}>
            {footerCta.subtitle}
          </p>
        )}
        {footerCta.ctaText && (
          <a
            href={link}
            onClick={handleClick}
            className={cn(
              "group/cta inline-flex items-center justify-center gap-2 px-12 py-4 rounded-md",
              "text-xs uppercase font-medium text-white transition-colors duration-300",
              track,
              NOIR_DISPLAY_FONT_CLASSES,
              NOIR_ACCENT_BG_CLASSES,
            )}>
            {footerCta.ctaText}
            <ArrowRight
              className='w-3.5 h-3.5 rtl:rotate-180 transition-transform duration-300 group-hover/cta:translate-x-1 rtl:group-hover/cta:-translate-x-1'
              strokeWidth={1.5}
            />
          </a>
        )}
      </div>
    </section>
  );
}
