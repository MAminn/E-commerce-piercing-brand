import type { HomepageNewsletterContent } from "#root/shared/types/homepage-content";
import { useMinimalI18n } from "#root/lib/i18n/MinimalI18nContext";
import { cn } from "#root/lib/utils";
import {
  NOIR_ACCENT_BG_CLASSES,
  NOIR_DISPLAY_FONT_CLASSES,
  NOIR_INPUT_CLASSES,
  NOIR_TEXT_MUTED_CLASSES,
  NOIR_TEXT_SECONDARY_CLASSES,
} from "./noir-tokens";

interface NoirNewsletterProps {
  newsletter: HomepageNewsletterContent;
}

/**
 * NoirNewsletter — dark band, uppercase heading, email input + red
 * submit. Uses the same submit path as the current landing templates:
 * the landing props contract exposes NO newsletter callback and the
 * existing templates' forms are preventDefault no-ops (known feature
 * gap — no subscription backend exists yet). No new backend calls.
 */
export function NoirNewsletter({ newsletter }: NoirNewsletterProps) {
  const { locale } = useMinimalI18n();
  const isAr = locale === "ar";
  const track = isAr ? "" : "tracking-[0.2em]";

  if (!newsletter.enabled) return null;

  return (
    <section className='px-4 md:px-8 py-16 md:py-24'>
      <div className='relative mx-auto max-w-5xl overflow-hidden rounded-2xl border border-white/10 bg-[#0c0c0c] px-6 py-16 md:py-20'>
        {/* Ambient red glow */}
        <div
          className='pointer-events-none absolute -top-1/3 start-1/2 -translate-x-1/2 w-[50vw] max-w-xl aspect-square rounded-full opacity-50 blur-3xl'
          style={{
            background:
              "radial-gradient(circle, rgba(232,17,45,0.18) 0%, transparent 68%)",
          }}
          aria-hidden='true'
        />
        <div className='relative max-w-xl mx-auto text-center space-y-6'>
          <div className='w-10 h-0.5 bg-[#E8112D] mx-auto' aria-hidden='true' />
          <h2
            className={cn(
              "text-2xl md:text-4xl uppercase font-semibold text-white leading-[1.05]",
              track,
              NOIR_DISPLAY_FONT_CLASSES,
            )}>
            {newsletter.title}
          </h2>
          {newsletter.subtitle && (
            <p
              className={cn(
                "text-sm md:text-base leading-relaxed max-w-md mx-auto",
                NOIR_TEXT_SECONDARY_CLASSES,
              )}>
              {newsletter.subtitle}
            </p>
          )}
          <form
            onSubmit={(e) => e.preventDefault()}
            className='flex flex-col sm:flex-row items-stretch gap-3 pt-2 max-w-md mx-auto'>
            <input
              type='email'
              required
              placeholder={
                newsletter.placeholderText ||
                (isAr ? "بريدك الإلكتروني" : "Your email address")
              }
              className={cn("flex-1 px-4 py-3.5 text-sm", NOIR_INPUT_CLASSES)}
            />
            <button
              type='submit'
              className={cn(
                "px-8 py-3.5 rounded-md text-xs uppercase font-medium text-white transition-colors duration-300",
                track,
                NOIR_DISPLAY_FONT_CLASSES,
                NOIR_ACCENT_BG_CLASSES,
              )}>
              {newsletter.ctaText || (isAr ? "اشترك" : "Subscribe")}
            </button>
          </form>
          {newsletter.privacyText && (
            <p className={cn("text-xs", NOIR_TEXT_MUTED_CLASSES)}>
              {newsletter.privacyText}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
