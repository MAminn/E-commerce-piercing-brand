import React, { useEffect, useState } from "react";
import { Tag, Zap, Truck, CheckCircle2 } from "lucide-react";
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
        <div className="flex items-center gap-3 border border-perce-line-strong bg-perce-surface px-4 py-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-perce-surface">
            <CheckCircle2 className="h-4 w-4 text-perce-success" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold leading-snug text-perce-ink">
              🎉 <span className="font-bold">{latestApplied.name}</span> unlocked!
            </p>
            <p className="mt-0.5 text-[12px] text-perce-success">
              <strong>{latestRewardLabel}</strong>
              {latestSavingsLabel ? ` — ${latestSavingsLabel}` : ""}
            </p>
          </div>
          <span className="hidden shrink-0 rounded bg-perce-success px-2 py-0.5 text-xs font-medium text-perce-ink-inverse sm:inline">
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
          <div className="border border-perce-line-strong bg-perce-surface px-4 py-3.5">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-perce-line">
                <IconComponent className="h-3.5 w-3.5 text-perce-ink-secondary" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium leading-snug text-perce-ink">
                  {closestPending.message}{" "}
                  <span className="text-perce-ink-secondary">
                    — get <strong>{closestPending.rewardLabel}</strong>!
                  </span>
                </p>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-perce-line">
                  <div
                    className="h-full rounded-full bg-perce-cta transition-all duration-500"
                    style={{
                      width: `${Math.round(closestPending.progress * 100)}%`,
                    }}
                  />
                </div>
                <p className="mt-1 text-[11px] text-perce-ink-secondary">
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
