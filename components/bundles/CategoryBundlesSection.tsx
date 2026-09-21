import { useEffect, useState } from "react";
import { trpc } from "#root/shared/trpc/client";
import { useMinimalI18n } from "#root/lib/i18n/MinimalI18nContext";
import { MinimalBundleSection } from "./MinimalBundleSection";
import type { BundleCardCampaign } from "./BundleCampaignCard";

/**
 * Category-page placement. Renders only when the merchant explicitly placed
 * live campaigns on this category (bundle_campaign_category); which products
 * a campaign contains never puts it here on its own.
 */
export function CategoryBundlesSection({ categoryId }: { categoryId: string }) {
  const { t } = useMinimalI18n();
  const [campaigns, setCampaigns] = useState<BundleCardCampaign[]>([]);

  useEffect(() => {
    let cancelled = false;
    setCampaigns([]);
    trpc.bundle.listLive
      .query({ categoryId })
      .then((result) => {
        if (!cancelled) setCampaigns(result.success && result.result ? result.result : []);
      })
      .catch(() => {
        if (!cancelled) setCampaigns([]);
      });
    return () => {
      cancelled = true;
    };
  }, [categoryId]);

  if (campaigns.length === 0) return null;
  return <MinimalBundleSection campaigns={campaigns} title={t("bundles.in_category")} className="bg-perce-surface" />;
}
