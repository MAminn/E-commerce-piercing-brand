import React, { useEffect, useState } from "react";
import { Input } from "#root/components/ui/input";
import { CityCombobox } from "#root/components/checkout/CityCombobox";
import { Textarea } from "#root/components/ui/textarea";
import { Button } from "#root/components/ui/button";
import { Alert, AlertDescription } from "#root/components/ui/alert";
import {
  AlertCircle,
  ShoppingCart,
  User,
  MapPin,
  Loader2,
  CreditCard,
  Banknote,
  Wallet,
  Shield,
  Lock,
  Truck,
  RotateCcw,
  FileText,
  ChevronDown,
} from "lucide-react";
import { cn } from "#root/lib/utils";
import { useMinimalI18n } from "#root/lib/i18n/MinimalI18nContext";
import { OfferProgressBanner } from "#root/components/template-system/cartPage/OfferProgressBanner";
import {
  AppliedOffersSavings,
} from "#root/components/template-system/cartPage/AppliedOffersSavings";

/**
 * Customer information interface
 */
export interface CheckoutCustomerInfo {
  name: string;
  email: string;
  phone?: string | null;
}

/**
 * Address interface
 */
export interface CheckoutAddress {
  line1: string;
  line2?: string | null;
  city: string;
  state?: string | null;
  postalCode: string;
  country: string;
}

/**
 * Order summary item interface
 */
export interface CheckoutOrderSummaryItem {
  id: string;
  name: string;
  price: number;
  originalPrice?: number | null;
  quantity: number;
  imageUrl?: string | null;
  variant?: string | null;
}

/**
 * Checkout totals interface
 */
export interface CheckoutTotals {
  subtotal: number;
  discount?: number;
  shipping?: number;
  grandTotal: number;
  appliedOffers?: Array<{
    name: string;
    discountAmount: number;
    freeShipping: boolean;
  }>;
}

/**
 * Payment method option from the server
 */
export interface PaymentMethodOption {
  id: string;
  label: string;
  description: string;
}

/**
 * Props for CheckoutPageModernTemplate
 */
export interface CheckoutPageModernTemplateProps {
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
  /** Available payment methods (fetched from server). If undefined/empty, only COD is shown */
  paymentMethods?: PaymentMethodOption[];
  /** Whether payment methods are loading */
  paymentMethodsLoading?: boolean;
  /** Applies a promo code. Resolves with whether it worked and a message that explains why/why not. */
  onApplyCoupon?: (
    code: string,
  ) => Promise<{ success: boolean; message: string }> | { success: boolean; message: string };
  /** Currently applied promo code, if any. */
  appliedCoupon?: { code: string; discountLabel?: string } | null;
  onRemoveCoupon?: () => void;
  /** A code that stopped being valid on its own (cart edited, code expired, etc). */
  couponNotice?: string | null;
  onDismissCouponNotice?: () => void;
}

/**
 * CheckoutPageModernTemplate Component
 *
 * Modern checkout page layout with form fields, order review and submission
 */
