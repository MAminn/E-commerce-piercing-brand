import { useEffect, useState } from "react";
import type { BundleCardCampaign } from "#root/components/bundles/BundleCampaignCard";
import { bundleHref, resolveBundleImage } from "#root/components/bundles/bundle-ui";
import { buttonClass } from "#root/components/storefront/Button";
import { useMinimalI18n } from "#root/lib/i18n/MinimalI18nContext";
import { cn } from "#root/lib/utils";
import {
  PROMO_LAYER,
  type PromoLayerConfig,
  activeAnnouncement,
  activeOffer,
  isPromoLayerOn,
} from "#root/shared/config/promo-layer";
import { trpc } from "#root/shared/trpc/client";

/**
 * The promotional layer (see shared/config/promo-layer.ts). Every component
 * here renders nothing — and fetches nothing — while the layer is off, which
 * is the default. `config` is injectable for tests and previews only.
 */

/** 32px ink bar, one message. Its height is reserved in the server render (layouts/style.css). */
export function AnnouncementBar({ config = PROMO_LAYER }: { config?: PromoLayerConfig }) {
  const { locale } = useMinimalI18n();
  const message = activeAnnouncement(config);
  if (!message) return null;
  const text = (locale === "ar" && message.textAr?.trim()) || message.text;
  return (
    <div data-announcement-bar='' className='on-ink flex h-8 items-center justify-center bg-ink px-4 text-bg'>
      {message.href ? (
        <a href={message.href} className='truncate t-micro underline decoration-1 underline-offset-4'>
          {text}
        </a>
      ) : (
        <p className='truncate t-micro'>{text}</p>
      )}
    </div>
  );
}

/** A 1px ink-ruled block of text. No imagery, no countdown, no badge. */
export function OfferBlock({ config = PROMO_LAYER, className }: { config?: PromoLayerConfig; className?: string }) {
  const { locale } = useMinimalI18n();
  const offer = activeOffer(config);
  if (!offer) return null;
  const ar = locale === "ar";
  const title = (ar && offer.titleAr?.trim()) || offer.title;
  const body = (ar && offer.bodyAr?.trim()) || offer.body;
  const linkLabel = (ar && offer.linkLabelAr?.trim()) || offer.linkLabel;
  return (
    <section className={cn("perce-container py-8 lg:py-12", className)} data-offer-block=''>
      <div className='border border-ink p-6 lg:p-8'>
        <h2 className='t-h2 text-ink'>{title}</h2>
        {body?.trim() && <p className='mt-2 max-w-prose t-body text-ink-2'>{body}</p>}
        {offer.href && linkLabel?.trim() && (
          <a href={offer.href} className={buttonClass({ variant: "text", size: "md", className: "mt-4" })}>
            {linkLabel}
          </a>
        )}
      </div>
    </section>
  );
}

/**
 * Live Pick Your Set campaigns, fetched only while the layer and the given
 * feature are on. Empty otherwise (and on the server render).
 */
export function useLiveSetsForPromo(
  feature: "bundleEntryTile" | "pdpBundleLink",
  config: PromoLayerConfig = PROMO_LAYER,
): (BundleCardCampaign & { eligibleProducts?: { productId: string }[] })[] {
  const on = isPromoLayerOn(config) && config[feature];
  const [sets, setSets] = useState<(BundleCardCampaign & { eligibleProducts?: { productId: string }[] })[]>([]);
  useEffect(() => {
    if (!on) return;
    let cancelled = false;
    trpc.bundle.listLive
      .query({ type: "build_your_stack", includeProducts: feature === "pdpBundleLink" })
      .then((res) => {
        if (!cancelled && res.success && res.result) setSets(res.result as never);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [on, feature]);
  return on ? sets : [];
}

/**
 * A tile in the product grid's own footprint (4:5 frame + two text lines)
 * leading into the first live Pick Your Set campaign.
 */
export function BundleEntryTile({ config = PROMO_LAYER }: { config?: PromoLayerConfig }) {
  const { t } = useMinimalI18n();
  const sets = useLiveSetsForPromo("bundleEntryTile", config);
  const campaign = sets.find((c) => c.availability === "available");
  if (!campaign) return null;
  const href = bundleHref(campaign.slug);
  return (
    <article className='group flex flex-col' data-bundle-entry-tile={campaign.slug}>
      <a href={href} tabIndex={-1} aria-hidden='true' className='relative block aspect-[4/5] overflow-hidden bg-surface-2'>
        <img
          src={resolveBundleImage(campaign.heroImageUrl)}
          alt=''
          className='h-full w-full object-cover'
          loading='lazy'
          decoding='async'
        />
      </a>
      <div className='pt-3'>
        <p className='t-micro text-ink-2'>{t("bundles.type_build")}</p>
        <a href={href} className='mt-1 block hover:underline hover:decoration-1 hover:underline-offset-4'>
          <h3 className='line-clamp-2 t-card-title text-ink'>{campaign.title}</h3>
        </a>
      </div>
    </article>
  );
}

/** "Part of Pick 3" — only when this product is in a live Pick Your Set pool. */
export function PdpBundleLink({ productId, config = PROMO_LAYER }: { productId: string; config?: PromoLayerConfig }) {
  const { t } = useMinimalI18n();
  const sets = useLiveSetsForPromo("pdpBundleLink", config);
  const campaign = sets.find(
    (c) => c.availability === "available" && (c.eligibleProducts ?? []).some((p) => p.productId === productId),
  );
  if (!campaign) return null;
  return (
    <a
      href={bundleHref(campaign.slug)}
      data-pdp-bundle-link={campaign.slug}
      className={buttonClass({ variant: "text", size: "sm", className: "mt-2 self-start" })}>
      {t("product.bundle_link").replace("{name}", campaign.title)}
    </a>
  );
}
