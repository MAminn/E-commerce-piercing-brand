import React, { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { GovernorateSelect } from "#root/components/checkout/GovernorateSelect";
import { getGovernorate, type GovernorateCode } from "#root/shared/shipping/egypt-governorates";
import type { ShippingLineStatus } from "#root/shared/shipping/checkout-shipping";
import { Button, buttonClass } from "#root/components/storefront/Button";
import { Input, fieldClass } from "#root/components/storefront/Field";
import { cn } from "#root/lib/utils";
import { useMinimalI18n } from "#root/lib/i18n/MinimalI18nContext";
import { formatItemCount } from "#root/lib/i18n/item-count";
import { OfferProgressBanner } from "#root/components/template-system/cartPage/OfferProgressBanner";
import {
  AppliedOffersSavings,
} from "#root/components/template-system/cartPage/AppliedOffersSavings";
import { formatMoney } from "#root/shared/pricing/format-money";
import { useCouponFeedback } from "#root/components/template-system/useCouponFeedback";

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
  /**
   * Product units in the cart (useCart().totalItems — loose pieces plus every
   * piece inside a set). A set is ONE summary line, so counting `items`
   * would show a PICK6 as "1 item".
   */
  itemCount?: number;
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
 * Every field has a real <label htmlFor>, `aria-invalid` and an
 * `aria-describedby` pointing at its error line — a placeholder is not a
 * label (it disappears on typing and is not reliably announced).
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
    <label htmlFor={htmlFor} className='mb-2 block t-label text-ink'>
      {children}
      {optional && <span className='ms-1 font-normal text-ink-2'>(optional)</span>}
    </label>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  // Rendered even when empty so the live region exists before the error does
  // — a region created at the same moment as its content is not reliably
  // announced.
  return (
    <p id={id} role='alert' className='mt-2 t-small text-error empty:hidden'>
      {message ?? ""}
    </p>
  );
}

