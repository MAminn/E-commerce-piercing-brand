import React, { useState } from "react";
import { Button } from "#root/components/ui/button";
import { Input } from "#root/components/ui/input";
import { Skeleton } from "#root/components/ui/skeleton";
import {
  Trash2,
  Plus,
  Minus,
  ShoppingBag,
  ArrowRight,
  Tag,
  Gift,
} from "lucide-react";
import type {
  CartPageCartItem,
  CartPageTotals,
} from "./CartPageModernTemplate";
import { EditorialChrome } from "../editorial/EditorialChrome";
import { Reveal } from "../motion/Reveal";
import { StaggerContainer, StaggerItem } from "../motion/Stagger";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export interface CartPageEditorialTemplateProps {
  items: CartPageCartItem[];
  totals: CartPageTotals;
  isLoading?: boolean;
  isUpdating?: boolean;
  currency?: string;
  onQuantityChange?: (id: string, quantity: number) => void;
  onRemoveItem?: (id: string) => void;
  onApplyCoupon?: (code: string) => void;
  onProceedToCheckout?: () => void;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function formatPrice(v: number, currency = "EGP"): string {
  return `${currency} ${v.toFixed(2)}`;
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                    */
/* ------------------------------------------------------------------ */

export function CartPageEditorialTemplate({
  items = [],
  totals,
  isLoading = false,
  isUpdating = false,
  currency = "EGP",
  onQuantityChange,
  onRemoveItem,
  onApplyCoupon,
  onProceedToCheckout,
}: CartPageEditorialTemplateProps) {
  const [couponCode, setCouponCode] = useState("");

  const handleApplyCoupon = () => {
    if (couponCode.trim() && onApplyCoupon) {
      onApplyCoupon(couponCode.trim());
      setCouponCode("");
    }
  };

  /* ---- Loading State ---- */
  if (isLoading) {
    return (
      <div className="min-h-screen bg-stone-50">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-10">
          <Skeleton className="h-8 w-40 rounded mb-10" />
          <div className="space-y-6">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="flex gap-4">
                <Skeleton className="h-28 w-24 shrink-0 rounded-xl" />
                <div className="flex-1 space-y-3">
                  <Skeleton className="h-4 w-40 rounded" />
                  <Skeleton className="h-4 w-24 rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  /* ---- Empty State ---- */
  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-stone-50">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:px-10">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full border border-stone-200 bg-white mb-6">
              <ShoppingBag className="h-6 w-6 text-stone-400" />
            </div>
            <h2 className="text-2xl font-semibold tracking-tight text-stone-900">
              Your bag is empty
            </h2>
            <p className="mt-2 text-sm text-stone-500">
              Looks like you haven't added anything yet.
            </p>
            <Button
              className="mt-8 rounded-full px-7 py-5 text-sm tracking-wide"
              onClick={() => {
                window.location.href = "/shop";
              }}
            >
              Continue Shopping
            </Button>
          </div>
        </div>
      </div>
    );
  }

  /* ---- Cart Content ---- */
  return (
    <EditorialChrome>
    <div className="min-h-screen bg-stone-50">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14 lg:px-10">
        {/* Header */}
        <Reveal variant="fadeUp">
        <div className="mb-10">
          <p className="text-xs tracking-[0.32em] uppercase text-stone-500">
            Shopping
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-stone-900 sm:text-4xl">
            Your Bag
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            {items.length} {items.length === 1 ? "item" : "items"}
          </p>
        </div>
        </Reveal>

        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
          {/* -------------------------------------------------------- */}
          {/*  Items List                                               */}
          {/* -------------------------------------------------------- */}
          <StaggerContainer className="lg:col-span-8 space-y-0 divide-y divide-stone-200">
            {items.map((item) => (
              <StaggerItem key={item.id}>
              <div
                className={`flex gap-4 py-6 first:pt-0 ${isUpdating ? "opacity-60 pointer-events-none" : ""}`}
              >
                {/* Image */}
                <div className="relative h-28 w-24 shrink-0 overflow-hidden rounded-xl bg-stone-200 sm:h-36 sm:w-28">
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-[9px] tracking-[0.28em] uppercase text-stone-400">
                        No img
                      </span>
                    </div>
                  )}
                </div>

                {/* Details */}
                <div className="flex flex-1 flex-col justify-between min-w-0">
                  <div>
                    <p className="text-sm font-medium text-stone-900 line-clamp-2">
                      {item.name}
                    </p>
                    {item.variant && (
                      <p className="mt-1 text-xs text-stone-500">
                        {item.variant}
                      </p>
                    )}
                    {item.freeQuantity && item.freeQuantity >= item.quantity ? (
                      <p className="mt-1 text-sm font-semibold text-emerald-600 uppercase tracking-wide">
                        Free
                      </p>
                    ) : (
                      <p className="mt-1 text-sm font-medium text-stone-900">
                        {formatPrice(item.price, currency)}
                        {item.freeQuantity != null && item.freeQuantity > 0 && (
                          <span className="ms-2 text-xs font-semibold text-emerald-600">
                            ({item.freeQuantity} free)
                          </span>
                        )}
                      </p>
                    )}
                  </div>

                  {/* Controls row */}
                  <div className="mt-3 flex items-center justify-between">
                    {/* Quantity */}
                    <div className="inline-flex items-center rounded-full border border-stone-200 bg-white">
                      <button
                        type="button"
                        onClick={() =>
                          onQuantityChange?.(
                            item.id,
                            Math.max(1, item.quantity - 1),
                          )
                        }
                        className="flex h-8 w-8 items-center justify-center text-stone-500 hover:text-stone-900 transition-colors"
                        aria-label="Decrease quantity"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="w-8 text-center text-xs font-medium text-stone-900">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          onQuantityChange?.(item.id, item.quantity + 1)
                        }
                        className="flex h-8 w-8 items-center justify-center text-stone-500 hover:text-stone-900 transition-colors"
                        aria-label="Increase quantity"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>

                    {/* Remove */}
                    <button
                      type="button"
                      onClick={() => onRemoveItem?.(item.id)}
                      className="flex h-8 w-8 items-center justify-center rounded-full text-stone-400 hover:text-stone-900 hover:bg-stone-100 transition-colors"
                      aria-label={`Remove ${item.name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
              </StaggerItem>
            ))}
          </StaggerContainer>

          {/* -------------------------------------------------------- */}
          {/*  Summary — sticky                                        */}
          {/* -------------------------------------------------------- */}
          <Reveal variant="fadeUp" delay={0.15} className="lg:col-span-4">
            <div className="lg:sticky lg:top-24 rounded-2xl border border-stone-200 bg-white p-6">
              <h2 className="text-sm font-medium tracking-[0.2em] uppercase text-stone-500 mb-5">
                Order Summary
              </h2>

              <div className="space-y-3 text-sm">
                <div className="flex justify-between text-stone-600">
                  <span>Subtotal</span>
                  <span>{formatPrice(totals.subtotal, currency)}</span>
                </div>
                {totals.discount != null && totals.discount > 0 && (
                  <div className="flex justify-between text-stone-600">
                    <span>Discount</span>
                    <span className="text-green-700">
                      −{formatPrice(totals.discount, currency)}
                    </span>
                  </div>
                )}
                {totals.appliedOffers && totals.appliedOffers.map((offer) => (
                  <div key={offer.name} className="flex items-start justify-between gap-2 text-red-600">
                    <span className="flex items-center gap-1.5 font-medium min-w-0">
                      <Gift className="w-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{offer.name}</span>
                    </span>
                    <span className="font-semibold shrink-0">
                      {offer.freeShipping && offer.discountAmount === 0
                        ? "Free shipping"
                        : `−${formatPrice(offer.discountAmount, currency)}`}
                    </span>
                  </div>
                ))}
                {totals.shipping != null && (
                  <div className="flex justify-between text-stone-600">
                    <span>Shipping</span>
                    <span>
                      {totals.shipping === 0
                        ? "Free"
                        : formatPrice(totals.shipping, currency)}
                    </span>
                  </div>
                )}
              </div>

              <div className="mt-4 h-px w-full bg-stone-200" />

              <div className="mt-4 flex justify-between text-base font-semibold text-stone-900">
                <span>Total</span>
                <span>{formatPrice(totals.grandTotal, currency)}</span>
              </div>

              {/* Coupon */}
              {onApplyCoupon && (
                <div className="mt-5">
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Tag className="absolute start-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-stone-400" />
                      <Input
                        type="text"
                        placeholder="Promo code"
                        value={couponCode}
                        onChange={(e) => setCouponCode(e.target.value)}
                        className="h-9 rounded-full ps-9 text-sm border-stone-200"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleApplyCoupon();
                        }}
                      />
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 rounded-full px-4 text-xs tracking-wide border-stone-200"
                      onClick={handleApplyCoupon}
                      disabled={!couponCode.trim()}
                    >
                      Apply
                    </Button>
                  </div>
                </div>
              )}

              <Button
                size="lg"
                className="mt-6 w-full rounded-full py-6 text-sm tracking-wide"
                onClick={onProceedToCheckout}
                disabled={isUpdating}
              >
                Proceed to Checkout
                <ArrowRight className="ms-2 h-4 w-4" />
              </Button>

              <button
                type="button"
                onClick={() => {
                  window.location.href = "/shop";
                }}
                className="mt-3 block w-full text-center text-sm text-stone-500 underline underline-offset-4 decoration-stone-500/25 hover:decoration-stone-500/50 transition-colors"
              >
                Continue Shopping
              </button>
            </div>
          </Reveal>
        </div>
      </div>
    </div>
    </EditorialChrome>
  );
}

CartPageEditorialTemplate.displayName = "CartPageEditorialTemplate";
