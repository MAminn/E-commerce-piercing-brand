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

export interface CuratedStackDetailProps {
  /** A live curated campaign with its composition, loaded by the detail page. */
  campaign: PublicBundleCampaignDto;
  reload: () => Promise<void>;
}

/**
 * Curated stack page: the merchant fixed the composition, so there is nothing
 * to select — the shopper sees exactly what is in the stack at today's
 * prices and adds the whole thing. Pricing shown here is the server's
 * (`regularValue` / `savings` computed from current product prices); the
 * add-to-bag call re-validates everything again before the cart trusts it.
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

  useEffect(() => {
    setNotice(null);
    setAddedInstanceId(null);
  }, [campaign.id]);

  const price = campaign.fixedBundlePrice ?? 0;
  const regularValue = campaign.regularValue ?? 0;
  const savings = campaign.savings ?? regularValue - price;
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

  const savingLine =
    savings > 0 ? (
      <p className="font-medium text-perce-success">
        {t("curated.you_save")} {formatMoney(savings, currency)}
      </p>
    ) : savings === 0 ? (
      <p className="text-perce-ink-muted">{t("curated.no_saving")}</p>
    ) : (
      <p className="text-perce-sale">{t("curated.costs_more")}</p>
    );

  return (
    <div className="perce-header-offset min-h-screen bg-perce-bg pb-40 sm:pb-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <section className="grid gap-6 py-6 sm:py-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
          <div className="aspect-[4/5] w-full overflow-hidden bg-perce-surface lg:sticky lg:top-[var(--perce-header-offset)]">
            <img src={resolveBundleImage(campaign.heroImageUrl)} alt={campaign.title} className="h-full w-full object-cover" />
          </div>
          <div>
            <p className="perce-eyebrow flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5" aria-hidden /> {t("curated.eyebrow")}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <h1 className="perce-section-title">{campaign.title}</h1>
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
                // The line's regular unit price as the server priced it: the
                // effective price plus the fixed variant's modifiers.
                const unit = p.unitPrice;
                // Any reason this line can't be fulfilled right now — the
                // whole stack is sold out when one of them applies. Phase 7:
                // `purchasable` is false when the merchant-fixed variant no
                // longer resolves (or was never chosen).
                const pieceSoldOut = !p.purchasable || p.stock < p.quantity;
                const variantLabel = p.selectedOptions ? formatSelectedOptions(p.selectedOptions) : "";
                return (
                  <li key={p.productId} className={cn("flex items-center gap-3 py-3", pieceSoldOut && "opacity-60")}>
                    <Link href={getProductUrl({ id: p.productId, slug: p.slug })} className="h-16 w-16 shrink-0 overflow-hidden bg-perce-surface">
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
                      <p className="text-[12px] text-perce-ink-muted">
                        {fillTemplate(t("curated.unit_x"), { count: p.quantity })} · {formatMoney(unit, currency)}
                        {pieceSoldOut && <span className="ms-2 text-perce-sale">{t("bundles.sold_out")}</span>}
                      </p>
                    </div>
                    <p className="shrink-0 text-[13px] text-perce-ink-secondary" style={{ fontFamily: "var(--font-price)" }}>
                      {formatMoney(unit * p.quantity, currency)}
                    </p>
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
          </div>
        </section>
      </div>

      {/* ── Price + CTA (sticky bottom on mobile, inline card on desktop) ───── */}
      <div
        className="fixed inset-x-0 border-t border-perce-border bg-perce-bg shadow-[0_-4px_16px_rgba(36,29,25,0.08)] sm:static sm:border-0 sm:bg-transparent sm:shadow-none"
        style={{ bottom: "calc(4rem + env(safe-area-inset-bottom))", zIndex: "var(--perce-z-sticky)" }}>
        <div className="mx-auto max-w-6xl px-4 py-3 sm:px-6 sm:py-0 lg:px-8">
          <div className="sm:ms-auto sm:max-w-md sm:border sm:border-perce-border sm:bg-perce-surface sm:p-6">
            <div className="flex items-end justify-between gap-3 text-[12px] text-perce-ink-secondary">
              <div className="min-w-0 space-y-0.5">
                <p>
                  {t("curated.current_value")}: <span className={cn(savings > 0 && "line-through")}>{formatMoney(regularValue, currency)}</span>
                </p>
                {savingLine}
              </div>
              <div className="text-end">
                <p className="text-xs text-perce-ink-muted">{t("curated.stack_price")}</p>
                <p className="text-[18px] font-semibold text-perce-ink" style={{ fontFamily: "var(--font-price)" }}>
                  {formatMoney(price, currency)}
                </p>
              </div>
            </div>
            <button
              ref={ctaRef}
              type="button"
              onClick={handleAddToBag}
              disabled={soldOut || submitting}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-md bg-perce-cta py-3.5 text-sm font-medium text-perce-ink-inverse transition-colors hover:bg-perce-cta-hover disabled:cursor-not-allowed disabled:opacity-50">
              <ShoppingBag className="h-4 w-4" />
              {soldOut ? t("bundles.sold_out") : submitting ? t("bundle.adding") : t("curated.add_to_bag")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
