import React from "react";
import type { CartShippingStatus } from "#root/shared/shipping/checkout-shipping";
import { OfferProgressBanner } from "./OfferProgressBanner";
import { CartBundleGroup, type CartPageBundleGroup } from "./CartBundleGroup";
import {
  AppliedOffersSavings,
  computeOfferSavingsTotal,
} from "./AppliedOffersSavings";
import { Button } from "#root/components/ui/button";
import { Input } from "#root/components/ui/input";
import {
  Trash2,
  Plus,
  Minus,
  ShoppingCart,
  ArrowRight,
  ArrowLeft,
} from "lucide-react";
import { useMinimalI18n } from "#root/lib/i18n/MinimalI18nContext";
import { formatItemCount } from "#root/lib/i18n/item-count";
import { cartUnitCount } from "#root/shared/bundles/cart-instance";
import { useCouponFeedback } from "#root/components/template-system/useCouponFeedback";
import { BOTTOM_NAV_CLEARANCE } from "#root/components/template-system/minimal/bottom-nav";

/** `bottom` of the mobile sticky checkout bar: on top of the bottom nav. */
const CART_STICKY_BAR_BOTTOM = BOTTOM_NAV_CLEARANCE;

/**
 * A cart line's image or name, linked to its product page. A plain <a>, so
 * Vike routes it client-side and Back returns to the cart (which lives in
 * localStorage, so nothing about it changes on the way). Without an href it
 * renders the content unlinked, as before.
 */
function LineLink({
  href,
  className,
  tabIndex,
  children,
}: {
  href?: string;
  className?: string;
  /** -1 on the image: it duplicates the name's link, so it stays out of the tab order. */
  tabIndex?: number;
  children: React.ReactNode;
}) {
  if (!href) return <span className={className}>{children}</span>;
  return (
    <a href={href} className={className} tabIndex={tabIndex}>
      {children}
    </a>
  );
}

/**
 * Shown until the saved cart has been read (CartContext `isHydrated`). It
 * holds the populated cart's geometry — same page frame, heading, one line,
 * promo row and summary card — so the real lines replace it in place rather
 * than replacing a centred "Your cart is empty" and shoving the page down.
 * States nothing about the cart's contents.
 */
