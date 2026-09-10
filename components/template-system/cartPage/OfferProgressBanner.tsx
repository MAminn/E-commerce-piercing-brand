import React, { useEffect, useState } from "react";
import { Tag, Zap, Truck, CheckCircle2 } from "lucide-react";
import { trpc } from "#root/shared/trpc/client";
import type { OfferCondition, OfferReward } from "#root/shared/database/drizzle/schema";
import type { AppliedOfferSummary } from "./AppliedOffersSavings";

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
      message: `Spend ${needed.toFixed(2)} ${currency} more to unlock`,
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
        ? `${latestApplied.discountAmount.toFixed(2)} ${currency} off applied at checkout`
        : "";

  return (
    <div className="mb-6 space-y-2">
      {latestApplied && (
        <div className="flex items-center gap-3 border border-emerald-200 bg-emerald-50 px-4 py-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold leading-snug text-emerald-800">
              🎉 <span className="font-bold">{latestApplied.name}</span> unlocked!
            </p>
            <p className="mt-0.5 text-[12px] text-emerald-700">
              <strong>{latestRewardLabel}</strong>
              {latestSavingsLabel ? ` — ${latestSavingsLabel}` : ""}
            </p>
          </div>
          <span className="hidden shrink-0 rounded bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white sm:inline">
            Active
          </span>
        </div>
      )}

      {closestPending && (() => {
        const IconComponent =
          closestPending.icon === "truck"
            ? Truck
            : closestPending.icon === "zap"
              ? Zap
              : Tag;
        return (
          <div className="border border-amber-200 bg-amber-50 px-4 py-3.5">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-100">
                <IconComponent className="h-3.5 w-3.5 text-amber-600" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium leading-snug text-amber-900">
                  {closestPending.message}{" "}
                  <span className="text-amber-700">
                    — get <strong>{closestPending.rewardLabel}</strong>!
                  </span>
                </p>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-amber-200">
                  <div
                    className="h-full rounded-full bg-amber-500 transition-all duration-500"
                    style={{
                      width: `${Math.round(closestPending.progress * 100)}%`,
                    }}
                  />
                </div>
                <p className="mt-1 text-[11px] text-amber-600">
                  {Math.round(closestPending.progress * 100)}% of the way there
                </p>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
