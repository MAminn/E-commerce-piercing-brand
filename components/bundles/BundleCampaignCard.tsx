import type { PublicBundleCampaignDto } from "#root/backend/bundles/service";
import { STORE_CURRENCY } from "#root/shared/config/branding";
import { formatMoney } from "#root/shared/pricing/format-money";
import { useMinimalI18n } from "#root/lib/i18n/MinimalI18nContext";
import { Link } from "#root/components/utils/Link";
import { cn } from "#root/lib/utils";
import { buttonClass } from "#root/components/storefront/Button";
import { bundleHref, fillTemplate, resolveBundleImage } from "./bundle-ui";
import { describeSetOffer } from "./set-offer";

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
  /** Added to the card: a shape other than 4:5 where a row calls for one. */
  className?: string;
  /** Image priority for the first above-the-fold card. */
  eager?: boolean;
}

/**
 * One campaign, either type, as a large photo card: the kind of set, its name,
 * its offer and one clear way in, set over the campaign's own image.
 *
 * The offer is the campaign's own, from describeSetOffer (the same words as the
 * /offers card): "20% off", "From EGP 270", or a Ready Set's fixed price. A
 * campaign with no image is a solid ink card, never a grey hole.
 */
export function BundleCampaignCard({ campaign, className, eager = false }: BundleCampaignCardProps) {
  const { t, locale } = useMinimalI18n();
  const isCurated = campaign.type === "curated_stack";
  const soldOut = campaign.availability !== "available";
  const href = bundleHref(campaign.slug);
  const money = (amount: number) => formatMoney(amount, { locale });
  const offer = describeSetOffer(campaign, t, STORE_CURRENCY, money);

  const headline = isCurated ? money(campaign.fixedBundlePrice ?? 0) : offer.headline;
  const detail = isCurated
    ? fillTemplate(t(campaign.unitCount === 1 ? "bundles.piece" : "bundles.pieces"), { count: campaign.unitCount })
    : offer.rule;

  return (
    <article
      className={cn("group relative aspect-[4/5] w-full overflow-hidden bg-ink", className)}
      data-bundle-card={campaign.slug}>
      {campaign.heroImageUrl && (
        <>
          <img
            src={resolveBundleImage(campaign.heroImageUrl)}
            alt=''
            loading={eager ? "eager" : "lazy"}
            decoding='async'
            className={cn(
              "absolute inset-0 h-full w-full object-cover transition-transform duration-[var(--perce-duration-slow)] ease-out motion-reduce:transition-none lg:group-hover:scale-[1.03]",
              soldOut && "opacity-70",
            )}
          />
          <div
            aria-hidden
            className='pointer-events-none absolute inset-x-0 bottom-0 h-3/4 bg-gradient-to-t from-ink/85 via-ink/40 to-transparent'
          />
        </>
      )}

      {/* The photo repeats the title's link for pointer users (same href, out of
          the tab order), as on the product card. */}
      <a href={href} tabIndex={-1} className='absolute inset-0'>
        <span className='sr-only'>{campaign.title}</span>
      </a>

      {(campaign.badgeText || soldOut) && (
        <p className='pointer-events-none absolute start-3 top-3 bg-bg px-2 py-1 t-micro text-ink lg:start-4 lg:top-4'>
          {soldOut ? t("bundles.sold_out") : campaign.badgeText}
        </p>
      )}

      <div className='pointer-events-none absolute inset-x-0 bottom-0 flex flex-col p-4 text-bg lg:p-5'>
        <p className='t-small text-bg/80'>{t(isCurated ? "bundles.type_curated" : "bundles.type_build")}</p>
        <h3 className='mt-1 t-h2 text-bg' style={{ fontFamily: "var(--font-product-title)" }}>
          <Link href={href} className='pointer-events-auto hover:underline hover:decoration-1 hover:underline-offset-4'>
            {campaign.title}
          </Link>
        </h3>
        <p className='mt-2 t-h3 tabular-nums text-bg' style={{ fontFamily: "var(--font-price)" }}>
          {headline}
          {!isCurated && campaign.freeShipping && <span className='ms-1.5'>{t("sets.plus_free_shipping")}</span>}
        </p>
        <p className='mt-1 t-small text-bg/80'>{detail}</p>

        {/* A sold-out set still links through: seeing what is in it (and that it
            is sold out) is more useful than a dead control. */}
        <Link
          href={href}
          className={buttonClass({
            variant: "primary",
            size: "md",
            fullWidth: true,
            className: cn("pointer-events-auto mt-4 bg-bg text-ink hover:bg-surface", soldOut && "bg-bg/70"),
          })}>
          {soldOut ? t("bundles.sold_out") : t(isCurated ? "bundles.cta_shop" : "sets.cta_build")}
        </Link>
      </div>
    </article>
  );
}
