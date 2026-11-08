import { useEffect, useRef, useState } from "react";
import { Check, ShoppingBag, Sparkles } from "lucide-react";
import { trpc } from "#root/shared/trpc/client";
import { STORE_CURRENCY } from "#root/shared/config/branding";
import type { PublicBundleCampaignDto } from "#root/backend/bundles/service";
import { useCart } from "#root/lib/context/CartContext";
import { useMinimalI18n } from "#root/lib/i18n/MinimalI18nContext";
import { useTracking } from "#root/frontend/contexts/TrackingContext";
import { TrackingEventName } from "#root/shared/types/pixel-tracking";
import { showCartToast, flyToCart } from "#root/components/ui/cart-toast";
import { Link } from "#root/components/utils/Link";
import { getProductUrl } from "#root/lib/utils/route-helpers";
import { cn } from "#root/lib/utils";
import { fillTemplate, formatMoney, resolveBundleImage } from "./bundle-ui";
import { formatSelectedOptions } from "#root/shared/products/options";
import { usePublishSetBarHeight, useSetPanelInView } from "./set-bar";

export interface CuratedStackDetailProps {
  /** A live curated campaign with its composition, loaded by the detail page. */
  campaign: PublicBundleCampaignDto;
  reload: () => Promise<void>;
}

/**
 * Curated stack page: the merchant fixed the composition, so there is nothing
 * to select — the shopper sees exactly what is in the set and adds the whole
 * thing at one price, the server's. A piece in a set has no price of its own
 * here, as in the bag. The add-to-bag call re-validates everything again
 * before the cart trusts it.
 */
