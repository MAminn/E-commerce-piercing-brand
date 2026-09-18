import { Layers, Sparkles } from "lucide-react";
import type { PublicBundleCampaignDto } from "#root/backend/bundles/service";
import { STORE_CURRENCY } from "#root/shared/config/branding";
import { useMinimalI18n } from "#root/lib/i18n/MinimalI18nContext";
import { Link } from "#root/components/utils/Link";
import { cn } from "#root/lib/utils";
import { bundleHref, fillTemplate, formatMoney, resolveBundleImage, summarizeBundleTiers } from "./bundle-ui";

/**
 * The slice of a campaign a card needs — the summary fields `listLive`
 * returns without products, so listings never pay for full compositions.
 */
export type BundleCardCampaign = Pick<
  PublicBundleCampaignDto,
  | "id"
  | "slug"
  | "title"
  | "subtitle"
  | "badgeText"
  | "heroImageUrl"
  | "type"
  | "availability"
  | "requiredQuantity"
  | "unitCount"
  | "tiers"
  | "fixedBundlePrice"
  | "regularValue"
  | "savings"
  | "valueRange"
  | "eligibleProductCount"
>;

interface BundleCampaignCardProps {
  campaign: BundleCardCampaign;
  className?: string;
  /** Image priority for the first above-the-fold card. */
  eager?: boolean;
}

/**
 * One campaign, either type, in the minimal storefront's image-first card
 * language. The purchase model is stated up front ("Build your stack" /
 * "Curated stack") because these are not products and the shopper should
 * know before tapping what kind of page they are going to.
 */
export function BundleCampaignCard({ campaign, className, eager = false }: BundleCampaignCardProps) {
  const { t } = useMinimalI18n();
  const currency = STORE_CURRENCY;
  const isCurated = campaign.type === "curated_stack";
  const soldOut = campaign.availability !== "available";
  const href = bundleHref(campaign.slug);
  // Multi-tier summary, or null when one concrete price still describes the
  // whole campaign. `tiers` arrives on the card DTO already (batched with the
  // campaign query), so this costs no extra request.
  const tierSummary = isCurated ? null : summarizeBundleTiers(campaign.tiers ?? [], currency, t);
  // The figure a "from X separately" line is measured against: the cheapest
  // price the shopper could actually pay.
  const price = tierSummary
    ? Math.min(...(campaign.tiers ?? []).map((tier) => tier.price))
    : (campaign.fixedBundlePrice ?? 0);

  const piecesLabel = (count: number) => fillTemplate(t(count === 1 ? "bundles.piece" : "bundles.pieces"), { count });

  // Only real numbers make it onto the card: a curated saving is shown when
  // positive; a build-your-stack "from X separately" only when the pool can
  // actually complete a stack right now.
  const savingLine = isCurated && campaign.savings !== null && campaign.savings > 0
    ? fillTemplate(t("bundles.save"), { price: formatMoney(campaign.savings, currency) })
    : null;
  const separatelyLine = isCurated
    ? campaign.regularValue !== null && campaign.regularValue > price
      ? fillTemplate(t("bundles.separately"), { price: formatMoney(campaign.regularValue, currency) })
      : null
    : campaign.valueRange && campaign.valueRange.min > price
      ? fillTemplate(t("bundles.from_separately"), { price: formatMoney(campaign.valueRange.min, currency) })
      : null;

  return (
    <article className={cn("group flex flex-col", className)} data-bundle-card={campaign.slug}>
      <Link href={href} className="relative block aspect-[4/5] w-full overflow-hidden bg-zeli-surface">
        <img
          src={resolveBundleImage(campaign.heroImageUrl)}
          alt={campaign.title}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          className={cn(
            "h-full w-full object-cover transition-transform duration-500 group-hover:scale-105",
            soldOut && "opacity-70",
          )}
        />
        <span className="absolute start-3 top-3 flex items-center gap-1 bg-zeli-bg/95 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[var(--zeli-tracking-label)] text-zeli-ink">
          {isCurated ? <Sparkles className="h-3 w-3" aria-hidden /> : <Layers className="h-3 w-3" aria-hidden />}
          {t(isCurated ? "bundles.type_curated" : "bundles.type_build")}
        </span>
        {campaign.badgeText && !soldOut && (
          <span className="absolute end-3 top-3 bg-zeli-ink px-2.5 py-1 text-[10px] font-medium uppercase tracking-[var(--zeli-tracking-label)] text-zeli-ink-inverse">
            {campaign.badgeText}
          </span>
        )}
        {soldOut && (
          <div className="absolute inset-0 flex items-center justify-center bg-zeli-bg/55">
            <span className="bg-zeli-bg px-3 py-1.5 text-[10px] font-medium uppercase tracking-[var(--zeli-tracking-label)] text-zeli-ink">
              {t("bundles.sold_out")}
            </span>
          </div>
        )}
      </Link>

      <div className="mt-3 flex flex-1 flex-col">
        <h3
          className="text-[14px] font-medium leading-snug text-zeli-ink"
          style={{ fontFamily: "var(--font-product-title)" }}>
          <Link href={href} className="hover:text-zeli-ink-secondary">
            {campaign.title}
          </Link>
        </h3>
        {campaign.subtitle && <p className="mt-0.5 text-[12px] text-zeli-ink-muted">{campaign.subtitle}</p>}

        <p className="mt-2 text-[15px] font-semibold text-zeli-ink" style={{ fontFamily: "var(--font-price)" }}>
          {isCurated
            ? formatMoney(price, currency)
            : tierSummary
              ? tierSummary.price
              : fillTemplate(t("bundle.choose_any"), { count: campaign.requiredQuantity, price: formatMoney(price, currency) })}
        </p>
        <p className="mt-0.5 text-[12px] text-zeli-ink-muted">
          {isCurated
            ? piecesLabel(campaign.unitCount)
            : tierSummary
              ? tierSummary.sizes
              : fillTemplate(t("bundles.pieces_to_choose"), { count: campaign.eligibleProductCount })}
          {separatelyLine && <> · {separatelyLine}</>}
        </p>
        {savingLine && <p className="mt-0.5 text-[12px] font-medium text-zeli-success">{savingLine}</p>}

        {/* A sold-out stack still links through: seeing what is in it (and
            that it is sold out) is more useful than a dead control. No
            aria-disabled — the link genuinely works. */}
        <Link
          href={href}
          className={cn(
            "mt-3 inline-flex min-h-11 w-full items-center justify-center border text-[11px] font-medium uppercase tracking-[var(--zeli-tracking-label)] transition-colors",
            soldOut
              ? "border-zeli-border text-zeli-ink-muted"
              : "border-zeli-ink text-zeli-ink hover:bg-zeli-ink hover:text-zeli-ink-inverse",
          )}>
          {soldOut ? t("bundles.sold_out") : t(isCurated ? "bundles.cta_shop" : "bundles.cta_build")}
        </Link>
      </div>
    </article>
  );
}
