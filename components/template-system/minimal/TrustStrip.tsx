import type React from "react";
import { Banknote, Gem, Truck } from "lucide-react";
import { useMinimalI18n } from "#root/lib/i18n/MinimalI18nContext";
import { cn } from "#root/lib/utils";
import type { HomepageContent } from "#root/shared/types/homepage-content";
import { ValuePropIcon } from "#root/components/template-system/shared/value-prop-icons";

interface TrustItem {
  key: string;
  icon: React.ReactNode;
  title: string;
}

/**
 * Store facts, true today:
 *   • delivery across Egypt — every shipping destination is an Egyptian
 *     governorate (shared/shipping/egypt-governorates.ts)
 *   • cash on delivery — always offered (shared/config/payment.ts)
 *   • curated piercing jewellery — what the catalogue is
 * Deliberately NOT here: hypoallergenic, materials, lifetime quality, return
 * windows — nothing in the product or settings data backs those.
 */
const GRID_COLS: Record<number, string> = { 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-3" };

const DEFAULT_KEYS = [
  { key: "delivery", icon: Truck, label: "trust.delivery_egypt" },
  { key: "cod", icon: Banknote, label: "trust.cash_on_delivery" },
  { key: "curated", icon: Gem, label: "trust.curated" },
] as const;

/**
 * Compact value strip. When the merchant has written value props in the CMS
 * (Homepage → Value props), those are shown instead, as authored; switching
 * that section off hides the strip.
 */
export function TrustStrip({ valueProps, className }: { valueProps?: HomepageContent["valueProps"]; className?: string }) {
  const { t } = useMinimalI18n();
  if (valueProps?.enabled === false) return null;

  const authored = (valueProps?.items ?? []).filter((item) => item.title?.trim());
  const items: TrustItem[] =
    authored.length > 0
      ? authored.slice(0, 3).map((item, i) => ({
          key: `cms-${i}`,
          icon: <ValuePropIcon icon={item.icon} className="h-5 w-5" />,
          title: item.title,
        }))
      : DEFAULT_KEYS.map(({ key, icon: Icon, label }) => ({ key, icon: <Icon className="h-5 w-5" />, title: t(label) }));

  return (
    <section className={cn("perce-section-tight", className)} aria-label={t("trust.label")} data-trust-strip>
      <div className="perce-container">
        <ul
          className={cn(
            "grid divide-x divide-perce-line border border-perce-line bg-perce-surface rtl:divide-x-reverse",
            GRID_COLS[items.length] ?? "grid-cols-3",
          )}>
          {items.map((item) => (
            <li
              key={item.key}
              className="flex flex-col items-center gap-1.5 px-2 py-4 text-center text-perce-ink sm:flex-row sm:justify-center sm:gap-3 sm:py-5 sm:text-start">
              <span className="text-perce-ink-secondary" aria-hidden>
                {item.icon}
              </span>
              <span className="text-[12px] font-medium leading-snug sm:text-[13px]">{item.title}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
