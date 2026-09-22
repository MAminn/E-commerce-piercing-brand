import React from "react";
import { Trash2, Plus, Minus, ShoppingCart, ArrowRight } from "lucide-react";
import type { CartPageModernTemplateProps } from "./CartPageModernTemplate";
import { OfferProgressBanner } from "./OfferProgressBanner";
import { CartBundleGroup } from "./CartBundleGroup";
import {
  AppliedOffersSavings,
  computeOfferSavingsTotal,
} from "./AppliedOffersSavings";
import { formatMoney } from "#root/shared/pricing/format-money";

/**
 * CartPageMinimalTemplate
 * Mobile-first minimal cart layout matching the minimal store aesthetic.
 * Clean, no-card design, stone palette, full-width on mobile.
 */
export function CartPageMinimalTemplate({
  items = [],
  bundles = [],
  onRemoveBundle,
  totals,
  isLoading = false,
  isUpdating = false,
  currency = "EGP",
  onQuantityChange,
  onRemoveItem,
  onApplyCoupon,
  onProceedToCheckout,
  appliedCoupon,
  onRemoveCoupon,
  couponNotice,
  onDismissCouponNotice,
}: CartPageModernTemplateProps) {
  const [couponCode, setCouponCode] = React.useState("");
  const [isApplyingCoupon, setIsApplyingCoupon] = React.useState(false);
  const [couponFeedback, setCouponFeedback] = React.useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const handleApplyCoupon = async () => {
    const code = couponCode.trim();
    if (!code || !onApplyCoupon || isApplyingCoupon) return;

    setCouponFeedback(null);
    onDismissCouponNotice?.();
    setIsApplyingCoupon(true);
    try {
      const result = await onApplyCoupon(code);
      if (result) {
        setCouponFeedback(result);
        // Only clear the field on success, so a typo stays editable.
        if (result.success) setCouponCode("");
      } else {
        setCouponCode("");
      }
    } finally {
      setIsApplyingCoupon(false);
    }
  };

  const handleRemoveCoupon = () => {
    setCouponFeedback(null);
    onDismissCouponNotice?.();
    onRemoveCoupon?.();
  };

  if (isLoading) {
    return (
      <div
        role="status"
        aria-label="Loading cart"
        className="flex min-h-[60vh] items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-perce-line-strong border-t-perce-ink" />
      </div>
    );
  }

  if (items.length === 0 && bundles.length === 0) {
    return (
      <div className="perce-header-offset flex min-h-[60vh] flex-col items-center justify-center bg-perce-bg px-4 text-center">
        <ShoppingCart aria-hidden className="mb-4 h-10 w-10 text-perce-ink-subtle" />
        <h1 className="perce-section-title">Your cart is empty</h1>
        <p className="mt-2 text-[length:var(--perce-text-body)] text-perce-ink-muted">
          Nothing added yet.
        </p>
        <a
          href="/shop"
          className="mt-6 inline-flex min-h-11 items-center gap-2 bg-perce-cta px-6 text-[length:var(--perce-text-small)] font-medium text-perce-ink-inverse transition-colors hover:bg-perce-cta-hover">
          Continue shopping
        </a>
      </div>
    );
  }

  const cartSubtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const appliedOffers = totals.appliedOffers ?? [];
  const bundleSavings = totals.bundleSavings ?? 0;
  const totalSavings =
    computeOfferSavingsTotal(appliedOffers, totals.discount ?? 0) + Math.max(0, bundleSavings);
  const lineCount = items.length + bundles.length;

  return (
    <>
      {/* pb-60 reserves room for the mobile sticky bar below; the page also
          has to clear the fixed header chrome, which it previously did not —
          the "Cart" heading started underneath the navbar. */}
      <div className="perce-header-offset min-h-screen bg-perce-bg pb-60 sm:pb-0">
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">

          {/* Page title */}
          <h1 className="text-[22px] sm:text-[28px] font-medium text-perce-ink mb-4 sm:mb-6">
            Cart <span className="text-perce-ink-muted font-normal text-[16px] sm:text-[18px]">({lineCount} {lineCount === 1 ? "item" : "items"})</span>
          </h1>

          {/* Offer progress banner */}
          <OfferProgressBanner
            cartSubtotal={cartSubtotal}
            cartQuantity={items.reduce((s, i) => s + i.quantity, 0)}
            appliedOffers={appliedOffers}
            currency={currency}
          />

          <div className="lg:grid lg:grid-cols-[1fr_360px] lg:gap-12">

            {/* ── Left: Items ───────────────────────────────── */}
            <div>
              {/* Column headers (desktop only) */}
              <div className="hidden sm:grid grid-cols-[1fr_120px_100px_40px] gap-4 pb-3 border-b border-perce-line text-xs text-perce-ink-muted font-medium">
                <span>Product</span>
                <span className="text-center">Quantity</span>
                <span className="text-right">Price</span>
                <span />
              </div>

              {/* Items list — stacks first, as grouped units */}
              <div className="divide-y divide-perce-line">
                {bundles.map((bundle) => (
                  <CartBundleGroup
                    key={bundle.instanceId}
                    bundle={bundle}
                    currency={currency}
                    onRemove={onRemoveBundle}
                    disabled={isUpdating}
                  />
                ))}
                {items.map((item) => {
                  const lineTotal = item.price * item.quantity;
                  const hasDiscount = item.originalPrice != null && item.originalPrice > item.price;
                  const freeQty = item.freeQuantity ?? 0;
                  const isFullyFree = freeQty > 0 && freeQty >= item.quantity;
                  return (
                    <div key={item.id} className={`py-5 sm:py-6 transition-opacity ${isUpdating ? "opacity-60 pointer-events-none" : ""}`}>

                      {/* Mobile layout */}
                      <div className="flex gap-3 sm:hidden">
                        {/* Image */}
                        <div className="w-[88px] h-[88px] shrink-0 bg-perce-surface overflow-hidden">
                          {item.imageUrl ? (
                            <img
                              src={item.imageUrl}
                              alt={item.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <ShoppingCart className="w-6 h-6 text-perce-ink-subtle" />
                            </div>
                          )}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0 flex flex-col gap-1">
                          {/* Name row + delete */}
                          <div className="flex items-start gap-1">
                            <p
                              className="flex-1 text-[14px] font-medium leading-snug break-words overflow-hidden"
                              style={{ color: "var(--perce-ink)", fontFamily: "var(--font-product-title)" }}>
                              {item.name}
                            </p>
                            <button
                              type="button"
                              onClick={() => onRemoveItem?.(item.id)}
                              aria-label="Remove item"
                              className="shrink-0 h-11 w-11 flex items-center justify-center text-perce-ink-subtle hover:text-perce-sale transition-colors -mr-1">
                              <Trash2 className="w-[15px] h-[15px]" />
                            </button>
                          </div>

                          {item.variant && (
                            <p className="text-[11px] text-perce-ink-muted leading-none">{item.variant}</p>
                          )}

                          {/* Unit price */}
                          <div className="flex items-center gap-1.5">
                            {hasDiscount && (
                              <span className="text-[11px] text-perce-ink-muted line-through">
                                {formatMoney(item.originalPrice!, { currency })}
                              </span>
                            )}
                            <span className={`text-[12px] ${hasDiscount ? "text-perce-sale font-medium" : "text-perce-ink-muted"}`}>
                              {formatMoney(item.price, { currency })} each
                            </span>
                            {hasDiscount && (
                              <span className="text-[10px] bg-perce-surface text-perce-sale px-1.5 py-0.5 font-medium">
                                -{Math.round((1 - item.price / item.originalPrice!) * 100)}%
                              </span>
                            )}
                          </div>

                          {/* Qty + line total */}
                          <div className="flex flex-col items-center mt-auto pt-1">
                            <div className="flex items-center border border-perce-line w-fit">
                              <button
                                type="button"
                                onClick={() => onQuantityChange?.(item.id, Math.max(1, item.quantity - 1))}
                                aria-label="Decrease quantity"
                                className="h-11 w-11 flex items-center justify-center text-perce-ink-secondary hover:bg-perce-surface active:bg-perce-surface transition-colors"
                                disabled={item.quantity <= 1}>
                                <Minus className="w-3 h-3" />
                              </button>
                              <span
                                className="w-8 text-center text-[13px] font-medium"
                                style={{ color: "var(--perce-ink)", fontFamily: "var(--font-body)" }}>
                                {item.quantity}
                              </span>
                              <button
                                type="button"
                                onClick={() => onQuantityChange?.(item.id, item.quantity + 1)}
                                aria-label="Increase quantity"
                                className="h-11 w-11 flex items-center justify-center text-perce-ink-secondary hover:bg-perce-surface active:bg-perce-surface transition-colors"
                                disabled={item.stock != null && item.quantity >= item.stock}>
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                            <div className="flex items-baseline gap-1.5 mt-1">
                              {freeQty > 0 ? (
                                <>
                                  <span className="text-[12px] text-perce-ink-muted line-through">
                                    {formatMoney(lineTotal, { currency })}
                                  </span>
                                  {isFullyFree ? (
                                    <p className="text-[15px] font-semibold text-perce-success" style={{ fontFamily: "var(--font-price)" }}>
                                      Free
                                    </p>
                                  ) : (
                                    <p className="text-[15px] font-semibold" style={{ color: "var(--perce-ink)", fontFamily: "var(--font-price)" }}>
                                      {formatMoney((item.price * (item.quantity - freeQty)), { currency })}
                                      <span className="ms-1 text-[10px] text-perce-success font-semibold">
                                        ({freeQty} free)
                                      </span>
                                    </p>
                                  )}
                                </>
                              ) : (
                                <>
                                  {hasDiscount && (
                                    <span className="text-[12px] text-perce-ink-muted line-through">
                                      {formatMoney((item.originalPrice! * item.quantity), { currency })}
                                    </span>
                                  )}
                                  <p
                                    className={`text-[15px] font-semibold ${hasDiscount ? "text-perce-sale" : ""}`}
                                    style={{ color: hasDiscount ? undefined : "var(--perce-ink)", fontFamily: "var(--font-price)" }}>
                                    {formatMoney(lineTotal, { currency })}
                                  </p>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Desktop layout */}
                      <div className="hidden sm:grid grid-cols-[1fr_120px_100px_40px] gap-4 items-center">
                        <div className="flex items-center gap-4">
                          {item.imageUrl ? (
                            <img src={item.imageUrl} alt={item.name} className="w-16 h-16 object-cover bg-perce-surface shrink-0" />
                          ) : (
                            <div className="w-16 h-16 bg-perce-surface shrink-0" />
                          )}
                          <div className="min-w-0">
                            <p
                              className="text-[14px] font-medium break-words"
                              style={{ color: "var(--perce-ink)", fontFamily: "var(--font-product-title)" }}>
                              {item.name}
                            </p>
                            {item.variant && <p className="text-[12px] text-perce-ink-muted mt-0.5">{item.variant}</p>}
                            <div className="flex items-center gap-1.5 mt-0.5">
                              {hasDiscount && (
                                <span className="text-[11px] text-perce-ink-muted line-through">
                                  {formatMoney(item.originalPrice!, { currency })}
                                </span>
                              )}
                              <span className={`text-[12px] ${hasDiscount ? "text-perce-sale font-medium" : "text-perce-ink-muted"}`}>
                                {formatMoney(item.price, { currency })}
                              </span>
                              {hasDiscount && (
                                <span className="text-[10px] bg-perce-surface text-perce-sale px-1.5 py-0.5 font-medium">
                                  -{Math.round((1 - item.price / item.originalPrice!) * 100)}%
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center justify-center border border-perce-line w-fit mx-auto">
                          <button
                            type="button"
                            onClick={() => onQuantityChange?.(item.id, Math.max(1, item.quantity - 1))}
                            aria-label="Decrease quantity"
                            className="w-9 h-9 flex items-center justify-center text-perce-ink-secondary hover:bg-perce-surface transition-colors"
                            disabled={item.quantity <= 1}>
                            <Minus className="w-3 h-3" />
                          </button>
                          <span
                            className="w-8 text-center text-[13px] font-medium"
                            style={{ color: "var(--perce-ink)", fontFamily: "var(--font-body)" }}>
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => onQuantityChange?.(item.id, item.quantity + 1)}
                            aria-label="Increase quantity"
                            className="w-9 h-9 flex items-center justify-center text-perce-ink-secondary hover:bg-perce-surface transition-colors"
                            disabled={item.stock != null && item.quantity >= item.stock}>
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                        <div className="text-right">
                          {freeQty > 0 ? (
                            <>
                              <p className="text-[11px] text-perce-ink-muted line-through">
                                {formatMoney(lineTotal, { currency })}
                              </p>
                              {isFullyFree ? (
                                <p className="text-[14px] font-semibold text-perce-success" style={{ fontFamily: "var(--font-price)" }}>
                                  Free
                                </p>
                              ) : (
                                <p className="text-[14px] font-semibold" style={{ color: "var(--perce-ink)", fontFamily: "var(--font-price)" }}>
                                  {formatMoney((item.price * (item.quantity - freeQty)), { currency })}
                                  <span className="ms-1 text-[10px] text-perce-success font-semibold">
                                    ({freeQty} free)
                                  </span>
                                </p>
                              )}
                            </>
                          ) : (
                            <>
                              {hasDiscount && (
                                <p className="text-[11px] text-perce-ink-muted line-through">
                                  {formatMoney((item.originalPrice! * item.quantity), { currency })}
                                </p>
                              )}
                              <p
                                className={`text-[14px] font-semibold ${hasDiscount ? "text-perce-sale" : ""}`}
                                style={{ color: hasDiscount ? undefined : "var(--perce-ink)", fontFamily: "var(--font-price)" }}>
                                {formatMoney(lineTotal, { currency })}
                              </p>
                            </>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => onRemoveItem?.(item.id)}
                          aria-label="Remove item"
                          className="w-8 h-8 flex items-center justify-center text-perce-ink-subtle hover:text-perce-sale transition-colors justify-self-end">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                    </div>
                  );
                })}
              </div>

              {/* Promo code */}
              <div className="mt-6 lg:mt-8 pt-6 border-t border-perce-line">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                  <p className="text-[13px] font-medium text-perce-ink shrink-0">
                    Apply promo code
                  </p>
                  <div className="flex flex-1 gap-2 min-w-0">
                    <input
                      type="text"
                      value={couponCode}
                      onChange={(e) => {
                        setCouponCode(e.target.value);
                        if (couponFeedback) setCouponFeedback(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleApplyCoupon();
                      }}
                      placeholder="Enter code"
                      disabled={isApplyingCoupon}
                      aria-invalid={couponFeedback?.success === false}
                      aria-describedby="promo-code-feedback"
                      className={`flex-1 px-4 py-2.5 rounded-md border text-[13px] text-perce-ink placeholder-perce-ink-subtle outline-none transition-colors bg-perce-surface-raised min-w-0 disabled:opacity-60 ${
                        couponFeedback && !couponFeedback.success
                          ? "border-perce-sale focus:border-perce-sale"
                          : "border-perce-line focus:border-perce-ink"
                      }`}
                    />
                    <button
                      type="button"
                      onClick={handleApplyCoupon}
                      disabled={!couponCode.trim() || isApplyingCoupon}
                      className="px-5 py-2.5 rounded-md bg-perce-cta text-perce-ink-inverse text-[12px] font-medium hover:bg-perce-cta-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0">
                      {isApplyingCoupon ? "Checking…" : "Apply"}
                    </button>
                  </div>
                </div>

                <div id="promo-code-feedback" aria-live="polite">
                  {/* A code that stopped being valid on its own (cart edited,
                      code expired between visits, etc.) */}
                  {couponNotice && (
                    <p className="text-[12px] text-amber-700 bg-amber-50 border border-amber-100 rounded-md px-3 py-2 mt-2">
                      {couponNotice}
                    </p>
                  )}

                  {couponFeedback && (
                    <p
                      className={`text-[12px] mt-2 ${
                        couponFeedback.success
                          ? "text-perce-success"
                          : "text-perce-sale"
                      }`}>
                      {couponFeedback.message}
                    </p>
                  )}
                </div>

                {/* Currently applied code, with a way to take it off */}
                {appliedCoupon && (
                  <div className="flex items-center justify-between gap-3 mt-3 px-3 py-2 rounded-md bg-perce-surface border border-perce-line">
                    <p className="text-[12px] text-perce-success min-w-0">
                      <span className="font-semibold">
                        {appliedCoupon.code}
                      </span>
                      {appliedCoupon.discountLabel
                        ? ` — ${appliedCoupon.discountLabel}`
                        : ""}
                      {totals.discount != null && totals.discount > 0
                        ? ` · saving ${formatMoney(totals.discount, { currency })}`
                        : ""}
                    </p>
                    {onRemoveCoupon && (
                      <button
                        type="button"
                        onClick={handleRemoveCoupon}
                        className="text-[11px] font-medium text-perce-success hover:text-perce-success underline shrink-0">
                        Remove
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* ── Right: Order Summary ────────────────────── */}
            <div className="mt-8 lg:mt-0">
              <div className="bg-perce-surface p-6">
                <h2 className="text-[15px] font-semibold text-perce-ink mb-5">Order Summary</h2>

                <div className="space-y-3">
                  <div className="flex justify-between text-[13px] text-perce-ink-secondary">
                    <span>Subtotal</span>
                    <span>{formatMoney(totals.subtotal, { currency })}</span>
                  </div>
                  {bundleSavings > 0 && (
                    <div className="flex justify-between text-[13px] text-perce-success">
                      <span>Stack savings</span>
                      <span>−{formatMoney(bundleSavings, { currency })}</span>
                    </div>
                  )}
                  {totals.discount != null && totals.discount > 0 && (
                    <div className="flex justify-between text-[13px] text-perce-success">
                      <span>Discount</span>
                      <span>−{formatMoney(totals.discount, { currency })}</span>
                    </div>
                  )}
                  <AppliedOffersSavings
                    appliedOffers={appliedOffers}
                    currency={currency}
                  />
                  {/* "Calculated at checkout" is shown ONLY when it is true:
                      zone shipping is on and the fee depends on the
                      governorate chosen at checkout. In flat mode the line
                      appears only once a fee is configured, exactly as
                      before. */}
                  {totals.shippingStatus === "pending" ? (
                    <div className="flex justify-between text-[13px] text-perce-ink-secondary">
                      <span>Shipping</span>
                      <span>Calculated at checkout</span>
                    </div>
                  ) : totals.shipping != null && totals.shipping > 0 ? (
                    <div className="flex justify-between text-[13px] text-perce-ink-secondary">
                      <span>Shipping</span>
                      <span>
                        {formatMoney(totals.shipping, { currency })}
                      </span>
                    </div>
                  ) : null}
                  <div className="pt-3 border-t border-perce-line flex justify-between text-[15px] font-semibold text-perce-ink">
                    <span>Total</span>
                    <span>{formatMoney(totals.grandTotal, { currency })}</span>
                  </div>
                </div>

                {/* Checkout button — visible on desktop always, hidden on mobile (mobile uses sticky bar) */}
                <button
                  type="button"
                  onClick={onProceedToCheckout}
                  disabled={isUpdating || lineCount === 0}
                  className="mt-6 w-full py-4 rounded-md bg-perce-cta text-perce-ink-inverse text-sm font-medium hover:bg-perce-cta-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed hidden sm:block">
                  {isUpdating ? "Updating…" : "Proceed to Checkout"}
                </button>

                <a
                  href="/shop"
                  className="mt-3 w-full hidden sm:flex items-center justify-center py-3 text-[12px] text-perce-ink-muted hover:text-perce-ink transition-colors">
                  ← Continue Shopping
                </a>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* ── Mobile sticky checkout bar ─────────────────────────────────────── */}
      {/* `fixed inset-x-0` with no `bottom` left this bar at its static
          position — a "sticky" checkout CTA that scrolled away with the page,
          while pb-60 above reserved empty space for a bar that was not there.
          It also has to sit ABOVE the fixed mobile bottom nav (h-16 + safe
          area, z-index --perce-z-bottom-nav) rather than behind it. */}
      <div
        style={{
          bottom: "calc(4rem + env(safe-area-inset-bottom))",
          zIndex: "var(--perce-z-sticky)",
        }}
        className="fixed inset-x-0 border-t border-perce-line bg-perce-bg shadow-[0_-4px_16px_rgba(36,29,25,0.08)] sm:hidden">
        <AppliedOffersSavings
          appliedOffers={appliedOffers}
          promoDiscount={totals.discount ?? 0}
          currency={currency}
          variant="sticky-banner"
        />
        <div className="px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12px] text-perce-ink-muted">Total</span>
            <div className="text-right">
              {totalSavings > 0 && (
                <p className="text-[10px] font-medium text-perce-success">
                  Saving {formatMoney(totalSavings, { currency })}
                </p>
              )}
              <span className="text-[15px] font-semibold text-perce-ink">
                {formatMoney(totals.grandTotal, { currency })}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onProceedToCheckout}
            disabled={isUpdating || lineCount === 0}
            className="flex w-full items-center justify-center gap-2 py-3.5 rounded-md bg-perce-cta text-perce-ink-inverse text-sm font-medium hover:bg-perce-cta-hover active:bg-perce-cta-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            {isUpdating ? "Updating…" : "Proceed to Checkout"}
            <ArrowRight className="h-4 w-4" />
          </button>
        <a
          href="/shop"
          className="mt-2 w-full flex items-center justify-center py-2 text-[11px] text-perce-ink-muted hover:text-perce-ink transition-colors">
          ← Continue Shopping
        </a>
        </div>
      </div>
    </>
  );
}
