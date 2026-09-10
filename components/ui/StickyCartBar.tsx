import { useCart } from "#root/lib/context/CartContext";
import { usePageContext } from "vike-react/usePageContext";
import { ShoppingBag, ArrowRight, Plus, ChevronDown } from "lucide-react";
import { trpc } from "#root/shared/trpc/client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { OfferCondition, OfferReward } from "#root/shared/database/drizzle/schema";
import type { AppliedOffer } from "#root/backend/offers/service";
import { cn } from "#root/lib/utils";
import { computeOfferSavingsTotal } from "#root/components/template-system/cartPage/AppliedOffersSavings";
import { STORE_CURRENCY } from "#root/shared/config/branding";

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
      return `GET ${reward.percentOff}% OFF`;
    case "fixed_off":
      return `GET ${reward.amountOff} OFF`;
    case "free_shipping":
      return "GET FREE SHIPPING";
    case "free_items":
      return `GET ${reward.quantity} FREE`;
    default:
      return "GET A DEAL";
  }
}

function unlockedHeadline(reward: OfferReward, name: string): string {
  switch (reward.type) {
    case "percentage_off":
      return `${reward.percentOff}% OFF UNLOCKED`;
    case "fixed_off":
      return `${reward.amountOff} OFF UNLOCKED`;
    case "free_shipping":
      return "FREE SHIPPING UNLOCKED";
    default:
      return `${name.toUpperCase()} UNLOCKED`;
  }
}

function formatOfferSaving(offer: AppliedOffer, currency: string): string {
  if (offer.freeShipping && offer.discountAmount === 0) {
    return "Free shipping";
  }
  return `−${offer.discountAmount.toFixed(2)} ${currency}`;
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
        ? `SAVING ${totalSavings.toFixed(2)} ${currency}`
        : latestApplied.freeShipping && latestApplied.discountAmount === 0
          ? "APPLIED AT CHECKOUT"
          : `SAVING ${latestApplied.discountAmount.toFixed(2)} ${currency}`;

    return {
      kind: "unlocked",
      actionText: matched
        ? unlockedHeadline(matched.reward, matched.name)
        : `${latestApplied.name.toUpperCase()} UNLOCKED`,
      rewardText,
      href: "/cart",
      ctaLabel: "VIEW CART",
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
      const actionText = `ADD ${needed} MORE ITEM${needed === 1 ? "" : "S"}`;
      if (!best || progress > best.progress) {
        best = { offer, progress, actionText };
      }
    }

    if (cond.type === "cart_total") {
      if (cartSubtotal >= cond.minTotal) continue;
      const needed = cond.minTotal - cartSubtotal;
      const progress = cartSubtotal / cond.minTotal;
      const actionText = `SPEND ${needed.toFixed(0)} ${currency} MORE`;
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
      ctaLabel: "SHOP MORE",
      progress: best.progress,
    };
  }

  return {
    kind: "cart",
    actionText: `${cartQuantity} ITEM${cartQuantity === 1 ? "" : "S"} IN CART`,
    rewardText: `${total.toFixed(2)} ${currency}`,
    href: "/cart",
    ctaLabel: "VIEW CART",
  };
}

