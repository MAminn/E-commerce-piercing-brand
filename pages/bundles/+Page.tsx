import { useEffect, useState } from "react";
import { trpc } from "#root/shared/trpc/client";
import type { PublicBundleCampaignDto } from "#root/backend/bundles/service";
import { useMinimalI18n } from "#root/lib/i18n/MinimalI18nContext";
import { BundleCampaignCard } from "#root/components/bundles/BundleCampaignCard";
import { Link } from "#root/components/utils/Link";

type LoadState = { status: "loading" } | { status: "ready"; campaigns: PublicBundleCampaignDto[] };

/**
 * /bundles — the Bundles & Stacks landing page. Lists every LIVE campaign
 * (switched on, inside its window) in CMS `sortOrder`; sold-out campaigns
 * stay listed with a disabled CTA so merchandising remains truthful. Card
 * data comes from `listLive` without products — one query for campaigns,
 * one for pools, one for placements, regardless of how many campaigns.
 */
export default function BundlesPage() {
  const { t } = useMinimalI18n();
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    trpc.bundle.listLive
      .query({})
      .then((result) => {
        if (cancelled) return;
        setState({ status: "ready", campaigns: result.success && result.result ? result.result : [] });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "ready", campaigns: [] });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="zeli-header-offset min-h-screen bg-zeli-bg">
      <div className="mx-auto max-w-[var(--zeli-content-max)] px-[var(--zeli-gutter)] py-8 sm:py-12">
        <header className="max-w-2xl">
          <p className="zeli-eyebrow">{t("nav.bundles")}</p>
          <h1 className="zeli-section-title mt-2">{t("bundles.page_title")}</h1>
          <p className="mt-3 text-[length:var(--zeli-text-body)] leading-[var(--zeli-leading-body)] text-zeli-ink-muted">
            {t("bundles.page_intro")}
          </p>
        </header>

        {state.status === "loading" ? (
          <div role="status" aria-label="Loading" className="flex min-h-[40vh] items-center justify-center">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-zeli-border-strong border-t-zeli-ink" />
          </div>
        ) : state.campaigns.length === 0 ? (
          <div className="mt-12 max-w-md">
            <p className="text-[length:var(--zeli-text-body)] text-zeli-ink-muted">{t("bundles.empty")}</p>
            <Link
              href="/shop"
              className="zeli-underline mt-6 inline-flex min-h-11 items-center text-[length:var(--zeli-text-small)] font-medium uppercase tracking-[var(--zeli-tracking-label)] text-zeli-ink">
              {t("bundle.browse_shop")}
            </Link>
          </div>
        ) : (
          <ul className="mt-8 grid grid-cols-2 gap-x-3 gap-y-8 sm:mt-10 sm:grid-cols-3 sm:gap-x-5 lg:grid-cols-4">
            {state.campaigns.map((campaign, index) => (
              <li key={campaign.id}>
                <BundleCampaignCard campaign={campaign} className="h-full" eager={index < 2} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
