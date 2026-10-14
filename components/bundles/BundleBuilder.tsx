import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Minus, Plus, Search, ShoppingBag, X } from "lucide-react";
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
import { needsNoPiercing } from "#root/shared/products/no-piercing";
import {
  fillTemplate as fill,
  formatBundlePercent,
  formatMoney as money,
  resolveBundleImage as imageSrc,
} from "./bundle-ui";
import { builderFilterCategories, filterBuilderPool } from "./builder-filters";

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
  /** Browse helpers only — they never change what is selected or how it is priced. */
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  // A different campaign (client-side navigation between slugs) starts clean.
  useEffect(() => {
    setSelection([]);
    setPending(new Map());
    setNotice(null);
    setAddedInstanceId(null);
    setSearch("");
    setCategoryFilter(null);
  }, [campaign.id]);

  // Only what a shopper can actually buy: the public DTO already drops hidden
  // and deleted products; out-of-stock stays visible but disabled.
  const pool = useMemo(() => campaign.eligibleProducts, [campaign]);
  const poolById = useMemo(() => new Map(pool.map((p) => [p.productId, p])), [pool]);
  /** Category chips: only categories the pool's products really carry. */
  const filterCategories = useMemo(() => builderFilterCategories(pool), [pool]);
  const visiblePool = useMemo(
    () => filterBuilderPool(pool, { search, categoryId: categoryFilter }),
    [pool, search, categoryFilter],
  );

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
      tiers: campaign.tiers.map((t) => ({
        id: t.id,
        quantity: t.quantity,
        price: t.price,
        discountPercent: t.discountPercent,
      })),
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
        freeShipping: check.bundle.freeShipping,
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
  const isPercentage = campaign.pricingType === "percentage_discount";
  /** "15%" for a percentage tier, null for a fixed one. */
  const tierPercent = (tier: { discountPercent: number | null } | null | undefined) =>
    tier && typeof tier.discountPercent === "number" ? formatBundlePercent(tier.discountPercent) : null;
  // What this stack costs RIGHT NOW: the matched tier's price, or nothing when
  // the count sits between tiers. Never the previous tier's price. A
  // percentage tier has no price of its own — its total is the evaluator's
  // (the selection minus its percentage), known once the set qualifies.
  const price = isPercentage ? evaluation.bundleTotal : (evaluation.tier?.price ?? null);
  const nextTier = evaluation.nextTier;
  const nextTierDto = nextTier ? tiers.find((tier) => tier.quantity === nextTier.quantity) : undefined;
  const headline = isPercentage
    ? multiTier
      ? fill(t("bundle.choose_from_pct"), {
          min: tiers[0]?.quantity ?? 0,
          max: largestTierQuantity,
          percent: formatBundlePercent(Math.max(...tiers.map((tier) => tier.discountPercent ?? 0))),
        })
      : fill(t("bundle.choose_pct"), {
          count: tiers[0]?.quantity ?? campaign.requiredQuantity,
          percent: tierPercent(tiers[0]) ?? "",
        })
    : multiTier
      ? fill(t("bundle.choose_from"), {
          min: tiers[0]?.quantity ?? 0,
          max: largestTierQuantity,
          price: money(Math.min(...tiers.flatMap((tier) => (tier.price === null ? [] : [tier.price]))), currency),
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
  /** The matched percentage tier's figures — what the live breakdown shows. */
  const percentBreakdown =
    isPercentage && evaluation.qualifies && price !== null && evaluation.discountAmount !== null
      ? {
          percent: tierPercent(evaluation.tier ? { discountPercent: evaluation.tier.discountPercent ?? null } : null),
          discount: evaluation.discountAmount,
        }
      : null;
  /**
   * What reaching a tier unlocks, in the shopper's words: "15% off + free
   * shipping" / "6 pieces for EGP 480". Free shipping is the campaign's own
   * benefit, earned by any qualifying size.
   */
  const benefitOf = (tier: { quantity: number; price: number | null; discountPercent: number | null }) =>
    (tierPercent(tier) !== null
      ? fill(t("bundle.benefit_pct"), { percent: tierPercent(tier) ?? "" })
      : fill(t("bundle.benefit_price"), { size: tier.quantity, price: money(tier.price ?? 0, currency) })) +
    (campaign.freeShipping ? t("bundle.benefit_free_shipping") : "");
  /** What the shopper saves on a qualifying set — from the evaluator, never re-derived. */
  const youSave =
    !evaluation.qualifies || price === null
      ? null
      : isPercentage
        ? (evaluation.discountAmount ?? null)
        : savings;
  /** Slots in the selection tray: the size being built toward (or matched). */
  const slotCount = Math.min(12, Math.max(required, selectedCount));
  /** One tray thumbnail per selected unit, in pick order. */
  const trayUnits = selection.flatMap((line) =>
    Array.from({ length: line.quantity }, (_, i) => ({ line, key: `${line.key}#${i}` })),
  );
  /** "6 pieces · 480.00 EGP" / "6 pieces · 15% off" for one rung of the ladder. */
  const tierHint = (tier: { quantity: number; price: number | null; discountPercent: number | null }) =>
    tierPercent(tier) !== null
      ? fill(t("bundle.tier_pct_hint"), { size: tier.quantity, percent: tierPercent(tier) ?? "" })
      : fill(t("bundle.tier_price_hint"), { size: tier.quantity, price: money(tier.price ?? 0, currency) });
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
    // Before the exact count is reached, say what the shopper WILL unlock —
    // never imply the discount (or free shipping) is already earned.
    if (nextTier && tierReachable(nextTier.quantity)) {
      return fill(t(selectedCount === 0 ? "bundle.unlock_start" : "bundle.unlock_more"), {
        count: nextTier.quantity - selectedCount,
        benefit: benefitOf(nextTierDto ?? { quantity: nextTier.quantity, price: nextTier.price ?? null, discountPercent: null }),
      });
    }
    if (evaluation.reason === "no_matching_tier") return t("bundle.between_tiers");
    return fill(t("bundle.choose_more"), { count: remaining });
  })();

  /** Shown once a tier is matched and a bigger one is still within reach. */
  const upsellLabel =
    evaluation.qualifies && nextTier && tierReachable(nextTier.quantity)
      ? tierPercent(nextTierDto) !== null
        ? fill(t("bundle.unlock_next_pct"), {
            count: nextTier.quantity - selectedCount,
            size: nextTier.quantity,
            percent: tierPercent(nextTierDto) ?? "",
          })
        : fill(t("bundle.unlock_next"), {
            count: nextTier.quantity - selectedCount,
            size: nextTier.quantity,
            price: money(nextTier.price ?? 0, currency),
          })
      : null;

  return (
    <div className="perce-header-offset min-h-screen bg-perce-bg pb-44 lg:pb-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        {/* ── Campaign header ────────────────────────────────────────────── */}
        <section className="grid gap-6 py-6 sm:py-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-center">
          {campaign.imageUrl && (
            <div className="aspect-[16/10] w-full overflow-hidden bg-perce-surface lg:aspect-[4/3]">
              <img src={`/uploads/${campaign.imageUrl}`} alt="" className="h-full w-full object-cover" />
            </div>
          )}
          <div className={cn(!campaign.imageUrl && "lg:col-span-2")}>
            <p className="perce-eyebrow">{t("bundle.eyebrow")}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <h1 className="perce-section-title">{campaign.title}</h1>
              {campaign.badgeText && (
                <span className="bg-perce-ink px-2.5 py-1 text-xs font-medium text-perce-ink-inverse">
                  {campaign.badgeText}
                </span>
              )}
            </div>
            <p className="mt-3 text-[17px] font-medium text-perce-ink" style={{ fontFamily: "var(--font-price)" }}>
              {headline}
            </p>
            {campaign.freeShipping && (
              <p className="mt-1 text-[13px] font-medium text-perce-success" data-testid="bundle-free-shipping">
                {t("bundle.free_shipping")}
              </p>
            )}
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
                          ? "border-perce-ink bg-perce-ink text-perce-ink-inverse"
                          : reachable
                            ? "border-perce-border text-perce-ink"
                            : "border-perce-border text-perce-ink-muted opacity-60",
                      )}>
                      <span className="font-medium" style={{ fontFamily: "var(--font-price)" }}>
                        {tierHint(tier)}
                      </span>
                      {!reachable && (
                        <span className="ms-1.5 text-xs">{t("bundle.sold_out")}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {campaign.description && (
              <p className="mt-3 max-w-prose text-[length:var(--perce-text-body)] leading-[var(--perce-leading-body)] text-perce-ink-muted">
                {campaign.description}
              </p>
            )}
            <p className="mt-3 text-[12px] text-perce-ink-muted">
              {campaign.allowDuplicates
                ? campaign.maxPerProduct
                  ? fill(t("bundle.max_per_product"), { count: campaign.maxPerProduct })
                  : null
                : t("bundle.once_only")}
              {campaign.isRepeatable && (
                <>
                  {campaign.allowDuplicates && !campaign.maxPerProduct ? "" : " · "}
                  {t("bundle.repeatable_hint")}
                </>
              )}
            </p>
          </div>
        </section>

        {/* ── Selection panel ───────────────────────────────────────────────
            Progress, the chosen pieces and the live price breakdown, side by
            side from md up. Every figure is the shared evaluator's — the same
            pure rules (and rounding) the server re-runs before anything
            reaches the bag. */}
        <section
          className="grid gap-px overflow-hidden border border-perce-border bg-perce-border md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]"
          aria-label={t("bundle.your_pieces")}
          data-testid="bundle-selection-panel">
          <div className="bg-perce-bg p-4 sm:p-5">
            <p className="text-[15px] font-medium text-perce-ink" data-testid="bundle-progress-count">
              {fill(t("bundle.selected"), { selected: selectedCount, required })}
            </p>
            <div className="mt-2 h-1.5 w-full bg-perce-surface" aria-hidden>
              <div
                className={cn("h-1.5 transition-[width]", evaluation.qualifies ? "bg-perce-success" : "bg-perce-ink")}
                style={{ width: `${Math.min(100, (selectedCount / Math.max(1, required)) * 100)}%` }}
              />
            </div>

            {/* The chosen pieces as thumbnails, with an empty slot for each one
                still to pick. × removes one unit of that line. */}
            <ul
              className="mt-3 grid max-w-md gap-2"
              // One row up to six slots, sized to the width (a 6-piece set fits a
              // 390px phone); larger sets wrap onto more rows.
              style={{ gridTemplateColumns: `repeat(${Math.min(slotCount, 6)}, minmax(0, 1fr))` }}
              data-testid="bundle-tray">
              {Array.from({ length: slotCount }, (_, i) => {
                const unit = trayUnits[i];
                const product = unit ? poolById.get(unit.line.productId) : undefined;
                if (!unit || !product) {
                  return (
                    <li
                      key={`slot-${i}`}
                      className="flex aspect-square max-w-16 items-center justify-center border border-dashed border-perce-border-strong text-perce-ink-muted"
                      aria-label={t("bundle.empty_slot")}>
                      <Plus className="h-4 w-4" aria-hidden />
                    </li>
                  );
                }
                const options = formatSelectedOptionValues(unit.line.selectedOptions);
                return (
                  <li key={unit.key} className="relative aspect-square max-w-16 bg-perce-surface">
                    <img src={imageSrc(product.imageUrl)} alt={options ? `${product.name} (${options})` : product.name} className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => decrement(product, unit.line.selectedOptions)}
                      aria-label={`${t("bundle.remove")}: ${product.name}`}
                      className="absolute -end-2.5 -top-2.5 flex h-7 w-7 items-center justify-center rounded-full border border-perce-border bg-perce-bg text-perce-ink shadow-sm hover:bg-perce-surface">
                      <X className="h-3 w-3" aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
            <p
              className={cn("mt-3 text-[13px]", evaluation.qualifies ? "text-perce-success" : "text-perce-ink-secondary")}
              data-testid="bundle-progress-label">
              {progressLabel}
            </p>
            {upsellLabel && <p className="mt-1 text-[12px] text-perce-ink-muted">{upsellLabel}</p>}
          </div>

          {/* Live price breakdown. Before the set qualifies there is no
              discount row and no saving: nothing is shown as earned until the
              exact piece count is reached. */}
          <dl className="space-y-1.5 bg-perce-surface p-4 text-[13px] sm:p-5" data-testid="bundle-breakdown">
            <div className="flex justify-between gap-3">
              <dt className="text-perce-ink-secondary">{t("bundle.selected_subtotal")}</dt>
              <dd className="text-perce-ink" data-testid="bundle-selected-subtotal">
                <span className={cn(!isPercentage && evaluation.qualifies && "line-through text-perce-ink-muted")}>
                  {money(regularTotal, currency)}
                </span>
              </dd>
            </div>
            {percentBreakdown && percentBreakdown.discount > 0 && (
              <div className="flex justify-between gap-3 font-medium text-perce-success" data-testid="bundle-percent-discount">
                <dt>{fill(t("bundle.discount_pct"), { percent: percentBreakdown.percent ?? "" })}</dt>
                <dd>−{money(percentBreakdown.discount, currency)}</dd>
              </div>
            )}
            <div className="flex justify-between gap-3">
              <dt className="text-perce-ink-secondary">{t("bundle.shipping")}</dt>
              <dd
                className={cn(campaign.freeShipping && evaluation.qualifies ? "font-medium text-perce-success" : "text-perce-ink-muted")}
                data-testid="bundle-shipping">
                {campaign.freeShipping && evaluation.qualifies ? t("bundle.shipping_free") : t("bundle.shipping_at_checkout")}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 border-t border-perce-border pt-2">
              <dt className="font-medium text-perce-ink">{t(isPercentage ? "bundle.final_total" : "bundle.stack_price")}</dt>
              {/* Between tiers there is no price, so none is shown. Falling
                  back to the tier below would quote a total the shopper
                  cannot actually be charged. */}
              <dd className="text-[17px] font-semibold text-perce-ink" style={{ fontFamily: "var(--font-price)" }} data-testid="bundle-final-total">
                {price === null ? "—" : money(price, currency)}
              </dd>
            </div>
            {youSave !== null && youSave > 0 && (
              <p className="mt-2 bg-perce-bg px-3 py-2 text-center font-medium text-perce-success" data-testid="bundle-you-save">
                {fill(t("bundle.you_save_amount"), { amount: money(youSave, currency) })}
              </p>
            )}
          </dl>
        </section>

        {/* ── Notices ───────────────────────────────────────────────────── */}
        {!poolCanComplete && (
          <p className="mt-4 border border-perce-border bg-perce-surface px-4 py-3 text-[13px] text-perce-ink-secondary">
            {pool.length === 0 ? t("bundle.no_products") : t("bundle.pool_too_small")}
          </p>
        )}
        {notice && (
          <div
            role={notice.tone === "error" ? "alert" : "status"}
            className={cn(
              "mt-4 flex flex-wrap items-center justify-between gap-3 border px-4 py-3 text-[13px]",
              notice.tone === "error" && "border-perce-sale/40 bg-perce-surface text-perce-sale",
              notice.tone === "success" && "border-perce-success/40 bg-perce-surface text-perce-success",
              notice.tone === "info" && "border-perce-border bg-perce-surface text-perce-ink-secondary",
            )}>
            <span>{notice.text}</span>
            {addedInstanceId && (
              <Link
                href="/cart"
                className="inline-flex min-h-9 items-center gap-1.5 bg-perce-cta px-4 text-xs font-medium text-perce-ink-inverse hover:bg-perce-cta-hover">
                <ShoppingBag className="h-3.5 w-3.5" /> {t("bundle.view_bag")}
              </Link>
            )}
          </div>
        )}

        {/* ── Product grid ───────────────────────────────────────────────── */}
        <section className="mt-6">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="perce-eyebrow">{t("bundle.eligible_products")}</h2>
            {pool.length > 0 && (
              <p className="text-[12px] text-perce-ink-muted" aria-live="polite">
                {fill(t("bundle.showing"), { count: visiblePool.length })}
              </p>
            )}
          </div>

          {/* Browse helpers. Search matches the product name; the chips are the
              categories the pool's products actually carry (no metal or
              placement is inferred from titles). Neither touches the
              selection — a picked piece stays picked when filtered out. */}
          {pool.length > 1 && (
            <div className="mt-3 space-y-3">
              <label className="relative block">
                <span className="sr-only">{t("bundle.search_label")}</span>
                <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-perce-ink-muted" aria-hidden />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("bundle.search_placeholder")}
                  className="h-11 w-full border border-perce-border bg-perce-bg ps-10 pe-3 text-[14px] text-perce-ink outline-none placeholder:text-perce-ink-muted focus:border-perce-ink"
                  data-testid="bundle-search"
                />
              </label>
              {filterCategories.length > 1 && (
                <fieldset className="m-0 min-w-0 border-0 p-0" data-testid="bundle-filters">
                  <legend className="sr-only">{t("bundle.filters_label")}</legend>
                  <div className="scrollbar-hide -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
                  {[{ id: null as string | null, name: t("bundle.filter_all") }, ...filterCategories].map((c) => {
                    const active = categoryFilter === c.id;
                    return (
                      <button
                        key={c.id ?? "all"}
                        type="button"
                        onClick={() => setCategoryFilter(c.id)}
                        aria-pressed={active}
                        className={cn(
                          "inline-flex min-h-10 shrink-0 items-center whitespace-nowrap rounded-full border px-4 text-[13px] transition-colors",
                          active
                            ? "border-perce-ink bg-perce-ink text-perce-ink-inverse"
                            : "border-perce-border text-perce-ink hover:border-perce-ink",
                        )}>
                        {c.name}
                      </button>
                    );
                  })}
                  </div>
                </fieldset>
              )}
            </div>
          )}

          {pool.length > 0 && visiblePool.length === 0 && (
            <div className="mt-6 border border-perce-border bg-perce-surface px-4 py-6 text-center text-[13px] text-perce-ink-secondary" data-testid="bundle-no-matches">
              <p>{t("bundle.no_matches")}</p>
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setCategoryFilter(null);
                }}
                className="mt-3 inline-flex min-h-10 items-center border border-perce-ink px-4 text-xs font-medium text-perce-ink">
                {t("bundle.clear_filters")}
              </button>
            </div>
          )}

          {visiblePool.length === 0 ? null : (
            <ul className="mt-4 grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 sm:gap-x-4 lg:grid-cols-4" data-testid="bundle-grid">
              {visiblePool.map((p) => {
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
                        "relative block aspect-[4/5] w-full overflow-hidden bg-perce-surface text-start outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-perce-ink",
                        isSelected && "ring-2 ring-perce-ink",
                        !soldOut && !isSelected && !canIncrement && "cursor-not-allowed",
                      )}>
                      <img
                        src={imageSrc(p.imageUrl)}
                        alt={p.name}
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                      {needsNoPiercing(p) && !soldOut && (
                        <span className="absolute start-2 top-2 bg-perce-bg/95 px-2 py-0.5 text-[11px] font-medium text-perce-ink">
                          {t("product.no_piercing_needed")}
                        </span>
                      )}
                      {isSelected && (
                        <span className="absolute end-2 top-2 flex h-7 min-w-7 items-center justify-center rounded-full bg-perce-ink px-1.5 text-[11px] font-semibold text-perce-ink-inverse">
                          {campaign.allowDuplicates ? qty : <Check className="h-4 w-4" />}
                        </span>
                      )}
                      {soldOut && (
                        <div className="absolute inset-0 flex items-center justify-center bg-perce-bg/55">
                          <span className="bg-perce-bg px-3 py-1.5 text-xs font-medium text-perce-ink">
                            {p.purchasable ? t("bundle.sold_out") : t("bundle.no_purchasable_options")}
                          </span>
                        </div>
                      )}
                    </button>

                    <div className="mt-2 min-w-0">
                      <p
                        className="line-clamp-2 min-h-[2.5em] text-[13px] font-medium leading-snug text-perce-ink"
                        style={{ fontFamily: "var(--font-product-title)" }}>
                        {p.name}
                      </p>
                      <p className="mt-1 flex items-baseline gap-1.5 text-[14px]" style={{ fontFamily: "var(--font-price)" }}>
                        <span className={hasDiscount ? "text-perce-sale font-semibold" : "font-semibold text-perce-ink"}>
                          {money(unit, currency)}
                        </span>
                        {hasDiscount && (
                          <span className="text-perce-ink-muted line-through">
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
                              <li key={line.key} className="flex items-center justify-between gap-2 border border-perce-border px-2 py-1 text-[11px] text-perce-ink">
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
                                      className="flex h-8 w-8 items-center justify-center text-perce-ink-secondary hover:bg-perce-surface">
                                      <Minus className="h-3 w-3" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => increment(p, line.selectedOptions)}
                                      disabled={!canIncrement}
                                      aria-label={`${t("bundle.increase")}: ${p.name} ${formatSelectedOptionValues(line.selectedOptions)}`}
                                      className="flex h-8 w-8 items-center justify-center text-perce-ink-secondary hover:bg-perce-surface disabled:opacity-40">
                                      <Plus className="h-3 w-3" />
                                    </button>
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => removeProduct(p)}
                                    aria-label={`${t("bundle.remove")}: ${p.name}`}
                                    className="flex h-8 w-8 shrink-0 items-center justify-center text-perce-ink-secondary hover:bg-perce-surface">
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
                                "flex min-h-11 w-full items-center justify-center gap-1.5 border text-xs font-medium transition-colors",
                                "border-perce-border text-perce-ink hover:border-perce-ink disabled:cursor-not-allowed disabled:opacity-40",
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
                            <p className="flex min-h-11 w-full items-center justify-center gap-1.5 border border-perce-ink bg-perce-ink text-xs font-medium text-perce-ink-inverse">
                              <Check className="h-3.5 w-3.5" /> {t("bundle.selected_label")}
                            </p>
                          )}
                        </>
                      ) : campaign.allowDuplicates ? (
                        <div className="flex items-center justify-between border border-perce-border">
                          <button
                            type="button"
                            onClick={() => decrement(p)}
                            disabled={qty === 0}
                            aria-label={`${t("bundle.decrease")}: ${p.name}`}
                            className="flex h-11 w-11 items-center justify-center text-perce-ink-secondary transition-colors hover:bg-perce-surface disabled:opacity-40">
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <span className="text-[13px] font-medium text-perce-ink">{qty}</span>
                          <button
                            type="button"
                            onClick={() => increment(p)}
                            disabled={!canIncrement}
                            aria-label={`${t("bundle.increase")}: ${p.name}`}
                            className="flex h-11 w-11 items-center justify-center text-perce-ink-secondary transition-colors hover:bg-perce-surface disabled:opacity-40">
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => toggle(p)}
                          disabled={soldOut || (!isSelected && !canIncrement)}
                          className={cn(
                            "flex min-h-11 w-full items-center justify-center gap-1.5 border text-xs font-medium transition-colors",
                            isSelected
                              ? "border-perce-ink bg-perce-ink text-perce-ink-inverse"
                              : "border-perce-border text-perce-ink hover:border-perce-ink disabled:cursor-not-allowed disabled:opacity-40",
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
                            <>
                              <Plus className="h-3.5 w-3.5" aria-hidden /> {t("bundle.add")}
                            </>
                          )}
                        </button>
                      )}
                      {campaign.allowDuplicates && atCap && !soldOut && qty > 0 && !hasOptions && (
                        <p className="mt-1 text-xs text-perce-ink-muted">{t("bundle.max_reached")}</p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {/* ── Sticky action bar ──────────────────────────────────────────────
          Always in reach: above the mobile bottom nav below lg, at the bottom
          of the window from lg. X of Y, the saving once earned (or what is
          still needed), and the CTA — disabled until the campaign's own rule
          (exact tier count, stock, duplicates) is met. */}
      <div
        className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] border-t border-perce-border bg-perce-bg/95 shadow-[0_-4px_16px_rgba(36,29,25,0.08)] backdrop-blur lg:bottom-0"
        style={{ zIndex: "var(--perce-z-sticky)" }}
        data-testid="bundle-action-bar">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-medium text-perce-ink">
              {fill(t("bundle.selected"), { selected: selectedCount, required })}
            </p>
            <p className={cn("truncate text-[12px]", youSave ? "font-medium text-perce-success" : "text-perce-ink-muted")}>
              {youSave
                ? fill(t("bundle.you_save_amount"), { amount: money(youSave, currency) })
                : evaluation.qualifies && price !== null
                  ? money(price, currency)
                  : progressLabel}
            </p>
          </div>
          <button
            ref={ctaRef}
            type="button"
            onClick={handleAddToBag}
            disabled={!canAdd}
            data-testid="bundle-add-to-bag"
            className="flex min-h-12 shrink-0 items-center justify-center gap-2 bg-perce-cta px-5 text-sm font-medium text-perce-ink-inverse transition-colors hover:bg-perce-cta-hover disabled:cursor-not-allowed disabled:opacity-45 sm:px-8">
            <ShoppingBag className="h-4 w-4" aria-hidden />
            {submitting ? t("bundle.adding") : t("bundle.add_to_bag")}
          </button>
        </div>
        {addedInstanceId && (
          <div className="mx-auto max-w-6xl px-4 pb-2 text-center sm:px-6 lg:px-8">
            <button
              type="button"
              onClick={() => {
                setAddedInstanceId(null);
                setNotice(null);
              }}
              className="py-1 text-xs text-perce-ink-muted hover:text-perce-ink">
              {t("bundle.build_another")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