export function CuratedStackDetail({ campaign, reload }: CuratedStackDetailProps) {
  const { t } = useMinimalI18n();
  const { addBundle } = useCart();
  const { trackEvent } = useTracking();
  const currency = STORE_CURRENCY;

  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [addedInstanceId, setAddedInstanceId] = useState<string | null>(null);
  const ctaRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Phones: a fixed bar, reserved like the builder's. From sm: an inline panel,
  // and the bag bar steps aside while it is on screen.
  usePublishSetBarHeight(panelRef);
  useSetPanelInView(panelRef);

  useEffect(() => {
    setNotice(null);
    setAddedInstanceId(null);
  }, [campaign.id]);

  const price = campaign.fixedBundlePrice ?? 0;
  const regularValue = campaign.regularValue ?? 0;
  const costsMore = (campaign.savings ?? regularValue - price) < 0;
  const soldOut = campaign.availability !== "available";
  const unitCount = campaign.unitCount;
  const pieces = campaign.eligibleProducts;

  const handleAddToBag = async () => {
    if (soldOut || submitting) return;
    setSubmitting(true);
    setNotice(null);
    try {
      // Only the campaign identity is sent — the server owns the composition.
      const result = await trpc.bundle.evaluateSelection.query({
        campaignId: campaign.id,
        items: [],
        expectedBundleTotal: price,
      });
      if (!result.success) {
        setNotice({ tone: "error", text: t("bundle.check_failed") });
        return;
      }
      const check = result.result;
      if (!check.ok) {
        setNotice({ tone: "error", text: check.message });
        await reload();
        return;
      }
      const added = addBundle({
        campaignId: check.bundle.campaignId,
        campaignSlug: check.bundle.campaignSlug,
        campaignTitle: check.bundle.campaignTitle,
        requiredQuantity: check.bundle.requiredQuantity,
        bundlePrice: check.bundle.bundleTotal,
        offerStacking: check.bundle.offerStacking,
        isRepeatable: check.bundle.isRepeatable,
        freeShipping: check.bundle.freeShipping,
        items: check.bundle.items.map((item) => ({
          productId: item.productId,
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          imageUrl: resolveBundleImage(item.imageUrl),
          // The composition's fixed variants, as the server resolved them.
          selectedOptions: item.selectedOptions,
          stock: item.stock,
        })),
      });
      if (!added.success) {
        setNotice({ tone: "error", text: added.message ?? t("bundle.check_failed") });
        return;
      }
      trackEvent(TrackingEventName.PRODUCT_ADDED_TO_CART, {
        ecommerce: {
          currency,
          value: check.bundle.bundleTotal,
          items: check.bundle.items.map((item) => ({
            itemId: item.productId,
            itemName: item.name,
            price: item.unitPrice,
            quantity: item.quantity,
          })),
        },
        customProperties: {
          bundleCampaignId: check.bundle.campaignId,
          bundleCampaignSlug: check.bundle.campaignSlug,
          bundleCampaignType: "curated_stack",
          bundleInstanceId: added.instanceId,
          bundlePrice: check.bundle.bundleTotal,
        },
      });
      flyToCart(ctaRef.current, resolveBundleImage(campaign.heroImageUrl));
      showCartToast({ name: campaign.title, price: check.bundle.bundleTotal, imageUrl: resolveBundleImage(campaign.heroImageUrl) });
      setAddedInstanceId(added.instanceId ?? null);
      setNotice({ tone: "success", text: added.replaced ? t("bundle.replaced") : t("bundle.added") });
    } catch {
      setNotice({ tone: "error", text: t("bundle.check_failed") });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-perce-bg pb-12 sm:pb-16">
      <div className="mx-auto max-w-[var(--perce-content-max)] px-[var(--perce-gutter)]">
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <section className="grid gap-4 py-4 sm:py-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start lg:gap-8">
          <div className="aspect-[4/5] w-full overflow-hidden bg-perce-surface lg:sticky lg:top-[calc(var(--perce-header-offset)+1rem)]">
            <img src={resolveBundleImage(campaign.heroImageUrl)} alt={campaign.title} className="h-full w-full object-cover" />
          </div>
          <div>
            <p className="perce-eyebrow flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5" aria-hidden /> {t("curated.eyebrow")}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <h1 className="t-h1 text-ink">{campaign.title}</h1>
              {campaign.badgeText && (
                <span className="bg-perce-ink px-2.5 py-1 text-xs font-medium text-perce-ink-inverse">
                  {campaign.badgeText}
                </span>
              )}
            </div>
            {campaign.subtitle && <p className="mt-1 text-[14px] text-perce-ink-secondary">{campaign.subtitle}</p>}
            <p className="mt-3 text-[13px] text-perce-ink-muted">
              {fillTemplate(t(unitCount === 1 ? "bundles.piece" : "bundles.pieces"), { count: unitCount })}
            </p>
            {campaign.description && (
              <p className="mt-3 max-w-prose text-[length:var(--perce-text-body)] leading-[var(--perce-leading-body)] text-perce-ink-muted">
                {campaign.description}
              </p>
            )}

            {/* Composition */}
            <h2 className="perce-eyebrow mt-8">{t("curated.includes")}</h2>
            <ul className="mt-3 divide-y divide-perce-line border-y border-perce-line">
              {pieces.map((p) => {
                // Any reason this line can't be fulfilled right now — the
                // whole stack is sold out when one of them applies. Phase 7:
                // `purchasable` is false when the merchant-fixed variant no
                // longer resolves (or was never chosen).
                const pieceSoldOut = !p.purchasable || p.stock < p.quantity;
                const variantLabel = p.selectedOptions ? formatSelectedOptions(p.selectedOptions) : "";
                return (
                  <li key={p.productId} className={cn("flex items-center gap-3 py-3", pieceSoldOut && "opacity-60")}>
                    <Link href={getProductUrl({ id: p.productId, slug: p.slug })} className="h-24 w-20 shrink-0 overflow-hidden bg-perce-surface">
                      <img src={resolveBundleImage(p.imageUrl)} alt={p.name} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                    </Link>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-medium" style={{ fontFamily: "var(--font-product-title)" }}>
                        <Link
                          href={getProductUrl({ id: p.productId, slug: p.slug })}
                          className="text-perce-ink hover:text-perce-ink-secondary">
                          {p.name}
                        </Link>
                      </p>
                      {/* The exact variant the merchant fixed — the shopper does not choose here. */}
                      {variantLabel && <p className="text-[12px] text-perce-ink-secondary">{variantLabel}</p>}
                      {pieceSoldOut && <p className="text-[12px] text-perce-sale">{t("bundles.sold_out")}</p>}
                    </div>
                    {p.quantity > 1 && (
                      <p className="shrink-0 text-[13px] tabular-nums text-perce-ink-secondary">
                        {fillTemplate(t("curated.unit_x"), { count: p.quantity })}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>

            {soldOut && (
              <p className="mt-4 border border-perce-border bg-perce-surface px-4 py-3 text-[13px] text-perce-ink-secondary">
                {t("curated.sold_out_body")}
              </p>
            )}
            {notice && (
              <div
                role={notice.tone === "error" ? "alert" : "status"}
                className={cn(
                  "mt-4 flex flex-wrap items-center justify-between gap-3 border px-4 py-3 text-[13px]",
                  notice.tone === "error" ? "border-perce-sale/40 bg-perce-surface text-perce-sale" : "border-perce-success/40 bg-perce-surface text-perce-success",
                )}>
                <span className="flex items-center gap-1.5">
                  {notice.tone === "success" && <Check className="h-3.5 w-3.5" />}
                  {notice.text}
                </span>
                {addedInstanceId && (
                  <Link
                    href="/cart"
                    className="inline-flex min-h-9 items-center gap-1.5 bg-perce-cta px-4 text-xs font-medium text-perce-ink-inverse hover:bg-perce-cta-hover">
                    <ShoppingBag className="h-3.5 w-3.5" /> {t("bundle.view_bag")}
                  </Link>
                )}
              </div>
            )}

            {/* ── Price + CTA: fixed to the bottom on phones, under the pieces from sm ── */}
            <div
              ref={panelRef}
              className="fixed inset-x-0 bottom-0 border-t border-perce-border bg-perce-bg pb-[env(safe-area-inset-bottom)] sm:static sm:mt-6 sm:border-0 sm:bg-transparent sm:pb-0"
              style={{ zIndex: "var(--perce-z-sticky)" }}
              data-testid="curated-price-panel">
              <div className="px-[var(--perce-gutter)] py-3 sm:p-0">
                <div className="sm:border sm:border-perce-border sm:bg-perce-surface sm:p-6">
                  {/* One price. The only comparison ever stated is a warning that a
                      set costs more than its pieces — never a saving. */}
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-[13px] text-perce-ink-secondary">{t("curated.stack_price")}</p>
                    <p className="text-[18px] font-medium tabular-nums text-perce-ink" style={{ fontFamily: "var(--font-price)" }}>
                      {formatMoney(price, currency)}
                    </p>
                  </div>
                  {costsMore && <p className="mt-1 text-[12px] text-perce-sale">{t("curated.costs_more")}</p>}
                  <button
                    ref={ctaRef}
                    type="button"
                    onClick={handleAddToBag}
                    disabled={soldOut || submitting}
                    className="mt-3 flex w-full items-center justify-center gap-2 bg-perce-cta py-3.5 text-sm font-medium text-perce-ink-inverse transition-colors hover:bg-perce-cta-hover disabled:cursor-not-allowed disabled:opacity-50">
                    <ShoppingBag className="h-4 w-4" />
                    {soldOut ? t("bundles.sold_out") : submitting ? t("bundle.adding") : t("curated.add_to_bag")}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
