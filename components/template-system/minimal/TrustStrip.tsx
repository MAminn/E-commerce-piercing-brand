import { useMinimalI18n } from "#root/lib/i18n/MinimalI18nContext";
import { cn } from "#root/lib/utils";
import type { HomepageContent } from "#root/shared/types/homepage-content";

interface TrustItem {
  key: string;
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
const DEFAULT_KEYS = [
  { key: "delivery", label: "trust.delivery_egypt" },
  { key: "cod", label: "trust.cash_on_delivery" },
  { key: "curated", label: "trust.curated" },
] as const;

/**
 * A quiet line of store facts between hairlines — text only, no icons, no
 * boxes. When the merchant has written value props in the CMS (Homepage →
 * Value props), those are shown instead, as authored; switching that section
 * off hides the strip.
 */
export function TrustStrip({ valueProps, className }: { valueProps?: HomepageContent["valueProps"]; className?: string }) {
  const { t } = useMinimalI18n();
  if (valueProps?.enabled === false) return null;

  const authored = (valueProps?.items ?? []).filter((item) => item.title?.trim());
  const items: TrustItem[] =
    authored.length > 0
      ? authored.slice(0, 3).map((item, i) => ({ key: `cms-${i}`, title: item.title }))
      : DEFAULT_KEYS.map(({ key, label }) => ({ key, title: t(label) }));

  return (
    <section className={cn("py-8 lg:py-12", className)} aria-label={t("trust.label")} data-trust-strip>
      <div className="perce-container">
        <ul className="flex flex-col divide-y divide-line border-y border-line md:flex-row md:divide-x md:divide-y-0 rtl:md:divide-x-reverse">
          {items.map((item) => (
            <li key={item.key} className="flex-1 py-3 t-label text-ink md:px-4 md:py-4 md:first:ps-0">
              {item.title}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
