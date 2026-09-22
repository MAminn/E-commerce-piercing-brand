import React, { useEffect, useState } from "react";
import { Input } from "#root/components/ui/input";
import { GovernorateSelect } from "#root/components/checkout/GovernorateSelect";
import { getGovernorate, type GovernorateCode } from "#root/shared/shipping/egypt-governorates";
import type { ShippingLineStatus } from "#root/shared/shipping/checkout-shipping";
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
  ChevronDown,
} from "lucide-react";
import { cn } from "#root/lib/utils";
import { useMinimalI18n } from "#root/lib/i18n/MinimalI18nContext";
import { OfferProgressBanner } from "#root/components/template-system/cartPage/OfferProgressBanner";
import {
  AppliedOffersSavings,
} from "#root/components/template-system/cartPage/AppliedOffersSavings";
import { formatMoney } from "#root/shared/pricing/format-money";

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
  /**
   * "pending" — no governorate chosen yet under zone shipping; the line reads
   * "Calculated at checkout". "quoted" — `shipping` is the exact fee.
   * "unavailable" — the store does not deliver there; ordering is blocked.
   * Absent = legacy caller; treated as "quoted".
   */
  shippingStatus?: ShippingLineStatus;
  /** True while a fresh quote is in flight after a governorate change. */
  shippingLoading?: boolean;
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
  /** Canonical governorate currently selected (owned by the page so the cart can re-quote). */
  governorateCode?: GovernorateCode | null;
  onGovernorateChange?: (code: GovernorateCode | null) => void;
  /** Zone shipping is on: a governorate must be chosen before the order can be placed. */
  governorateRequired?: boolean;
}


/**
 * Every input on this form was previously labelled by its placeholder alone.
 * A placeholder is not a label: it disappears the moment the shopper types,
 * screen readers are not required to announce it, and autofill has nothing
 * stable to match. It also meant the inline error text underneath an invalid
 * field was not associated with it at all, so a screen-reader user tabbing
 * into "Phone Number" heard no indication that it had been rejected.
 *
 * These two wrappers put a real <label htmlFor>, `aria-invalid` and
 * `aria-describedby` on every field in one place.
 */
