import React from "react";
import type { CartShippingStatus } from "#root/shared/shipping/checkout-shipping";
import { CartBundleGroup, type CartPageBundleGroup } from "./CartBundleGroup";
import {
  AppliedOffersSavings,
  computeOfferSavingsTotal,
} from "./AppliedOffersSavings";
import { Button, ButtonLink, buttonClass } from "#root/components/storefront/Button";
import { Input } from "#root/components/storefront/Field";
import { Stepper } from "#root/components/storefront/Stepper";
import { useMinimalI18n } from "#root/lib/i18n/MinimalI18nContext";
import { formatItemCount } from "#root/lib/i18n/item-count";
import { cartUnitCount } from "#root/shared/bundles/cart-instance";
import { formatMoney } from "#root/shared/pricing/format-money";
import { useCouponFeedback } from "#root/components/template-system/useCouponFeedback";
import {
  STICKY_BAR_BOTTOM,
  STICKY_BAR_PADDING_BOTTOM,
} from "#root/components/template-system/minimal/sticky-bar";

/** `bottom` of the mobile sticky checkout bar: the viewport edge (no bottom nav). */
const CART_STICKY_BAR_BOTTOM = STICKY_BAR_BOTTOM;
/** Its content clears the device's home indicator. */
const CART_STICKY_BAR_PADDING_BOTTOM = STICKY_BAR_PADDING_BOTTOM;

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
 * promo row and totals — so the real lines replace it in place rather than
 * replacing a "Your cart is empty" and shoving the page down. States nothing
 * about the cart's contents.
 */