export function StickyCartBar({
  raiseForBottomNav = false,
  desktopOnly = false,
  ctaHref,
}: {
  /** When true, adds extra bottom clearance below `lg` so this bar stacks above a fixed mobile bottom nav instead of overlapping it. */
  raiseForBottomNav?: boolean;
  /** When true, only renders on `lg` and up (the minimal template already has its own mobile bottom nav + dedicated offers page). */
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
        "fixed inset-x-0 bottom-0 z-[9990] px-3 sm:px-4 pointer-events-none",
        desktopOnly && "hidden lg:block",
        raiseForBottomNav ? "pb-20 lg:pb-4" : "pb-3 sm:pb-4",
        visible ? "animate-offer-bar-enter" : "translate-y-full opacity-0",
      )}
      aria-label="Cart and offers"
    >
      <div className="mx-auto w-full max-w-3xl pointer-events-auto relative">
        {isUnlocked && savingsExpanded && hasSavingsBreakdown && (
          <div className="mb-2 rounded-2xl border border-emerald-400/40 bg-[#0a0a0a]/95 px-4 py-3 shadow-[0_8px_32px_rgba(0,0,0,0.35)] backdrop-blur-sm">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-emerald-300/90">
              Savings breakdown
            </p>
            <ul className="space-y-1.5">
              {appliedOffers.map((offer) => (
                <li
                  key={offer.name}
                  className="flex items-start justify-between gap-3 text-[11px] leading-snug text-white/90"
                >
                  <span className="min-w-0 break-words">{offer.name}</span>
                  <span className="shrink-0 font-semibold text-emerald-300">
                    {formatOfferSaving(offer, currency)}
                  </span>
                </li>
              ))}
              {discount > 0 && (
                <li className="flex items-center justify-between gap-3 text-[11px] text-white/90">
                  <span>Promo code</span>
                  <span className="font-semibold text-emerald-300">
                    −{discount.toFixed(2)} {currency}
                  </span>
                </li>
              )}
            </ul>
          </div>
        )}

        {/* Sparkle accents */}
        {isProgress && (
          <>
            <Plus
              className="absolute -left-0.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-amber-400 animate-offer-sparkle pointer-events-none"
              strokeWidth={3}
              aria-hidden
            />
            <Plus
              className="absolute -right-0.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-amber-400 animate-offer-sparkle-delayed pointer-events-none"
              strokeWidth={3}
              aria-hidden
            />
          </>
        )}

        <div
          className={cn(
            "relative flex items-center gap-2 sm:gap-3 rounded-full border border-amber-400/50 bg-[#0a0a0a] px-3 py-2.5 sm:px-4 sm:py-3",
            isUnlocked
              ? "border-emerald-400/50 animate-offer-border-pulse-success"
              : isProgress
                ? "animate-offer-border-pulse"
                : "shadow-[0_8px_32px_rgba(0,0,0,0.35)]",
          )}
        >
          {/* Progress fill (subtle) */}
          {isProgress && (
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-amber-500/10 transition-all duration-700 ease-out"
              style={{ width: `${Math.round(strip.progress * 100)}%` }}
              aria-hidden
            />
          )}

          {/* Bag icon */}
          <div className="relative z-10 shrink-0">
            <ShoppingBag
              className={cn(
                "h-5 w-5 sm:h-[22px] sm:w-[22px]",
                isUnlocked ? "text-emerald-300" : "text-amber-300",
              )}
              strokeWidth={1.75}
            />
            <span
              className={cn(
                "absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-0.5 text-[9px] font-bold leading-none",
                isUnlocked
                  ? "bg-emerald-400 text-emerald-950"
                  : "bg-amber-400 text-amber-950",
              )}
            >
              {totalItems > 99 ? "99+" : totalItems}
            </span>
          </div>

          {/* Offer copy */}
          <div className="relative z-10 min-w-0 flex-1">
            {isUnlocked && hasSavingsBreakdown ? (
              <button
                type="button"
                onClick={() => setSavingsExpanded((prev) => !prev)}
                className="flex w-full min-w-0 items-center gap-1 text-left"
                aria-expanded={savingsExpanded}
              >
                <p className="min-w-0 flex-1 truncate text-[10px] font-bold uppercase leading-tight tracking-wide text-white sm:text-[13px] animate-offer-text-glow">
                  <span>{strip.actionText}</span>
                  <span className="mx-1.5 font-normal text-white/30">|</span>
                  <span className="font-semibold text-emerald-300">
                    {strip.rewardText}
                  </span>
                </p>
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 shrink-0 text-emerald-300/80 transition-transform sm:h-4 sm:w-4",
                    savingsExpanded && "rotate-180",
                  )}
                />
              </button>
            ) : (
              <p className="truncate text-[10px] font-bold uppercase leading-tight tracking-wide text-white sm:text-[13px] animate-offer-text-glow">
                <span>{strip.actionText}</span>
                <span className="mx-1.5 font-normal text-white/30">|</span>
                <span
                  className={cn(
                    "font-semibold",
                    isUnlocked ? "text-emerald-300" : "text-amber-200/90",
                  )}
                >
                  {strip.rewardText}
                </span>
              </p>
            )}
          </div>

          {/* CTA */}
          <a
            href={ctaLink}
            className={cn(
              "relative z-10 flex shrink-0 items-center gap-1.5 overflow-hidden rounded-full px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-[#1a1000] transition-transform active:scale-95 sm:px-4 sm:py-2.5 sm:text-[12px]",
              isUnlocked
                ? "bg-gradient-to-r from-emerald-300 via-emerald-400 to-teal-400"
                : "bg-gradient-to-r from-amber-300 via-orange-400 to-amber-500 animate-offer-cta-shimmer",
            )}
          >
            <span className="hidden sm:inline">{ctaText}</span>
            <span
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full sm:h-7 sm:w-7",
                isUnlocked ? "bg-emerald-950/15" : "bg-black/15",
              )}
            >
              <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" strokeWidth={2.5} />
            </span>
          </a>
        </div>
      </div>
    </div>
  );
}
