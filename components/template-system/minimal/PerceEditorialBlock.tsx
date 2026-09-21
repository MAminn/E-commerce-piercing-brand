import { cn } from "#root/lib/utils";

export interface PerceEditorialBlockProps {
  /** Small label above the heading. Optional. */
  eyebrow?: string;
  heading?: string;
  body?: string;
  imageUrl?: string;
  /** Description of the image for screen readers. Falls back to decorative. */
  imageAlt?: string;
  ctaText?: string;
  ctaLink?: string;
  /** Which side the image sits on at md+. Mobile always stacks image-first. */
  imageSide?: "start" | "end";
  /** Section ground. `surface` is the warm ivory band, `blush` the nude one. */
  tone?: "bg" | "surface" | "blush";
  onCtaClick?: (link: string) => void;
  className?: string;
}

/**
 * Reusable editorial / campaign block.
 *
 * An asymmetric two-column composition (7/5 rather than 6/6, so it reads as a
 * magazine spread rather than a split screen) that stacks image-first on
 * mobile. Used for the brand statement and the stack-inspiration section.
 *
 * Renders **nothing** unless real content exists — it needs at minimum an
 * image or a heading. Every field is CMS-supplied; there is no placeholder
 * copy, no stock image and no default heading, so an unconfigured store simply
 * does not show this section rather than showing invented brand storytelling.
 */
export function PerceEditorialBlock({
  eyebrow,
  heading,
  body,
  imageUrl,
  imageAlt,
  ctaText,
  ctaLink,
  imageSide = "start",
  tone = "bg",
  onCtaClick,
  className,
}: PerceEditorialBlockProps) {
  const hasImage = Boolean(imageUrl?.trim());
  const hasText = Boolean(heading?.trim() || body?.trim());
  if (!hasImage && !hasText) return null;

  const hasCta = Boolean(ctaText?.trim() && ctaLink?.trim());

  const toneClass =
    tone === "surface"
      ? "bg-perce-surface"
      : tone === "blush"
        ? "bg-perce-surface"
        : "bg-perce-bg";

  const textBlock = (
    <div
      className={cn(
        "flex flex-col justify-center",
        "px-[var(--perce-gutter)] py-10 md:py-14 lg:px-14",
      )}>
      {eyebrow?.trim() && <p className='perce-eyebrow mb-4'>{eyebrow}</p>}
      {heading?.trim() && (
        <h2 className='perce-section-title text-balance'>{heading}</h2>
      )}
      {body?.trim() && (
        <p className='mt-4 max-w-prose text-[0.9375rem] leading-relaxed text-perce-ink-muted'>
          {body}
        </p>
      )}
      {hasCta && (
        <a
          href={ctaLink as string}
          onClick={(e: React.MouseEvent) => {
            if (!onCtaClick) return;
            e.preventDefault();
            onCtaClick(ctaLink as string);
          }}
          className={cn(
            "perce-underline-hover mt-7 inline-flex min-h-11 w-fit items-center",
            "text-xs font-medium",
            "tracking-[var(--perce-tracking-label)] text-perce-ink",
          )}>
          {ctaText}
        </a>
      )}
    </div>
  );

  const imageBlock = hasImage ? (
    <div className='relative w-full overflow-hidden bg-perce-surface aspect-[4/5] md:aspect-[3/4] md:h-full'>
      <img
        src={imageUrl}
        // Empty alt when the CMS gives none: the heading beside it carries the
        // meaning, and a fabricated description helps nobody.
        alt={imageAlt ?? ""}
        className='h-full w-full object-cover object-center'
        loading='lazy'
        decoding='async'
      />
    </div>
  ) : null;

  // Text-only: centre it in a narrow measure rather than leaving a dead column.
  if (!hasImage) {
    return (
      <section className={cn(toneClass, "perce-section", className)}>
        <div className='perce-container-narrow text-center'>
          {eyebrow?.trim() && <p className='perce-eyebrow mb-4'>{eyebrow}</p>}
          {heading?.trim() && (
            <h2 className='perce-section-title text-balance'>{heading}</h2>
          )}
          {body?.trim() && (
            <p className='mx-auto mt-4 max-w-prose text-[0.9375rem] leading-relaxed text-perce-ink-muted'>
              {body}
            </p>
          )}
          {hasCta && (
            <div>
              <a
                href={ctaLink as string}
                onClick={(e: React.MouseEvent) => {
                  if (!onCtaClick) return;
                  e.preventDefault();
                  onCtaClick(ctaLink as string);
                }}
                className={cn(
                  "perce-underline-hover mt-7 inline-flex min-h-11 items-center",
                  "text-xs font-medium",
                  "tracking-[var(--perce-tracking-label)] text-perce-ink",
                )}>
                {ctaText}
              </a>
            </div>
          )}
        </div>
      </section>
    );
  }

  // Image-only: full-bleed, no empty text column.
  if (!hasText) {
    return <section className={cn(toneClass, className)}>{imageBlock}</section>;
  }

  return (
    <section className={cn(toneClass, className)}>
      <div className='md:grid md:grid-cols-12 md:items-stretch'>
        <div
          className={cn(
            "md:col-span-7",
            imageSide === "end" && "md:order-2 md:col-span-7",
          )}>
          {imageBlock}
        </div>
        <div
          className={cn(
            "md:col-span-5",
            imageSide === "end" && "md:order-1 md:col-span-5",
          )}>
          {textBlock}
        </div>
      </div>
    </section>
  );
}

PerceEditorialBlock.displayName = "PerceEditorialBlock";
