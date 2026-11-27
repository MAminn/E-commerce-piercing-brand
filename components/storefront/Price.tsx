import type { ReactNode } from "react";
import { cn } from "#root/lib/utils";
import { formatMoney, type MoneyLocale } from "#root/shared/pricing/format-money";
import { compareAtDisplay } from "#root/shared/pricing/sale-display";

const sizeClass = {
  card: "t-card-price",
  pdp: "t-pdp-price",
  line: "t-label tabular-nums",
  /** Inherits the surrounding type (index lines, editorial panels). */
  inline: "tabular-nums",
} as const;

/** The struck regular price sits one step quieter than the paid price. */
const compareSizeClass = {
  card: "t-small",
  pdp: "t-body",
  line: "t-small",
  inline: "text-[0.8em]",
} as const;

/**
 * A price as structured data: tabular, ink, one weight.
 *
 * With `compareAt` above `amount` (a real sale) it becomes a sale price:
 * the price paid first and in ink, the regular price struck through in a
 * quieter ink, and a square ink badge with the whole percent off. Ink stays
 * the only accent — no sale colour (see `--perce-sale` in layouts/style.css).
 * Without a valid `compareAt` it is the single price, exactly as before.
 *
 * `tone="inverse"` is for prices set on an ink ground (light text, light badge).
 */
export function Price({
  amount,
  compareAt,
  locale = "en",
  size = "card",
  tone = "default",
  showBadge = true,
  paidSuffix,
  className,
}: {
  amount: number;
  /** The regular price to strike through. Ignored unless it is above `amount`. */
  compareAt?: number | null;
  locale?: MoneyLocale;
  size?: keyof typeof sizeClass;
  tone?: "default" | "inverse";
  showBadge?: boolean;
  /** Text kept beside the paid price (e.g. "each"), before the struck price. */
  paidSuffix?: ReactNode;
  className?: string;
}) {
  const sale = compareAtDisplay(amount, compareAt);
  const paidText = formatMoney(amount, { locale });
  const inkClass = tone === "inverse" ? "text-bg" : "text-ink";

  if (sale.compareAt === null) {
    return (
      <span className={cn(sizeClass[size], inkClass, className)}>
        {paidText}
        {paidSuffix ? <> {paidSuffix}</> : null}
      </span>
    );
  }

  const wasText = formatMoney(sale.compareAt, { locale });
  const pct = sale.percentOff;
  const spoken =
    locale === "ar"
      ? `السعر الآن ${paidText}، بدلًا من ${wasText}${pct ? `، خصم ${pct}%` : ""}`
      : `Now ${paidText}, was ${wasText}${pct ? `, ${pct}% off` : ""}`;

  return (
    <span className={cn("inline-flex flex-wrap items-baseline gap-x-2 gap-y-1", className)} data-sale-price=''>
      <span className='sr-only'>{spoken}</span>
      <span aria-hidden className={cn(sizeClass[size], inkClass)} data-price-paid=''>
        {paidText}
      </span>
      {paidSuffix ? <span className='font-normal text-ink-2'>{paidSuffix}</span> : null}
      <s
        aria-hidden
        className={cn(
          compareSizeClass[size],
          "font-normal tabular-nums decoration-1",
          tone === "inverse" ? "text-bg/60" : "text-ink-3",
        )}
        data-price-compare=''>
        {wasText}
      </s>
      {showBadge && pct !== null && (
        <span
          aria-hidden
          dir='ltr'
          className={cn(
            "self-center px-1.5 py-0.5 t-micro font-medium leading-none tabular-nums",
            tone === "inverse" ? "bg-bg text-ink" : "bg-ink text-bg",
          )}
          data-price-badge=''>
          −{pct}%
        </span>
      )}
    </span>
  );
}
