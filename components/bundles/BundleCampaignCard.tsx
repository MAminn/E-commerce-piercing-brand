import type { PublicBundleCampaignDto } from "#root/backend/bundles/service";
import { STORE_CURRENCY } from "#root/shared/config/branding";
import { useMinimalI18n } from "#root/lib/i18n/MinimalI18nContext";
import { Link } from "#root/components/utils/Link";
import { cn } from "#root/lib/utils";
import { buttonClass } from "#root/components/storefront/Button";
import {
  bundleHref,
  fillTemplate,
  formatMoney,
  resolveBundleImage,
  summarizeBundleTiers,
  summarizePercentageTiers,
} from "./bundle-ui";

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
  | "pricingType"
  | "freeShipping"
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
  const isPercentage = !isCurated && campaign.pricingType === "percentage_discount";
  // Percentage-priced Pick Your Set: the discount IS the offer — there is no
  // fixed price to quote.
  const percentSummary = isPercentage ? summarizePercentageTiers(campaign.tiers ?? [], t) : null;
  const tierSummary = isCurated || isPercentage ? null : summarizeBundleTiers(campaign.tiers ?? [], currency, t);
  // The cheapest price the shopper could actually pay.
  const price = tierSummary
    ? Math.min(...(campaign.tiers ?? []).flatMap((tier) => (tier.price === null ? [] : [tier.price])))
    : (campaign.fixedBundlePrice ?? 0);

  const piecesLabel = (count: number) => fillTemplate(t(count === 1 ? "bundles.piece" : "bundles.pieces"), { count });

  return (
    <article className={cn("group flex flex-col", className)} data-bundle-card={campaign.slug}>
      <Link href={href} className="relative block aspect-[4/5] w-full overflow-hidden bg-surface-2">
        <img
          src={resolveBundleImage(campaign.heroImageUrl)}
          alt={campaign.title}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          className={cn(
            "h-full w-full object-cover",
            soldOut && "opacity-70",
          )}
        />
      </Link>

      <div className="mt-3 flex flex-1 flex-col">
        {/* Type, admin badge text and sold-out state as one Micro line —
            facts under the photo, not badges over it. */}
        <p className="t-micro text-ink-2">
          {t(isCurated ? "bundles.type_curated" : "bundles.type_build")}
          {campaign.badgeText && !soldOut && <> · {campaign.badgeText}</>}
          {soldOut && <> · {t("bundles.sold_out")}</>}
        </p>
        <h3
          className="mt-1 t-card-title text-ink"
          style={{ fontFamily: "var(--font-product-title)" }}>
          <Link href={href} className="hover:underline hover:decoration-1 hover:underline-offset-4">
            {campaign.title}
          </Link>
        </h3>
        {campaign.subtitle && <p className="mt-1 t-small text-ink-2">{campaign.subtitle}</p>}

        <p className="mt-2 t-card-price text-ink" style={{ fontFamily: "var(--font-price)" }}>
          {isCurated
            ? formatMoney(price, currency)
            : percentSummary
              ? percentSummary.price
              : tierSummary
                ? tierSummary.price
                : fillTemplate(t("bundle.choose_any"), { count: campaign.requiredQuantity, price: formatMoney(price, currency) })}
        </p>
        <p className="mt-1 t-small text-ink-2">
          {isCurated
            ? piecesLabel(campaign.unitCount)
            : (percentSummary?.sizes ?? tierSummary?.sizes ??
              fillTemplate(t("bundles.pieces_to_choose"), { count: campaign.eligibleProductCount }))}
        </p>
        {!isCurated && campaign.freeShipping && (
          <p className="mt-1 t-small text-ink">{t("bundle.free_shipping")}</p>
        )}

        {/* A sold-out stack still links through: seeing what is in it (and
            that it is sold out) is more useful than a dead control. No
            aria-disabled — the link genuinely works. */}
        <Link
          href={href}
          className={buttonClass({
            variant: "secondary",
            size: "md",
            fullWidth: true,
            className: cn("mt-4", soldOut && "border-line text-ink-2"),
          })}>
          {soldOut ? t("bundles.sold_out") : t(isCurated ? "bundles.cta_shop" : "bundles.cta_build")}
        </Link>
      </div>
    </article>
  );
}
