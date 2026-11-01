import { STORE_CURRENCY } from "#root/shared/config/branding";
import { useMinimalI18n } from "#root/lib/i18n/MinimalI18nContext";
import { Link } from "#root/components/utils/Link";
import { cn } from "#root/lib/utils";
import { buttonClass } from "#root/components/storefront/Button";
import type { BundleCardCampaign } from "./BundleCampaignCard";
import { bundleHref, resolveBundleImage } from "./bundle-ui";
import { describeSetOffer } from "./set-offer";

interface SetOfferCardProps {
  campaign: BundleCardCampaign;
  /** Overrides the derived "Shop 3 pieces" label (the Offers page says "Build this set"). */
  ctaLabel?: string;
  eager?: boolean;
  className?: string;
}

/**
 * A Pick Your Set campaign as a selling card: image, the set's name, its
 * economics in large type ("20% off", "+ free shipping"), the exact piece
 * rule, and one clear CTA into the builder. Every figure comes from the live
 * campaign via describeSetOffer — no copy here can promise more than the
 * builder gives.
 */
export function SetOfferCard({ campaign, ctaLabel, eager = false, className }: SetOfferCardProps) {
  const { t } = useMinimalI18n();
  const offer = describeSetOffer(campaign, t, STORE_CURRENCY);
  const href = bundleHref(campaign.slug);

  return (
    <article
      className={cn("flex min-h-52 overflow-hidden border border-line bg-surface", className)}
      data-set-offer={campaign.slug}>
      {/* Decorative image; the title and the CTA are the links. */}
      <div className="relative w-[42%] shrink-0 overflow-hidden bg-surface-2">
        <img
          src={resolveBundleImage(campaign.heroImageUrl)}
          alt=""
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          className={cn("absolute inset-0 h-full w-full object-cover", offer.soldOut && "opacity-70")}
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-between gap-4 p-4 md:p-6">
        <div className="min-w-0">
          <h3 className="t-label text-ink" style={{ fontFamily: "var(--font-product-title)" }}>
            <Link href={href} className="hover:underline hover:decoration-1 hover:underline-offset-4">
              {campaign.title}
            </Link>
          </h3>
          <p
            className="mt-2 t-h1 tabular-nums text-ink"
            style={{ fontFamily: "var(--font-price)" }}
            data-testid="set-offer-headline">
            {offer.headline}
          </p>
          {offer.freeShipping && (
            <p
              className="mt-1 t-h3 text-ink"
              data-testid="set-offer-free-shipping">
              {t("sets.plus_free_shipping")}
            </p>
          )}
          <p className="mt-2 t-small text-ink-2">{offer.rule}</p>
        </div>

        <Link
          href={href}
          className={buttonClass({
            variant: "secondary",
            size: "md",
            className: cn("w-full sm:w-auto sm:self-start", offer.soldOut && "border-line text-ink-2"),
          })}>
          {offer.soldOut ? t("bundles.sold_out") : (ctaLabel ?? offer.cta)}
        </Link>
      </div>
    </article>
  );
}
