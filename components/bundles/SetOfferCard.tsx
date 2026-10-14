import { ChevronRight } from "lucide-react";
import { STORE_CURRENCY } from "#root/shared/config/branding";
import { useMinimalI18n } from "#root/lib/i18n/MinimalI18nContext";
import { Link } from "#root/components/utils/Link";
import { cn } from "#root/lib/utils";
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
      className={cn("flex min-h-[13rem] overflow-hidden border border-perce-line bg-perce-surface", className)}
      data-set-offer={campaign.slug}>
      {/* Decorative image; the title and the CTA are the links. */}
      <div className="relative w-[42%] shrink-0 overflow-hidden bg-perce-surface-raised">
        <img
          src={resolveBundleImage(campaign.heroImageUrl)}
          alt=""
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          className={cn("absolute inset-0 h-full w-full object-cover", offer.soldOut && "opacity-70")}
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-between gap-4 p-4 sm:p-5">
        <div className="min-w-0">
          <h3 className="text-[15px] font-medium leading-snug text-perce-ink" style={{ fontFamily: "var(--font-product-title)" }}>
            <Link href={href} className="hover:text-perce-ink-secondary">
              {campaign.title}
            </Link>
          </h3>
          <p
            className="mt-2 text-[1.75rem] font-medium leading-[1.1] tracking-tight text-perce-ink sm:text-[2rem]"
            style={{ fontFamily: "var(--font-price)" }}
            data-testid="set-offer-headline">
            {offer.headline}
          </p>
          {offer.freeShipping && (
            <p
              className="mt-0.5 text-[1.0625rem] font-medium leading-tight text-perce-ink sm:text-lg"
              data-testid="set-offer-free-shipping">
              {t("sets.plus_free_shipping")}
            </p>
          )}
          <p className="mt-2 text-[13px] leading-snug text-perce-ink-muted">{offer.rule}</p>
        </div>

        <Link
          href={href}
          className={cn(
            "inline-flex min-h-11 w-full items-center justify-center gap-1.5 px-4 text-[13px] font-medium transition-colors sm:w-auto sm:self-start",
            offer.soldOut
              ? "border border-perce-line-strong text-perce-ink-muted"
              : "bg-perce-cta text-perce-ink-inverse hover:bg-perce-cta-hover",
          )}>
          {offer.soldOut ? t("bundles.sold_out") : (ctaLabel ?? offer.cta)}
          {!offer.soldOut && <ChevronRight className="h-4 w-4 rtl:rotate-180" aria-hidden />}
        </Link>
      </div>
    </article>
  );
}
