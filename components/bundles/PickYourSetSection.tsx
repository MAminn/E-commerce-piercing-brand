import { useMinimalI18n } from "#root/lib/i18n/MinimalI18nContext";
import { cn } from "#root/lib/utils";
import { buttonClass } from "#root/components/storefront/Button";
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
    <section id="pick-your-set" className={cn("py-12 lg:py-16", className)} data-pick-your-set>
      <div className="perce-container">
        <div className="mb-6 flex items-end justify-between gap-4 lg:mb-8">
          <div className="min-w-0">
            <p className="t-label text-ink-2">{t("sets.eyebrow")}</p>
            <h2 className="mt-2 t-h2 text-ink">{t("sets.title")}</h2>
          </div>
          <a href={viewAllHref} className={buttonClass({ variant: "text", size: "sm", className: "shrink-0" })}>
            {t("sets.view_all")}
          </a>
        </div>
        <div className={cn("grid gap-3 md:gap-6", campaigns.length > 1 && "md:grid-cols-2")}>
          {campaigns.map((campaign, index) => (
            <SetOfferCard key={campaign.id} campaign={campaign} eager={index < 2} />
          ))}
        </div>
      </div>
    </section>
  );
}
