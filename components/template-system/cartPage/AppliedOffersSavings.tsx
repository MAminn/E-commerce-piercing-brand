import React, { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "#root/lib/utils";
import { formatMoney } from "#root/shared/pricing/format-money";

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
  return `−${formatMoney(offer.discountAmount, { currency })}`;
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
    <ul className="mt-2 space-y-1 border-t border-line pt-2">
      {appliedOffers.map((offer) => (
        <li
          key={offer.name}
          className="flex items-start justify-between gap-3 t-small"
        >
          <span className="min-w-0 break-words">{offer.name}</span>
          <span className="shrink-0 tabular-nums">
            {formatOfferAmount(offer, currency)}
          </span>
        </li>
      ))}
      {promoDiscount > 0 && (
        <li className="flex items-center justify-between gap-3 t-small">
          <span>Promo code</span>
          <span className="tabular-nums">
            −{formatMoney(promoDiscount, { currency })}
          </span>
        </li>
      )}
    </ul>
  );

  if (variant === "sticky-banner") {
    if (totalSavings <= 0) return null;

    return (
      <div className="border-b border-line bg-surface-2 text-ink">
        <button
          type="button"
          onClick={toggle}
          className="flex min-h-11 w-full items-center justify-between gap-2 px-4 text-start"
          aria-expanded={expanded}
        >
          <span className="t-small">
            <span className="t-label tabular-nums">Offers −{formatMoney(totalSavings, { currency })}</span>
            {!expanded && <span className="text-ink-2"> — details</span>}
          </span>
          <ChevronDown
            aria-hidden
            size={16}
            strokeWidth={1.5}
            className={cn("shrink-0 transition-transform", expanded && "rotate-180")}
          />
        </button>
        {expanded && (
          <div className="px-4 pb-3">
            {details}
          </div>
        )}
      </div>
    );
  }

  if (offersTotal <= 0) return null;

  return (
    <div className="t-body text-ink">
      <button
        type="button"
        onClick={toggle}
        className="flex min-h-11 w-full items-center justify-between gap-2 text-start"
        aria-expanded={expanded}
      >
        <span className="flex min-w-0 items-center gap-1 text-ink-2">
          Offers
          <ChevronDown
            aria-hidden
            size={16}
            strokeWidth={1.5}
            className={cn("shrink-0 transition-transform", expanded && "rotate-180")}
          />
        </span>
        <span className="shrink-0 tabular-nums">
          −{formatMoney(offersTotal, { currency })}
        </span>
      </button>
      {expanded && (
        <div className="mt-1 space-y-1 border-s border-line ps-3 t-small text-ink-2">
          {appliedOffers.map((offer) => (
            <div
              key={offer.name}
              className="flex items-start justify-between gap-2"
            >
              <span className="min-w-0 break-words">{offer.name}</span>
              <span className="shrink-0 tabular-nums">
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
