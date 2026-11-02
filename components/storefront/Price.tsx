import { cn } from "#root/lib/utils";
import { formatMoney, type MoneyLocale } from "#root/shared/pricing/format-money";

const sizeClass = {
  card: "t-card-price",
  pdp: "t-pdp-price",
  line: "t-label tabular-nums",
} as const;

/**
 * A price as structured data: tabular, ink, one weight. One number — the
 * price the shopper pays. No struck-through previous price, no sale colour,
 * no percentage badge.
 */
export function Price({
  amount,
  locale = "en",
  size = "card",
  className,
}: {
  amount: number;
  locale?: MoneyLocale;
  size?: keyof typeof sizeClass;
  className?: string;
}) {
  return (
    <span className={cn(sizeClass[size], "text-ink", className)}>
      {formatMoney(amount, { locale })}
    </span>
  );
}
