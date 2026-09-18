import React from "react";
import { Trash2, Plus, Minus, ShoppingCart, ArrowRight } from "lucide-react";
import type { CartPageModernTemplateProps } from "./CartPageModernTemplate";
import { OfferProgressBanner } from "./OfferProgressBanner";
import { CartBundleGroup } from "./CartBundleGroup";
import {
  AppliedOffersSavings,
  computeOfferSavingsTotal,
} from "./AppliedOffersSavings";

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
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-zeli-line-strong border-t-zeli-ink" />
      </div>
    );
  }

  if (items.length === 0 && bundles.length === 0) {
    return (
      <div className="zeli-header-offset flex min-h-[60vh] flex-col items-center justify-center bg-zeli-bg px-4 text-center">
        <ShoppingCart aria-hidden className="mb-4 h-10 w-10 text-zeli-ink-subtle" />
        <h1 className="zeli-section-title">Your cart is empty</h1>
        <p className="mt-2 text-[length:var(--zeli-text-body)] text-zeli-ink-muted">
          Nothing added yet.
        </p>
        <a
          href="/shop"
          className="mt-6 inline-flex min-h-11 items-center gap-2 bg-zeli-accent px-6 text-[length:var(--zeli-text-small)] font-medium uppercase tracking-[var(--zeli-tracking-label)] text-zeli-ink-inverse transition-colors hover:bg-zeli-accent-hover">
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
      <div className="zeli-header-offset min-h-screen bg-zeli-bg pb-60 sm:pb-0">
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">

          {/* Page title */}
          <h1 className="text-[22px] sm:text-[28px] font-medium text-zeli-ink mb-4 sm:mb-6">
            Cart <span className="text-zeli-ink-muted font-normal text-[16px] sm:text-[18px]">({lineCount} {lineCount === 1 ? "item" : "items"})</span>
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
              <div className="hidden sm:grid grid-cols-[1fr_120px_100px_40px] gap-4 pb-3 border-b border-zeli-line text-[11px] uppercase tracking-wider text-zeli-ink-muted font-medium">
                <span>Product</span>
                <span className="text-center">Quantity</span>
                <span className="text-right">Price</span>
                <span />
              </div>

              {/* Items list — stacks first, as grouped units */}
              <div className="divide-y divide-zeli-line">
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
                        <div className="w-[88px] h-[88px] shrink-0 bg-zeli-surface overflow-hidden">
                          {item.imageUrl ? (
                            <img
                              src={item.imageUrl}
                              alt={item.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <ShoppingCart className="w-6 h-6 text-zeli-ink-subtle" />
                            </div>
                          )}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0 flex flex-col gap-1">
                          {/* Name row + delete */}
                          <div className="flex items-start gap-1">
                            <p
                              className="flex-1 text-[14px] font-medium leading-snug break-words overflow-hidden"
                              style={{ color: "var(--zeli-ink)", fontFamily: "var(--font-product-title)" }}>
                              {item.name}
                            </p>
                            <button
                              type="button"
                              onClick={() => onRemoveItem?.(item.id)}
                              aria-label="Remove item"
                              className="shrink-0 h-11 w-11 flex items-center justify-center text-zeli-ink-subtle hover:text-zeli-sale transition-colors -mr-1">
                              <Trash2 className="w-[15px] h-[15px]" />
                            </button>
                          </div>

                          {item.variant && (
                            <p className="text-[11px] text-zeli-ink-muted leading-none">{item.variant}</p>
                          )}

                          {/* Unit price */}
                          <div className="flex items-center gap-1.5">
                            {hasDiscount && (
                              <span className="text-[11px] text-zeli-ink-muted line-through">
                                {item.originalPrice!.toFixed(2)} {currency}
                              </span>
                            )}
                            <span className={`text-[12px] ${hasDiscount ? "text-zeli-sale font-medium" : "text-zeli-ink-muted"}`}>
                              {item.price.toFixed(2)} {currency} each
                            </span>
                            {hasDiscount && (
                              <span className="text-[10px] bg-zeli-blush-soft text-zeli-sale px-1.5 py-0.5 font-medium">
                                -{Math.round((1 - item.price / item.originalPrice!) * 100)}%
                              </span>
                            )}
                          </div>

                          {/* Qty + line total */}
                          <div className="flex flex-col items-center mt-auto pt-1">
                            <div className="flex  items-center border border-zeli-line w-fit">
                              <button
                                type="button"
                                onClick={() => onQuantityChange?.(item.id, Math.max(1, item.quantity - 1))}
                                aria-label="Decrease quantity"
                                className="h-11 w-11 flex items-center justify-center text-zeli-ink-secondary hover:bg-zeli-surface active:bg-zeli-surface transition-colors"
                                disabled={item.quantity <= 1}>
                                <Minus className="w-3 h-3" />
                              </button>
                              <span
                                className="w-8 text-center text-[13px] font-medium"
                                style={{ color: "var(--zeli-ink)", fontFamily: "var(--font-body)" }}>
                                {item.quantity}
                              </span>
                              <button
                                type="button"
                                onClick={() => onQuantityChange?.(item.id, item.quantity + 1)}
                                aria-label="Increase quantity"
                                className="h-11 w-11 flex items-center justify-center text-zeli-ink-secondary hover:bg-zeli-surface active:bg-zeli-surface transition-colors"
                                disabled={item.stock != null && item.quantity >= item.stock}>
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                            <div className="flex items-baseline gap-1.5 mt-1">
                              {freeQty > 0 ? (
                                <>
                                  <span className="text-[12px] text-zeli-ink-muted line-through">
                                    {lineTotal.toFixed(2)} {currency}
                                  </span>
                                  {isFullyFree ? (
                                    <p className="text-[15px] font-semibold text-zeli-success uppercase" style={{ fontFamily: "var(--font-price)" }}>
                                      Free
                                    </p>
                                  ) : (
                                    <p className="text-[15px] font-semibold" style={{ color: "var(--zeli-ink)", fontFamily: "var(--font-price)" }}>
                                      {(item.price * (item.quantity - freeQty)).toFixed(2)} {currency}
                                      <span className="ms-1 text-[10px] text-zeli-success font-semibold">
                                        ({freeQty} free)
                                      </span>
                                    </p>
                                  )}
                                </>
                              ) : (
                                <>
                                  {hasDiscount && (
                                    <span className="text-[12px] text-zeli-ink-muted line-through">
                                      {(item.originalPrice! * item.quantity).toFixed(2)} {currency}
                                    </span>
                                  )}
                                  <p
                                    className={`text-[15px] font-semibold ${hasDiscount ? "text-zeli-sale" : ""}`}
                                    style={{ color: hasDiscount ? undefined : "var(--zeli-ink)", fontFamily: "var(--font-price)" }}>
                                    {lineTotal.toFixed(2)} {currency}
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
                            <img src={item.imageUrl} alt={item.name} className="w-16 h-16 object-cover bg-zeli-surface shrink-0" />
                          ) : (
                            <div className="w-16 h-16 bg-zeli-surface shrink-0" />
                          )}
                          <div className="min-w-0">
                            <p
                              className="text-[14px] font-medium break-words"
                              style={{ color: "var(--zeli-ink)", fontFamily: "var(--font-product-title)" }}>
                              {item.name}
                            </p>
                            {item.variant && <p className="text-[12px] text-zeli-ink-muted mt-0.5">{item.variant}</p>}
                            <div className="flex items-center gap-1.5 mt-0.5">
                              {hasDiscount && (
                                <span className="text-[11px] text-zeli-ink-muted line-through">
                                  {item.originalPrice!.toFixed(2)} {currency}
                                </span>
                              )}
                              <span className={`text-[12px] ${hasDiscount ? "text-zeli-sale font-medium" : "text-zeli-ink-muted"}`}>
                                {item.price.toFixed(2)} {currency}
                              </span>
                              {hasDiscount && (
                                <span className="text-[10px] bg-zeli-blush-soft text-zeli-sale px-1.5 py-0.5 font-medium">
                                  -{Math.round((1 - item.price / item.originalPrice!) * 100)}%
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center justify-center border border-zeli-line w-fit mx-auto">
                          <button
                            type="button"
                            onClick={() => onQuantityChange?.(item.id, Math.max(1, item.quantity - 1))}
                            aria-label="Decrease quantity"
                            className="w-9 h-9 flex items-center justify-center text-zeli-ink-secondary hover:bg-zeli-surface transition-colors"
                            disabled={item.quantity <= 1}>
                            <Minus className="w-3 h-3" />
                          </button>
                          <span
                            className="w-8 text-center text-[13px] font-medium"
                            style={{ color: "var(--zeli-ink)", fontFamily: "var(--font-body)" }}>
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => onQuantityChange?.(item.id, item.quantity + 1)}
                            aria-label="Increase quantity"
                            className="w-9 h-9 flex items-center justify-center text-zeli-ink-secondary hover:bg-zeli-surface transition-colors"
                            disabled={item.stock != null && item.quantity >= item.stock}>
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                        <div className="text-right">
                          {freeQty > 0 ? (
                            <>
                              <p className="text-[11px] text-zeli-ink-muted line-through">
                                {lineTotal.toFixed(2)} {currency}
                              </p>
                              {isFullyFree ? (
                                <p className="text-[14px] font-semibold text-zeli-success uppercase" style={{ fontFamily: "var(--font-price)" }}>
                                  Free
                                </p>
                              ) : (
                                <p className="text-[14px] font-semibold" style={{ color: "var(--zeli-ink)", fontFamily: "var(--font-price)" }}>
                                  {(item.price * (item.quantity - freeQty)).toFixed(2)} {currency}
                                  <span className="ms-1 text-[10px] text-zeli-success font-semibold">
                                    ({freeQty} free)
                                  </span>
                                </p>
                              )}
                            </>
                          ) : (
                            <>
                              {hasDiscount && (
                                <p className="text-[11px] text-zeli-ink-muted line-through">
                                  {(item.originalPrice! * item.quantity).toFixed(2)} {currency}
                                </p>
                              )}
                              <p
                                className={`text-[14px] font-semibold ${hasDiscount ? "text-zeli-sale" : ""}`}
                                style={{ color: hasDiscount ? undefined : "var(--zeli-ink)", fontFamily: "var(--font-price)" }}>
                                {lineTotal.toFixed(2)} {currency}
                              </p>
                            </>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => onRemoveItem?.(item.id)}
                          aria-label="Remove item"
                          className="w-8 h-8 flex items-center justify-center text-zeli-ink-subtle hover:text-zeli-sale transition-colors justify-self-end">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                    </div>
                  );
                })}
              </div>

              {/* Promo code */}
              <div className="mt-6 lg:mt-8 pt-6 border-t border-zeli-line">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                  <p className="text-[13px] font-medium text-zeli-ink shrink-0">
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
                      className={`flex-1 px-4 py-2.5 rounded-md border text-[13px] text-zeli-ink placeholder-zeli-ink-subtle outline-none transition-colors bg-zeli-surface-raised min-w-0 disabled:opacity-60 ${
                        couponFeedback && !couponFeedback.success
                          ? "border-zeli-sale focus:border-zeli-sale"
                          : "border-zeli-line focus:border-zeli-ink"
                      }`}
                    />
                    <button
                      type="button"
                      onClick={handleApplyCoupon}
                      disabled={!couponCode.trim() || isApplyingCoupon}
                      className="px-5 py-2.5 rounded-md bg-zeli-accent text-zeli-ink-inverse text-[12px] font-medium uppercase tracking-wide hover:bg-zeli-accent-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0">
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
                          ? "text-zeli-success"
                          : "text-zeli-sale"
                      }`}>
                      {couponFeedback.message}
                    </p>
                  )}
                </div>

                {/* Currently applied code, with a way to take it off */}
                {appliedCoupon && (
                  <div className="flex items-center justify-between gap-3 mt-3 px-3 py-2 rounded-md bg-zeli-surface border border-zeli-line">
                    <p className="text-[12px] text-zeli-success min-w-0">
                      <span className="font-semibold">
                        {appliedCoupon.code}
                      </span>
                      {appliedCoupon.discountLabel
                        ? ` — ${appliedCoupon.discountLabel}`
                        : ""}
                      {totals.discount != null && totals.discount > 0
                        ? ` · saving ${totals.discount.toFixed(2)} ${currency}`
                        : ""}
                    </p>
                    {onRemoveCoupon && (
                      <button
                        type="button"
                        onClick={handleRemoveCoupon}
                        className="text-[11px] font-medium uppercase tracking-wide text-zeli-success hover:text-zeli-success underline shrink-0">
                        Remove
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* ── Right: Order Summary ────────────────────── */}
            <div className="mt-8 lg:mt-0">
              <div className="bg-zeli-surface p-6">
                <h2 className="text-[15px] font-semibold text-zeli-ink mb-5">Order Summary</h2>

                <div className="space-y-3">
                  <div className="flex justify-between text-[13px] text-zeli-ink-secondary">
                    <span>Subtotal</span>
                    <span>{totals.subtotal.toFixed(2)} {currency}</span>
                  </div>
                  {bundleSavings > 0 && (
                    <div className="flex justify-between text-[13px] text-zeli-success">
                      <span>Stack savings</span>
                      <span>−{bundleSavings.toFixed(2)} {currency}</span>
                    </div>
                  )}
                  {totals.discount != null && totals.discount > 0 && (
                    <div className="flex justify-between text-[13px] text-zeli-success">
                      <span>Discount</span>
                      <span>−{totals.discount.toFixed(2)} {currency}</span>
                    </div>
                  )}
                  <AppliedOffersSavings
                    appliedOffers={appliedOffers}
                    currency={currency}
                  />
                  {/* Shown only when the store has a shipping fee configured.
                      This used to read "Calculated at checkout" whenever the
                      fee was zero or unknown — but checkout applies the same
                      single flat fee from store_settings.shipping_fee and
                      calculates nothing, so the line promised a step that
                      does not exist. */}
                  {totals.shipping != null && totals.shipping > 0 && (
                    <div className="flex justify-between text-[13px] text-zeli-ink-secondary">
                      <span>Shipping</span>
                      <span>
                        {totals.shipping.toFixed(2)} {currency}
                      </span>
                    </div>
                  )}
                  <div className="pt-3 border-t border-zeli-line flex justify-between text-[15px] font-semibold text-zeli-ink">
                    <span>Total</span>
                    <span>{totals.grandTotal.toFixed(2)} {currency}</span>
                  </div>
                </div>

                {/* Checkout button — visible on desktop always, hidden on mobile (mobile uses sticky bar) */}
                <button
                  type="button"
                  onClick={onProceedToCheckout}
                  disabled={isUpdating || lineCount === 0}
                  className="mt-6 w-full py-4 rounded-md bg-zeli-accent text-zeli-ink-inverse text-[13px] font-medium uppercase tracking-wider hover:bg-zeli-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed hidden sm:block">
                  {isUpdating ? "Updating…" : "Proceed to Checkout"}
                </button>

                <a
                  href="/shop"
                  className="mt-3 w-full hidden sm:flex items-center justify-center py-3 text-[12px] text-zeli-ink-muted hover:text-zeli-ink transition-colors uppercase tracking-wide">
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
          area, z-index --zeli-z-bottom-nav) rather than behind it. */}
      <div
        style={{
          bottom: "calc(4rem + env(safe-area-inset-bottom))",
          zIndex: "var(--zeli-z-sticky)",
        }}
        className="fixed inset-x-0 border-t border-zeli-line bg-zeli-bg shadow-[0_-4px_16px_rgba(36,29,25,0.08)] sm:hidden">
        <AppliedOffersSavings
          appliedOffers={appliedOffers}
          promoDiscount={totals.discount ?? 0}
          currency={currency}
          variant="sticky-banner"
        />
        <div className="px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12px] text-zeli-ink-muted uppercase tracking-wide">Total</span>
            <div className="text-right">
              {totalSavings > 0 && (
                <p className="text-[10px] font-medium text-zeli-success">
                  Saving {totalSavings.toFixed(2)} {currency}
                </p>
              )}
              <span className="text-[15px] font-semibold text-zeli-ink">
                {totals.grandTotal.toFixed(2)} {currency}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onProceedToCheckout}
            disabled={isUpdating || lineCount === 0}
            className="flex w-full items-center justify-center gap-2 py-3.5 rounded-md bg-zeli-accent text-zeli-ink-inverse text-[13px] font-medium uppercase tracking-wider hover:bg-zeli-accent-hover active:bg-zeli-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            {isUpdating ? "Updating…" : "Proceed to Checkout"}
            <ArrowRight className="h-4 w-4" />
          </button>
        <a
          href="/shop"
          className="mt-2 w-full flex items-center justify-center py-2 text-[11px] text-zeli-ink-muted hover:text-zeli-ink transition-colors uppercase tracking-wide">
          ← Continue Shopping
        </a>
        </div>
      </div>
    </>
  );
}
