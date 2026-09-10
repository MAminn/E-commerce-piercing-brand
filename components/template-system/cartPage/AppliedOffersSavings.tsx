import React, { useState } from "react";
import { ChevronDown, Gift } from "lucide-react";
import { cn } from "#root/lib/utils";

export interface AppliedOfferSummary {
  name: string;
  discountAmount: number;
  freeShipping?: boolean;
}

interface AppliedOffersSavingsProps {
  appliedOffers?: AppliedOfferSummary[];
  /** Promo code discount — included in sticky-banner total only */
  promoDiscount?: number;
  currency?: string;
  /** inline = order summary row; sticky-banner = mobile checkout strip */
  variant?: "inline" | "sticky-banner";
}

function formatOfferAmount(
  offer: AppliedOfferSummary,
  currency: string,
): string {
  if (offer.freeShipping && offer.discountAmount === 0) {
    return "Free shipping";
  }
  return `−${offer.discountAmount.toFixed(2)} ${currency}`;
}

export function AppliedOffersSavings({
  appliedOffers = [],
  promoDiscount = 0,
  currency = "EGP",
  variant = "inline",
}: AppliedOffersSavingsProps) {
  const [expanded, setExpanded] = useState(false);

  const offersTotal = appliedOffers.reduce((s, o) => s + o.discountAmount, 0);
  const totalSavings = offersTotal + promoDiscount;

  if (appliedOffers.length === 0 && promoDiscount <= 0) return null;

  const toggle = () => setExpanded((prev) => !prev);

  const details = (
    <ul className="mt-2 space-y-1.5 border-t border-current/20 pt-2">
      {appliedOffers.map((offer) => (
        <li
          key={offer.name}
          className="flex items-start justify-between gap-3 text-[11px] leading-snug"
        >
          <span className="min-w-0 break-words">{offer.name}</span>
          <span className="shrink-0 font-semibold">
            {formatOfferAmount(offer, currency)}
          </span>
        </li>
      ))}
      {promoDiscount > 0 && (
        <li className="flex items-center justify-between gap-3 text-[11px]">
          <span>Promo code</span>
          <span className="font-semibold">
            −{promoDiscount.toFixed(2)} {currency}
          </span>
        </li>
      )}
    </ul>
  );

  if (variant === "sticky-banner") {
    if (totalSavings <= 0) return null;

    return (
      <div className="bg-emerald-600 text-white">
        <button
          type="button"
          onClick={toggle}
          className="flex w-full items-center justify-between gap-2 px-4 py-2 text-left"
          aria-expanded={expanded}
        >
          <span className="text-[11px] font-semibold tracking-wide">
            🎉 Saving {currency}
            {totalSavings.toFixed(2)}
            {!expanded && (
              <span className="font-normal opacity-90"> — tap for details</span>
            )}
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 transition-transform",
              expanded && "rotate-180",
            )}
          />
        </button>
        {expanded && (
          <div className="border-t border-emerald-500/40 px-4 pb-2.5 opacity-95">
            {details}
          </div>
        )}
      </div>
    );
  }

  if (offersTotal <= 0) return null;

  return (
    <div className="text-[13px] text-red-600">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-start justify-between gap-2 text-left"
        aria-expanded={expanded}
      >
        <span className="flex min-w-0 items-start gap-1 font-medium">
          <Gift className="mt-0.5 h-3 w-3 shrink-0" />
          <span className="leading-snug">
            Offer savings
            <ChevronDown
              className={cn(
                "ml-1 inline h-3 w-3 align-middle transition-transform",
                expanded && "rotate-180",
              )}
            />
          </span>
        </span>
        <span className="shrink-0 font-semibold">
          −{offersTotal.toFixed(2)} {currency}
        </span>
      </button>
      {expanded && (
        <div className="ml-4 mt-1.5 space-y-1 border-l border-red-200 pl-3 text-[12px] text-red-600/90">
          {appliedOffers.map((offer) => (
            <div
              key={offer.name}
              className="flex items-start justify-between gap-2"
            >
              <span className="min-w-0 break-words">{offer.name}</span>
              <span className="shrink-0 font-medium">
                {formatOfferAmount(offer, currency)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function computeOfferSavingsTotal(
  appliedOffers: AppliedOfferSummary[] | undefined,
  promoDiscount = 0,
): number {
  const offersTotal =
    appliedOffers?.reduce((s, o) => s + o.discountAmount, 0) ?? 0;
  return offersTotal + promoDiscount;
}
