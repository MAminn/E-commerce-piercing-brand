import { useCart } from "#root/lib/context/CartContext";
import { usePageContext } from "vike-react/usePageContext";
import { ChevronDown } from "lucide-react";
import { buttonClass } from "#root/components/storefront/Button";
import { trpc } from "#root/shared/trpc/client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { OfferCondition, OfferReward } from "#root/shared/database/drizzle/schema";
import type { AppliedOffer } from "#root/backend/offers/service";
import { cn } from "#root/lib/utils";
import { computeOfferSavingsTotal } from "#root/components/template-system/cartPage/AppliedOffersSavings";
import { STORE_CURRENCY } from "#root/shared/config/branding";
import { formatMoney } from "#root/shared/pricing/format-money";

const HIDDEN_PATHS = ["/cart", "/checkout", "/login", "/register", "/dashboard"];

interface ActiveOffer {
  id: string;
  name: string;
  condition: OfferCondition;
  reward: OfferReward;
}

type StripState =
  | {
      kind: "unlocked";
      actionText: string;
      rewardText: string;
      href: string;
      ctaLabel: string;
    }
  | {
      kind: "progress";
      actionText: string;
      rewardText: string;
      href: string;
      ctaLabel: string;
      progress: number;
    }
  | {
      kind: "cart";
      actionText: string;
      rewardText: string;
      href: string;
      ctaLabel: string;
    };

function rewardHeadline(reward: OfferReward): string {
  switch (reward.type) {
    case "percentage_off":
      return `Get ${reward.percentOff}% off`;
    case "fixed_off":
      return `Get ${formatMoney(reward.amountOff)} off`;
    case "free_shipping":
      return "Get free shipping";
    case "free_items":
      return `Get ${reward.quantity} free`;
    default:
      return "Get the offer";
  }
}

function unlockedHeadline(reward: OfferReward, name: string): string {
  switch (reward.type) {
    case "percentage_off":
      return `${reward.percentOff}% off unlocked`;
    case "fixed_off":
      return `${formatMoney(reward.amountOff)} off unlocked`;
    case "free_shipping":
      return "Free shipping unlocked";
    default:
      return `${name} unlocked`;
  }
}

function formatOfferSaving(offer: AppliedOffer, currency: string): string {
  if (offer.freeShipping && offer.discountAmount === 0) {
    return "Free shipping";
  }
  return `−${formatMoney(offer.discountAmount, { currency })}`;
}

function buildStripState(
  offers: ActiveOffer[],
  cartSubtotal: number,
  cartQuantity: number,
  total: number,
  appliedNames: string[],
  appliedOffers: AppliedOffer[],
  currency: string,
  totalSavings: number,
): StripState {
  const latestApplied = appliedOffers[appliedOffers.length - 1];
  if (latestApplied) {
    const matched = offers.find((o) => o.name === latestApplied.name);
    const rewardText =
      totalSavings > 0
        ? `Saving ${formatMoney(totalSavings, { currency })}`
        : latestApplied.freeShipping && latestApplied.discountAmount === 0
          ? "Applied at checkout"
          : `Saving ${formatMoney(latestApplied.discountAmount, { currency })}`;

    return {
      kind: "unlocked",
      actionText: matched
        ? unlockedHeadline(matched.reward, matched.name)
        : `${latestApplied.name} unlocked`,
      rewardText,
      href: "/cart",
      ctaLabel: "View bag",
    };
  }

  let best: {
    offer: ActiveOffer;
    progress: number;
    actionText: string;
  } | null = null;

  for (const offer of offers) {
    if (appliedNames.includes(offer.name)) continue;
    const cond = offer.condition;

    if (cond.type === "quantity_threshold") {
      if (cartQuantity >= cond.minQuantity) continue;
      const needed = cond.minQuantity - cartQuantity;
      const progress = cartQuantity / cond.minQuantity;
      const actionText = `Add ${needed} more item${needed === 1 ? "" : "s"}`;
      if (!best || progress > best.progress) {
        best = { offer, progress, actionText };
      }
    }

    if (cond.type === "cart_total") {
      if (cartSubtotal >= cond.minTotal) continue;
      const needed = cond.minTotal - cartSubtotal;
      const progress = cartSubtotal / cond.minTotal;
      const actionText = `Spend ${formatMoney(needed, { currency })} more`;
      if (!best || progress > best.progress) {
        best = { offer, progress, actionText };
      }
    }
  }

  if (best) {
    return {
      kind: "progress",
      actionText: best.actionText,
      rewardText: rewardHeadline(best.offer.reward),
      href: "/shop",
      ctaLabel: "Shop more",
      progress: best.progress,
    };
  }

  return {
    kind: "cart",
    actionText: `${cartQuantity} item${cartQuantity === 1 ? "" : "s"} in your bag`,
    rewardText: `${formatMoney(total, { currency })}`,
    href: "/cart",
    ctaLabel: "View bag",
  };
}

