import React, { useEffect, useState } from "react";
import { trpc } from "#root/shared/trpc/client";
import type { OfferCondition, OfferReward } from "#root/shared/database/drizzle/schema";
import type { AppliedOfferSummary } from "./AppliedOffersSavings";
import { formatMoney } from "#root/shared/pricing/format-money";

interface Props {
  cartSubtotal: number;
  cartQuantity: number;
  appliedOffers?: AppliedOfferSummary[];
  currency?: string;
}

interface ActiveOffer {
  id: string;
  name: string;
  condition: OfferCondition;
  reward: OfferReward;
  description?: string | null;
}

type PendingState = {
  offer: ActiveOffer;
  progress: number;
  message: string;
  rewardLabel: string;
  icon: "tag" | "truck" | "zap";
};

function getRewardLabel(reward: OfferReward): string {
  switch (reward.type) {
    case "percentage_off":
      return `${reward.percentOff}% off`;
    case "fixed_off":
      return `${reward.amountOff} off`;
    case "free_shipping":
      return "free shipping";
    case "free_items":
      return `${reward.quantity} item${reward.quantity > 1 ? "s" : ""} free`;
    default:
      return "a discount";
  }
}

function getIcon(reward: OfferReward): "tag" | "truck" | "zap" {
  if (reward.type === "free_shipping") return "truck";
  if (reward.type === "free_items") return "zap";
  return "tag";
}

function conditionProgress(
  offer: ActiveOffer,
  cartSubtotal: number,
  cartQuantity: number,
  currency: string,
): { met: true } | { met: false; progress: number; message: string } | null {
  const cond = offer.condition;

  if (cond.type === "quantity_threshold") {
    // Past an optional maximum the offer no longer applies, and there is no
    // honest "add more" message to show.
    if (cond.maxQuantity !== undefined && cartQuantity > cond.maxQuantity) return null;
    if (cartQuantity >= cond.minQuantity) return { met: true };
    const needed = cond.minQuantity - cartQuantity;
    const progress = Math.min(cartQuantity / cond.minQuantity, 0.99);
    return {
      met: false,
      progress,
      message: `Add ${needed} more item${needed === 1 ? "" : "s"} to unlock`,
    };
  }

  if (cond.type === "cart_total") {
    if (cartSubtotal >= cond.minTotal) return { met: true };
    const needed = cond.minTotal - cartSubtotal;
    const progress = Math.min(cartSubtotal / cond.minTotal, 0.99);
    return {
      met: false,
      progress,
      message: `Spend ${formatMoney(needed, { currency })} more to unlock`,
    };
  }

  return null;
}

export function OfferProgressBanner({
  cartSubtotal,
  cartQuantity,
  appliedOffers = [],
  currency = "EGP",
}: Props) {
  const [activeOffers, setActiveOffers] = useState<ActiveOffer[]>([]);

  useEffect(() => {
    trpc.offer.listActive
      .query()
      .then((res) => {
        if (res.success && res.result) {
          setActiveOffers(res.result as ActiveOffer[]);
        }
      })
      .catch(() => {});
  }, []);

  if (activeOffers.length === 0 && appliedOffers.length === 0) return null;

  const appliedNames = new Set(appliedOffers.map((o) => o.name));
  const latestApplied =
    appliedOffers.length > 0
      ? appliedOffers[appliedOffers.length - 1]
      : undefined;
  const latestOfferMeta = latestApplied
    ? activeOffers.find((o) => o.name === latestApplied.name)
    : undefined;

  const pending: PendingState[] = [];

  for (const offer of activeOffers) {
    if (appliedNames.has(offer.name)) continue;

    const rewardLabel = getRewardLabel(offer.reward);
    const icon = getIcon(offer.reward);
    const prog = conditionProgress(offer, cartSubtotal, cartQuantity, currency);
    if (!prog || prog.met) continue;

    pending.push({
      offer,
      progress: prog.progress,
      message: prog.message,
      rewardLabel,
      icon,
    });
  }

  pending.sort((a, b) => b.progress - a.progress);
  const closestPending = pending[0];

  if (!latestApplied && !closestPending) return null;

  const latestRewardLabel = latestOfferMeta
    ? getRewardLabel(latestOfferMeta.reward)
    : "your discount";
  const latestSavingsLabel =
    latestApplied?.freeShipping && latestApplied.discountAmount === 0
      ? "Free shipping applied at checkout"
      : latestApplied
        ? `${formatMoney(latestApplied.discountAmount, { currency })} off applied at checkout`
        : "";

  return (
    <div className="mb-6 space-y-2">
      {latestApplied && (
        <div className="border border-line px-4 py-3">
          <p className="t-label text-ink">
            {latestApplied.name} <span className="font-normal text-ink-2">· Applied</span>
          </p>
          <p className="mt-1 t-small text-ink-2">
            {latestRewardLabel}
            {latestSavingsLabel ? ` — ${latestSavingsLabel}` : ""}
          </p>
        </div>
      )}

      {closestPending && (() => {
        const percent = Math.round(closestPending.progress * 100);
        return (
          <div className="border border-line px-4 py-3">
            <p className="t-small text-ink">
              {closestPending.message}{" "}
              <span className="text-ink-2">— get {closestPending.rewardLabel}</span>
            </p>
            <div
              className="mt-2 h-px w-full bg-line"
              role="progressbar"
              aria-label={closestPending.message}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}>
              <div
                className="h-px bg-ink transition-[width] duration-[var(--perce-duration-slow)]"
                style={{ width: `${percent}%` }}
              />
            </div>
            <p className="mt-1 t-micro tabular-nums text-ink-2">{percent}% of the way there</p>
          </div>
        );
      })()}
    </div>
  );
}
