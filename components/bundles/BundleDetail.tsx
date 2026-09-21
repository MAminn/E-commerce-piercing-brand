import { useCallback, useEffect, useRef, useState } from "react";
import { trpc } from "#root/shared/trpc/client";
import type { PublicBundleCampaignDto } from "#root/backend/bundles/service";
import { useMinimalI18n } from "#root/lib/i18n/MinimalI18nContext";
import { useTracking } from "#root/frontend/contexts/TrackingContext";
import { Link } from "#root/components/utils/Link";
import { BundleBuilder } from "./BundleBuilder";
import { CuratedStackDetail } from "./CuratedStackDetail";

type LoadState =
  | { status: "loading" }
  | { status: "not_found" }
  | { status: "ready"; campaign: PublicBundleCampaignDto };

/**
 * /bundles/[slug] — loads the live campaign once and hands it to the
 * experience that matches its type. Drafts, scheduled and expired campaigns
 * are not returned by `getLiveBySlug`, so they land on the same not-found
 * state as an unknown slug.
 */
export function BundleDetail({ slug }: { slug: string }) {
  const { t } = useMinimalI18n();
  const { trackEvent } = useTracking();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const trackedFor = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await trpc.bundle.getLiveBySlug.query({ slug });
      if (result.success && result.result) setState({ status: "ready", campaign: result.result });
      else setState({ status: "not_found" });
    } catch {
      setState({ status: "not_found" });
    }
  }, [slug]);

  useEffect(() => {
    setState({ status: "loading" });
    load();
  }, [load]);

  // Lightweight custom event — adapters without a native mapping send it as
  // a custom event (e.g. Meta trackCustom); no analytics rewrite needed.
  useEffect(() => {
    if (state.status !== "ready" || trackedFor.current === state.campaign.id) return;
    trackedFor.current = state.campaign.id;
    trackEvent("bundle_viewed", {
      customProperties: {
        bundleCampaignId: state.campaign.id,
        bundleCampaignSlug: state.campaign.slug,
        bundleCampaignType: state.campaign.type,
        bundlePrice: state.campaign.fixedBundlePrice,
        availability: state.campaign.availability,
      },
    });
  }, [state, trackEvent]);

  if (state.status === "loading") {
    return (
      <div role="status" aria-label="Loading" className="perce-header-offset flex min-h-[60vh] items-center justify-center bg-perce-bg">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-perce-border-strong border-t-perce-ink" />
      </div>
    );
  }

  if (state.status === "not_found") {
    return (
      <div className="perce-header-offset flex min-h-[60vh] items-center justify-center bg-perce-bg px-4">
        <div className="max-w-md text-center">
          <h1 className="perce-section-title">{t("bundle.not_found")}</h1>
          <p className="mt-2 text-[length:var(--perce-text-body)] text-perce-ink-muted">{t("bundle.not_found_body")}</p>
          <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/bundles"
              className="inline-flex min-h-11 items-center justify-center bg-perce-cta px-6 text-[length:var(--perce-text-small)] font-medium text-perce-ink-inverse hover:bg-perce-cta-hover">
              {t("bundles.view_all")}
            </Link>
            <Link
              href="/shop"
              className="perce-underline-hover inline-flex min-h-11 items-center px-2 text-[length:var(--perce-text-small)] font-medium text-perce-ink">
              {t("bundle.browse_shop")}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return state.campaign.type === "curated_stack" ? (
    <CuratedStackDetail campaign={state.campaign} reload={load} />
  ) : (
    <BundleBuilder campaign={state.campaign} reload={load} />
  );
}