export function CheckoutPageModernTemplate({
  customer,
  shippingAddress,
  billingAddress,
  items = [],
  totals,
  isSubmitting = false,
  errorMessage = null,
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
}: CheckoutPageModernTemplateProps) {
  const { t } = useMinimalI18n();
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
  const [form, setForm] = useState({
    fullName: customer?.name ?? "",
    email: customer?.email ?? "",
    phoneNumber: customer?.phone ?? "",
    address: shippingAddress?.line1 ?? "",
    city: shippingAddress?.city ?? "",
    state: shippingAddress?.state ?? "",
    postalCode: "00000",
    // Egypt-only store — no country field shown, always submitted as-is.
    country: "Egypt",
    notes: "",
    paymentMethod: "cod",
    buildingNumber: "",
    apartment: "",
  });

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [notesOpen, setNotesOpen] = useState(false);
  const [summaryExpanded, setSummaryExpanded] = useState(false);

  const updateField = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (fieldErrors[field]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!form.fullName.trim()) errors.fullName = t("validation.name_required");
    if (!form.email.trim()) {
      errors.email = t("validation.email_required");
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      errors.email = t("validation.email_invalid");
    }
    if (!form.phoneNumber.trim()) {
      errors.phoneNumber = t("validation.phone_required");
    } else if (!/^[\d\s+()-]{7,20}$/.test(form.phoneNumber.trim())) {
      errors.phoneNumber = t("validation.phone_invalid");
    }
    if (!form.address.trim()) errors.address = t("validation.address_required");
    else if (form.address.trim().length < 5) {
      errors.address = "Please enter a full street address (at least 5 characters)";
    }
    if (!form.city.trim()) errors.city = t("validation.city_required");

    setFieldErrors(errors);

    // Scroll to first error field
    if (Object.keys(errors).length > 0) {
      const firstErrorField = Object.keys(errors)[0];
      const el = document.getElementById(firstErrorField!);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.focus();
      }
    }

    return Object.keys(errors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    onSubmit?.(form);
  };

  // Resolved payment methods (with COD fallback when none provided)
  const methods =
    paymentMethods && paymentMethods.length > 0
      ? paymentMethods
      : [
          {
            id: "cod",
            label: "Cash on Delivery",
            description: "Pay when your order is delivered to your doorstep",
          },
        ];

  const getPaymentIcon = (id: string) => {
    switch (id) {
      case "stripe":
        return <CreditCard className='w-5 h-5' />;
      case "paymob":
        return <Wallet className='w-5 h-5' />;
      default:
        return <Banknote className='w-5 h-5' />;
    }
  };

  // Auto-select the only payment method when there's exactly one
  useEffect(() => {
    if (methods.length === 1 && form.paymentMethod !== methods[0]!.id) {
      updateField("paymentMethod", methods[0]!.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [methods, form.paymentMethod]);

  const appliedOffers = totals.appliedOffers ?? [];
  const cartSubtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const cartQuantity = items.reduce((s, i) => s + i.quantity, 0);
  const originalCartTotal = items.reduce(
    (s, i) => s + (i.originalPrice ?? i.price) * i.quantity,
    0,
  );
  const originalTotal = originalCartTotal + (totals.shipping ?? 0);
  const hasDiscount = originalTotal > totals.grandTotal + 0.001;

  // Section number component
  const SectionNum = ({ n }: { n: number }) => (
    <span className='flex items-center justify-center w-7 h-7 rounded-full bg-green-600 text-white text-xs font-bold shrink-0'>
      {n}
    </span>
  );

  // Shared item rows — used by both the desktop card and the mobile expanded panel
  const renderItemsList = () => (
    <div className='space-y-4'>
      {items.map((item) => (
        <div key={item.id} className='flex items-center gap-3'>
          <div className='w-14 h-14 shrink-0 rounded-lg overflow-hidden bg-muted border'>
            {item.imageUrl ? (
              <img
                src={item.imageUrl}
                alt={item.name}
                className='w-full h-full object-cover'
              />
            ) : (
              <div className='w-full h-full flex items-center justify-center'>
                <ShoppingCart className='w-4 h-4 text-muted-foreground/30' />
              </div>
            )}
          </div>
          <div className='flex-1 min-w-0'>
            <p className='font-semibold text-sm leading-snug truncate'>
              {item.name}
            </p>
            {item.variant && (
              <p className='text-xs text-muted-foreground truncate'>
                {item.variant}
              </p>
            )}
            <p className='text-xs text-muted-foreground'>
              Qty: {item.quantity}
            </p>
          </div>
          <div className='text-right shrink-0'>
            {item.originalPrice != null &&
              item.originalPrice > item.price && (
                <p className='text-xs text-muted-foreground line-through'>
                  {currency}
                  {(item.originalPrice * item.quantity).toFixed(2)}
                </p>
              )}
            <p className='font-semibold text-sm'>
              {currency}
              {(item.price * item.quantity).toFixed(2)}
            </p>
          </div>
        </div>
      ))}
      {onEditCart && (
        <button
          type='button'
          onClick={onEditCart}
          className='text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors'>
          {t("checkout.edit_cart") || "Edit cart"}
        </button>
      )}
    </div>
  );

  // Shared totals breakdown — used by both the desktop card and the mobile expanded panel
  const renderTotalsBreakdown = () => (
    <div className='space-y-2.5 text-xs w-full'>
      <div className='flex justify-between'>
        <span className='text-muted-foreground'>
          {t("cart.subtotal") || "Subtotal"}
        </span>
        <span className='font-semibold'>
          {currency}
          {totals.subtotal.toFixed(2)}
        </span>
      </div>
      {totals.discount !== undefined && totals.discount > 0 && (
        <div className='flex justify-between text-red-600'>
          <span className='font-medium'>
            {t("cart.discount") || "Discount"}
          </span>
          <span className='font-semibold'>
            - {currency}
            {totals.discount.toFixed(2)}
          </span>
        </div>
      )}
      <AppliedOffersSavings
        appliedOffers={appliedOffers}
        currency={currency}
      />
      {totals.shipping !== undefined && (
        <div className='flex justify-between'>
          <span className='text-muted-foreground'>
            {t("cart.shipping") || "Shipping"}
          </span>
          <span className='font-semibold'>
            {totals.shipping === 0
              ? t("cart.free") || "Free"
              : `${currency}${totals.shipping.toFixed(2)}`}
          </span>
        </div>
      )}
    </div>
  );

  // Shared coupon box — used by both the desktop card and the mobile expanded panel
  const renderCouponBlock = () =>
    onApplyCoupon ? (
      <div className='space-y-2'>
        <div className='flex gap-2'>
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
            disabled={isApplyingCoupon}
            aria-invalid={couponFeedback?.success === false}
            aria-describedby='checkout-promo-code-feedback'
            className={cn(
              "flex-1 text-sm",
              couponFeedback?.success === false &&
                "border-red-300 focus-visible:ring-red-300",
            )}
          />
          <Button
            type='button'
            variant='outline'
            onClick={handleApplyCoupon}
            disabled={isApplyingCoupon || !couponCode.trim()}
            className='shrink-0 text-xs font-bold tracking-wide'>
            {isApplyingCoupon
              ? t("cart.checking") || "Checking…"
              : t("cart.apply") || "Apply"}
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
                couponFeedback.success ? "text-green-600" : "text-red-600",
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
                {t("cart.remove") || "Remove"}
              </button>
            )}
          </div>
        )}
      </div>
    ) : null;

  return (
    <div className='max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-12'>
      <h1 className='text-2xl sm:text-3xl font-extrabold mb-8'>
        {t("checkout.title") || "Checkout"}
      </h1>

      {errorMessage && (
        <Alert variant='destructive' className='mb-6'>
          <AlertCircle className='h-4 w-4' />
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}

      {Object.keys(fieldErrors).length > 0 && (
        <Alert variant='destructive' className='mb-6'>
          <AlertCircle className='h-4 w-4' />
          <AlertDescription>{t("validation.fix_errors")}</AlertDescription>
        </Alert>
      )}

      <OfferProgressBanner
        cartSubtotal={cartSubtotal}
        cartQuantity={cartQuantity}
        appliedOffers={appliedOffers}
        currency={currency}
      />

      <form onSubmit={handleSubmit}>
        <div className='grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-10'>
          {/* ── Left column: form sections ─────────────────── */}
          <div className='space-y-6'>
            {/* 1. Customer Information */}
            <div className='border rounded-2xl p-6'>
              <div className='flex items-center justify-between mb-5'>
                <div className='flex items-center gap-3'>
                  <SectionNum n={1} />
                  <h2 className='font-bold text-base'>
                    {t("checkout.customer_info") || "Customer Information"}
                  </h2>
                </div>
                <User className='w-5 h-5 text-muted-foreground' />
              </div>
              <div className='space-y-4'>
                <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
                  <div className='space-y-1.5'>
                    <Input
                      id='fullName'
                      name='name'
                      autoComplete='name'
                      placeholder={t("checkout.full_name") || "Full Name"}
                      value={form.fullName}
                      onChange={(e) => updateField("fullName", e.target.value)}
                      className={
                        fieldErrors.fullName ? "border-destructive" : ""
                      }
                    />
                    {fieldErrors.fullName && (
                      <p className='text-xs text-destructive'>
                        {fieldErrors.fullName}
                      </p>
                    )}
                  </div>
                  <div className='space-y-1.5'>
                    <Input
                      id='email'
                      name='email'
                      type='email'
                      autoComplete='email'
                      placeholder={t("checkout.email") || "Email Address"}
                      value={form.email}
                      onChange={(e) => updateField("email", e.target.value)}
                      className={fieldErrors.email ? "border-destructive" : ""}
                    />
                    {fieldErrors.email && (
                      <p className='text-xs text-destructive'>
                        {fieldErrors.email}
                      </p>
                    )}
                  </div>
                </div>
                <div className='space-y-1.5'>
                  <Input
                    id='phoneNumber'
                    name='tel'
                    type='tel'
                    autoComplete='tel'
                    placeholder={t("checkout.phone") || "Phone Number"}
                    value={form.phoneNumber}
                    onChange={(e) => updateField("phoneNumber", e.target.value)}
                    className={
                      fieldErrors.phoneNumber ? "border-destructive" : ""
                    }
                  />
                  {fieldErrors.phoneNumber && (
                    <p className='text-xs text-destructive'>
                      {fieldErrors.phoneNumber}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* 2. Shipping Address */}
            <div className='border rounded-2xl p-6'>
              <div className='flex items-center justify-between mb-5'>
                <div className='flex items-center gap-3'>
                  <SectionNum n={2} />
                  <h2 className='font-bold text-base'>
                    {t("checkout.shipping_address") || "Shipping Address"}
                  </h2>
                </div>
                <MapPin className='w-5 h-5 text-muted-foreground' />
              </div>
              <div className='space-y-4'>
                <div className='space-y-1.5'>
                  <Input
                    id='address'
                    name='address-line1'
                    autoComplete='address-line1'
                    placeholder={t("checkout.street") || "Street Address"}
                    value={form.address}
                    onChange={(e) => updateField("address", e.target.value)}
                    className={fieldErrors.address ? "border-destructive" : ""}
                  />
                  {fieldErrors.address && (
                    <p className='text-xs text-destructive'>
                      {fieldErrors.address}
                    </p>
                  )}
                </div>
                <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
                  <div className='space-y-1.5'>
                    <Input
                      id='buildingNumber'
                      name='address-line2'
                      autoComplete='address-line2'
                      placeholder={
                        t("checkout.building_number") || "Building Number"
                      }
                      value={form.buildingNumber}
                      onChange={(e) =>
                        updateField("buildingNumber", e.target.value)
                      }
                    />
                  </div>
                  <div className='space-y-1.5'>
                    <Input
                      id='apartment'
                      placeholder={t("checkout.apartment") || "Apartment / Unit"}
                      value={form.apartment}
                      onChange={(e) => updateField("apartment", e.target.value)}
                    />
                  </div>
                </div>
                <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
                  <div className='space-y-1.5'>
                    <Input
                      id='city'
                      name='address-level2'
                      autoComplete='address-level2'
                      placeholder={t("checkout.city") || "City"}
                      value={form.city}
                      onChange={(e) => updateField("city", e.target.value)}
                      className={fieldErrors.city ? "border-destructive" : ""}
                    />
                    {fieldErrors.city && (
                      <p className='text-xs text-destructive'>
                        {fieldErrors.city}
                      </p>
                    )}
                  </div>
                  <div className='space-y-1.5'>
                    <CityCombobox
                      id='state'
                      name='address-level1'
                      autoComplete='address-level1'
                      placeholder={t("checkout.state") || "Governorate"}
                      value={form.state}
                      onChange={(v) => updateField("state", v)}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Order Notes — inline collapsible, not numbered */}
            <div className='px-1'>
              {!notesOpen ? (
                <button
                  type='button'
                  onClick={() => setNotesOpen(true)}
                  className='text-sm text-stone-500 hover:text-stone-700 underline underline-offset-4'>
                  + Add special instructions (optional)
                </button>
              ) : (
                <Textarea
                  placeholder={
                    t("checkout.notes_placeholder") ||
                    "Any special instructions for your order\u2026"
                  }
                  value={form.notes}
                  onChange={(e) => updateField("notes", e.target.value)}
                  rows={3}
                />
              )}
            </div>

            {/* 3. Payment Method */}
            <div className='border rounded-2xl p-6'>
              <div className='flex items-center justify-between mb-5'>
                <div className='flex items-center gap-3'>
                  <SectionNum n={3} />
                  <h2 className='font-bold text-base'>
                    {t("checkout.payment_method") || "Payment Method"}
                  </h2>
                </div>
                <Lock className='w-5 h-5 text-muted-foreground' />
              </div>
              {paymentMethodsLoading ? (
                <div className='flex items-center gap-2 text-muted-foreground py-2'>
                  <Loader2 className='w-4 h-4 animate-spin' />
                  {t("checkout.loading_payment") ||
                    "Loading payment options..."}
                </div>
              ) : (
                <div className='space-y-3'>
                  {methods.map((method) => (
                    <label
                      key={method.id}
                      className={`flex items-start gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all duration-300 ${
                        form.paymentMethod === method.id
                          ? "border-green-600 bg-muted/40"
                          : "border-border hover:border-muted-foreground/40"
                      }`}>
                      <input
                        type='radio'
                        name='paymentMethod'
                        value={method.id}
                        checked={form.paymentMethod === method.id}
                        onChange={(e) =>
                          updateField("paymentMethod", e.target.value)
                        }
                        className='mt-1 accent-foreground'
                      />
                      <div className='flex items-start gap-3 flex-1'>
                        <div
                          className={`mt-0.5 ${form.paymentMethod === method.id ? "text-foreground" : "text-muted-foreground"}`}>
                          {getPaymentIcon(method.id)}
                        </div>
                        <div className='flex-1'>
                          <p className='font-semibold'>{method.label}</p>
                          <p className='text-sm text-muted-foreground'>
                            {method.description}
                          </p>
                        </div>
                      </div>
                      {method.id !== "cod" && (
                        <div className='flex items-center gap-1 text-xs text-green-600 shrink-0 mt-1'>
                          <Shield className='w-3 h-3' />
                          {t("checkout.secure") || "SECURE"}
                        </div>
                      )}
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Right column: Order Summary ────────────────── */}
          <div className='lg:sticky lg:top-6 lg:self-start w-full space-y-3'>
            {/* Desktop: full itemized card */}
            <div className='hidden lg:block border rounded-2xl p-6 space-y-5 w-full'>
              <h2 className='font-extrabold text-base uppercase tracking-widest'>
                {t("checkout.order_summary") || "Order Summary"}
              </h2>

              {renderItemsList()}

              <div className='border-t' />

              {renderTotalsBreakdown()}

              {renderCouponBlock()}

              {/* Grand total */}
              <div className='border-t pt-4 flex justify-between items-center'>
                <span className='font-bold text-base uppercase tracking-wide'>
                  {t("cart.total") || "Total"}
                </span>
                <span className='font-extrabold text-xl text-emerald-600'>
                  {currency} {totals.grandTotal.toFixed(2)}
                </span>
              </div>

              {/* Trust badges */}
              <div className='space-y-2.5 text-sm text-muted-foreground'>
                <div className='flex items-center gap-2'>
                  <Lock className='w-4 h-4 shrink-0' />
                  <div>
                    <p className='font-medium text-foreground text-xs'>
                      Secure Checkout
                    </p>
                    <p className='text-xs'>
                      Your payment information is safe with us.
                    </p>
                  </div>
                </div>
                <div className='flex items-center gap-2'>
                  <Truck className='w-4 h-4 shrink-0' />
                  <div>
                    <p className='font-medium text-foreground text-xs'>
                      Fast Delivery
                    </p>
                    <p className='text-xs'>Quick delivery to your doorstep.</p>
                  </div>
                </div>
                <div className='flex items-center gap-2'>
                  <RotateCcw className='w-4 h-4 shrink-0' />
                  <div>
                    <p className='font-medium text-foreground text-xs'>
                      Easy Returns
                    </p>
                    <p className='text-xs'>14-day return policy.</p>
                  </div>
                </div>
              </div>

              {/* Submit */}
              <Button
                type='submit'
                className='w-full font-bold tracking-wide uppercase'
                size='lg'
                disabled={isSubmitting || items.length === 0}>
                {isSubmitting ? (
                  <span className='flex items-center gap-2'>
                    <Loader2 className='w-4 h-4 animate-spin' />
                    {t("checkout.processing") || "Processing..."}
                  </span>
                ) : (
                  <span className='flex items-center gap-2'>
                    <Lock className='w-4 h-4' />
                    {form.paymentMethod === "cod"
                      ? t("checkout.place_order") || "Place Order"
                      : t("checkout.place_order_pay") || "Place Order & Pay"}
                  </span>
                )}
              </Button>

              <p className='text-xs text-center text-muted-foreground'>
                {t("checkout.terms") || (
                  <>
                    By placing your order, you agree to our{" "}
                    <a
                      href='/links'
                      className='underline underline-offset-2 text-foreground'>
                      Terms &amp; Conditions
                    </a>
                  </>
                )}
              </p>
            </div>

            {/* Mobile: compact collapsed summary bar */}
            <div className='lg:hidden border rounded-2xl p-4'>
              <button
                type='button'
                onClick={() => setSummaryExpanded((v) => !v)}
                className='w-full flex items-center gap-3'
                aria-expanded={summaryExpanded}>
                <div className='w-12 h-12 shrink-0 rounded-lg overflow-hidden bg-muted border'>
                  {items[0]?.imageUrl ? (
                    <img
                      src={items[0].imageUrl}
                      alt={items[0].name}
                      className='w-full h-full object-cover'
                    />
                  ) : (
                    <div className='w-full h-full flex items-center justify-center'>
                      <ShoppingCart className='w-4 h-4 text-muted-foreground/30' />
                    </div>
                  )}
                </div>
                <div className='flex-1 min-w-0 text-left'>
                  <p className='font-bold text-sm'>
                    {t("cart.total") || "Total"}
                  </p>
                  <p className='text-xs text-muted-foreground'>
                    {cartQuantity} {cartQuantity === 1 ? "item" : "items"}
                  </p>
                </div>
                <div className='text-right shrink-0'>
                  {hasDiscount && (
                    <p className='text-xs text-muted-foreground line-through'>
                      {currency}
                      {originalTotal.toFixed(2)}
                    </p>
                  )}
                  <p className='font-extrabold text-base'>
                    {currency} {totals.grandTotal.toFixed(2)}
                  </p>
                </div>
                <ChevronDown
                  className={cn(
                    "w-4 h-4 text-muted-foreground shrink-0 transition-transform",
                    summaryExpanded && "rotate-180",
                  )}
                />
              </button>

              {summaryExpanded && (
                <div className='mt-4 pt-4 border-t space-y-4'>
                  {renderItemsList()}
                  <div className='border-t' />
                  {renderTotalsBreakdown()}
                </div>
              )}

              {/* Always visible on mobile, not tucked behind the collapse toggle */}
              <div className='mt-4 pt-4 border-t'>{renderCouponBlock()}</div>
            </div>

            <div className='lg:hidden space-y-3'>
              <Button
                type='submit'
                className='w-full font-bold tracking-wide uppercase'
                size='lg'
                disabled={isSubmitting || items.length === 0}>
                {isSubmitting ? (
                  <span className='flex items-center gap-2'>
                    <Loader2 className='w-4 h-4 animate-spin' />
                    {t("checkout.processing") || "Processing..."}
                  </span>
                ) : (
                  <span className='flex items-center gap-2'>
                    <Lock className='w-4 h-4' />
                    {form.paymentMethod === "cod"
                      ? t("checkout.place_order") || "Place Order"
                      : t("checkout.place_order_pay") || "Place Order & Pay"}
                  </span>
                )}
              </Button>

              <p className='text-xs text-center text-muted-foreground'>
                {t("checkout.terms") || (
                  <>
                    By placing your order, you agree to our{" "}
                    <a
                      href='/links'
                      className='underline underline-offset-2 text-foreground'>
                      Terms &amp; Conditions
                    </a>
                  </>
                )}
              </p>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
