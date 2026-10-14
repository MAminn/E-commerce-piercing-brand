import { ChevronRight } from "lucide-react";
import { useMinimalI18n } from "#root/lib/i18n/MinimalI18nContext";
import { cn } from "#root/lib/utils";
import type { BundleCardCampaign } from "./BundleCampaignCard";
import { SetOfferCard } from "./SetOfferCard";

interface PickYourSetSectionProps {
  /** Live Pick Your Set (build_your_stack) campaigns, in CMS order. */
  campaigns: BundleCardCampaign[];
  viewAllHref?: string;
  className?: string;
}

/**
 * The homepage's first selling block after the hero: every live Pick Your Set
 * campaign as a large offer card. Renders nothing when there is none — the
 * section never shows a placeholder offer.
 */
export function PickYourSetSection({ campaigns, viewAllHref = "/bundles", className }: PickYourSetSectionProps) {
  const { t } = useMinimalI18n();
  if (campaigns.length === 0) return null;

  return (
    <section id="pick-your-set" className={cn("perce-section-tight", className)} data-pick-your-set>
      <div className="perce-container">
        <div className="mb-5 flex items-end justify-between gap-4 sm:mb-7">
          <div className="min-w-0">
            <p className="perce-eyebrow">{t("sets.eyebrow")}</p>
            <h2 className="perce-section-title mt-1.5">{t("sets.title")}</h2>
          </div>
          <a
            href={viewAllHref}
            className="perce-underline-hover inline-flex min-h-11 shrink-0 items-center gap-1 text-xs font-medium text-perce-ink-muted hover:text-perce-ink">
            {t("sets.view_all")}
            <ChevronRight className="h-3.5 w-3.5 rtl:rotate-180" aria-hidden />
          </a>
        </div>
        <div className={cn("grid gap-3 sm:gap-4", campaigns.length > 1 && "md:grid-cols-2")}>
          {campaigns.map((campaign, index) => (
            <SetOfferCard key={campaign.id} campaign={campaign} eager={index < 2} />
          ))}
        </div>
      </div>
    </section>
  );
}
