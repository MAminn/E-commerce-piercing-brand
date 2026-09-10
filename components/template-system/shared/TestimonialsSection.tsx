import type { CSSProperties } from "react";
import type { HomepageContent } from "#root/shared/types/homepage-content";

type Locale = "en" | "ar";
type Variant = "minimal" | "modern";

export interface TestimonialsSectionProps {
  testimonials: HomepageContent["testimonials"];
  variant: Variant;
  locale: Locale;
  className?: string;
}

interface VariantStyles {
  wrapper: string;
  container: string;
  titleClasses: string;
  underlineClasses: string | null;
  cardClasses: string;
  avatarWrapper: string;
  avatarIcon: string;
  nameClasses: string;
  starActive: string;
  starInactive: string;
  reviewClasses: string;
}

const VARIANT_STYLES: Record<Variant, VariantStyles> = {
  minimal: {
    wrapper: "py-14 sm:py-20 bg-stone-50 overflow-hidden",
    container: "max-w-[1400px] mx-auto",
    titleClasses:
      "text-2xl sm:text-3xl font-light text-stone-900 tracking-tight inline-block relative pb-3",
    underlineClasses:
      "absolute bottom-0 left-1/4 right-1/4 h-[2px] bg-stone-900",
    cardClasses:
      "flex-none w-[280px] sm:w-[320px] mr-6 bg-white border border-stone-100 p-6 flex flex-col items-center text-center",
    avatarWrapper:
      "w-16 h-16 rounded-full bg-stone-100 flex items-center justify-center mb-4",
    avatarIcon: "w-8 h-8 text-stone-400",
    nameClasses: "text-sm font-medium text-stone-900 mb-2",
    starActive: "text-amber-400",
    starInactive: "text-gray-200",
    reviewClasses: "text-sm text-stone-600 leading-relaxed line-clamp-4",
  },
  modern: {
    wrapper: "py-16 md:py-24 bg-white overflow-hidden",
    container: "max-w-7xl mx-auto",
    titleClasses:
      "text-3xl md:text-4xl font-medium text-neutral-900 tracking-tight inline-block relative pb-3",
    underlineClasses:
      "absolute bottom-0 left-1/3 right-1/3 h-[2px] bg-neutral-900",
    cardClasses:
      "flex-none w-[300px] sm:w-[340px] mr-6 bg-neutral-50 border border-neutral-200 rounded-lg p-6 flex flex-col items-center text-center",
    avatarWrapper:
      "w-16 h-16 rounded-full bg-neutral-100 flex items-center justify-center mb-4",
    avatarIcon: "w-8 h-8 text-neutral-400",
    nameClasses: "text-sm font-medium text-neutral-900 mb-2",
    starActive: "text-neutral-900",
    starInactive: "text-neutral-300",
    reviewClasses: "text-sm text-neutral-600 leading-relaxed line-clamp-4",
  },
};

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
 * Shared testimonials section. Variant-driven styling; single source of truth
 * for testimonial CMS content. Returns null when CMS testimonials are absent,
 * disabled, or empty — no hard-coded fallback data lives here.
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

  const styles = VARIANT_STYLES[variant];

  const cmsTitle =
    locale === "ar"
      ? testimonials.titleAr?.trim() || testimonials.title?.trim() || ""
      : testimonials.title?.trim() || "";

  const resolvedTitle =
    cmsTitle || getDynamicTitle(testimonials.items.length, locale);

  // Repeat items so the marquee track is always wide enough for the viewport
  // and the translate(-50%) seam is invisible.
  const MIN_PER_HALF = 8;
  const repeatCount = Math.ceil(MIN_PER_HALF / testimonials.items.length);
  const singleSet = Array.from(
    { length: repeatCount },
    () => testimonials.items,
  ).flat();
  const loopItems = [...singleSet, ...singleSet];

  const sectionDir = locale === "ar" ? "rtl" : "ltr";

  return (
    <section
      dir={sectionDir}
      className={`${styles.wrapper} ${className}`.trim()}>
      <div className={styles.container}>
        <div className='text-center mb-10 sm:mb-14 px-4'>
          <h2 className={styles.titleClasses}>
            {resolvedTitle}
            {styles.underlineClasses ? (
              <span className={styles.underlineClasses} />
            ) : null}
          </h2>
        </div>

        <div
          className='relative'
          dir='ltr'
          style={{
            maskImage:
              "linear-gradient(to right, transparent, black 8%, black 92%, transparent)",
            WebkitMaskImage:
              "linear-gradient(to right, transparent, black 8%, black 92%, transparent)",
          }}>
          <div
            className='flex w-max animate-marquee-half hover:[animation-play-state:paused]'
            style={
              {
                "--marquee-duration": `${singleSet.length * 10}s`,
              } as CSSProperties
            }>
            {loopItems.map((item, i) => {
              const name = resolveLocalized(locale, item.name, item.nameAr);
              const review = resolveLocalized(
                locale,
                item.review,
                item.reviewAr,
              );
              const rating = Math.max(0, Math.min(5, Math.round(item.rating)));
              return (
                <div key={i} className={styles.cardClasses}>
                  <div className={styles.avatarWrapper}>
                    <svg
                      className={styles.avatarIcon}
                      fill='currentColor'
                      viewBox='0 0 24 24'
                      aria-hidden='true'>
                      <path d='M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z' />
                    </svg>
                  </div>
                  <h3 className={styles.nameClasses}>{name}</h3>
                  <div
                    className='flex items-center gap-0.5 mb-3'
                    aria-label={`${rating} out of 5 stars`}>
                    {[0, 1, 2, 3, 4].map((s) => (
                      <svg
                        key={s}
                        className={`w-4 h-4 ${s < rating ? styles.starActive : styles.starInactive}`}
                        fill='currentColor'
                        viewBox='0 0 20 20'
                        aria-hidden='true'>
                        <path d='M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z' />
                      </svg>
                    ))}
                  </div>
                  <p className={styles.reviewClasses}>{review}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

export default TestimonialsSection;
