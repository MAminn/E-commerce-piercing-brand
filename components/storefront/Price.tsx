import { cn } from "#root/lib/utils";
import { formatMoney, type MoneyLocale } from "#root/shared/pricing/format-money";

const sizeClass = {
  card: "t-card-price",
  pdp: "t-pdp-price",
  line: "t-label tabular-nums",
} as const;

/**
 * A price as structured data: tabular, ink, one weight. A compare-at price
 * renders only when it is a real, higher previous price — struck through in
 * ink-2 after the paid price (ink-3 is too light for 14px text on stone),
 * with "was/now" for screen readers. No sale colour, no percentage badge.
 */
export function Price({
  amount,
  compareAt,
  locale = "en",
  size = "card",
  className,
}: {
  amount: number;
  compareAt?: number | null;
  locale?: MoneyLocale;
  size?: keyof typeof sizeClass;
  className?: string;
}) {
  const hasCompare = compareAt != null && Number.isFinite(compareAt) && compareAt > amount;
  return (
    <span className={cn("inline-flex flex-wrap items-baseline gap-x-2", className)}>
      <span className={cn(sizeClass[size], "text-ink")}>
        {hasCompare && <span className='sr-only'>{locale === "ar" ? "السعر الآن " : "Now "}</span>}
        {formatMoney(amount, { locale })}
      </span>
      {hasCompare && (
        <s className={cn(sizeClass[size], "font-normal text-ink-2")}>
          <span className='sr-only'>{locale === "ar" ? "بدلاً من " : "was "}</span>
          {formatMoney(compareAt as number, { locale })}
        </s>
      )}
    </span>
  );
}