function FieldLabel({
  htmlFor,
  children,
  optional,
}: {
  htmlFor: string;
  children: React.ReactNode;
  optional?: boolean;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className='block text-xs font-medium text-perce-ink-muted'>
      {children}
      {optional && (
        <span className='ms-1 normal-case tracking-normal text-perce-ink-subtle'>
          (optional)
        </span>
      )}
    </label>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  // Rendered even when empty so the live region exists before the error does
  // — a region created at the same moment as its content is not reliably
  // announced.
  return (
    <p id={id} role='alert' className='min-h-0 text-xs text-perce-sale empty:hidden'>
      {message ?? ""}
    </p>
  );
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
  governorateCode = null,
  onGovernorateChange,
  governorateRequired = false,
}: CheckoutPageModernTemplateProps) {
  const { t, locale } = useMinimalI18n();
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
    // Egyptian addresses are not routed by postal code and no courier
    // integration here consumes one. The order schema requires
    // `shippingPostalCode` to be PRESENT but allows it to be empty, so this
    // stays "" rather than writing the literal string "00000" onto every
    // order record — a value that looks like data and is not.
    postalCode: "",
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
    if (governorateRequired && !governorateCode) {
      errors.state = t("validation.governorate_required");
    } else if (totals.shippingStatus === "unavailable") {
      errors.state = t("checkout.shipping_unavailable_destination");
    }

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

  // True only when the server actually offered a gateway other than COD.
  // `payment.methods` derives its list from configured environment
  // credentials, so this cannot be true for an unconfigured store.
  const hasOnlinePaymentMethod = methods.some((m) => m.id !== "cod");

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
  // Ordering is blocked while the destination cannot be served or a fresh
  // quote is still in flight — never on "pending", so the shopper can press
  // the button and be pointed at the governorate field by validation.
  const shippingBlocksOrder =
    totals.shippingStatus === "unavailable" || totals.shippingLoading === true;

  // Section number component
  const SectionNum = ({ n }: { n: number }) => (
    <span
      aria-hidden
      className='flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-perce-cta text-xs font-medium text-perce-ink-inverse'>
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
                  {formatMoney(item.originalPrice * item.quantity, { currency })}
                </p>
              )}
            <p className='font-semibold text-sm'>
              {formatMoney(item.price * item.quantity, { currency })}
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
          {formatMoney(totals.subtotal, { currency })}
        </span>
      </div>
      {totals.discount !== undefined && totals.discount > 0 && (
        <div className='flex justify-between text-perce-sale'>
          <span className='font-medium'>
            {t("cart.discount") || "Discount"}
          </span>
          <span className='font-semibold'>
            −{formatMoney(totals.discount, { currency })}
          </span>
        </div>
      )}
      <AppliedOffersSavings
        appliedOffers={appliedOffers}
        currency={currency}
      />
      {totals.shippingStatus === "pending" ? (
        <div className='flex justify-between' data-testid='shipping-line'>
          <span className='text-muted-foreground'>
            {t("cart.shipping") || "Shipping"}
          </span>
          <span className='text-muted-foreground'>
            {t("cart.shipping_calculated_at_checkout") || "Calculated at checkout"}
          </span>
        </div>
      ) : totals.shippingStatus === "unavailable" ? (
        <div className='flex justify-between text-perce-sale' data-testid='shipping-line'>
          <span className='font-medium'>
            {t("cart.shipping") || "Shipping"}
          </span>
          <span className='font-semibold'>
            {t("cart.shipping_unavailable") || "Not available for this destination"}
          </span>
        </div>
      ) : totals.shipping !== undefined ? (
        <div className='flex justify-between' data-testid='shipping-line'>
          <span className='text-muted-foreground'>
            {t("cart.shipping") || "Shipping"}
          </span>
          <span className='font-semibold'>
            {totals.shippingLoading
              ? "…"
              : totals.shipping === 0
                ? t("cart.free") || "Free"
                : formatMoney(totals.shipping, { currency })}
          </span>
        </div>
      ) : null}
    </div>
  );

  // Shared coupon box — used by both the desktop card and the mobile expanded panel
  const renderCouponBlock = (scope: "desktop" | "mobile") => {
    // The desktop card and the mobile panel are BOTH in the DOM (one is
    // hidden with `lg:hidden` / `hidden lg:block`), so a single hardcoded id
    // produced two elements sharing `checkout-promo-code-feedback` — invalid
    // HTML, and `aria-describedby` on the input resolved to whichever came
    // first, which on mobile is the hidden one.
    const feedbackId = `checkout-promo-code-feedback-${scope}`;
    return onApplyCoupon ? (
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
            aria-describedby={feedbackId}
            className={cn(
              "flex-1 text-sm",
              couponFeedback?.success === false &&
                "border-perce-sale focus-visible:ring-perce-sale",
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

        <div id={feedbackId} aria-live='polite'>
          {couponNotice && (
            <p className='rounded-md border border-perce-line bg-perce-surface px-3 py-2 text-xs text-perce-ink-secondary'>
              {couponNotice}
            </p>
          )}
          {couponFeedback && (
            <p
              className={cn(
                "text-xs",
                couponFeedback.success ? "text-perce-success" : "text-perce-sale",
              )}>
              {couponFeedback.message}
            </p>
          )}
        </div>

        {appliedCoupon && (
          <div className='flex items-center justify-between gap-3 rounded-md border border-perce-line bg-perce-surface px-3 py-2'>
            <p className='min-w-0 text-xs text-perce-success'>
              <span className='font-semibold'>{appliedCoupon.code}</span>
              {appliedCoupon.discountLabel ? ` — ${appliedCoupon.discountLabel}` : ""}
            </p>
            {onRemoveCoupon && (
              <button
                type='button'
                onClick={handleRemoveCoupon}
                className='shrink-0 text-[11px] font-medium text-perce-success underline hover:text-perce-ink'>
                {t("cart.remove") || "Remove"}
              </button>
            )}
          </div>
        )}
      </div>
    ) : null;
  };

  return (
    <div className='perce-header-offset perce-container bg-perce-bg py-10 sm:py-12'>
      <h1 className='perce-section-title mb-8'>
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
                    <FieldLabel htmlFor='fullName'>
                      {t("checkout.full_name") || "Full Name"}
                    </FieldLabel>
                    <Input
                      id='fullName'
                      name='name'
                      autoComplete='name'
                      required
                      aria-invalid={!!fieldErrors.fullName}
                      aria-describedby='fullName-error'
                      placeholder={t("checkout.full_name") || "Full Name"}
                      value={form.fullName}
                      onChange={(e) => updateField("fullName", e.target.value)}
                      className={
                        fieldErrors.fullName ? "border-destructive" : ""
                      }
                    />
                    <FieldError id='fullName-error' message={fieldErrors.fullName} />
                  </div>
                  <div className='space-y-1.5'>
                    <FieldLabel htmlFor='email'>
                      {t("checkout.email") || "Email Address"}
                    </FieldLabel>
                    <Input
                      id='email'
                      name='email'
                      type='email'
                      inputMode='email'
                      autoComplete='email'
                      required
                      aria-invalid={!!fieldErrors.email}
                      aria-describedby='email-error'
                      placeholder={t("checkout.email") || "Email Address"}
                      value={form.email}
                      onChange={(e) => updateField("email", e.target.value)}
                      className={fieldErrors.email ? "border-destructive" : ""}
                    />
                    <FieldError id='email-error' message={fieldErrors.email} />
                  </div>
                </div>
                <div className='space-y-1.5'>
                  <FieldLabel htmlFor='phoneNumber'>
                    {t("checkout.phone") || "Phone Number"}
                  </FieldLabel>
                  <Input
                    id='phoneNumber'
                    name='tel'
                    type='tel'
                    /* Egyptian mobile numbers are entered as 01X XXXX XXXX.
                       `inputMode="tel"` gets the numeric keypad on mobile;
                       the field stays free-text because the store also has to
                       accept landlines and +20-prefixed numbers. */
                    inputMode='tel'
                    autoComplete='tel'
                    required
                    aria-invalid={!!fieldErrors.phoneNumber}
                    aria-describedby='phoneNumber-error'
                    placeholder='01XXXXXXXXX'
                    value={form.phoneNumber}
                    onChange={(e) => updateField("phoneNumber", e.target.value)}
                    className={
                      fieldErrors.phoneNumber ? "border-destructive" : ""
                    }
                  />
                  <FieldError
                    id='phoneNumber-error'
                    message={fieldErrors.phoneNumber}
                  />
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
                  <FieldLabel htmlFor='address'>
                    {t("checkout.street") || "Street Address"}
                  </FieldLabel>
                  <Input
                    id='address'
                    name='address-line1'
                    autoComplete='address-line1'
                    required
                    aria-invalid={!!fieldErrors.address}
                    aria-describedby='address-error'
                    placeholder={t("checkout.street") || "Street Address"}
                    value={form.address}
                    onChange={(e) => updateField("address", e.target.value)}
                    className={fieldErrors.address ? "border-destructive" : ""}
                  />
                  <FieldError id='address-error' message={fieldErrors.address} />
                </div>
                <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
                  <div className='space-y-1.5'>
                    <FieldLabel htmlFor='buildingNumber' optional>
                      {t("checkout.building_number") || "Building Number"}
                    </FieldLabel>
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
                    <FieldLabel htmlFor='apartment' optional>
                      {t("checkout.apartment") || "Apartment / Unit"}
                    </FieldLabel>
                    <Input
                      id='apartment'
                      name='address-line3'
                      placeholder={t("checkout.apartment") || "Apartment / Unit"}
                      value={form.apartment}
                      onChange={(e) => updateField("apartment", e.target.value)}
                    />
                  </div>
                </div>
                <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
                  <div className='space-y-1.5'>
                    <FieldLabel htmlFor='city'>
                      {t("checkout.city") || "City"}
                    </FieldLabel>
                    <Input
                      id='city'
                      name='address-level2'
                      autoComplete='address-level2'
                      required
                      aria-invalid={!!fieldErrors.city}
                      aria-describedby='city-error'
                      placeholder={t("checkout.city") || "City"}
                      value={form.city}
                      onChange={(e) => updateField("city", e.target.value)}
                      className={fieldErrors.city ? "border-destructive" : ""}
                    />
                    <FieldError id='city-error' message={fieldErrors.city} />
                  </div>
                  <div className='space-y-1.5'>
                    <FieldLabel htmlFor='state' optional={!governorateRequired}>
                      {t("checkout.state") || "Governorate"}
                    </FieldLabel>
                    {/* The canonical 27-governorate list — the shipping fee
                        is priced from this code, so free text would leave the
                        order unpriceable. Under flat shipping the pick is
                        optional and only stored on the address. */}
                    <GovernorateSelect
                      id='state'
                      name='address-level1'
                      autoComplete='address-level1'
                      locale={locale}
                      required={governorateRequired}
                      aria-invalid={!!fieldErrors.state}
                      aria-describedby='state-error'
                      value={governorateCode}
                      onChange={(code) => {
                        updateField("state", code ? getGovernorate(code)?.nameEn ?? "" : "");
                        onGovernorateChange?.(code);
                      }}
                      className={fieldErrors.state ? "border-destructive" : ""}
                    />
                    {governorateRequired && !governorateCode && !fieldErrors.state && (
                      <p className='text-xs text-perce-ink-muted'>
                        {t("checkout.shipping_select_to_calculate") ||
                          "Select your governorate to see the shipping fee."}
                      </p>
                    )}
                    {totals.shippingStatus === "unavailable" && !fieldErrors.state && (
                      <p className='text-xs text-perce-sale'>
                        {t("checkout.shipping_unavailable_destination") ||
                          "We don't deliver to this governorate yet. Please choose another destination."}
                      </p>
                    )}
                    <FieldError id='state-error' message={fieldErrors.state} />
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
                  className='min-h-11 text-sm text-perce-ink-muted underline underline-offset-4 hover:text-perce-ink'>
                  + Add special instructions (optional)
                </button>
              ) : (
                <>
                  <FieldLabel htmlFor='notes' optional>
                    {t("checkout.notes") || "Order notes"}
                  </FieldLabel>
                  <Textarea
                    id='notes'
                    className='mt-1.5'
                    placeholder={
                      t("checkout.notes_placeholder") ||
                      "Any special instructions for your order\u2026"
                    }
                    value={form.notes}
                    onChange={(e) => updateField("notes", e.target.value)}
                    rows={3}
                  />
                </>
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
                          ? "border-perce-ink bg-perce-surface"
                          : "border-perce-line hover:border-perce-line-strong"
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
                        <div className='mt-1 flex shrink-0 items-center gap-1 text-xs text-perce-success'>
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
              <h2 className='font-extrabold text-base'>
                {t("checkout.order_summary") || "Order Summary"}
              </h2>

              {renderItemsList()}

              <div className='border-t' />

              {renderTotalsBreakdown()}

              {renderCouponBlock("desktop")}

              {/* Grand total */}
              <div className='border-t pt-4 flex justify-between items-center'>
                <span className='font-semibold text-base'>
                  {t("cart.total") || "Total"}
                </span>
                <span className='text-xl font-semibold text-perce-ink'>
                  {formatMoney(totals.grandTotal, { currency })}
                </span>
              </div>

              {/* Trust badges.
                  "Fast Delivery — Quick delivery to your doorstep." is gone:
                  Percé has not set a delivery time, no courier integration is
                  configured, and the claim was made at the exact moment the
                  shopper decides to pay. "Easy Returns — 14-day return
                  policy." was removed for the same reason in Phase 2.
                  What is left is the one statement that is true, and only
                  when it applies: card details are handled by the gateway's
                  own hosted page, which does not exist in a COD-only store,
                  so the line is hidden when COD is the only method. */}
              {hasOnlinePaymentMethod && (
                <div className='space-y-2.5 text-sm text-perce-ink-muted'>
                  <div className='flex items-center gap-2'>
                    <Lock aria-hidden className='h-4 w-4 shrink-0' />
                    <div>
                      <p className='text-xs font-medium text-perce-ink'>
                        Secure payment
                      </p>
                      <p className='text-xs'>
                        Card details are entered on the payment provider's own
                        page — this store never sees them.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Submit */}
              <Button
                type='submit'
                className='w-full font-bold'
                size='lg'
                disabled={isSubmitting || items.length === 0 || shippingBlocksOrder}>
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

              {/* The default read "By placing your order, you agree to our
                  Terms & Conditions", linking to /links — which is the
                  link-tree page, not a terms document. Percé has no published
                  terms, so the sentence pointed a paying customer at an
                  agreement that does not exist. It renders only when an admin
                  has supplied real copy through the `checkout.terms`
                  translation override. */}
              {t("checkout.terms") ? (
                <p className='text-center text-xs text-perce-ink-muted'>
                  {t("checkout.terms")}
                </p>
              ) : null}
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
                      {formatMoney(originalTotal, { currency })}
                    </p>
                  )}
                  <p className='font-extrabold text-base'>
                    {formatMoney(totals.grandTotal, { currency })}
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
              <div className='mt-4 pt-4 border-t'>
                {renderCouponBlock("mobile")}
              </div>
            </div>

            <div className='lg:hidden space-y-3'>
              <Button
                type='submit'
                className='w-full font-bold'
                size='lg'
                disabled={isSubmitting || items.length === 0 || shippingBlocksOrder}>
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

              {/* The default read "By placing your order, you agree to our
                  Terms & Conditions", linking to /links — which is the
                  link-tree page, not a terms document. Percé has no published
                  terms, so the sentence pointed a paying customer at an
                  agreement that does not exist. It renders only when an admin
                  has supplied real copy through the `checkout.terms`
                  translation override. */}
              {t("checkout.terms") ? (
                <p className='text-center text-xs text-perce-ink-muted'>
                  {t("checkout.terms")}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
