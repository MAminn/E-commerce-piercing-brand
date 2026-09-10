import type { HomepageBrandStatementContent } from "#root/shared/types/homepage-content";
import { useMinimalI18n } from "#root/lib/i18n/MinimalI18nContext";
import { cn } from "#root/lib/utils";
import { NoirImagePlaceholder } from "./ProductCardNoir";
import {
  NOIR_ACCENT_LINE,
  NOIR_DISPLAY_FONT_CLASSES,
  NOIR_SECTION_Y_LG,
  NOIR_TEXT_SECONDARY_CLASSES,
} from "./noir-tokens";

interface NoirWhyUsProps {
  brandStatement: HomepageBrandStatementContent;
}

/**
 * NoirWhyUs — brand statement centerpiece. Centered statement
 * composition (title, description, image with red glow). The benefit
 * items are intentionally NOT repeated here — they already appear in
 * NoirBenefitsStrip on the same page (both drew from the same
 * valuePropositions source), so this reads as a clean editorial
 * statement instead of a duplicate. Renders nothing when disabled.
 */
export function NoirWhyUs({ brandStatement }: NoirWhyUsProps) {
  const { locale } = useMinimalI18n();
  const isAr = locale === "ar";
  const track = isAr ? "" : "tracking-[0.14em]";

  if (!brandStatement.enabled) return null;

  const hasImage = Boolean(brandStatement.image);

  return (
    <section className={cn("relative overflow-hidden", NOIR_SECTION_Y_LG)}>
      {/* Ambient red glow anchored behind the statement */}
      <div
        className='pointer-events-none absolute top-1/2 start-1/2 -translate-x-1/2 -translate-y-1/2 w-[60vw] max-w-2xl aspect-square rounded-full opacity-40 blur-3xl'
        style={{
          background:
            "radial-gradient(circle, rgba(232,17,45,0.16) 0%, transparent 68%)",
        }}
        aria-hidden='true'
      />

      <div className='relative mx-auto max-w-3xl px-4 md:px-8 flex flex-col items-center text-center gap-7'>
        <div className={cn(NOIR_ACCENT_LINE, "mx-auto")} aria-hidden='true' />

        <h2
          className={cn(
            "text-3xl md:text-5xl uppercase font-semibold text-white leading-[1.05]",
            track,
            NOIR_DISPLAY_FONT_CLASSES,
          )}>
          {brandStatement.title}
        </h2>

        {brandStatement.description && (
          <p
            className={cn(
              "text-sm md:text-base leading-relaxed max-w-xl",
              NOIR_TEXT_SECONDARY_CLASSES,
            )}>
            {brandStatement.description}
          </p>
        )}

        {hasImage && (
          <div className='mt-4 w-full max-w-md'>
            <div className='relative aspect-video bg-[#101010] border border-white/10 rounded-xl overflow-hidden'>
              <img
                src={brandStatement.image}
                alt={brandStatement.title}
                className='w-full h-full object-cover'
                loading='lazy'
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
              {/* placeholder sits behind the image; if img hides on error it shows */}
              <div className='absolute inset-0 -z-10'>
                <NoirImagePlaceholder />
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