function CartPageModernSkeleton({ title, label }: { title: string; label: string }) {
  const bar = "animate-pulse bg-surface-2";
  return (
    <div aria-busy='true' data-testid='cart-loading' className='min-h-screen bg-bg pb-48 lg:pb-0'>
      <output className='sr-only'>{label}</output>
      <div className='perce-container py-8 lg:py-12'>
        <h1 className='mb-6 t-h1 text-ink lg:mb-8'>
          {title}
          <span aria-hidden className={`ms-3 inline-block h-4 w-16 align-middle ${bar}`} />
        </h1>
        <div className='lg:grid lg:grid-cols-12 lg:gap-12' aria-hidden>
          <div className='lg:col-span-7'>
            <div className='grid grid-cols-[80px_1fr] gap-4 border-y border-line py-6'>
              <div className={`h-25 w-20 ${bar}`} />
              <div className='space-y-3'>
                <div className={`h-4 w-3/4 ${bar}`} />
                <div className={`h-3 w-1/3 ${bar}`} />
                <div className={`mt-4 h-9 w-28 ${bar}`} />
              </div>
            </div>
            <div className='py-6'>
              <div className={`h-12 w-full ${bar}`} />
            </div>
          </div>
          <div className='mt-4 lg:col-span-5 lg:mt-0'>
            <div className='space-y-4 border-t border-ink pt-4'>
              <div className={`h-5 w-36 ${bar}`} />
              <div className={`h-4 w-full ${bar}`} />
              <div className={`h-4 w-full ${bar}`} />
              <div className={`h-6 w-full ${bar}`} />
              <div className={`hidden h-13 w-full lg:block ${bar}`} />
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
 * CartPageModernTemplate — the Percé cart (template id `cart-modern`), in the
 * Object Index language.
 *
 * Lines on the left (7/12), totals on the right (5/12, sticky) from 1024px;
 * one column below. A line is an 80×100 photo, the title, the option, a
 * tabular price, a square stepper and a text "Remove". Sets render as one
 * indexed block (CartBundleGroup). Totals sit on hairlines. Below 1024px the
 * checkout action lives in a `surface` panel fixed to the bottom edge, its
 * content padded above the home indicator.
 *
 * Presentation only: quantities, removal, sets, promo codes, offers,
 * shipping and every total come from the cart page exactly as before.
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
  const money = (amount: number) =>
    formatMoney(amount, { locale, currency });

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
      <div className='perce-container flex min-h-[60vh] flex-col items-start justify-center gap-4 py-16'>
        <h1 className='t-h1 text-ink'>{t("cart.empty")}</h1>
        <p className='t-body text-ink-2'>{t("cart.empty_cta")}</p>
        <ButtonLink href='/shop' variant='primary' size='md' className='mt-4'>
          {t("cart.continue_shopping")}
        </ButtonLink>
      </div>
    );
  }

  const totalSavings = computeOfferSavingsTotal(
    totals.appliedOffers,
    totals.discount ?? 0,
  );

  const appliedOffers = totals.appliedOffers ?? [];
  const hasDiscount = (line: CartPageCartItem) =>
    line.originalPrice != null && line.originalPrice > line.price;
  const checkoutDisabled = isUpdating || (items.length === 0 && bundles.length === 0);
  const promoInvalid = couponFeedback?.success === false;

  return (
    <>
    <div className='min-h-screen bg-bg pb-48 lg:pb-0'>
      <div className='perce-container py-8 lg:py-12'>

        {/* ── Page heading ───────────────────────────────── */}
        <h1 className='mb-6 t-h1 text-ink lg:mb-8'>
          {t("cart.title") || "Shopping Cart"}
          <span className='ms-3 t-small tabular-nums text-ink-2'>
            ({formatItemCount(cartUnitCount(items, bundles), locale, t)})
          </span>
        </h1>

        <div className='lg:grid lg:grid-cols-12 lg:gap-12'>
          {/* ── Lines ─────────────────────────────────── */}
          <div className='lg:col-span-7'>
            <ul className='border-t border-line'>
              {bundles.map((bundle) => (
                <li key={bundle.instanceId} className='border-b border-line'>
                  <CartBundleGroup
                    bundle={bundle}
                    currency={currency}
                    onRemove={onRemoveBundle}
                    disabled={isUpdating}
                  />
                </li>
              ))}
              {items.map((item) => {
                const free = item.freeQuantity ?? 0;
                const paidUnits = Math.max(0, item.quantity - free);
                return (
                  <li
                    key={item.id}
                    className={`grid grid-cols-[80px_1fr] gap-4 border-b border-line py-6 transition-opacity ${isUpdating ? "pointer-events-none opacity-50" : ""}`}>
                    <LineLink
                      href={item.href}
                      tabIndex={-1}
                      className='block h-25 w-20 bg-surface-2'>
                      {item.imageUrl && (
                        <img
                          src={item.imageUrl}
                          alt={item.name}
                          className='h-full w-full object-cover'
                        />
                      )}
                    </LineLink>

                    <div className='flex min-w-0 flex-col'>
                      <div className='flex items-start justify-between gap-4'>
                        <div className='min-w-0'>
                          <p className='t-body text-ink'>
                            <LineLink href={item.href} className='hover:underline hover:decoration-1 hover:underline-offset-4'>
                              {item.name}
                            </LineLink>
                          </p>
                          {item.variant && (
                            <p className='mt-1 t-small text-ink-2'>{item.variant}</p>
                          )}
                          <p className='mt-1 flex flex-wrap gap-x-2 t-small tabular-nums text-ink-2'>
                            <span>
                              {money(item.price)} {t("checkout.each") || "each"}
                            </span>
                            {hasDiscount(item) && <s>{money(item.originalPrice as number)}</s>}
                          </p>
                        </div>

                        {/* Line total */}
                        <div className='shrink-0 text-end' style={{ fontFamily: "var(--font-price)" }}>
                          {free > 0 ? (
                            <>
                              <p className='t-small tabular-nums text-ink-2'>
                                <s>{money(item.price * item.quantity)}</s>
                              </p>
                              <p className='t-label tabular-nums text-ink'>
                                {free >= item.quantity ? t("cart.free") || "Free" : money(item.price * paidUnits)}
                              </p>
                              {free < item.quantity && (
                                <p className='t-micro text-ink-2'>
                                  {free} {t("cart.free") || "free"}
                                </p>
                              )}
                            </>
                          ) : (
                            <>
                              {hasDiscount(item) && (
                                <p className='t-small tabular-nums text-ink-2'>
                                  <s>{money((item.originalPrice as number) * item.quantity)}</s>
                                </p>
                              )}
                              <p className='t-label tabular-nums text-ink'>{money(item.price * item.quantity)}</p>
                            </>
                          )}
                        </div>
                      </div>

                      <div className='mt-auto flex items-center justify-between gap-4 pt-4'>
                        <Stepper
                          size='sm'
                          value={item.quantity}
                          onDecrement={() => onQuantityChange?.(item.id, Math.max(1, item.quantity - 1))}
                          onIncrement={() => onQuantityChange?.(item.id, item.quantity + 1)}
                          canDecrement={!isUpdating && item.quantity > 1}
                          canIncrement={!isUpdating && !(item.stock != null && item.quantity >= item.stock)}
                          label={(t("cart.quantity_for") || "Quantity, {name}").replace("{name}", item.name)}
                          decrementLabel={t("product.decrease")}
                          incrementLabel={t("product.increase")}
                        />
                        <button
                          type='button'
                          onClick={() => onRemoveItem?.(item.id)}
                          disabled={isUpdating}
                          aria-label={`${t("cart.remove") || "Remove"}: ${item.name}`}
                          className='inline-flex min-h-11 items-center t-small text-ink underline decoration-1 underline-offset-4 hover:text-ink-2 disabled:text-ink-3'>
                          {t("cart.remove") || "Remove"}
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            {/* ── Promo code ──────────────────────────────── */}
            <div className='py-6'>
              <label htmlFor='cart-promo-code' className='mb-2 block t-label text-ink'>
                {t("cart.promo_code") || "Promo code"}
              </label>
              <div className='flex gap-2'>
                <Input
                  id='cart-promo-code'
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
                  aria-invalid={promoInvalid || undefined}
                  aria-describedby='promo-code-feedback'
                  autoCapitalize='characters'
                  className='min-w-0 flex-1'
                />
                <Button
                  variant='secondary'
                  size='lg'
                  onClick={handleApplyCoupon}
                  disabled={isUpdating || isApplyingCoupon || !couponCode.trim()}
                  className='h-12 shrink-0'>
                  {isApplyingCoupon
                    ? t("cart.checking") || "Checking…"
                    : t("cart.apply") || "Apply"}
                </Button>
              </div>

              <div id='promo-code-feedback' aria-live='polite'>
                {/* A code that stopped being valid on its own (cart edited,
                    code expired between visits, etc.) */}
                {couponNotice && (
                  <p className='mt-3 border border-line px-3 py-2 t-small text-ink'>
                    {couponNotice}
                  </p>
                )}

                {couponFeedback && (
                  <p className={`mt-2 t-small ${couponFeedback.success ? "text-success" : "text-error"}`}>
                    {couponFeedback.message}
                  </p>
                )}
              </div>

              {/* Currently applied code, with a way to remove it */}
              {appliedCoupon && (
                <div className='mt-3 flex items-center justify-between gap-4 border border-line px-3'>
                  <p className='min-w-0 py-2 t-small text-ink'>
                    <span className='t-label'>{appliedCoupon.code}</span>
                    {appliedCoupon.discountLabel
                      ? ` — ${appliedCoupon.discountLabel}`
                      : ""}
                    {totals.discount != null && totals.discount > 0
                      ? ` · saving ${money(totals.discount)}`
                      : ""}
                  </p>
                  {onRemoveCoupon && (
                    <button
                      type='button'
                      onClick={handleRemoveCoupon}
                      className='inline-flex min-h-11 shrink-0 items-center t-small text-ink underline decoration-1 underline-offset-4 hover:text-ink-2'>
                      {t("cart.remove") || "Remove"}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ── Totals ──────────────────────────────── */}
          <div className='mt-4 lg:sticky lg:top-[calc(var(--perce-header-offset)+2rem)] lg:col-span-5 lg:mt-0 lg:self-start'>
            <div className='border-t border-ink pt-4'>
              <h2 className='t-h3 text-ink'>
                {t("cart.order_summary") || "Order Summary"}
              </h2>

              <dl className='mt-4 t-body'>
                <div className='flex justify-between border-b border-line py-3'>
                  <dt className='text-ink-2'>{t("cart.subtotal") || "Subtotal"}</dt>
                  <dd className='tabular-nums text-ink'>{money(totals.subtotal)}</dd>
                </div>

                {totals.bundleSavings !== undefined && totals.bundleSavings > 0 && (
                  <div className='flex justify-between border-b border-line py-3'>
                    <dt className='text-ink-2'>Set savings</dt>
                    <dd className='tabular-nums text-ink'>−{money(totals.bundleSavings)}</dd>
                  </div>
                )}

                {/* Promo code discount */}
                {totals.discount !== undefined && totals.discount > 0 && (
                  <div className='flex justify-between border-b border-line py-3'>
                    <dt className='text-ink-2'>{t("cart.discount") || "Discount"}</dt>
                    <dd className='tabular-nums text-ink'>−{money(totals.discount)}</dd>
                  </div>
                )}

                {appliedOffers.length > 0 && (
                  <div className='border-b border-line py-3'>
                    <AppliedOffersSavings appliedOffers={appliedOffers} currency={currency} />
                  </div>
                )}

                {/* Shipping */}
                {totals.shippingStatus === "pending" ? (
                  <div className='flex justify-between gap-4 border-b border-line py-3' data-testid='shipping-line'>
                    <dt className='text-ink-2'>{t("cart.shipping") || "Shipping"}</dt>
                    <dd className='text-end text-ink-2'>
                      {t("cart.shipping_calculated_at_checkout") || "Calculated at checkout"}
                    </dd>
                  </div>
                ) : totals.shipping !== undefined ? (
                  <div className='flex justify-between border-b border-line py-3' data-testid='shipping-line'>
                    <dt className='text-ink-2'>{t("cart.shipping") || "Shipping"}</dt>
                    <dd className='tabular-nums text-ink'>
                      {totals.shipping === 0 ? t("cart.free") || "Free" : money(totals.shipping)}
                    </dd>
                  </div>
                ) : null}

                {/* Total */}
                <div className='flex items-baseline justify-between py-4'>
                  <dt className='t-h3 text-ink'>{t("cart.total") || "Total"}</dt>
                  <dd className='t-h3 tabular-nums text-ink'>{money(totals.grandTotal)}</dd>
                </div>
              </dl>

              {/* No trust badges, payment logos or delivery promises: none of
                  them is a claim this store has made (see git history). */}

              {/* Checkout — from 1024px; the sticky panel carries it below. */}
              <Button
                variant='primary'
                size='lg'
                fullWidth
                className='hidden lg:inline-flex'
                onClick={onProceedToCheckout}
                disabled={checkoutDisabled}>
                {t("cart.proceed_to_checkout") || "Proceed to Checkout"}
              </Button>

              <a
                href='/shop'
                className={buttonClass({ variant: "text", size: "md", className: "mt-2" })}>
                {t("cart.continue_shopping") || "Continue Shopping"}
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>

    {/* ── Sticky checkout (below 1024px) ─────────────────────────────────────
        A `surface` panel on the viewport's bottom edge with a top hairline;
        its content is padded above the device's home indicator. */}
    <div
      data-testid='cart-sticky-checkout'
      style={{
        bottom: CART_STICKY_BAR_BOTTOM,
        paddingBottom: CART_STICKY_BAR_PADDING_BOTTOM,
        zIndex: "var(--perce-z-sticky)",
      }}
      className='fixed inset-x-0 border-t border-line bg-surface px-4 pt-3 lg:hidden'>
      <div className='mb-3 flex items-baseline justify-between gap-4'>
        <span className='t-label text-ink'>{t("cart.total") || "Total"}</span>
        <div className='text-end'>
          {totalSavings > 0 && (
            <p className='t-micro tabular-nums text-ink-2'>Saving {money(totalSavings)}</p>
          )}
          <p className='t-h3 tabular-nums text-ink'>{money(totals.grandTotal)}</p>
        </div>
      </div>
      <Button
        variant='primary'
        size='lg'
        fullWidth
        onClick={onProceedToCheckout}
        disabled={checkoutDisabled}>
        {t("cart.proceed_to_checkout") || "Proceed to Checkout"}
      </Button>
    </div>
    </>
  );
}