function CartPageModernSkeleton({ title, label }: { title: string; label: string }) {
  const bar = "animate-pulse rounded bg-muted";
  return (
    <div aria-busy='true' data-testid='cart-loading' className='min-h-screen bg-background pb-24 sm:pb-0'>
      <output className='sr-only'>{label}</output>
      <div className='max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-12'>
        <h1 className='text-2xl sm:text-3xl font-extrabold uppercase tracking-tight mb-6'>
          {title}
          <span aria-hidden className={`ms-3 inline-block h-4 w-16 align-middle ${bar}`} />
        </h1>
        <div className='lg:grid lg:grid-cols-[1fr_380px] lg:gap-12' aria-hidden>
          <div>
            <div className='hidden sm:block pb-4 border-b'>
              <div className={`h-4 w-40 ${bar}`} />
            </div>
            <div className='py-6 flex gap-4'>
              <div className={`w-20 h-20 shrink-0 rounded-lg ${bar}`} />
              <div className='flex-1 space-y-2.5'>
                <div className={`h-4 w-3/4 ${bar}`} />
                <div className={`h-3 w-1/3 ${bar}`} />
                <div className={`mt-3 h-9 w-28 ${bar}`} />
              </div>
            </div>
            <div className='mt-6 pt-6 border-t'>
              <div className={`h-9 w-full ${bar}`} />
            </div>
          </div>
          <div className='mt-8 lg:mt-0'>
            <div className='border rounded-2xl p-6 space-y-5'>
              <div className={`h-5 w-36 ${bar}`} />
              <div className='space-y-3'>
                <div className={`h-4 w-full ${bar}`} />
                <div className={`h-4 w-full ${bar}`} />
              </div>
              <div className='border-t pt-4'>
                <div className={`h-6 w-full ${bar}`} />
              </div>
              <div className={`h-10 w-full ${bar}`} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Cart item interface
 */
export interface CartPageCartItem {
  id: string;
  /** The line's product page. Image and name link to it when present. */
  href?: string;
  name: string;
  price: number;
  /** Original price before discount — present only when the item was discounted */
  originalPrice?: number | null;
  /** How many units of this line an offer made free (e.g. "Buy 2 Get 1") */
  freeQuantity?: number;
  quantity: number;
  imageUrl?: string | null;
  variant?: string | null;
  stock?: number | null;
  available: boolean;
}

/**
 * Cart totals interface
 */
export interface CartPageTotals {
  /** Ordinary lines + bundle children at regular prices. */
  subtotal: number;
  discount?: number;
  shipping?: number;
  /**
   * "pending" — the fee depends on a governorate the shopper has not chosen
   * yet (zone shipping); the line reads "Calculated at checkout" and
   * `grandTotal` is the goods total. "quoted" — `shipping` is exact.
   * "waived" — no quote yet, but a free-shipping set / code / offer already
   * in the cart waives every destination: `shipping` is 0 ("Free").
   * Absent = legacy caller; treated as "quoted".
   */
  shippingStatus?: CartShippingStatus;
  grandTotal: number;
  /** Σ (regular value − fixed price) over the bundle instances in the cart. */
  bundleSavings?: number;
  appliedOffers?: Array<{
    name: string;
    discountAmount: number;
    freeShipping: boolean;
  }>;
}

/**
 * Props for CartPageModernTemplate
 */
export interface CartPageModernTemplateProps {
  items: CartPageCartItem[];
  /** Completed Build Your Stack instances, rendered as grouped units. */
  bundles?: CartPageBundleGroup[];
  onRemoveBundle?: (instanceId: string) => void;
  totals: CartPageTotals;
  isLoading?: boolean;
  isUpdating?: boolean;
  currency?: string;
  onQuantityChange?: (id: string, quantity: number) => void;
  onRemoveItem?: (id: string) => void;
  /**
   * Applies a promo code. Resolves with whether it worked and a message that
   * is always safe to show the shopper (the specific rejection reason on
   * failure, a confirmation of the discount on success).
   */
  onApplyCoupon?: (
    code: string,
  ) => void | Promise<{ success: boolean; message: string }>;
  onProceedToCheckout?: () => void;
  /** Currently applied promo code, if any. */
  appliedCoupon?: { code: string; discountLabel?: string } | null;
  onRemoveCoupon?: () => void;
  /** Message about a code that stopped being valid on its own. */
  couponNotice?: string | null;
  onDismissCouponNotice?: () => void;
}

/**
 * CartPageModernTemplate Component
 *
 * Modern cart page layout with item management and checkout flow
 */
export function CartPageModernTemplate({
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
  // Cleared automatically when CartContext drops the code (see the hook).
  const [couponFeedback, setCouponFeedback] = useCouponFeedback(appliedCoupon?.code, couponNotice);
  const { t, locale } = useMinimalI18n();

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
    return <CartPageModernSkeleton title={t("cart.title") || "Shopping Cart"} label={t("cart.loading")} />;
  }

  if (items.length === 0 && bundles.length === 0) {
    return (
      <div className='min-h-[60vh] flex flex-col items-center justify-center gap-4 px-4 text-center'>
        <ShoppingCart className='w-14 h-14 text-muted-foreground/40' />
        <h2 className='text-2xl font-bold'>{t("cart.empty")}</h2>
        <p className='text-muted-foreground'>{t("cart.empty_cta")}</p>
        <Button
          onClick={() => (window.location.href = "/shop")}
          className='mt-2'>
          {t("cart.continue_shopping")}
        </Button>
      </div>
    );
  }

  const totalSavings = computeOfferSavingsTotal(
    totals.appliedOffers,
    totals.discount ?? 0,
  );

  const cartSubtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const cartQuantity = items.reduce((s, i) => s + i.quantity, 0);
  const appliedOffers = totals.appliedOffers ?? [];

  return (
    <>
    <div className='min-h-screen bg-background pb-24 sm:pb-0'>
      <div className='max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-12'>

        {/* ── Page heading ───────────────────────────────── */}
        <h1 className='text-2xl sm:text-3xl font-extrabold uppercase tracking-tight mb-6'>
          {t("cart.title") || "Shopping Cart"}
          <span className='ms-3 text-sm font-semibold tracking-widest text-muted-foreground uppercase'>
            ({formatItemCount(cartUnitCount(items, bundles), locale, t)})
          </span>
        </h1>

        {/* Offer progress banner */}
        {/* <OfferProgressBanner
          cartSubtotal={cartSubtotal}
          cartQuantity={cartQuantity}
          appliedOffers={appliedOffers}
          currency={currency}
        /> */}

        <div className='lg:grid lg:grid-cols-[1fr_380px] lg:gap-12'>
          {/* ── Items list ─────────────────────────────────── */}
          <div>
            {/* Column headers — desktop */}
            <div className='hidden sm:grid grid-cols-[1fr_160px_110px_40px] gap-4 pb-4 border-b text-xs font-semibold uppercase tracking-widest text-muted-foreground'>
              <span>{t("cart.product") || "Product"}</span>
              <span className='text-center'>
                {t("cart.quantity") || "Quantity"}
              </span>
              <span className='text-right'>{t("cart.total") || "Total"}</span>
              <span />
            </div>

            {/* Items */}
            <div className='divide-y'>
              {bundles.map((bundle) => (
                <CartBundleGroup
                  key={bundle.instanceId}
                  bundle={bundle}
                  currency={currency}
                  onRemove={onRemoveBundle}
                  disabled={isUpdating}
                />
              ))}
              {items.map((item) => (
                <div
                  key={item.id}
                  className={`py-6 transition-opacity ${isUpdating ? "opacity-50 pointer-events-none" : ""}`}>
                  {/* Mobile */}
                  <div className='flex gap-4 sm:hidden'>
                    <LineLink
                      href={item.href}
                      tabIndex={-1}
                      className='block w-20 h-20 shrink-0 bg-muted rounded-lg overflow-hidden border'>
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt={item.name}
                          className='w-full h-full object-cover'
                        />
                      ) : (
                        <div className='w-full h-full flex items-center justify-center'>
                          <ShoppingCart className='w-5 h-5 text-muted-foreground/30' />
                        </div>
                      )}
                    </LineLink>
                    <div className='flex-1 min-w-0'>
                      <div className='flex items-start justify-between gap-2'>
                        <div className='min-w-0'>
                          <p className='font-semibold text-sm leading-snug'>
                            <LineLink href={item.href} className='hover:underline underline-offset-2'>
                              {item.name}
                            </LineLink>
                          </p>
                          {item.variant && (
                            <p className='text-xs text-muted-foreground mt-0.5'>
                              {item.variant}
                            </p>
                          )}
                          <div className='flex items-center gap-1.5 mt-1 flex-wrap'>
                            {item.originalPrice != null && item.originalPrice > item.price && (
                              <span className='text-xs text-muted-foreground line-through'>
                                {currency}{item.originalPrice.toFixed(2)}
                              </span>
                            )}
                            {/* Per-unit price is only shown when it isn't already
                                identical to the line total below (qty > 1) —
                                otherwise it just repeats the same number. */}
                            {item.quantity > 1 && (
                              <span className={`text-sm ${item.originalPrice != null && item.originalPrice > item.price ? "text-red-500 font-semibold" : "text-muted-foreground"}`}>
                                {currency}{item.price.toFixed(2)}
                              </span>
                            )}
                            {item.originalPrice != null && item.originalPrice > item.price && (
                              <span className='text-[10px] bg-red-100 text-red-600 font-semibold px-1.5 py-0.5 rounded'>
                                -{Math.round((1 - item.price / item.originalPrice) * 100)}%
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          type='button'
                          onClick={() => onRemoveItem?.(item.id)}
                          disabled={isUpdating}
                          aria-label='Remove item'
                          className='shrink-0 p-1.5 rounded-md text-muted-foreground hover:text-destructive transition-colors'>
                          <Trash2 className='w-4 h-4' />
                        </button>
                      </div>
                      {/* Quantity and line total stack vertically on phone —
                          side by side overflowed the card at narrow widths. */}
                      <div className='flex flex-col gap-2 mt-3'>
                        <div className='inline-flex items-center border rounded-lg self-start'>
                          <button
                            type='button'
                            onClick={() =>
                              onQuantityChange?.(
                                item.id,
                                Math.max(1, item.quantity - 1),
                              )
                            }
                            disabled={isUpdating || item.quantity <= 1}
                            aria-label='Decrease quantity'
                            className='w-9 h-9 flex items-center justify-center hover:bg-muted transition-colors rounded-l-lg disabled:opacity-40'>
                            <Minus className='w-3.5 h-3.5' />
                          </button>
                          <span className='w-10 text-center text-sm font-semibold'>
                            {item.quantity}
                          </span>
                          <button
                            type='button'
                            onClick={() =>
                              onQuantityChange?.(item.id, item.quantity + 1)
                            }
                            disabled={
                              isUpdating ||
                              (item.stock != null &&
                                item.quantity >= item.stock)
                            }
                            aria-label='Increase quantity'
                            className='w-9 h-9 flex items-center justify-center hover:bg-muted transition-colors rounded-r-lg disabled:opacity-40'>
                            <Plus className='w-3.5 h-3.5' />
                          </button>
                        </div>
                        <div className='flex items-center justify-between'>
                          <span className='text-xs text-muted-foreground'>
                            {t("cart.total") || "Total"}
                          </span>
                          {item.freeQuantity && item.freeQuantity >= item.quantity ? (
                            <p className='font-bold text-emerald-600 uppercase tracking-wide'>
                              {t("cart.free") || "Free"}
                            </p>
                          ) : item.freeQuantity && item.freeQuantity > 0 ? (
                            <p className='font-bold'>
                              {currency}{(item.price * (item.quantity - item.freeQuantity)).toFixed(2)}
                              <span className='ms-1 text-[10px] text-emerald-600 font-semibold'>
                                ({item.freeQuantity} {t("cart.free") || "free"})
                              </span>
                            </p>
                          ) : (
                            <p className='font-bold'>
                              {currency}{(item.price * item.quantity).toFixed(2)}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Desktop */}
                  <div className='hidden sm:grid grid-cols-[1fr_160px_110px_40px] gap-4 items-center'>
                    {/* Product info */}
                    <div className='flex items-center gap-4'>
                      <LineLink
                        href={item.href}
                        tabIndex={-1}
                        className='block w-20 h-20 shrink-0 bg-muted rounded-xl overflow-hidden border'>
                        {item.imageUrl ? (
                          <img
                            src={item.imageUrl}
                            alt={item.name}
                            className='w-full h-full object-cover'
                          />
                        ) : (
                          <div className='w-full h-full flex items-center justify-center'>
                            <ShoppingCart className='w-5 h-5 text-muted-foreground/30' />
                          </div>
                        )}
                      </LineLink>
                      <div className='min-w-0'>
                        <p className='font-semibold'>
                          <LineLink href={item.href} className='hover:underline underline-offset-2'>
                            {item.name}
                          </LineLink>
                        </p>
                        {item.variant && (
                          <p className='text-xs text-muted-foreground mt-0.5'>
                            {item.variant}
                          </p>
                        )}
                        <div className='flex items-center gap-1.5 mt-1 flex-wrap'>
                          {item.originalPrice != null && item.originalPrice > item.price && (
                            <span className='text-xs text-muted-foreground line-through'>
                              {currency}{item.originalPrice.toFixed(2)}
                            </span>
                          )}
                          <span className={`text-sm ${item.originalPrice != null && item.originalPrice > item.price ? "text-red-500 font-semibold" : "text-muted-foreground"}`}>
                            {currency}{item.price.toFixed(2)} {t("checkout.each") || "each"}
                          </span>
                          {item.originalPrice != null && item.originalPrice > item.price && (
                            <span className='text-[10px] bg-red-100 text-red-600 font-semibold px-1.5 py-0.5 rounded'>
                              -{Math.round((1 - item.price / item.originalPrice) * 100)}%
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Quantity stepper */}
                    <div className='flex justify-center'>
                      <div className='inline-flex items-center border rounded-lg'>
                        <button
                          type='button'
                          onClick={() =>
                            onQuantityChange?.(
                              item.id,
                              Math.max(1, item.quantity - 1),
                            )
                          }
                          disabled={isUpdating || item.quantity <= 1}
                          aria-label='Decrease quantity'
                          className='w-9 h-9 flex items-center justify-center hover:bg-muted transition-colors rounded-l-lg disabled:opacity-40'>
                          <Minus className='w-3.5 h-3.5' />
                        </button>
                        <span className='w-10 text-center text-sm font-semibold'>
                          {item.quantity}
                        </span>
                        <button
                          type='button'
                          onClick={() =>
                            onQuantityChange?.(item.id, item.quantity + 1)
                          }
                          disabled={
                            isUpdating ||
                            (item.stock != null && item.quantity >= item.stock)
                          }
                          aria-label='Increase quantity'
                          className='w-9 h-9 flex items-center justify-center hover:bg-muted transition-colors rounded-r-lg disabled:opacity-40'>
                          <Plus className='w-3.5 h-3.5' />
                        </button>
                      </div>
                    </div>

                    {/* Line total */}
                    <div className='text-right'>
                      {item.freeQuantity && item.freeQuantity > 0 ? (
                        <>
                          <p className='text-xs text-muted-foreground line-through'>
                            {currency}{(item.price * item.quantity).toFixed(2)}
                          </p>
                          {item.freeQuantity >= item.quantity ? (
                            <p className='font-bold text-emerald-600 uppercase tracking-wide'>
                              {t("cart.free") || "Free"}
                            </p>
                          ) : (
                            <>
                              <p className='font-bold'>
                                {currency}{(item.price * (item.quantity - item.freeQuantity)).toFixed(2)}
                              </p>
                              <p className='text-[10px] text-emerald-600 font-semibold'>
                                {item.freeQuantity} {t("cart.free") || "free"}
                              </p>
                            </>
                          )}
                        </>
                      ) : (
                        <>
                          {item.originalPrice != null && item.originalPrice > item.price && (
                            <p className='text-xs text-muted-foreground line-through'>
                              {currency}{(item.originalPrice * item.quantity).toFixed(2)}
                            </p>
                          )}
                          <p className={`font-bold ${item.originalPrice != null && item.originalPrice > item.price ? "text-red-500" : ""}`}>
                            {currency}{(item.price * item.quantity).toFixed(2)}
                          </p>
                        </>
                      )}
                    </div>

                    {/* Remove */}
                    <button
                      type='button'
                      onClick={() => onRemoveItem?.(item.id)}
                      disabled={isUpdating}
                      aria-label='Remove item'
                      className='justify-self-end p-1.5 rounded-md text-muted-foreground hover:text-destructive transition-colors'>
                      <Trash2 className='w-4 h-4' />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* ── Coupon code ──────────────────────────────── */}
            <div className='mt-6 pt-6 border-t'>
              <div className='flex flex-col sm:flex-row items-start sm:items-center gap-4'>
                <p className='text-sm font-semibold shrink-0'>
                  Apply promo code
                </p>
                <div className='flex gap-2 flex-1 w-full sm:w-auto items-center'>
                  <Input
                    placeholder={t("cart.enter_code") || "Enter coupon code"}
                    value={couponCode}
                    onChange={(e) => {
                      setCouponCode(e.target.value);
                      if (couponFeedback) setCouponFeedback(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleApplyCoupon();
                    }}
                    disabled={isUpdating || isApplyingCoupon}
                    aria-invalid={couponFeedback?.success === false}
                    aria-describedby='promo-code-feedback'
                    className={`flex-1 text-sm ${
                      couponFeedback && !couponFeedback.success
                        ? "border-red-300 focus-visible:ring-red-300"
                        : ""
                    }`}
                  />
                  <Button
                    variant='primary'
                    onClick={handleApplyCoupon}
                    disabled={isUpdating || isApplyingCoupon || !couponCode.trim()}
                    className='shrink-0 font-bold tracking-wide'>
                    {isApplyingCoupon
                      ? t("cart.checking") || "Checking…"
                      : t("cart.apply") || "Apply"}
                  </Button>
                </div>
              </div>

              <div id='promo-code-feedback' aria-live='polite'>
                {/* A code that stopped being valid on its own (cart edited,
                    code expired between visits, etc.) */}
                {couponNotice && (
                  <p className='text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-md px-3 py-2 mt-3'>
                    {couponNotice}
                  </p>
                )}

                {couponFeedback && (
                  <p
                    className={`text-xs mt-2 ${
                      couponFeedback.success ? "text-green-600" : "text-red-600"
                    }`}>
                    {couponFeedback.message}
                  </p>
                )}
              </div>

              {/* Currently applied code, with a way to remove it */}
              {appliedCoupon && (
                <div className='flex items-center justify-between gap-3 mt-3 px-3 py-2 rounded-md bg-green-50 border border-green-100'>
                  <p className='text-xs text-green-700 min-w-0'>
                    <span className='font-semibold'>{appliedCoupon.code}</span>
                    {appliedCoupon.discountLabel
                      ? ` — ${appliedCoupon.discountLabel}`
                      : ""}
                    {totals.discount != null && totals.discount > 0
                      ? ` · saving ${currency}${totals.discount.toFixed(2)}`
                      : ""}
                  </p>
                  {onRemoveCoupon && (
                    <button
                      type='button'
                      onClick={handleRemoveCoupon}
                      className='text-[11px] font-medium uppercase tracking-wide text-green-700 hover:text-green-900 underline shrink-0'>
                      Remove
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Trust badges removed entirely — "100% Authentic Products",
                "Secure Payments", "Fast & Reliable Delivery" and "Easy
                Returns" were four claims the business has not made. The empty
                grid went with them rather than leaving a bordered blank row. */}
          </div>

          {/* ── Order Summary ──────────────────────────────── */}
          <div className='mt-8 lg:mt-0 lg:sticky lg:top-6 lg:self-start'>
            <div className='border rounded-2xl bg-card p-6 space-y-5'>
              <h2 className='font-extrabold text-base uppercase tracking-widest'>
                {t("cart.order_summary") || "Order Summary"}
              </h2>

              <div className='space-y-3 text-sm'>
                {/* Subtotal */}
                <div className='flex justify-between'>
                  <span className='text-muted-foreground'>
                    {t("cart.subtotal") || "Subtotal"}
                  </span>
                  <span className='font-semibold'>
                    {currency}
                    {totals.subtotal.toFixed(2)}
                  </span>
                </div>

                {totals.bundleSavings !== undefined && totals.bundleSavings > 0 && (
                  <div className='flex justify-between text-red-600'>
                    <span className='font-medium'>Stack savings</span>
                    <span className='font-semibold'>
                      -{currency}
                      {totals.bundleSavings.toFixed(2)}
                    </span>
                  </div>
                )}

                {/* Promo code discount */}
                {totals.discount !== undefined && totals.discount > 0 && (
                  <div className='flex justify-between text-red-600'>
                    <span className='font-medium'>
                      {t("cart.discount") || "Discount"}
                    </span>
                    <span className='font-semibold'>
                      -{currency}
                      {totals.discount.toFixed(2)}
                    </span>
                  </div>
                )}

                <AppliedOffersSavings
                  appliedOffers={appliedOffers}
                  currency={currency}
                />

                {/* Shipping */}
                {totals.shippingStatus === "pending" ? (
                  <div className='flex justify-between' data-testid='shipping-line'>
                    <span className='text-muted-foreground'>
                      {t("cart.shipping") || "Shipping"}
                    </span>
                    <span className='text-muted-foreground'>
                      {t("cart.shipping_calculated_at_checkout") || "Calculated at checkout"}
                    </span>
                  </div>
                ) : totals.shipping !== undefined ? (
                  <div className='flex justify-between' data-testid='shipping-line'>
                    <span className='text-muted-foreground'>
                      {t("cart.shipping") || "Shipping"}
                    </span>
                    <span className='font-semibold'>
                      {totals.shipping === 0
                        ? t("cart.free") || "Free"
                        : `${currency}${totals.shipping.toFixed(2)}`}
                    </span>
                  </div>
                ) : null}
              </div>

              {/* Total */}
              <div className='border-t pt-4 flex justify-between items-center font-extrabold text-lg'>
                <span className='uppercase tracking-wide'>
                  {t("cart.total") || "Total"}
                </span>
                <span>
                  {currency}
                  {totals.grandTotal.toFixed(2)}
                </span>
              </div>

              {/* Trust signals removed. "Fast Delivery" and "Easy Returns"
                  were asserted as fact directly above the checkout button —
                  Percé has set no delivery time and published no returns
                  policy, so both were promises the business had not made.
                  "Secure Checkout" went with them: this store is COD-only
                  until a gateway is configured, and there is nothing for a
                  padlock to be securing.

                  This template is not the Percé production cart (see
                  PERCE_TEMPLATE_PRESET in shared/config/storefront.ts) but it
                  remains selectable from Dashboard > Templates, so it must
                  not carry claims either. */}

              {/* Proceed button — hidden on mobile (sticky bar handles it) */}
              <Button
                className='w-full font-bold tracking-wide uppercase hidden sm:flex'
                size='lg'
                onClick={onProceedToCheckout}
                disabled={isUpdating || (items.length === 0 && bundles.length === 0)}>
                {t("cart.proceed_to_checkout") || "Proceed to Checkout"}
                <ArrowRight className='w-4 h-4 ms-2' />
              </Button>

              {/* Divider */}
              <div className='hidden sm:flex items-center gap-3 text-xs text-muted-foreground'>
                <div className='flex-1 border-t' />
                <span>or</span>
                <div className='flex-1 border-t' />
              </div>

              {/* Continue shopping */}
              <Button
                variant='outline'
                className='w-full font-semibold'
                onClick={() => (window.location.href = "/shop")}>
                <ArrowLeft className='w-4 h-4 me-2' />
                {t("cart.continue_shopping") || "Continue Shopping"}
              </Button>

              {/* Payment logos removed.
                  This read "We accept" followed by Visa, Mastercard, Meeza
                  and Apple Pay marks. None of them is accepted: no payment
                  gateway is configured, the only method `payment.methods`
                  returns is Cash on Delivery, and Apple Pay has no code path
                  in this repo at all. It sat in the cart summary, one click
                  before checkout, telling a shopper they could pay by card.

                  If a gateway is enabled later, the accepted methods are
                  already listed on the checkout page from the server's own
                  response — they must never be hardcoded here. */}
            </div>
          </div>
        </div>


      </div>
    </div>

    {/* ── Mobile sticky checkout bar ─────────────────────────────────────────
        Rests on top of the fixed mobile bottom nav. It used to sit at
        `bottom-15` (60px) under a 64px nav painted above it, so the nav
        covered the bottom of the bar. Same offset rule as the PDP's sticky
        Add to bag (see CART_STICKY_BAR_BOTTOM). */}
    <div
      data-testid='cart-sticky-checkout'
      style={{ bottom: CART_STICKY_BAR_BOTTOM }}
      className='sm:hidden fixed inset-x-0 z-40 bg-white border-t border-gray-200 shadow-[0_-4px_20px_rgba(0,0,0,0.10)]'>
      <AppliedOffersSavings
        appliedOffers={appliedOffers}
        promoDiscount={totals.discount ?? 0}
        currency={currency}
        variant='sticky-banner'
      />
      <div className='px-4 py-3'>
        <div className='flex items-center justify-between mb-2.5'>
          <span className='text-xs text-muted-foreground uppercase tracking-widest font-semibold'>Total</span>
          <div className='text-right'>
            {totalSavings > 0 && (
              <p className='text-[10px] text-emerald-600 font-medium'>Saving {currency}{totalSavings.toFixed(2)}</p>
            )}
            <p className='text-base font-extrabold'>{currency}{totals.grandTotal.toFixed(2)}</p>
          </div>
        </div>
        <Button
          className='w-full font-bold tracking-wide text-xs uppercase'
          size='lg'
          onClick={onProceedToCheckout}
          disabled={isUpdating || (items.length === 0 && bundles.length === 0)}>
          {t("cart.proceed_to_checkout") || "Proceed to Checkout"}
          <ArrowRight className='w-4 h-4 ms-2' />
        </Button>
      </div>
    </div>
    </>
  );
}
