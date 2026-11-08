import { useEffect, useState } from "react";
import { trpc } from "#root/shared/trpc/client";
import type { PublicBundleCampaignDto } from "#root/backend/bundles/service";
import { useMinimalI18n } from "#root/lib/i18n/MinimalI18nContext";
import { BundleCampaignCard } from "#root/components/bundles/BundleCampaignCard";
import { Link } from "#root/components/utils/Link";
import { cn } from "#root/lib/utils";

type LoadState = { status: "loading" } | { status: "ready"; campaigns: PublicBundleCampaignDto[] };

/** One kind of set as large photo cards. Two fill the row; more run three-up. */
function SetGroup({
  title,
  campaigns,
  eager = false,
}: {
  title: string;
  campaigns: PublicBundleCampaignDto[];
  eager?: boolean;
}) {
  if (campaigns.length === 0) return null;
  const few = campaigns.length <= 2;
  return (
    <section className="mt-6 lg:mt-10" data-set-group>
      <h2 className="mb-3 t-h1 text-ink lg:mb-4">{title}</h2>
      <ul className={cn("grid grid-cols-1 gap-2 md:grid-cols-2 lg:gap-3", !few && "lg:grid-cols-3")}>
        {campaigns.map((campaign, index) => (
          <li key={campaign.id}>
            <BundleCampaignCard
              campaign={campaign}
              eager={eager && index < 2}
              className={few ? "lg:aspect-[5/4]" : undefined}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

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
    <div className="min-h-screen bg-perce-bg">
      <div className="mx-auto max-w-[var(--perce-content-max)] px-[var(--perce-gutter)] pb-12 pt-4 lg:pb-16 lg:pt-6">
        <header className="max-w-2xl">
          <h1 className="t-display text-ink">{t("bundles.page_title")}</h1>
          <p className="mt-2 t-body text-ink-2">{t("bundles.page_intro")}</p>
        </header>

        {state.status === "loading" ? (
          <div role="status" aria-label="Loading" className="flex min-h-[40vh] items-center justify-center">
            <div className="h-5 w-5 animate-spin border-2 border-perce-border-strong border-t-perce-ink" />
          </div>
        ) : state.campaigns.length === 0 ? (
          <div className="mt-12 max-w-md">
            <p className="text-[length:var(--perce-text-body)] text-perce-ink-muted">{t("bundles.empty")}</p>
            <Link
              href="/shop"
              className="perce-underline mt-6 inline-flex min-h-11 items-center text-[length:var(--perce-text-small)] font-medium text-perce-ink">
              {t("bundle.browse_shop")}
            </Link>
          </div>
        ) : (
          <>
            <SetGroup title={t("sets.cta_build")} campaigns={state.campaigns.filter((c) => c.type !== "curated_stack")} eager />
            <SetGroup title={t("bundles.section_ready")} campaigns={state.campaigns.filter((c) => c.type === "curated_stack")} />
          </>
        )}
      </div>
    </div>
  );
}
