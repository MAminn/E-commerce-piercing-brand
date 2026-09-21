import { ArrowRight } from "lucide-react";
import { useMinimalI18n } from "#root/lib/i18n/MinimalI18nContext";
import { cn } from "#root/lib/utils";
import { BundleCampaignCard, type BundleCardCampaign } from "./BundleCampaignCard";

interface MinimalBundleSectionProps {
  campaigns: BundleCardCampaign[];
  title: string;
  subtitle?: string | null;
  viewAllHref?: string;
  viewAllText?: string;
  className?: string;
  id?: string;
}

/**
 * Horizontal rail of bundle cards for the minimal shell — the homepage and
 * category pages both use it. Deliberately not the product carousel:
 * bundle cards are wider, carry a purchase-model label and never open quick
 * view, so a shopper reads them as "a set", not "a product".
 */
export function MinimalBundleSection({
  campaigns,
  title,
  subtitle,
  viewAllHref = "/bundles",
  viewAllText,
  className,
  id,
}: MinimalBundleSectionProps) {
  const { t } = useMinimalI18n();
  if (campaigns.length === 0) return null;
  const viewAll = viewAllText || t("bundles.view_all");

  return (
    <section id={id} className={cn("perce-section", className)} data-bundle-section>
      <div className="mx-auto max-w-[var(--perce-content-max)]">
        <div className="mb-7 flex items-end justify-between gap-4 px-[var(--perce-gutter)] sm:mb-9">
          <div className="min-w-0">
            <h2 className="perce-section-title">{title}</h2>
            {subtitle?.trim() && (
              <p className="mt-2 text-[length:var(--perce-text-body)] text-perce-ink-muted">{subtitle}</p>
            )}
          </div>
          {viewAllHref && (
            <a
              href={viewAllHref}
              className="perce-underline-hover hidden shrink-0 text-xs font-medium text-perce-ink-muted hover:text-perce-ink sm:inline-flex">
              {viewAll}
            </a>
          )}
        </div>

        <div className="scrollbar-hide flex snap-x snap-mandatory gap-3 overflow-x-auto px-[var(--perce-gutter)] pb-2 sm:gap-5">
          {campaigns.map((campaign, index) => (
            <div key={campaign.id} className="w-[240px] flex-none snap-start sm:w-[280px] lg:w-[320px]">
              <BundleCampaignCard campaign={campaign} className="h-full" eager={index === 0} />
            </div>
          ))}
        </div>

        {viewAllHref && (
          <div className="mt-6 px-[var(--perce-gutter)] sm:hidden">
            <a
              href={viewAllHref}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 border border-perce-ink text-xs font-medium text-perce-ink">
              {viewAll}
              <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" aria-hidden />
            </a>
          </div>
        )}
      </div>
    </section>
  );
}