export function StickyCartBar({
  desktopOnly = false,
  ctaHref,
}: {
  /** When true, only renders on `lg` and up (phones reach the bag and the offers page from the header and menu). */
  desktopOnly?: boolean;
  /** When set, overrides every state's CTA link + label to point here instead of /cart or /shop. */
  ctaHref?: { href: string; label: string };
} = {}) {
  const { totalItems, total, appliedOffers, subtotal, discount } = useCart();
  const { urlPathname } = usePageContext();
  const [visible, setVisible] = useState(false);
  const [offers, setOffers] = useState<ActiveOffer[]>([]);
  const [savingsExpanded, setSavingsExpanded] = useState(false);
  const prevItems = useRef(0);
  const currency = STORE_CURRENCY;

  const isHidden = HIDDEN_PATHS.some((p) => urlPathname.startsWith(p));
  const totalSavings = computeOfferSavingsTotal(appliedOffers, discount);
  const hasSavingsBreakdown =
    appliedOffers.length > 0 || discount > 0;

  useEffect(() => {
    if (isHidden) return;
    trpc.offer.listActive
      .query()
      .then((res) => {
        if (res.success && res.result) setOffers(res.result as ActiveOffer[]);
      })
      .catch(() => {});
  }, [isHidden]);

  useEffect(() => {
    if (isHidden) {
      setVisible(false);
      return;
    }
    if (totalItems > 0 && prevItems.current === 0) {
      setTimeout(() => setVisible(true), 400);
    } else if (totalItems === 0) {
      setVisible(false);
    } else {
      setVisible(totalItems > 0);
    }
    prevItems.current = totalItems;
  }, [totalItems, isHidden]);

  useEffect(() => {
    setSavingsExpanded(false);
  }, [appliedOffers.length, discount, totalItems]);

  const strip = useMemo(
    () =>
      buildStripState(
        offers,
        subtotal,
        totalItems,
        total,
        appliedOffers.map((o) => o.name),
        appliedOffers,
        currency,
        totalSavings,
      ),
    [offers, subtotal, totalItems, total, appliedOffers, currency, totalSavings],
  );

  if (isHidden || totalItems === 0) return null;

  const isUnlocked = strip.kind === "unlocked";
  const isProgress = strip.kind === "progress";
  const ctaLink = ctaHref?.href ?? strip.href;
  const ctaText = ctaHref?.label ?? strip.ctaLabel;

  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-x-0 bottom-0 px-4 pb-4 transition-opacity duration-[var(--perce-duration)]",
        desktopOnly && "hidden lg:block",
        visible ? "opacity-100" : "translate-y-full opacity-0",
      )}
      style={{ zIndex: "var(--perce-z-sticky)" }}
      aria-label="Bag and offers"
    >
      <div className="pointer-events-auto relative mx-auto w-full max-w-3xl">
        {isUnlocked && savingsExpanded && hasSavingsBreakdown && (
          <div className="mb-2 border border-line bg-surface px-4 py-3">
            <p className="mb-2 t-micro text-ink-2">Savings breakdown</p>
            <ul className="space-y-2">
              {appliedOffers.map((offer) => (
                <li
                  key={offer.name}
                  className="flex items-start justify-between gap-3 t-small text-ink"
                >
                  <span className="min-w-0 break-words">{offer.name}</span>
                  <span className="shrink-0 t-label tabular-nums">
                    {formatOfferSaving(offer, currency)}
                  </span>
                </li>
              ))}
              {discount > 0 && (
                <li className="flex items-center justify-between gap-3 t-small text-ink">
                  <span>Promo code</span>
                  <span className="t-label tabular-nums">
                    −{formatMoney(discount, { currency })}
                  </span>
                </li>
              )}
            </ul>
          </div>
        )}

        <div className="relative flex items-center gap-3 border border-line bg-surface px-4 py-2">
          {/* Progress toward the offer: a 1px ink rule along the top edge. */}
          {isProgress && (
            <div
              className="absolute inset-x-0 top-0 h-px bg-line"
              role="progressbar"
              aria-label="Progress toward the offer"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(strip.progress * 100)}
            >
              <div
                className="h-px bg-ink transition-[width] duration-[var(--perce-duration-slow)]"
                style={{ width: `${Math.round(strip.progress * 100)}%` }}
              />
            </div>
          )}

          <p className="shrink-0 t-label tabular-nums text-ink">
            Bag ({totalItems > 99 ? "99+" : totalItems})
          </p>

          {/* Offer copy */}
          <div className="min-w-0 flex-1">
            {isUnlocked && hasSavingsBreakdown ? (
              <button
                type="button"
                onClick={() => setSavingsExpanded((prev) => !prev)}
                className="flex min-h-11 w-full min-w-0 items-center gap-1 text-start"
                aria-expanded={savingsExpanded}
              >
                <span className="min-w-0 flex-1 truncate t-small text-ink-2">
                  <span>{strip.actionText}</span>
                  <span className="mx-2" aria-hidden>·</span>
                  <span className="t-label text-ink">{strip.rewardText}</span>
                </span>
                <ChevronDown
                  aria-hidden
                  size={16}
                  strokeWidth={1.5}
                  className={cn(
                    "shrink-0 text-ink-2 transition-transform",
                    savingsExpanded && "rotate-180",
                  )}
                />
              </button>
            ) : (
              <p className="flex min-h-11 items-center truncate t-small text-ink-2">
                <span className="truncate">
                  <span>{strip.actionText}</span>
                  <span className="mx-2" aria-hidden>·</span>
                  <span className="t-label text-ink">{strip.rewardText}</span>
                </span>
              </p>
            )}
          </div>

          <a href={ctaLink} className={buttonClass({ variant: "secondary", size: "sm", className: "shrink-0" })}>
            {ctaText}
          </a>
        </div>
      </div>
    </div>
  );
}

