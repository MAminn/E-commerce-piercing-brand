import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Layers, Minus, Plus, ShoppingBag, X } from "lucide-react";
import { trpc } from "#root/shared/trpc/client";
import { STORE_CURRENCY } from "#root/shared/config/branding";
import type { PublicBundleCampaignDto } from "#root/backend/bundles/service";
import type { BundleRejectionDetail } from "#root/backend/bundles/selection";
import {
  type BundleCampaignConfig,
  bundlePoolCapacity,
  evaluateBundleSelection,
} from "#root/shared/bundles/evaluate";
import {
  type SelectedOptions,
  formatSelectedOptionValues,
  productLineKey,
  requiresOptionSelection,
  resolvePurchasableLinePrice,
  resolveSelectedOptions,
} from "#root/shared/products/options";
import { VariantSelector } from "#root/components/shop/VariantSelector";
import { useCart } from "#root/lib/context/CartContext";
import { useMinimalI18n } from "#root/lib/i18n/MinimalI18nContext";
import { useTracking } from "#root/frontend/contexts/TrackingContext";
import { TrackingEventName } from "#root/shared/types/pixel-tracking";
import { showCartToast, flyToCart } from "#root/components/ui/cart-toast";
import { Link } from "#root/components/utils/Link";
import { cn } from "#root/lib/utils";
import { fillTemplate as fill, formatMoney as money, resolveBundleImage as imageSrc } from "./bundle-ui";

// ─── Helpers ──────────────────────────────────────────────────────────────────

type PoolProduct = PublicBundleCampaignDto["eligibleProducts"][number];

/** The product's effective price with no options chosen — the server decided it (`unitPrice`). */
function effectivePrice(p: PoolProduct): number {
  return p.unitPrice;
}

/**
 * One chosen line of the stack: a product plus, when it has options, the
 * exact configuration. Two options of one product are two lines (they may
 * cost different amounts) but ONE product for the campaign's duplicate and
 * max-per-product rules — the evaluator merges by `productId`.
 */
interface SelectionLine {
  key: string;
  productId: string;
  selectedOptions: SelectedOptions;
  quantity: number;
}

/** Price of a specific configuration, via the same helper the server prices with. Null when it does not resolve. */
function linePrice(p: PoolProduct, selectedOptions: SelectedOptions): number | null {
  const resolved = resolveSelectedOptions(p.optionGroups, selectedOptions);
  return resolved.ok ? resolvePurchasableLinePrice(effectivePrice(p), resolved.priceModifier) : null;
}

