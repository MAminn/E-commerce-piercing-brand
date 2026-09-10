import React, { useState } from "react";
import { Button } from "#root/components/ui/button";
import { Input } from "#root/components/ui/input";
import { CityCombobox } from "#root/components/checkout/CityCombobox";
import { Skeleton } from "#root/components/ui/skeleton";
import { Alert, AlertDescription } from "#root/components/ui/alert";
import { AlertCircle, Loader2, Shield, ChevronLeft, ChevronDown, ShoppingBag } from "lucide-react";
import { cn } from "#root/lib/utils";
import type {
  CheckoutCustomerInfo,
  CheckoutAddress,
  CheckoutOrderSummaryItem,
  CheckoutTotals,
  PaymentMethodOption,
} from "./CheckoutPageModernTemplate";
import { EditorialChrome } from "../editorial/EditorialChrome";
import { Reveal } from "../motion/Reveal";
import { StaggerContainer, StaggerItem } from "../motion/Stagger";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export interface CheckoutPageEditorialTemplateProps {
  customer?: CheckoutCustomerInfo;
  shippingAddress?: CheckoutAddress;
  billingAddress?: CheckoutAddress;
  items: CheckoutOrderSummaryItem[];
  totals: CheckoutTotals;
  isSubmitting?: boolean;
  errorMessage?: string | null;
  onSubmit?: (formValues: Record<string, string>) => void | Promise<void>;
  onEditCart?: () => void;
  currency?: string;
  paymentMethods?: PaymentMethodOption[];
  paymentMethodsLoading?: boolean;
  onApplyCoupon?: (
    code: string,
  ) => Promise<{ success: boolean; message: string }> | { success: boolean; message: string };
  appliedCoupon?: { code: string; discountLabel?: string } | null;
  onRemoveCoupon?: () => void;
  couponNotice?: string | null;
  onDismissCouponNotice?: () => void;
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

export function CheckoutPageEditorialTemplate({
  customer,
  shippingAddress,
  items = [],
  totals,
  isSubmitting = false,
  errorMessage,
  onSubmit,
  onEditCart,
  currency = "EGP",
  paymentMethods,
  paymentMethodsLoading = false,
  onApplyCoupon,
  appliedCoupon,
  onRemoveCoupon,
  couponNotice,
  onDismissCouponNotice,
}: CheckoutPageEditorialTemplateProps) {
  /* Internal form state — field names match the Modern template so
     pages/checkout/+Page.tsx's submit handler works for either template. */
  const [formValues, setFormValues] = useState<Record<string, string>>({
    fullName: customer?.name ?? "",
    email: customer?.email ?? "",
    phoneNumber: customer?.phone ?? "",
    address: shippingAddress?.line1 ?? "",
    buildingNumber: "",
    apartment: "",
    city: shippingAddress?.city ?? "",
    state: shippingAddress?.state ?? "",
    // Egypt-only store — no country field shown, always submitted as-is.
    country: "Egypt",
    paymentMethod: paymentMethods?.[0]?.id ?? "cod",
    notes: "",
  });

  const updateField = (key: string, value: string) => {
    setFormValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit?.(formValues);
  };

  /* Pill-style input classes */
  const inputCls =
    "h-11 rounded-full border-stone-200 bg-white text-sm px-5 focus-visible:ring-2 focus-visible:ring-stone-900/15 focus-visible:ring-offset-0";

  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [isApplyingCoupon, setIsApplyingCoupon] = useState(false);
  const [couponFeedback, setCouponFeedback] = useState<{
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
      setCouponFeedback(result);
      if (result.success) setCouponCode("");
    } finally {
      setIsApplyingCoupon(false);
    }
  };

  const handleRemoveCoupon = () => {
    setCouponFeedback(null);
    onDismissCouponNotice?.();
    onRemoveCoupon?.();
  };
  const cartQuantity = items.reduce((s, i) => s + i.quantity, 0);
  const originalCartTotal = items.reduce(
    (s, i) => s + (i.originalPrice ?? i.price) * i.quantity,
    0,
  );
  const originalTotal = originalCartTotal + (totals.shipping ?? 0);
  const hasDiscount = originalTotal > totals.grandTotal + 0.001;

  // Shared item rows — used by both the desktop card and the mobile expanded panel
  const renderItemsList = () => (
    <div className='space-y-4 max-h-60 overflow-y-auto'>
      {items.map((item) => (
        <div key={item.id} className='flex justify-between gap-3'>
          <div className='flex-1 min-w-0'>
            <p className='text-sm text-stone-900 line-clamp-1'>
              {item.name}
            </p>
            {item.variant && (
              <p className='text-xs text-stone-400'>{item.variant}</p>
            )}
            <p className='text-xs text-stone-500'>Qty: {item.quantity}</p>
          </div>
          <div className='text-right shrink-0'>
            {item.originalPrice != null &&
              item.originalPrice > item.price && (
                <p className='text-xs text-stone-400 line-through'>
                  {formatPrice(item.originalPrice * item.quantity, currency)}
                </p>
              )}
            <p className='text-sm font-medium text-stone-900'>
              {formatPrice(item.price * item.quantity, currency)}
            </p>
          </div>
        </div>
      ))}
    </div>
  );

  // Shared totals breakdown — used by both the desktop card and the mobile expanded panel
  const renderTotalsBreakdown = () => (
    <div className='mt-4 space-y-3 text-sm'>
      <div className='flex justify-between text-stone-600'>
        <span>Subtotal</span>
        <span>{formatPrice(totals.subtotal, currency)}</span>
      </div>
      {totals.discount != null && totals.discount > 0 && (
        <div className='flex justify-between text-stone-600'>
          <span>Discount</span>
          <span className='text-green-700'>
            −{formatPrice(totals.discount, currency)}
          </span>
        </div>
      )}
      {totals.appliedOffers &&
        totals.appliedOffers.map((offer) => (
          <div
            key={offer.name}
            className='flex items-start justify-between gap-2 text-red-600'>
            <span className='flex items-center gap-1 font-medium min-w-0'>
              🎁 <span className='truncate'>{offer.name}</span>
            </span>
            <span className='font-semibold shrink-0'>
              {offer.freeShipping && offer.discountAmount === 0
                ? "Free shipping"
                : `−${formatPrice(offer.discountAmount, currency)}`}
            </span>
          </div>
        ))}
      {totals.shipping != null && (
        <div className='flex justify-between text-stone-600'>
          <span>Shipping</span>
          <span>
            {totals.shipping === 0
              ? "Free"
              : formatPrice(totals.shipping, currency)}
          </span>
        </div>
      )}
    </div>
  );

  // Shared coupon box — used by both the desktop card and the mobile expanded panel
  const renderCouponBlock = () =>
    onApplyCoupon ? (
      <div className='mt-4 space-y-2'>
        <div className='flex gap-2'>
          <Input
            placeholder='Enter coupon code'
            value={couponCode}
            onChange={(e) => {
              setCouponCode(e.target.value);
              if (couponFeedback) setCouponFeedback(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleApplyCoupon();
            }}
            disabled={isApplyingCoupon}
            aria-invalid={couponFeedback?.success === false}
            aria-describedby='checkout-promo-code-feedback'
            className={cn(
              inputCls,
              "flex-1",
              couponFeedback?.success === false &&
                "border-red-300 focus-visible:ring-red-300",
            )}
          />
          <Button
            type='button'
            variant='outline'
            onClick={handleApplyCoupon}
            disabled={isApplyingCoupon || !couponCode.trim()}
            className='h-11 shrink-0 rounded-full px-5 text-xs tracking-wide border-stone-200'>
            {isApplyingCoupon ? "Checking…" : "Apply"}
          </Button>
        </div>

        <div id='checkout-promo-code-feedback' aria-live='polite'>
          {couponNotice && (
            <p className='text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-md px-3 py-2'>
              {couponNotice}
            </p>
          )}
          {couponFeedback && (
            <p
              className={cn(
                "text-xs",
                couponFeedback.success ? "text-green-700" : "text-red-600",
              )}>
              {couponFeedback.message}
            </p>
          )}
        </div>

        {appliedCoupon && (
          <div className='flex items-center justify-between gap-3 px-3 py-2 rounded-md bg-green-50 border border-green-100'>
            <p className='text-xs text-green-700 min-w-0'>
              <span className='font-semibold'>{appliedCoupon.code}</span>
              {appliedCoupon.discountLabel ? ` — ${appliedCoupon.discountLabel}` : ""}
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
    ) : null;

  return (
    <EditorialChrome>
      <div className='min-h-screen bg-stone-50'>
        <div className='mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14 lg:px-10'>
          {/* Header */}
          <Reveal variant='fadeUp'>
            <div className='mb-10 flex items-center justify-between'>
              <div>
                <p className='text-xs tracking-[0.32em] uppercase text-stone-500'>
                  Checkout
                </p>
                <h1 className='mt-2 text-3xl font-semibold tracking-tight text-stone-900 sm:text-4xl'>
                  Complete Your Order
                </h1>
              </div>
              {onEditCart && (
                <button
                  type='button'
                  onClick={onEditCart}
                  className='inline-flex items-center gap-1 text-sm text-stone-500 hover:text-stone-900 transition-colors'>
                  <ChevronLeft className='h-3.5 w-3.5' />
                  Edit Bag
                </button>
              )}
            </div>
          </Reveal>

          {/* Error */}
          {errorMessage && (
            <Alert variant='destructive' className='mb-8 rounded-xl'>
              <AlertCircle className='h-4 w-4' />
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit}>
            <div className='grid grid-cols-1 gap-10 lg:grid-cols-12'>
              {/* ====================================================== */}
              {/*  LEFT — Form                                            */}
              {/* ====================================================== */}
              <StaggerContainer className='lg:col-span-7 space-y-8'>
                {/* Customer Info */}
                <StaggerItem>
                  <section className='rounded-2xl border border-stone-200 bg-white p-6'>
                    <h2 className='text-sm font-medium tracking-[0.2em] uppercase text-stone-500 mb-5'>
                      Contact Information
                    </h2>
                    <div className='space-y-4'>
                      <div>
                        <Input
                          id='checkout-name'
                          name='name'
                          autoComplete='name'
                          required
                          value={formValues.fullName}
                          onChange={(e) => updateField("fullName", e.target.value)}
                          className={inputCls}
                          placeholder='Full Name'
                        />
                      </div>
                      <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
                        <div>
                          <Input
                            id='checkout-email'
                            name='email'
                            type='email'
                            autoComplete='email'
                            required
                            value={formValues.email}
                            onChange={(e) =>
                              updateField("email", e.target.value)
                            }
                            className={inputCls}
                            placeholder='Email'
                          />
                        </div>
                        <div>
                          <Input
                            id='checkout-phone'
                            name='tel'
                            type='tel'
                            autoComplete='tel'
                            value={formValues.phoneNumber}
                            onChange={(e) =>
                              updateField("phoneNumber", e.target.value)
                            }
                            className={inputCls}
                            placeholder='Phone Number'
                          />
                        </div>
                      </div>
                    </div>
                  </section>
                </StaggerItem>

                {/* Shipping Address */}
                <StaggerItem>
                  <section className='rounded-2xl border border-stone-200 bg-white p-6'>
                    <h2 className='text-sm font-medium tracking-[0.2em] uppercase text-stone-500 mb-5'>
                      Shipping Address
                    </h2>
                    <div className='space-y-4'>
                      <div>
                        <Input
                          id='checkout-address1'
                          name='address-line1'
                          autoComplete='address-line1'
                          required
                          value={formValues.address}
                          onChange={(e) =>
                            updateField("address", e.target.value)
                          }
                          className={inputCls}
                          placeholder='Street Address'
                        />
                      </div>
                      <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
                        <div>
                          <Input
                            id='checkout-building'
                            name='address-line2'
                            autoComplete='address-line2'
                            value={formValues.buildingNumber}
                            onChange={(e) =>
                              updateField("buildingNumber", e.target.value)
                            }
                            className={inputCls}
                            placeholder='Building Number'
                          />
                        </div>
                        <div>
                          <Input
                            id='checkout-apartment'
                            value={formValues.apartment}
                            onChange={(e) =>
                              updateField("apartment", e.target.value)
                            }
                            className={inputCls}
                            placeholder='Apartment / Unit'
                          />
                        </div>
                      </div>
                      <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
                        <div>
                          <Input
                            id='checkout-city'
                            name='address-level2'
                            autoComplete='address-level2'
                            required
                            value={formValues.city}
                            onChange={(e) =>
                              updateField("city", e.target.value)
                            }
                            className={inputCls}
                            placeholder='City'
                          />
                        </div>
                        <div>
                          <CityCombobox
                            id='checkout-state'
                            name='address-level1'
                            autoComplete='address-level1'
                            value={formValues.state}
                            onChange={(v) => updateField("state", v)}
                            className={inputCls}
                            placeholder='Governorate'
                          />
                        </div>
                      </div>
                    </div>
                  </section>
                </StaggerItem>

                {/* Payment Method */}
                <StaggerItem>
                  <section className='rounded-2xl border border-stone-200 bg-white p-6'>
                    <h2 className='text-sm font-medium tracking-[0.2em] uppercase text-stone-500 mb-5'>
                      Payment Method
                    </h2>
                    {paymentMethodsLoading ? (
                      <div className='space-y-3'>
                        <Skeleton className='h-12 w-full rounded-xl' />
                        <Skeleton className='h-12 w-full rounded-xl' />
                      </div>
                    ) : paymentMethods && paymentMethods.length > 0 ? (
                      <div className='space-y-2'>
                        {paymentMethods.map((pm) => (
                          <label
                            key={pm.id}
                            className={`flex cursor-pointer items-center gap-4 rounded-xl border px-5 py-4 transition-colors ${
                              formValues.paymentMethod === pm.id
                                ? "border-stone-900 bg-stone-50"
                                : "border-stone-200 bg-white hover:border-stone-300"
                            }`}>
                            <input
                              type='radio'
                              name='paymentMethod'
                              value={pm.id}
                              checked={formValues.paymentMethod === pm.id}
                              onChange={(e) =>
                                updateField("paymentMethod", e.target.value)
                              }
                              className='h-4 w-4 border-stone-300 text-stone-900 focus:ring-stone-900/20'
                            />
                            <div className='flex-1'>
                              <p className='text-sm font-medium text-stone-900'>
                                {pm.label}
                              </p>
                              {pm.description && (
                                <p className='text-xs text-stone-500'>
                                  {pm.description}
                                </p>
                              )}
                            </div>
                          </label>
                        ))}
                      </div>
                    ) : (
                      <label className='flex cursor-pointer items-center gap-4 rounded-xl border border-stone-900 bg-stone-50 px-5 py-4'>
                        <input
                          type='radio'
                          name='paymentMethod'
                          value='cod'
                          checked
                          readOnly
                          className='h-4 w-4 border-stone-300 text-stone-900'
                        />
                        <div>
                          <p className='text-sm font-medium text-stone-900'>
                            Cash on Delivery
                          </p>
                          <p className='text-xs text-stone-500'>
                            Pay when you receive your order
                          </p>
                        </div>
                      </label>
                    )}
                  </section>
                </StaggerItem>

                {/* Order Notes */}
                <StaggerItem>
                  <section className='rounded-2xl border border-stone-200 bg-white p-6'>
                    <h2 className='text-sm font-medium tracking-[0.2em] uppercase text-stone-500 mb-5'>
                      Order Notes (Optional)
                    </h2>
                    <textarea
                      value={formValues.notes}
                      onChange={(e) => updateField("notes", e.target.value)}
                      placeholder='Any special instructions…'
                      rows={3}
                      className='w-full rounded-xl border border-stone-200 bg-white p-4 text-sm text-stone-900 placeholder:text-stone-400 resize-none focus:outline-none focus:ring-2 focus:ring-stone-900/15'
                    />
                  </section>
                </StaggerItem>
              </StaggerContainer>

              {/* ====================================================== */}
              {/*  RIGHT — Order Summary                                  */}
              {/* ====================================================== */}
              <Reveal
                variant='fadeUp'
                delay={0.2}
                className='lg:col-span-5 space-y-3'>
                {/* Desktop: full itemized card */}
                <div className='hidden lg:block lg:sticky lg:top-24 rounded-2xl border border-stone-200 bg-white p-6'>
                  <h2 className='text-sm font-medium tracking-[0.2em] uppercase text-stone-500 mb-5'>
                    Order Summary
                  </h2>

                  {renderItemsList()}

                  <div className='mt-5 h-px w-full bg-stone-200' />

                  {renderTotalsBreakdown()}

                  {renderCouponBlock()}

                  <div className='mt-4 h-px w-full bg-stone-200' />

                  <div className='mt-4 flex justify-between text-base font-semibold text-stone-900'>
                    <span>Total</span>
                    <span>{formatPrice(totals.grandTotal, currency)}</span>
                  </div>

                  {/* Submit */}
                  <Button
                    type='submit'
                    size='lg'
                    className='mt-6 w-full rounded-full py-6 text-sm tracking-wide'
                    disabled={isSubmitting}>
                    {isSubmitting ? (
                      <>
                        <Loader2 className='me-2 h-4 w-4 animate-spin' />
                        Processing…
                      </>
                    ) : (
                      "Place Order"
                    )}
                  </Button>

                  {/* Security note */}
                  <div className='mt-4 flex items-center justify-center gap-1.5 text-xs text-stone-400'>
                    <Shield className='h-3 w-3' />
                    <span>Secure checkout</span>
                  </div>
                </div>

                {/* Mobile: compact collapsed summary bar */}
                <div className='lg:hidden rounded-2xl border border-stone-200 bg-white p-4'>
                  <button
                    type='button'
                    onClick={() => setSummaryExpanded((v) => !v)}
                    className='w-full flex items-center gap-3'
                    aria-expanded={summaryExpanded}>
                    <div className='w-12 h-12 shrink-0 rounded-lg overflow-hidden bg-stone-100 border border-stone-200 flex items-center justify-center'>
                      <ShoppingBag className='w-4 h-4 text-stone-300' />
                    </div>
                    <div className='flex-1 min-w-0 text-left'>
                      <p className='text-sm font-semibold text-stone-900'>
                        Total
                      </p>
                      <p className='text-xs text-stone-500'>
                        {cartQuantity} {cartQuantity === 1 ? "item" : "items"}
                      </p>
                    </div>
                    <div className='text-right shrink-0'>
                      {hasDiscount && (
                        <p className='text-xs text-stone-400 line-through'>
                          {formatPrice(originalTotal, currency)}
                        </p>
                      )}
                      <p className='text-base font-semibold text-stone-900'>
                        {formatPrice(totals.grandTotal, currency)}
                      </p>
                    </div>
                    <ChevronDown
                      className={cn(
                        "w-4 h-4 text-stone-400 shrink-0 transition-transform",
                        summaryExpanded && "rotate-180",
                      )}
                    />
                  </button>

                  {summaryExpanded && (
                    <div className='mt-4 pt-4 border-t border-stone-200'>
                      {renderItemsList()}
                      <div className='mt-4 h-px w-full bg-stone-200' />
                      {renderTotalsBreakdown()}
                    </div>
                  )}

                  {/* Always visible on mobile, not tucked behind the collapse toggle */}
                  <div className='mt-4 pt-4 border-t border-stone-200'>
                    {renderCouponBlock()}
                  </div>
                </div>

                <div className='lg:hidden'>
                  <Button
                    type='submit'
                    size='lg'
                    className='w-full rounded-full py-6 text-sm tracking-wide'
                    disabled={isSubmitting}>
                    {isSubmitting ? (
                      <>
                        <Loader2 className='me-2 h-4 w-4 animate-spin' />
                        Processing…
                      </>
                    ) : (
                      "Place Order"
                    )}
                  </Button>
                  <div className='mt-4 flex items-center justify-center gap-1.5 text-xs text-stone-400'>
                    <Shield className='h-3 w-3' />
                    <span>Secure checkout</span>
                  </div>
                </div>
              </Reveal>
            </div>
          </form>
        </div>
      </div>
    </EditorialChrome>
  );
}

CheckoutPageEditorialTemplate.displayName = "CheckoutPageEditorialTemplate";
