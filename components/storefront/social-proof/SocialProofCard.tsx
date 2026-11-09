import { Fragment, type ReactNode } from "react";
import { X } from "lucide-react";
import { fillTemplate } from "#root/components/bundles/bundle-ui";

/**
 * The recent-order card — presentation only.
 *
 * Ported from Mach's `MachSocialProofCard`, keeping its construction and its
 * contract, redrawn in Percé's own language: the same square `surface` panel
 * with a hairline that the add-to-bag toast (components/ui/cart-toast.tsx)
 * uses — no shadow, no colour wash — with the product photo on the
 * `surface-2` stage the cards use.
 *
 * Split from `SocialProofToast` so the admin preview renders the *same* card
 * rather than a copy of its markup that quietly drifts. It takes strings and
 * draws them: no data fetching, no timers, no session state, no router, no
 * translation lookups (the caller passes finished copy), which is why the
 * dashboard can mount it with demo copy without inheriting any storefront
 * behaviour.
 *
 * ── Link vs close ─────────────────────────────────────────────────────────
 *
 * The body navigates and the X must not, which rules out nesting the button
 * inside the anchor (invalid, and it does not survive hydration). Content is
 * plain elements, a stretched anchor covers the card at z-10, and the close
 * button is a sibling painting above it at z-20 — so a click on the X can
 * never reach the link beneath.
 */

export interface SocialProofCardProps {
  /** Eyebrow, e.g. "Recent order". */
  eyebrow: string;
  /** Sanitised server-side — "Ahmed M.", never a full name. */
  displayName: string;
  /** Broad city/governorate, or null when the admin has location off. */
  location: string | null;
  /** "{name} just ordered" — used when there is no location. */
  orderedTemplate: string;
  /** "{name} in {location} just ordered". */
  orderedInTemplate: string;
  productName: string;
  productImageUrl: string | null;
  /** Pre-formatted, e.g. "4 min ago". Empty string hides the row. */
  relativeTime: string;
  /**
   * Product destination. Omitted in the admin preview, which renders the same
   * card with no stretched link and a decorative close control.
   */
  href?: string;
  /** Screen-reader suffix for the link, e.g. "View product." */
  linkSuffix?: string;
  onDismiss?: () => void;
  dismissLabel?: string;
  /** Transition/positioning classes supplied by the caller. */
  className?: string;
}

/**
 * Renders a translated sentence with the name and place as their own spans,
 * so `capitalize` reaches only those two — never the whole sentence, which
 * would read "In Cairo Just Ordered".
 */
function renderContext(
  template: string,
  values: Record<string, string>,
): ReactNode[] {
  return template.split(/(\{\w+\})/g).map((part, i) => {
    const key = /^\{(\w+)\}$/.exec(part)?.[1];
    if (key && key in values) {
      return (
        <span key={i} className='capitalize'>
          {values[key]}
        </span>
      );
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

export function SocialProofCard({
  eyebrow,
  displayName,
  location,
  orderedTemplate,
  orderedInTemplate,
  productName,
  productImageUrl,
  relativeTime,
  href,
  linkSuffix = "",
  onDismiss,
  dismissLabel = "Dismiss",
  className = "",
}: SocialProofCardProps) {
  const interactive = Boolean(href);
  const template = location ? orderedInTemplate : orderedTemplate;
  const values: Record<string, string> = location
    ? { name: displayName, location }
    : { name: displayName };
  // Plain-text equivalent for the screen-reader label.
  const context = fillTemplate(template, values);

  return (
    <div
      data-testid='social-proof-card'
      className={`group relative w-full border border-line bg-surface text-ink transition-colors duration-[var(--perce-duration)] hover:border-ink motion-reduce:transition-none sm:w-[360px] ${className}`}>
      {interactive && (
        <a
          href={href}
          className='absolute inset-0 z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink'>
          <span className='sr-only'>{`${context}: ${productName}. ${linkSuffix}`}</span>
        </a>
      )}

      {/* 44px hit target, the mark only. z-20 keeps it above the link. */}
      {onDismiss ? (
        <button
          type='button'
          onClick={onDismiss}
          aria-label={dismissLabel}
          className='absolute end-0 top-0 z-20 flex h-11 w-11 items-center justify-center text-ink-2 transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink'>
          <X size={16} strokeWidth={1.5} aria-hidden />
        </button>
      ) : (
        <span
          aria-hidden='true'
          className='absolute end-0 top-0 z-20 flex h-11 w-11 items-center justify-center text-ink-2'>
          <X size={16} strokeWidth={1.5} />
        </span>
      )}

      <div className='flex items-stretch gap-3 p-3'>
        <div className='h-[72px] w-[60px] shrink-0 overflow-hidden bg-surface-2'>
          {productImageUrl && (
            <img
              src={productImageUrl}
              alt=''
              loading='lazy'
              decoding='async'
              className='h-full w-full object-cover'
            />
          )}
        </div>

        {/* pe clears the close control so copy never runs underneath it. */}
        <div className='flex min-w-0 flex-1 flex-col justify-center pe-8'>
          <p className='t-micro text-ink-2'>{eyebrow}</p>
          {/*
            `capitalize` (name and place only — see renderContext) is
            presentation only. Orders are stored exactly as the customer typed
            them, and plenty arrive lowercase. Arabic has no case mapping, so
            an Arabic name renders exactly as stored.
          */}
          <p className='mt-1 truncate t-small text-ink-2'>
            {renderContext(template, values)}
          </p>
          <p className='mt-0.5 line-clamp-2 t-label text-ink'>{productName}</p>
          {relativeTime && (
            <p className='mt-1 t-micro tabular-nums text-ink-2'>{relativeTime}</p>
          )}
        </div>
      </div>
    </div>
  );
}