/** Storefront wording for a server rejection, in the shopper's language when we have it. */
function rejectionText(
  t: (key: string) => string,
  code: string,
  fallback: string,
  detail: BundleRejectionDetail | null,
): string {
  const values = { product: detail?.productName ?? "", option: detail?.optionName ?? "" };
  switch (code) {
    case "option_required":
    case "option_not_found":
    case "option_unavailable":
    case "price_changed":
    case "composition_incomplete":
      return fill(t(`bundle.${code}`), values);
    default:
      return fallback;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export interface BundleBuilderProps {
  /** A live build-your-stack campaign, loaded by the detail page. */
  campaign: PublicBundleCampaignDto;
  /** Re-fetches the campaign (used after the server reports a stale pool). */
  reload: () => Promise<void>;
}

export function BundleBuilder({ campaign, reload: load }: BundleBuilderProps) {
  const { t } = useMinimalI18n();
  const { addBundle } = useCart();
  const { trackEvent } = useTracking();
  const currency = STORE_CURRENCY;

  /** The chosen lines, in the order the shopper picked them. */
  const [selection, setSelection] = useState<SelectionLine[]>([]);
  /** Options being chosen per product with option groups, before the line is added. */
  const [pending, setPending] = useState<Map<string, SelectedOptions>>(new Map());
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<{ tone: "error" | "success" | "info"; text: string } | null>(null);
  const [addedInstanceId, setAddedInstanceId] = useState<string | null>(null);
  const ctaRef = useRef<HTMLButtonElement>(null);

  // A different campaign (client-side navigation between slugs) starts clean.
  useEffect(() => {
    setSelection([]);
    setPending(new Map());
    setNotice(null);
    setAddedInstanceId(null);
  }, [campaign.id]);

  // Only what a shopper can actually buy: the public DTO already drops hidden
  // and deleted products; out-of-stock stays visible but disabled.
  const pool = useMemo(() => campaign.eligibleProducts, [campaign]);
  const poolById = useMemo(() => new Map(pool.map((p) => [p.productId, p])), [pool]);

  const config = useMemo<BundleCampaignConfig | null>(
    () => ({
      type: campaign.type,
      requiredQuantity: campaign.requiredQuantity,
      pricingType: campaign.pricingType,
      fixedBundlePrice: campaign.fixedBundlePrice,
      allowDuplicates: campaign.allowDuplicates,
      maxPerProduct: campaign.maxPerProduct,
      isRepeatable: campaign.isRepeatable,
      // The campaign's real tiers, so the builder's live feedback is produced
      // by the SAME pure evaluator the server runs. Nothing about pricing is
      // decided here — `handleAddToBag` still re-checks with the server before
      // anything reaches the cart.
      tiers: campaign.tiers.map((t) => ({ id: t.id, quantity: t.quantity, price: t.price })),
      eligibleProductIds: pool.map((p) => p.productId),
    }),
    [campaign, pool],
  );

  // Drop anything that stopped being purchasable since it was picked
  // (e.g. the campaign was refetched after a server rejection): a product
  // gone from the pool or out of stock, or a configuration that no longer
  // resolves against the product's current options. Never swap in another
  // option — the shopper chooses again.
  useEffect(() => {
    setSelection((prev) => {
      let changed = false;
      const next: SelectionLine[] = [];
      const usedPerProduct = new Map<string, number>();
      for (const line of prev) {
        const p = poolById.get(line.productId);
        if (!p || p.stock <= 0 || !p.purchasable || linePrice(p, line.selectedOptions) === null) {
          changed = true;
          continue;
        }
        const used = usedPerProduct.get(p.productId) ?? 0;
        const room = Math.max(0, p.stock - used);
        const capped = Math.min(line.quantity, room);
        if (capped !== line.quantity) changed = true;
        if (capped === 0) continue;
        usedPerProduct.set(p.productId, used + capped);
        next.push({ ...line, quantity: capped });
      }
      return changed ? next : prev;
    });
  }, [campaign, poolById]);

  // What the evaluator sees: one unit-line per configuration at ITS price.
  // Duplicate/max rules are applied per product inside the evaluator.
  const units = useMemo(
    () =>
      selection.map((line) => {
        const p = poolById.get(line.productId);
        return {
          productId: line.productId,
          quantity: line.quantity,
          unitPrice: p ? (linePrice(p, line.selectedOptions) ?? effectivePrice(p)) : 0,
        };
      }),
    [selection, poolById],
  );

  /** Units of a product across all of its configurations — what the campaign rules count. */
  const quantityOfProduct = useCallback(
    (productId: string) => selection.reduce((sum, l) => (l.productId === productId ? sum + l.quantity : sum), 0),
    [selection],
  );

  // The same pure rules the server runs — used here only for live feedback.
  const evaluation = useMemo(() => (config ? evaluateBundleSelection(config, units) : null), [config, units]);

  const selectedCount = evaluation?.qualifyingQuantity ?? 0;
  /** Tiers ascending — the ladder the shopper climbs. */
  const tiers = useMemo(() => [...campaign.tiers].sort((a, b) => a.quantity - b.quantity), [campaign.tiers]);
  const largestTierQuantity = tiers[tiers.length - 1]?.quantity ?? campaign.requiredQuantity;
  const required = evaluation?.requiredQuantity ?? campaign.requiredQuantity;
  // Stop at the biggest tier: past it nothing can qualify, so there is no
  // reason to let the shopper build a stack that can never be added.
  const stackFull = selectedCount >= largestTierQuantity;

  // Capacity check: can this pool still complete a stack at all?
  /**
   * Units the pool can supply right now — the basis for every "can this tier
   * be built?" answer. The SAME `bundlePoolCapacity` the server's tier
   * availability uses; `purchasable` already accounts for a product whose
   * options leave nothing sellable.
   */
  const poolCapacity = useMemo(
    () =>
      config
        ? bundlePoolCapacity(
            config,
            pool.map((p) => ({ productId: p.productId, stock: p.stock, purchasable: p.purchasable })),
          )
        : 0,
    [config, pool],
  );

  /** A tier the pool cannot fill today is shown, but never advertised as attainable. */
  const tierReachable = useCallback((quantity: number) => poolCapacity >= quantity, [poolCapacity]);

  // Campaign-level: available when ANY tier can still be completed.
  const poolCanComplete = useMemo(
    () => (tiers.length === 0 ? false : tiers.some((t) => poolCapacity >= t.quantity)),
    [tiers, poolCapacity],
  );

  const perProductCap = useCallback(
    (p: PoolProduct): number => {
      if (!campaign.allowDuplicates) return Math.min(1, p.stock);
      return Math.min(p.stock, campaign.maxPerProduct ?? Number.POSITIVE_INFINITY);
    },
    [campaign],
  );

  const touch = () => {
    setNotice(null);
    setAddedInstanceId(null);
  };

  /**
   * Adds one unit of a configuration. The per-product cap counts EVERY
   * configuration of the product — Gold ×1 + Silver ×1 is two of Product A —
   * so a different option can never bypass "once only" or `maxPerProduct`.
   */
  const increment = (p: PoolProduct, selectedOptions: SelectedOptions = {}) => {
    if (p.stock <= 0 || !p.purchasable || stackFull) return;
    if (linePrice(p, selectedOptions) === null) return;
    touch();
    setSelection((prev) => {
      const productTotal = prev.reduce((sum, l) => (l.productId === p.productId ? sum + l.quantity : sum), 0);
      if (productTotal >= perProductCap(p)) return prev;
      const key = productLineKey(p.productId, selectedOptions);
      const existing = prev.find((l) => l.key === key);
      if (existing) return prev.map((l) => (l.key === key ? { ...l, quantity: l.quantity + 1 } : l));
      return [...prev, { key, productId: p.productId, selectedOptions, quantity: 1 }];
    });
  };

  const decrement = (p: PoolProduct, selectedOptions: SelectedOptions = {}) => {
    touch();
    const key = productLineKey(p.productId, selectedOptions);
    setSelection((prev) => {
      const existing = prev.find((l) => l.key === key);
      if (!existing) return prev;
      if (existing.quantity === 1) return prev.filter((l) => l.key !== key);
      return prev.map((l) => (l.key === key ? { ...l, quantity: l.quantity - 1 } : l));
    });
  };

  /** Removes every configuration of a product (the "once only" toggle-off, or the × on a line). */
  const removeProduct = (p: PoolProduct) => {
    touch();
    setSelection((prev) => prev.filter((l) => l.productId !== p.productId));
  };

  const toggle = (p: PoolProduct) => {
    if (quantityOfProduct(p.productId) > 0 && !campaign.allowDuplicates) removeProduct(p);
    else increment(p);
  };

  /** The first (with duplicates off: the only) line of a product. */
  const selectedLineOf = (p: PoolProduct): SelectionLine | undefined =>
    selection.find((l) => l.productId === p.productId);

  const pendingOptionsOf = (p: PoolProduct): SelectedOptions =>
    pending.get(p.productId) ?? selectedLineOf(p)?.selectedOptions ?? {};

  /**
   * Option chip changed for a product with option groups. With duplicates off
   * and the product already in the stack, the ONE allowed unit simply moves
   * to the new configuration (still one Product A); otherwise it only updates
   * what the next "Add" will add.
   */
  const choosePendingOption = (p: PoolProduct, optionName: string, value: string) => {
    touch();
    const current = pending.get(p.productId) ?? selectedLineOf(p)?.selectedOptions ?? {};
    const nextOptions = { ...current, [optionName]: value };
    setPending((prev) => new Map(prev).set(p.productId, nextOptions));
    if (!campaign.allowDuplicates) {
      const existing = selectedLineOf(p);
      if (existing && linePrice(p, nextOptions) !== null) {
        const key = productLineKey(p.productId, nextOptions);
        setSelection((prev) =>
          prev.map((l) => (l.productId === p.productId ? { ...l, key, selectedOptions: nextOptions } : l)),
        );
      }
    }
  };


  const handleAddToBag = async () => {
    if (!evaluation?.qualifies || submitting) return;
    setSubmitting(true);
    setNotice(null);
    try {
      // Server authority: the campaign, pool, prices and stock are re-read
      // and the stack re-evaluated. Only ids + quantities leave the browser.
      const result = await trpc.bundle.evaluateSelection.query({
        campaignId: campaign.id,
        items: selection.map((line) => ({
          productId: line.productId,
          quantity: line.quantity,
          selectedOptions: Object.keys(line.selectedOptions).length > 0 ? line.selectedOptions : undefined,
        })),
        expectedBundleTotal: evaluation.bundleTotal ?? undefined,
      });
      if (!result.success) {
        setNotice({ tone: "error", text: t("bundle.check_failed") });
        return;
      }
      const check = result.result;
      if (!check.ok) {
        setNotice({ tone: "error", text: rejectionText(t, check.code, check.message, check.detail) });
        // Anything about availability means our copy of the pool is stale.
        if (
          [
            "product_unavailable",
            "out_of_stock",
            "campaign_not_live",
            "campaign_not_found",
            "price_changed",
            "option_not_found",
            "option_unavailable",
          ].includes(check.code)
        ) {
          await load();
        }
        return;
      }

      const added = addBundle({
        campaignId: check.bundle.campaignId,
        campaignSlug: check.bundle.campaignSlug,
        campaignTitle: check.bundle.campaignTitle,
        requiredQuantity: check.bundle.tierQuantity,
        tierId: check.bundle.tierId,
        bundlePrice: check.bundle.bundleTotal,
        offerStacking: check.bundle.offerStacking,
        isRepeatable: check.bundle.isRepeatable,
        items: check.bundle.items.map((item) => ({
          productId: item.productId,
          name: item.name,
          quantity: item.quantity,
          // Regular price of THIS configuration and the CANONICAL options —
          // both as the server resolved them, never as the browser built them.
          unitPrice: item.unitPrice,
          imageUrl: imageSrc(item.imageUrl),
          selectedOptions: item.selectedOptions,
          stock: item.stock,
        })),
      });
      if (!added.success) {
        setNotice({ tone: "error", text: added.message ?? t("bundle.check_failed") });
        return;
      }

      // Analytics: the children are real products; the stack is metadata.
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
          bundleCampaignType: "build_your_stack",
          bundleInstanceId: added.instanceId,
          bundlePrice: check.bundle.bundleTotal,
        },
      });

      flyToCart(ctaRef.current, imageSrc(check.bundle.items[0]?.imageUrl));
      showCartToast({
        name: check.bundle.campaignTitle,
        price: check.bundle.bundleTotal,
        imageUrl: imageSrc(check.bundle.items[0]?.imageUrl),
      });
      setAddedInstanceId(added.instanceId ?? null);
      setNotice({ tone: "success", text: added.replaced ? t("bundle.replaced") : t("bundle.added") });
      setSelection([]);
      setPending(new Map());
    } catch {
      setNotice({ tone: "error", text: t("bundle.check_failed") });
    } finally {
      setSubmitting(false);
    }
  };

  if (!config || !evaluation) return null;

  const multiTier = tiers.length > 1;
  // What this stack costs RIGHT NOW: the matched tier's price, or nothing when
  // the count sits between tiers. Never the previous tier's price.
  const price = evaluation.tier?.price ?? null;
  const nextTier = evaluation.nextTier;
  const headline = multiTier
    ? fill(t("bundle.choose_from"), {
        min: tiers[0]?.quantity ?? 0,
        max: largestTierQuantity,
        price: money(tiers.reduce((a, b) => (b.price < a.price ? b : a)).price, currency),
      })
    : fill(t(campaign.allowDuplicates ? "bundle.choose" : "bundle.choose_any"), {
        count: tiers[0]?.quantity ?? campaign.requiredQuantity,
        price: money(tiers[0]?.price ?? campaign.fixedBundlePrice ?? 0, currency),
      });
  const remaining = Math.max(0, required - selectedCount);
  const regularTotal = evaluation.regularTotal;
  // Truthful: only a matched tier has a price to compare against, and a
  // negative result is never relabelled as a saving.
  const savings = price === null ? null : regularTotal - price;
  // The CTA is live only on an exact tier. A between-tiers count can never be
  // added, so it is never silently charged the tier below.
  const canAdd = evaluation.qualifies && !submitting;

  /**
   * One line describing where the shopper is on the tier ladder. Mirrors the
   * evaluator rather than re-deriving anything: `tier` says a size is matched,
   * `nextTier` says what the next rung costs, and a `nextTier` the pool cannot
   * currently fill is not dangled as attainable.
   */
  const progressLabel = (() => {
    if (evaluation.reason === "too_many_units" && !multiTier) {
      return fill(t("bundle.too_many"), { count: evaluation.excessUnits });
    }
    if (evaluation.qualifies) return t("bundle.complete");
    if (selectedCount === 0 && nextTier) {
      return fill(t("bundle.start_tier"), { count: nextTier.quantity });
    }
    if (nextTier && tierReachable(nextTier.quantity)) {
      return fill(t("bundle.next_tier"), {
        count: nextTier.quantity - selectedCount,
        size: nextTier.quantity,
        price: money(nextTier.price, currency),
      });
    }
    if (evaluation.reason === "no_matching_tier") return t("bundle.between_tiers");
    return fill(t("bundle.choose_more"), { count: remaining });
  })();

  /** Shown once a tier is matched and a bigger one is still within reach. */
  const upsellLabel =
    evaluation.qualifies && nextTier && tierReachable(nextTier.quantity)
      ? fill(t("bundle.unlock_next"), {
          count: nextTier.quantity - selectedCount,
          size: nextTier.quantity,
          price: money(nextTier.price, currency),
        })
      : null;

  return (
    <div className="zeli-header-offset min-h-screen bg-zeli-bg pb-40 sm:pb-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        {/* ── Campaign header ────────────────────────────────────────────── */}
        <section className="grid gap-6 py-6 sm:py-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-center">
          {campaign.imageUrl && (
            <div className="aspect-[16/10] w-full overflow-hidden bg-zeli-surface lg:aspect-[4/3]">
              <img src={`/uploads/${campaign.imageUrl}`} alt="" className="h-full w-full object-cover" />
            </div>
          )}
          <div className={cn(!campaign.imageUrl && "lg:col-span-2")}>
            <p className="zeli-eyebrow">{t("bundle.eyebrow")}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <h1 className="zeli-section-title">{campaign.title}</h1>
              {campaign.badgeText && (
                <span className="bg-zeli-ink px-2.5 py-1 text-[10px] font-medium uppercase tracking-[var(--zeli-tracking-label)] text-zeli-ink-inverse">
                  {campaign.badgeText}
                </span>
              )}
            </div>
            <p className="mt-3 text-[17px] font-medium text-zeli-ink" style={{ fontFamily: "var(--font-price)" }}>
              {headline}
            </p>
            {/* ── Tier ladder ──────────────────────────────────────────────
                The sizes and their prices, stated plainly before the shopper
                starts choosing. Prices are printed exactly as configured — no
                "best value" badge, because a merchant is free to price 6 above
                two 3s and the builder does not editorialise. A tier the pool
                cannot fill today is dimmed and marked, never hidden: it is
                still part of the campaign, just not buyable right now. */}
            {multiTier && (
              <ul className="mt-4 flex flex-wrap gap-2" aria-label={t("bundle.tiers_heading")}>
                {tiers.map((tier) => {
                  const reachable = tierReachable(tier.quantity);
                  const isCurrent = evaluation.tier?.quantity === tier.quantity;
                  return (
                    <li
                      key={tier.quantity}
                      className={cn(
                        "border px-3 py-1.5 text-[12px]",
                        isCurrent
                          ? "border-zeli-ink bg-zeli-ink text-zeli-ink-inverse"
                          : reachable
                            ? "border-zeli-border text-zeli-ink"
                            : "border-zeli-border text-zeli-ink-muted opacity-60",
                      )}>
                      <span className="font-medium" style={{ fontFamily: "var(--font-price)" }}>
                        {fill(t("bundle.tier_price_hint"), {
                          size: tier.quantity,
                          price: money(tier.price, currency),
                        })}
                      </span>
                      {!reachable && (
                        <span className="ms-1.5 uppercase tracking-wide text-[10px]">{t("bundle.sold_out")}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {campaign.description && (
              <p className="mt-3 max-w-prose text-[length:var(--zeli-text-body)] leading-[var(--zeli-leading-body)] text-zeli-ink-muted">
                {campaign.description}
              </p>
            )}
            <p className="mt-3 text-[12px] text-zeli-ink-muted">
              {campaign.allowDuplicates
                ? campaign.maxPerProduct
                  ? fill(t("bundle.max_per_product"), { count: campaign.maxPerProduct })
                  : null
                : t("bundle.once_only")}
              {campaign.isRepeatable && (
                <>
                  {" "}
                  {t("bundle.repeatable_hint")}
                </>
              )}
            </p>
          </div>
        </section>

        {/* ── Sticky progress ────────────────────────────────────────────── */}
        <div
          className="sticky z-[5] -mx-4 border-y border-zeli-border bg-zeli-bg/95 px-4 py-3 backdrop-blur sm:mx-0 sm:px-0"
          style={{ top: "var(--zeli-header-offset)" }}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-zeli-ink">
                {fill(t("bundle.selected"), { selected: selectedCount, required })}
              </p>
              <p className={cn("text-[12px]", evaluation.qualifies ? "text-zeli-success" : "text-zeli-ink-muted")}>
                {progressLabel}
              </p>
            </div>
            <div className="flex items-center gap-1" aria-hidden>
              {Array.from({ length: Math.min(required, 12) }, (_, i) => (
                <span
                  key={i}
                  className={cn(
                    "h-2 w-2 rounded-full transition-colors",
                    i < Math.min(selectedCount, 12) ? "bg-zeli-ink" : "bg-zeli-border-strong",
                  )}
                />
              ))}
              {required > 12 && <span className="text-[11px] text-zeli-ink-muted">+{required - 12}</span>}
            </div>
          </div>
          <div className="mt-2 h-1 w-full bg-zeli-surface">
            <div
              className="h-1 bg-zeli-ink transition-[width]"
              style={{ width: `${Math.min(100, (selectedCount / Math.max(1, required)) * 100)}%` }}
            />
          </div>
        </div>

        {/* ── Notices ───────────────────────────────────────────────────── */}
        {!poolCanComplete && (
          <p className="mt-4 border border-zeli-border bg-zeli-surface px-4 py-3 text-[13px] text-zeli-ink-secondary">
            {pool.length === 0 ? t("bundle.no_products") : t("bundle.pool_too_small")}
          </p>
        )}
        {notice && (
          <div
            role={notice.tone === "error" ? "alert" : "status"}
            className={cn(
              "mt-4 flex flex-wrap items-center justify-between gap-3 border px-4 py-3 text-[13px]",
              notice.tone === "error" && "border-zeli-sale/40 bg-zeli-blush-soft text-zeli-sale",
              notice.tone === "success" && "border-zeli-success/40 bg-zeli-surface text-zeli-success",
              notice.tone === "info" && "border-zeli-border bg-zeli-surface text-zeli-ink-secondary",
            )}>
            <span>{notice.text}</span>
            {addedInstanceId && (
              <Link
                href="/cart"
                className="inline-flex min-h-9 items-center gap-1.5 bg-zeli-accent px-4 text-[11px] font-medium uppercase tracking-[var(--zeli-tracking-label)] text-zeli-ink-inverse hover:bg-zeli-accent-hover">
                <ShoppingBag className="h-3.5 w-3.5" /> {t("bundle.view_bag")}
              </Link>
            )}
          </div>
        )}

        {/* ── Product grid ───────────────────────────────────────────────── */}
        <section className="mt-6">
          <h2 className="zeli-eyebrow">{t("bundle.eligible_products")}</h2>
          {pool.length === 0 ? null : (
            <ul className="mt-4 grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 sm:gap-x-4 lg:grid-cols-4">
              {pool.map((p) => {
                const qty = quantityOfProduct(p.productId);
                // Product-level stock, and — Phase 7 — a product whose options
                // leave nothing sellable reads as sold out too.
                const soldOut = p.stock <= 0 || !p.purchasable;
                const cap = perProductCap(p);
                const atCap = qty >= cap;
                const hasOptions = requiresOptionSelection(p.optionGroups);
                const pendingOptions = hasOptions ? pendingOptionsOf(p) : {};
                const pendingPrice = hasOptions ? linePrice(p, pendingOptions) : effectivePrice(p);
                const pendingResolution = hasOptions ? resolveSelectedOptions(p.optionGroups, pendingOptions) : null;
                const unit = pendingPrice ?? effectivePrice(p);
                const hasDiscount = p.discountPrice !== null && p.discountPrice < p.price;
                const canIncrement = !soldOut && !atCap && !stackFull;
                const isSelected = qty > 0;
                const productLines = selection.filter((l) => l.productId === p.productId);
                const strikethroughMap: Record<string, string[]> = {};
                for (const group of p.optionGroups) {
                  const unavailable = group.values.filter((v) => !v.available).map((v) => v.value);
                  if (unavailable.length > 0) strikethroughMap[group.name] = unavailable;
                }
                // Tapping the image on an option product only scrolls focus to
                // its chips — a configuration must be chosen explicitly.
                const onTileClick = () => {
                  if (hasOptions) {
                    if (isSelected && !campaign.allowDuplicates) removeProduct(p);
                    else if (pendingResolution?.ok) increment(p, pendingOptions);
                    return;
                  }
                  if (campaign.allowDuplicates) increment(p);
                  else toggle(p);
                };
                return (
                  <li key={p.productId} className={cn("group flex flex-col", soldOut && "opacity-60")}>
                    <button
                      type="button"
                      onClick={onTileClick}
                      disabled={soldOut || (!isSelected && !canIncrement)}
                      aria-pressed={isSelected}
                      aria-label={`${isSelected ? t("bundle.remove") : t("bundle.add")}: ${p.name}`}
                      className={cn(
                        "relative block aspect-[4/5] w-full overflow-hidden bg-zeli-surface text-start outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-zeli-ink",
                        isSelected && "ring-2 ring-zeli-ink",
                        !soldOut && !isSelected && !canIncrement && "cursor-not-allowed",
                      )}>
                      <img
                        src={imageSrc(p.imageUrl)}
                        alt={p.name}
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                      {isSelected && (
                        <span className="absolute end-2 top-2 flex h-7 min-w-7 items-center justify-center rounded-full bg-zeli-ink px-1.5 text-[11px] font-semibold text-zeli-ink-inverse">
                          {campaign.allowDuplicates ? qty : <Check className="h-4 w-4" />}
                        </span>
                      )}
                      {soldOut && (
                        <div className="absolute inset-0 flex items-center justify-center bg-zeli-bg/55">
                          <span className="bg-zeli-bg px-3 py-1.5 text-[10px] font-medium uppercase tracking-[var(--zeli-tracking-label)] text-zeli-ink">
                            {p.purchasable ? t("bundle.sold_out") : t("bundle.no_purchasable_options")}
                          </span>
                        </div>
                      )}
                    </button>

                    <div className="mt-2 min-w-0">
                      <p
                        className="truncate text-[13px] font-medium text-zeli-ink"
                        style={{ fontFamily: "var(--font-product-title)" }}>
                        {p.name}
                      </p>
                      <p className="mt-0.5 flex items-baseline gap-1.5 text-[12px]" style={{ fontFamily: "var(--font-price)" }}>
                        <span className={hasDiscount ? "text-zeli-sale font-medium" : "text-zeli-ink-secondary"}>
                          {money(unit, currency)}
                        </span>
                        {hasDiscount && (
                          <span className="text-zeli-ink-muted line-through">
                            {money(hasOptions && pendingResolution?.ok ? resolvePurchasableLinePrice(p.price, pendingResolution.priceModifier) : p.price, currency)}
                          </span>
                        )}
                      </p>
                    </div>

                    {/* ── Options (Phase 7) ──────────────────────────────
                        The storefront's own option selector, one chip row per
                        group. A configuration counts toward the stack only
                        once every group is chosen and resolves; unavailable
                        values are struck through exactly as on the product
                        page. Stock is product-level, so there is no per-option
                        sold-out state to show. */}
                    {hasOptions && !soldOut && (
                      <div className="mt-2">
                        <VariantSelector
                          variants={p.optionGroups.map((g) => ({
                            name: g.name,
                            values: g.values.map((v) => ({ value: v.value, priceModifier: v.priceModifier })),
                          }))}
                          selectedVariants={pendingOptions}
                          onVariantChange={(name, value) => choosePendingOption(p, name, value)}
                          strikethroughMap={strikethroughMap}
                          className="space-y-2 [&_p]:mb-1 [&_p]:text-[11px] [&_button]:min-h-9 [&_button]:px-3 [&_button]:py-1 [&_button]:text-[11px]"
                        />
                        {productLines.length > 0 && (
                          <ul className="mt-2 space-y-1">
                            {productLines.map((line) => (
                              <li key={line.key} className="flex items-center justify-between gap-2 border border-zeli-border px-2 py-1 text-[11px] text-zeli-ink">
                                <span className="min-w-0 truncate">
                                  <Check className="me-1 inline h-3 w-3" aria-hidden />
                                  {formatSelectedOptionValues(line.selectedOptions)}
                                  {campaign.allowDuplicates && ` × ${line.quantity}`}
                                </span>
                                {campaign.allowDuplicates ? (
                                  <span className="flex shrink-0 items-center">
                                    <button
                                      type="button"
                                      onClick={() => decrement(p, line.selectedOptions)}
                                      aria-label={`${t("bundle.decrease")}: ${p.name} ${formatSelectedOptionValues(line.selectedOptions)}`}
                                      className="flex h-8 w-8 items-center justify-center text-zeli-ink-secondary hover:bg-zeli-surface">
                                      <Minus className="h-3 w-3" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => increment(p, line.selectedOptions)}
                                      disabled={!canIncrement}
                                      aria-label={`${t("bundle.increase")}: ${p.name} ${formatSelectedOptionValues(line.selectedOptions)}`}
                                      className="flex h-8 w-8 items-center justify-center text-zeli-ink-secondary hover:bg-zeli-surface disabled:opacity-40">
                                      <Plus className="h-3 w-3" />
                                    </button>
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => removeProduct(p)}
                                    aria-label={`${t("bundle.remove")}: ${p.name}`}
                                    className="flex h-8 w-8 shrink-0 items-center justify-center text-zeli-ink-secondary hover:bg-zeli-surface">
                                    <X className="h-3 w-3" />
                                  </button>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}

                    {/* Controls */}
                    <div className="mt-2">
                      {hasOptions ? (
                        <>
                          {(campaign.allowDuplicates || !isSelected) && (
                            <button
                              type="button"
                              onClick={() => increment(p, pendingOptions)}
                              disabled={soldOut || !canIncrement || !pendingResolution?.ok}
                              className={cn(
                                "flex min-h-11 w-full items-center justify-center gap-1.5 border text-[11px] font-medium uppercase tracking-[var(--zeli-tracking-label)] transition-colors",
                                "border-zeli-border text-zeli-ink hover:border-zeli-ink disabled:cursor-not-allowed disabled:opacity-40",
                              )}>
                              {soldOut
                                ? p.purchasable
                                  ? t("bundle.sold_out")
                                  : t("bundle.no_purchasable_options")
                                : stackFull
                                  ? t("bundle.stack_full")
                                  : atCap
                                    ? t("bundle.max_reached")
                                    : pendingResolution && !pendingResolution.ok
                                      ? fill(t("bundle.option_pending"), { option: pendingResolution.optionName })
                                      : campaign.allowDuplicates
                                        ? t("bundle.add_variant")
                                        : t("bundle.add")}
                            </button>
                          )}
                          {!campaign.allowDuplicates && isSelected && (
                            <p className="flex min-h-11 w-full items-center justify-center gap-1.5 border border-zeli-ink bg-zeli-ink text-[11px] font-medium uppercase tracking-[var(--zeli-tracking-label)] text-zeli-ink-inverse">
                              <Check className="h-3.5 w-3.5" /> {t("bundle.selected_label")}
                            </p>
                          )}
                        </>
                      ) : campaign.allowDuplicates ? (
                        <div className="flex items-center justify-between border border-zeli-border">
                          <button
                            type="button"
                            onClick={() => decrement(p)}
                            disabled={qty === 0}
                            aria-label={`${t("bundle.decrease")}: ${p.name}`}
                            className="flex h-11 w-11 items-center justify-center text-zeli-ink-secondary transition-colors hover:bg-zeli-surface disabled:opacity-40">
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <span className="text-[13px] font-medium text-zeli-ink">{qty}</span>
                          <button
                            type="button"
                            onClick={() => increment(p)}
                            disabled={!canIncrement}
                            aria-label={`${t("bundle.increase")}: ${p.name}`}
                            className="flex h-11 w-11 items-center justify-center text-zeli-ink-secondary transition-colors hover:bg-zeli-surface disabled:opacity-40">
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => toggle(p)}
                          disabled={soldOut || (!isSelected && !canIncrement)}
                          className={cn(
                            "flex min-h-11 w-full items-center justify-center gap-1.5 border text-[11px] font-medium uppercase tracking-[var(--zeli-tracking-label)] transition-colors",
                            isSelected
                              ? "border-zeli-ink bg-zeli-ink text-zeli-ink-inverse"
                              : "border-zeli-border text-zeli-ink hover:border-zeli-ink disabled:cursor-not-allowed disabled:opacity-40",
                          )}>
                          {isSelected ? (
                            <>
                              <Check className="h-3.5 w-3.5" /> {t("bundle.selected_label")}
                            </>
                          ) : soldOut ? (
                            t("bundle.sold_out")
                          ) : stackFull ? (
                            t("bundle.stack_full")
                          ) : (
                            t("bundle.add")
                          )}
                        </button>
                      )}
                      {campaign.allowDuplicates && atCap && !soldOut && qty > 0 && !hasOptions && (
                        <p className="mt-1 text-[10px] uppercase tracking-wide text-zeli-ink-muted">{t("bundle.max_reached")}</p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {/* ── Summary + CTA (sticky bottom on mobile, inline on desktop) ─────── */}
      <div
        className="fixed inset-x-0 border-t border-zeli-border bg-zeli-bg shadow-[0_-4px_16px_rgba(36,29,25,0.08)] sm:static sm:mt-10 sm:border-0 sm:bg-transparent sm:shadow-none"
        style={{ bottom: "calc(4rem + env(safe-area-inset-bottom))", zIndex: "var(--zeli-z-sticky)" }}>
        <div className="mx-auto max-w-6xl px-4 py-3 sm:px-6 sm:py-0 lg:px-8">
          <div className="sm:ms-auto sm:max-w-md sm:border sm:border-zeli-border sm:bg-zeli-surface sm:p-6">
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0 space-y-0.5 text-[12px] text-zeli-ink-secondary">
                <div className="flex items-center gap-2">
                  <Layers className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span className="truncate">{fill(t("bundle.selected"), { selected: selectedCount, required })}</span>
                </div>
                {selectedCount > 0 && (
                  <p>
                    {t("bundle.bought_separately")}:{" "}
                    <span className={cn(evaluation.qualifies && "line-through")}>{money(regularTotal, currency)}</span>
                  </p>
                )}
                {/* Only ever shown when the bundle genuinely costs less than the
                    selected products do separately. A zero or negative
                    difference is simply not announced — it is never relabelled
                    as a saving. */}
                {evaluation.qualifies && savings !== null && savings > 0 && (
                  <p className="font-medium text-zeli-success">
                    {t("bundle.you_save")} {money(savings, currency)}
                  </p>
                )}
              </div>
              <div className="text-end">
                <p className="text-[11px] uppercase tracking-wide text-zeli-ink-muted">{t("bundle.stack_price")}</p>
                {/* Between tiers there is no price, so none is shown. Falling
                    back to the tier below would quote a total the shopper
                    cannot actually be charged. */}
                <p className="text-[18px] font-semibold text-zeli-ink" style={{ fontFamily: "var(--font-price)" }}>
                  {price === null ? "—" : money(price, currency)}
                </p>
                {price === null && nextTier && tierReachable(nextTier.quantity) && (
                  <p className="text-[11px] text-zeli-ink-muted">
                    {fill(t("bundle.tier_price_hint"), {
                      size: nextTier.quantity,
                      price: money(nextTier.price, currency),
                    })}
                  </p>
                )}
              </div>
            </div>
            <button
              ref={ctaRef}
              type="button"
              onClick={handleAddToBag}
              disabled={!canAdd}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-md bg-zeli-accent py-3.5 text-[13px] font-medium uppercase tracking-wider text-zeli-ink-inverse transition-colors hover:bg-zeli-accent-hover disabled:cursor-not-allowed disabled:opacity-50">
              <ShoppingBag className="h-4 w-4" />
              {submitting ? t("bundle.adding") : evaluation.qualifies ? t("bundle.add_to_bag") : progressLabel}
            </button>
            {/* A matched stack that can still be upgraded. Suppressed when the
                pool cannot currently fill the next tier, so the builder never
                dangles a size the shopper could not complete. */}
            {upsellLabel && <p className="mt-2 text-center text-[11px] text-zeli-ink-secondary">{upsellLabel}</p>}
            {addedInstanceId && (
              <button
                type="button"
                onClick={() => {
                  setAddedInstanceId(null);
                  setNotice(null);
                }}
                className="mt-2 w-full py-2 text-[11px] uppercase tracking-wide text-zeli-ink-muted hover:text-zeli-ink">
                {t("bundle.build_another")}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
