import type { HomepageContent } from "#root/shared/types/homepage-content";

type Locale = "en" | "ar";
type Variant = "minimal" | "modern";

export interface TestimonialsSectionProps {
  testimonials: HomepageContent["testimonials"];
  variant: Variant;
  locale: Locale;
  className?: string;
}


function getDynamicTitle(_count: number, locale: Locale): string {
  if (locale === "ar") return "انضم إلى عملائنا";
  return "Join our Clients";
}

function resolveLocalized(
  locale: Locale,
  primary: string,
  arVariant?: string,
): string {
  if (locale === "ar") return (arVariant && arVariant.trim()) || primary || "";
  return primary || arVariant || "";
}


/**
 * Shared testimonials section — Object Index. CMS reviews as a quiet,
 * swipeable index of quotes: name, rating as data ("5 / 5"), the review.
 * No marquee, no fade mask, no avatar glyphs or star graphics. Returns null
 * when CMS testimonials are absent, disabled, or empty — no hard-coded
 * fallback data lives here. Both variants render the same way; `variant`
 * only picks the section ground.
 */
export function TestimonialsSection({
  testimonials,
  variant,
  locale,
  className = "",
}: TestimonialsSectionProps) {
  if (
    !testimonials ||
    !testimonials.enabled ||
    !testimonials.items ||
    testimonials.items.length === 0
  ) {
    return null;
  }

  const cmsTitle =
    locale === "ar"
      ? testimonials.titleAr?.trim() || testimonials.title?.trim() || ""
      : testimonials.title?.trim() || "";

  const resolvedTitle =
    cmsTitle || getDynamicTitle(testimonials.items.length, locale);

  const sectionDir = locale === "ar" ? "rtl" : "ltr";
  const ground = variant === "modern" ? "bg-surface" : "bg-bg";

  return (
    <section dir={sectionDir} className={`perce-section ${ground} ${className}`.trim()}>
      <div className='perce-container'>
        <h2 className='mb-6 t-h2 text-ink lg:mb-8'>{resolvedTitle}</h2>
      </div>
      <ul className='scrollbar-hide flex snap-x snap-mandatory gap-3 overflow-x-auto px-[var(--perce-gutter)] md:gap-6'>
        {testimonials.items.map((item, i) => {
          const name = resolveLocalized(locale, item.name, item.nameAr);
          const review = resolveLocalized(locale, item.review, item.reviewAr);
          const rating = Math.max(0, Math.min(5, Math.round(item.rating)));
          return (
            <li
              key={`${item.name}-${i}`}
              className='flex w-[280px] flex-none snap-start flex-col border-t border-ink pt-4 md:w-[320px]'>
              <p className='flex items-baseline justify-between gap-4'>
                <span className='t-label text-ink'>{name}</span>
                <span className='t-small tabular-nums text-ink-2' aria-label={`${rating} out of 5`}>
                  {rating} / 5
                </span>
              </p>
              <p className='mt-3 line-clamp-5 t-body text-ink-2'>{review}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default TestimonialsSection;