/** A numbered form section: "1 Contact", "2 Delivery", "3 Payment". */
function CheckoutSection({
  n,
  id,
  title,
  children,
}: {
  n: number;
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className='border-t border-line py-8 first:border-t-ink'>
      <h2 id={id} className='mb-6 flex items-baseline gap-3 t-h3 text-ink'>
        <span aria-hidden='true' className='t-label tabular-nums text-ink-2'>
          {n}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function scrollBehavior(): ScrollBehavior {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}

/**
 * CheckoutPageModernTemplate — the Percé checkout (template id
 * `checkout-modern`), in the Object Index language.
 *
 * Desktop: the form takes 7/12 and the order summary 5/12, sticky. Phones:
 * one column, with a collapsible summary above Place order. Sections are
 * numbered — 1 Contact, 2 Delivery, 3 Payment. Presentation only: fields,
 * validation, shipping quotes, governorates, COD, promo codes and order
 * submission are exactly as before.
 */
export function CheckoutPageModernTemplate({
  customer,
  shippingAddress,
  billingAddress,
  items = [],
  itemCount,
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

  /**
   * `checkout.terms` defaults to "" in both locales: Percé has published no
   * terms, so no "you agree to our Terms" line renders until an admin
   * supplies real copy through the translation override. `t()` falls back to
   * the key itself for an unknown key, so guard against that and against a
   * whitespace-only override here.
   */
  const rawTerms = t("checkout.terms");
  const termsCopy =
    rawTerms && rawTerms !== "checkout.terms" ? rawTerms.trim() : "";

  const [couponCode, setCouponCode] = useState("");
  const [isApplyingCoupon, setIsApplyingCoupon] = useState(false);
  // Cleared automatically when CartContext drops the code (see the hook).
  const [couponFeedback, setCouponFeedback] = useCouponFeedback(appliedCoupon?.code, couponNotice);

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

    // Move to the first invalid field (errors are collected in form order).
    if (Object.keys(errors).length > 0) {
      const firstErrorField = Object.keys(errors)[0];
      const el = document.getElementById(firstErrorField!);
      if (el) {
        el.scrollIntoView({ behavior: scrollBehavior(), block: "center" });
        el.focus({ preventScroll: true });
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
  const money = (amount: number) => formatMoney(amount, { currency, locale });
  const placeOrderDisabled = isSubmitting || items.length === 0 || shippingBlocksOrder;
  const placeOrderLabel = isSubmitting
    ? t("checkout.processing") || "Processing..."
    : form.paymentMethod === "cod"
      ? t("checkout.place_order") || "Place Order"
      : t("checkout.place_order_pay") || "Place Order & Pay";

  // Shared item rows — used by both the desktop summary and the mobile panel
  const renderItemsList = () => (
    <div>
      <ul className='divide-y divide-line'>
        {items.map((item) => (
          <li key={item.id} className='flex items-center gap-3 py-3'>
            <div className='h-15 w-12 shrink-0 bg-surface-2'>
              {item.imageUrl && (
                <img src={item.imageUrl} alt={item.name} className='h-full w-full object-cover' />
              )}
            </div>
            <div className='min-w-0 flex-1'>
              <p className='truncate t-small text-ink'>{item.name}</p>
              {item.variant && <p className='truncate t-micro font-normal text-ink-2'>{item.variant}</p>}
              <p className='t-micro font-normal tabular-nums text-ink-2'>Qty: {item.quantity}</p>
            </div>
            <div className='shrink-0 text-end'>
              {item.originalPrice != null && item.originalPrice > item.price && (
                <p className='t-micro font-normal tabular-nums text-ink-2'>
                  <s>{money(item.originalPrice * item.quantity)}</s>
                </p>
              )}
              <p className='t-label tabular-nums text-ink'>{money(item.price * item.quantity)}</p>
            </div>
          </li>
        ))}
      </ul>
      {onEditCart && (
        <button
          type='button'
          onClick={onEditCart}
          className={buttonClass({ variant: "text", size: "sm" })}>
          {t("checkout.edit_cart") || "Edit cart"}
        </button>
      )}
    </div>
  );

  // Shared totals breakdown — hairline rows
  const renderTotalsBreakdown = () => (
    <dl className='w-full t-small'>
      <div className='flex justify-between border-b border-line py-3'>
        <dt className='text-ink-2'>{t("cart.subtotal") || "Subtotal"}</dt>
        <dd className='tabular-nums text-ink'>{money(totals.subtotal)}</dd>
      </div>
      {totals.discount !== undefined && totals.discount > 0 && (
        <div className='flex justify-between border-b border-line py-3'>
          <dt className='text-ink-2'>{t("cart.discount") || "Discount"}</dt>
          <dd className='tabular-nums text-ink'>−{money(totals.discount)}</dd>
        </div>
      )}
      {appliedOffers.length > 0 && (
        <div className='border-b border-line py-2'>
          <AppliedOffersSavings appliedOffers={appliedOffers} currency={currency} />
        </div>
      )}
      {totals.shippingStatus === "pending" ? (
        <div className='flex justify-between gap-4 border-b border-line py-3' data-testid='shipping-line'>
          <dt className='text-ink-2'>{t("cart.shipping") || "Shipping"}</dt>
          <dd className='text-end text-ink-2'>
            {t("cart.shipping_calculated_at_checkout") || "Calculated at checkout"}
          </dd>
        </div>
      ) : totals.shippingStatus === "unavailable" ? (
        <div className='flex justify-between gap-4 border-b border-line py-3' data-testid='shipping-line'>
          <dt className='text-ink-2'>{t("cart.shipping") || "Shipping"}</dt>
          <dd className='text-end text-error'>
            {t("cart.shipping_unavailable") || "Not available for this destination"}
          </dd>
        </div>
      ) : totals.shipping !== undefined ? (
        <div className='flex justify-between border-b border-line py-3' data-testid='shipping-line'>
          <dt className='text-ink-2'>{t("cart.shipping") || "Shipping"}</dt>
          <dd className='tabular-nums text-ink'>
            {totals.shippingLoading
              ? "…"
              : totals.shipping === 0
                ? t("cart.free") || "Free"
                : money(totals.shipping)}
          </dd>
        </div>
      ) : null}
    </dl>
  );

  // Shared coupon box — used by both the desktop summary and the mobile panel
  const renderCouponBlock = (scope: "desktop" | "mobile") => {
    // The desktop summary and the mobile panel are BOTH in the DOM (one is
    // hidden per breakpoint), so every id is scoped — one shared id would be
    // invalid HTML and `aria-describedby` would resolve to the hidden one.
    const feedbackId = `checkout-promo-code-feedback-${scope}`;
    const inputId = `checkout-promo-code-${scope}`;
    return onApplyCoupon ? (
      <div>
        <label htmlFor={inputId} className='mb-2 block t-label text-ink'>
          {t("cart.promo_code") || "Promo code"}
        </label>
        <div className='flex gap-2'>
          <Input
            id={inputId}
            placeholder={t("cart.enter_code") || "Enter coupon code"}
            value={couponCode}
            onChange={(e) => {
              setCouponCode(e.target.value);
              if (couponFeedback) setCouponFeedback(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                // Enter applies the code; it must not submit the order form.
                e.preventDefault();
                handleApplyCoupon();
              }
            }}
            disabled={isApplyingCoupon}
            aria-invalid={couponFeedback?.success === false || undefined}
            aria-describedby={feedbackId}
            autoCapitalize='characters'
            className='min-w-0 flex-1'
          />
          <Button
            type='button'
            variant='secondary'
            size='lg'
            onClick={handleApplyCoupon}
            disabled={isApplyingCoupon || !couponCode.trim()}
            className='h-12 shrink-0'>
            {isApplyingCoupon
              ? t("cart.checking") || "Checking…"
              : t("cart.apply") || "Apply"}
          </Button>
        </div>

        <div id={feedbackId} aria-live='polite'>
          {couponNotice && (
            <p className='mt-3 border border-line px-3 py-2 t-small text-ink'>
              {couponNotice}
            </p>
          )}
          {couponFeedback && (
            <p className={cn("mt-2 t-small", couponFeedback.success ? "text-success" : "text-error")}>
              {couponFeedback.message}
            </p>
          )}
        </div>

        {appliedCoupon && (
          <div className='mt-3 flex items-center justify-between gap-3 border border-line px-3'>
            <p className='min-w-0 py-2 t-small text-ink'>
              <span className='t-label'>{appliedCoupon.code}</span>
              {appliedCoupon.discountLabel ? ` — ${appliedCoupon.discountLabel}` : ""}
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
    ) : null;
  };

  const placeOrder = (
    <>
      <Button type='submit' variant='primary' size='lg' fullWidth disabled={placeOrderDisabled}>
        {placeOrderLabel}
      </Button>
      {/* Renders only when an admin has supplied real terms copy through the
          `checkout.terms` translation override (see termsCopy above). */}
      {termsCopy ? <p className='mt-3 t-small text-ink-2'>{termsCopy}</p> : null}
    </>
  );

  return (
    <div className='perce-container bg-bg py-8 lg:py-12'>
      <h1 className='mb-6 t-h1 text-ink lg:mb-8'>
        {t("checkout.title") || "Checkout"}
      </h1>

      {errorMessage && (
        <div role='alert' className='mb-6 border border-error px-4 py-3 t-small text-error'>
          {errorMessage}
        </div>
      )}

      {Object.keys(fieldErrors).length > 0 && (
        <div role='alert' className='mb-6 border border-error px-4 py-3 t-small text-error'>
          {t("validation.fix_errors")}
        </div>
      )}

      <OfferProgressBanner
        cartSubtotal={cartSubtotal}
        cartQuantity={cartQuantity}
        appliedOffers={appliedOffers}
        currency={currency}
      />

      <form onSubmit={handleSubmit} noValidate>
        <div className='grid grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-12'>
          {/* ── Form (7/12) ─────────────────── */}
          <div className='lg:col-span-7'>
            {/* 1. Contact */}
            <CheckoutSection n={1} id='checkout-contact' title={t("checkout.step_contact") || "Contact"}>
              <div className='space-y-6'>
                <div className='grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-4'>
                  <div>
                    <FieldLabel htmlFor='fullName'>
                      {t("checkout.full_name") || "Full Name"}
                    </FieldLabel>
                    <Input
                      id='fullName'
                      name='name'
                      autoComplete='name'
                      required
                      aria-invalid={!!fieldErrors.fullName || undefined}
                      aria-describedby='fullName-error'
                      value={form.fullName}
                      onChange={(e) => updateField("fullName", e.target.value)}
                    />
                    <FieldError id='fullName-error' message={fieldErrors.fullName} />
                  </div>
                  <div>
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
                      aria-invalid={!!fieldErrors.email || undefined}
                      aria-describedby='email-error'
                      value={form.email}
                      onChange={(e) => updateField("email", e.target.value)}
                    />
                    <FieldError id='email-error' message={fieldErrors.email} />
                  </div>
                </div>
                <div>
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
                    aria-invalid={!!fieldErrors.phoneNumber || undefined}
                    aria-describedby='phoneNumber-error'
                    placeholder='01XXXXXXXXX'
                    value={form.phoneNumber}
                    onChange={(e) => updateField("phoneNumber", e.target.value)}
                    className='tabular-nums'
                  />
                  <FieldError id='phoneNumber-error' message={fieldErrors.phoneNumber} />
                </div>
              </div>
            </CheckoutSection>

            {/* 2. Delivery */}
            <CheckoutSection n={2} id='checkout-delivery' title={t("checkout.step_delivery") || "Delivery"}>
              <div className='space-y-6'>
                <div>
                  <FieldLabel htmlFor='address'>
                    {t("checkout.street") || "Street Address"}
                  </FieldLabel>
                  <Input
                    id='address'
                    name='address-line1'
                    autoComplete='address-line1'
                    required
                    aria-invalid={!!fieldErrors.address || undefined}
                    aria-describedby='address-error'
                    value={form.address}
                    onChange={(e) => updateField("address", e.target.value)}
                  />
                  <FieldError id='address-error' message={fieldErrors.address} />
                </div>
                <div className='grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-4'>
                  <div>
                    <FieldLabel htmlFor='buildingNumber' optional>
                      {t("checkout.building_number") || "Building Number"}
                    </FieldLabel>
                    <Input
                      id='buildingNumber'
                      name='address-line2'
                      autoComplete='address-line2'
                      value={form.buildingNumber}
                      onChange={(e) => updateField("buildingNumber", e.target.value)}
                    />
                  </div>
                  <div>
                    <FieldLabel htmlFor='apartment' optional>
                      {t("checkout.apartment") || "Apartment / Unit"}
                    </FieldLabel>
                    <Input
                      id='apartment'
                      name='address-line3'
                      value={form.apartment}
                      onChange={(e) => updateField("apartment", e.target.value)}
                    />
                  </div>
                </div>
                <div className='grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-4'>
                  <div>
                    <FieldLabel htmlFor='city'>
                      {t("checkout.city") || "City"}
                    </FieldLabel>
                    <Input
                      id='city'
                      name='address-level2'
                      autoComplete='address-level2'
                      required
                      aria-invalid={!!fieldErrors.city || undefined}
                      aria-describedby='city-error'
                      value={form.city}
                      onChange={(e) => updateField("city", e.target.value)}
                    />
                    <FieldError id='city-error' message={fieldErrors.city} />
                  </div>
                  <div>
                    <FieldLabel htmlFor='state' optional={!governorateRequired}>
                      {t("checkout.state") || "Governorate"}
                    </FieldLabel>
                    {/* The canonical 27-governorate list — the shipping fee
                        is priced from this code, so free text would leave the
                        order unpriceable. Under flat shipping the pick is
                        optional and only stored on the address. */}
                    <div className='relative'>
                      <GovernorateSelect
                        id='state'
                        name='address-level1'
                        autoComplete='address-level1'
                        locale={locale}
                        required={governorateRequired}
                        aria-invalid={!!fieldErrors.state || undefined}
                        aria-describedby='state-error'
                        value={governorateCode}
                        onChange={(code) => {
                          updateField("state", code ? getGovernorate(code)?.nameEn ?? "" : "");
                          onGovernorateChange?.(code);
                        }}
                        className='appearance-none pe-10'
                      />
                      <ChevronDown
                        aria-hidden
                        size={16}
                        strokeWidth={1.5}
                        className='pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-ink-2'
                      />
                    </div>
                    {/* One reserved status line under the field: the hint,
                        the unavailable notice and the validation error take
                        turns in it, so choosing a governorate (or a quote
                        landing) never inserts or removes a row. */}
                    <div data-testid='governorate-status' className='mt-2 min-h-4 t-small'>
                      {governorateRequired && !governorateCode && !fieldErrors.state && (
                        <p className='text-ink-2'>
                          {t("checkout.shipping_select_to_calculate") ||
                            "Select your governorate to see the shipping fee."}
                        </p>
                      )}
                      {totals.shippingStatus === "unavailable" && !fieldErrors.state && (
                        <p className='text-error'>
                          {t("checkout.shipping_unavailable_destination") ||
                            "We don't deliver to this governorate yet. Please choose another destination."}
                        </p>
                      )}
                      <p id='state-error' role='alert' className='text-error empty:hidden'>
                        {fieldErrors.state ?? ""}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Order notes — optional, opened on request */}
                <div>
                  {!notesOpen ? (
                    <button
                      type='button'
                      onClick={() => setNotesOpen(true)}
                      aria-expanded={false}
                      className={buttonClass({ variant: "text", size: "sm" })}>
                      Add special instructions (optional)
                    </button>
                  ) : (
                    <>
                      <FieldLabel htmlFor='notes' optional>
                        {t("checkout.notes") || "Order notes"}
                      </FieldLabel>
                      <textarea
                        id='notes'
                        className={cn(fieldClass, "h-auto min-h-24 py-3")}
                        placeholder={
                          t("checkout.notes_placeholder") ||
                          "Any special instructions for your order…"
                        }
                        value={form.notes}
                        onChange={(e) => updateField("notes", e.target.value)}
                        rows={3}
                      />
                    </>
                  )}
                </div>
              </div>
            </CheckoutSection>

            {/* 3. Payment */}
            <CheckoutSection n={3} id='checkout-payment' title={t("checkout.step_payment") || "Payment"}>
              {paymentMethodsLoading ? (
                <p className='t-small text-ink-2' aria-live='polite'>
                  {t("checkout.loading_payment") || "Loading payment options..."}
                </p>
              ) : (
                <fieldset>
                  <legend className='sr-only'>{t("checkout.payment_method") || "Payment Method"}</legend>
                  <div className='space-y-2'>
                    {methods.map((method) => {
                      const selected = form.paymentMethod === method.id;
                      return (
                        <label
                          key={method.id}
                          className={cn(
                            "flex cursor-pointer items-start gap-3 border p-4 transition-colors",
                            selected ? "border-ink" : "border-line hover:border-line-input",
                          )}>
                          {/* Native radio: its circular indicator is kept
                              deliberately — it is what reads as a radio. */}
                          <input
                            type='radio'
                            name='paymentMethod'
                            value={method.id}
                            checked={selected}
                            onChange={(e) => updateField("paymentMethod", e.target.value)}
                            className='mt-0.5 h-5 w-5 shrink-0 accent-ink'
                          />
                          <span className='min-w-0 flex-1'>
                            <span className='block t-label text-ink'>{method.label}</span>
                            <span className='mt-1 block t-small text-ink-2'>{method.description}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              )}
            </CheckoutSection>
          </div>

          {/* ── Order summary (5/12) ────────────────── */}
          <div className='w-full lg:sticky lg:top-[calc(var(--perce-header-offset)+2rem)] lg:col-span-5 lg:self-start'>
            {/* Desktop: itemised summary */}
            <div className='hidden border-t border-ink pt-6 lg:block'>
              <h2 className='t-h3 text-ink'>
                {t("checkout.order_summary") || "Order Summary"}
              </h2>
              <div className='mt-2'>{renderItemsList()}</div>
              <div className='mt-2 border-t border-line'>{renderTotalsBreakdown()}</div>
              <div className='mt-6'>{renderCouponBlock("desktop")}</div>

              <div className='mt-6 flex items-baseline justify-between border-t border-line pt-4'>
                <span className='t-h3 text-ink'>{t("cart.total") || "Total"}</span>
                <span className='t-h3 tabular-nums text-ink'>{money(totals.grandTotal)}</span>
              </div>

              {/* The one payment statement that is true, and only when it
                  applies: card details are entered on the gateway's own page,
                  which does not exist in a COD-only store. */}
              {hasOnlinePaymentMethod && (
                <p className='mt-4 t-small text-ink-2'>
                  Card details are entered on the payment provider's own page — this store never sees them.
                </p>
              )}

              <div className='mt-6'>{placeOrder}</div>
            </div>

            {/* Phones: collapsible summary, then Place order */}
            <div className='border-t border-ink lg:hidden'>
              <button
                type='button'
                onClick={() => setSummaryExpanded((v) => !v)}
                className='flex min-h-14 w-full items-center gap-3 text-start'
                aria-expanded={summaryExpanded}
                aria-controls='checkout-summary-panel'>
                <span className='min-w-0 flex-1'>
                  <span className='block t-label text-ink'>{t("checkout.order_summary") || "Order Summary"}</span>
                  <span className='block t-small text-ink-2'>
                    {formatItemCount(itemCount ?? cartQuantity, locale, t)}
                  </span>
                </span>
                <span className='shrink-0 text-end'>
                  {hasDiscount && (
                    <span className='block t-micro font-normal tabular-nums text-ink-2'>
                      <s>{money(originalTotal)}</s>
                    </span>
                  )}
                  <span className='block t-label tabular-nums text-ink'>{money(totals.grandTotal)}</span>
                </span>
                <ChevronDown
                  aria-hidden
                  size={16}
                  strokeWidth={1.5}
                  className={cn("shrink-0 text-ink-2 transition-transform", summaryExpanded && "rotate-180")}
                />
              </button>

              <div id='checkout-summary-panel' hidden={!summaryExpanded} className='border-t border-line'>
                {renderItemsList()}
                <div className='border-t border-line'>{renderTotalsBreakdown()}</div>
              </div>

              {/* Always visible on phones, not tucked behind the toggle */}
              <div className='border-t border-line py-6'>{renderCouponBlock("mobile")}</div>

              <div className='flex items-baseline justify-between border-t border-line py-4'>
                <span className='t-h3 text-ink'>{t("cart.total") || "Total"}</span>
                <span className='t-h3 tabular-nums text-ink'>{money(totals.grandTotal)}</span>
              </div>

              {placeOrder}
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
