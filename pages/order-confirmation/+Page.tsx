"use client";

import { useEffect, useRef, useState } from "react";
import { Link } from "#root/components/utils/Link";
import {
  CheckCircle,
  Package,
  Home,
  ShoppingBag,
  XCircle,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { Button } from "#root/components/ui/button";
import { useTracking } from "#root/frontend/contexts/TrackingContext";
import { TrackingEventName } from "#root/shared/types/pixel-tracking";
import { STORE_CURRENCY } from "#root/shared/config/branding";
import { useCart } from "#root/lib/context/CartContext";
import { trpc } from "#root/shared/trpc/client";

type PaymentState = "none" | "success" | "pending" | "cancelled" | "failed";

function getPaymentState(param: string | null): PaymentState {
  if (!param) return "none";
  switch (param.toLowerCase()) {
    case "success":
      return "success";
    case "pending":
      return "pending";
    case "cancelled":
    case "canceled":
      return "cancelled";
    case "failed":
      return "failed";
    default:
      return "none";
  }
}

export default function OrderConfirmationPage() {
  const searchParams =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search)
      : null;
  const orderId = searchParams?.get("id") ?? "";
  const orderTotal = searchParams?.get("total") ?? "";
  const customerEmail = searchParams?.get("email") ?? "";
  const paymentState = getPaymentState(searchParams?.get("payment") ?? null);
  const shortId = orderId ? orderId.substring(0, 8).toUpperCase() : "";
  const [verifiedPaymentStatus, setVerifiedPaymentStatus] = useState<
    | "pending"
    | "paid"
    | "failed"
    | "processing"
    | "not_required"
    | "refunded"
    | null
  >(null);

  // Poll backend when customer returns from Paymob/Stripe before webhook lands
  useEffect(() => {
    if (!orderId) return;
    if (paymentState !== "success" && paymentState !== "pending") return;

    let cancelled = false;
    let interval: number | undefined;

    const verifyPayment = async () => {
      try {
        const result = await trpc.payment.verify.query({ orderId });
        const paymentStatus =
          result && "result" in result && result.success
            ? result.result.paymentStatus
            : null;
        if (!cancelled && paymentStatus) {
          setVerifiedPaymentStatus(paymentStatus);
          if (
            interval &&
            (paymentStatus === "paid" || paymentStatus === "failed")
          ) {
            window.clearInterval(interval);
            interval = undefined;
          }
        }
      } catch {
        /* best-effort */
      }
    };

    void verifyPayment();
    interval = window.setInterval(verifyPayment, 4000);
    const timeout = window.setTimeout(() => {
      if (interval) window.clearInterval(interval);
    }, 60000);

    return () => {
      cancelled = true;
      if (interval) window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [orderId, paymentState]);

  const isPaymentFailed =
    paymentState === "cancelled" || paymentState === "failed";

  const isPaymentPending =
    !isPaymentFailed &&
    (paymentState === "pending" ||
      (paymentState === "success" &&
        verifiedPaymentStatus !== "paid" &&
        verifiedPaymentStatus !== "failed"));

  const isPaymentSuccess = !isPaymentFailed && !isPaymentPending;

  // ─── Fire checkout_completed once per order ────────────────────────────
  // Uses sessionStorage keyed by orderId to survive page refresh.
  // Ref guards against React strict-mode double-effects within the same mount.
  const { trackEvent } = useTracking();
  const { clearCart } = useCart();
  const hasTrackedCompletion = useRef<string | null>(null);

  // ─── Clear cart on successful payment (deferred from checkout page) ────
  // For online payments, clearCart is NOT called before redirect (so pressing
  // back in the browser keeps the cart intact). This effect clears it once
  // the user lands here with a successful/pending payment.
  useEffect(() => {
    if (!orderId) return;
    try {
      const key = `pending_cart_clear:${orderId}`;
      if (sessionStorage.getItem(key) && (isPaymentSuccess || isPaymentPending)) {
        clearCart();
        sessionStorage.removeItem(key);
      }
    } catch { /* best-effort */ }
  }, [orderId, isPaymentSuccess, isPaymentPending, clearCart]);

  useEffect(() => {
    if (!orderId || !isPaymentSuccess) return;
    if (hasTrackedCompletion.current === orderId) return;

    // Persist guard: prevent re-firing on page refresh
    const storageKey = `tracked_checkout_completed:${orderId}`;
    try {
      if (sessionStorage.getItem(storageKey)) return;
    } catch {
      /* SSR or private browsing — fall through to ref guard */
    }

    hasTrackedCompletion.current = orderId;

    try {
      sessionStorage.setItem(storageKey, "1");
    } catch {
      /* best-effort */
    }

    const totalValue = orderTotal ? Number.parseFloat(orderTotal) : undefined;

    // Retrieve cart items saved by checkout page for richer Purchase events
    let purchaseItems:
      | {
          itemId: string;
          itemName: string;
          price?: number;
          quantity?: number;
          category?: string;
        }[]
      | undefined;
    try {
      const raw = sessionStorage.getItem(`checkout_items:${orderId}`);
      if (raw) {
        purchaseItems = JSON.parse(raw);
        // Clean up after reading
        sessionStorage.removeItem(`checkout_items:${orderId}`);
      }
    } catch {
      /* best-effort */
    }

    trackEvent(TrackingEventName.CHECKOUT_COMPLETED, {
      ecommerce: {
        currency: STORE_CURRENCY,
        value: totalValue,
        transactionId: orderId,
        items: purchaseItems,
      },
    });
  }, [orderId, orderTotal, isPaymentSuccess, trackEvent]);

  return (
    <div className='zeli-header-offset flex min-h-screen items-center justify-center bg-zeli-bg px-4 py-12 sm:py-16'>
      <div className='flex w-full max-w-2xl flex-col border border-zeli-line bg-zeli-surface-raised px-6 pb-12 pt-8 text-center sm:px-8'>
        {/* Icon */}
        {isPaymentSuccess && (
          <div className='mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-zeli-surface'>
            <CheckCircle aria-hidden className='h-7 w-7 text-zeli-success' />
          </div>
        )}
        {isPaymentPending && (
          <div className='mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-zeli-blush-soft'>
            <Clock aria-hidden className='h-7 w-7 text-zeli-ink-secondary' />
          </div>
        )}
        {isPaymentFailed && (
          <div className='mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-zeli-blush-soft'>
            <XCircle aria-hidden className='h-7 w-7 text-zeli-sale' />
          </div>
        )}

        {/* Heading */}
        {/* Every sentence below is limited to something this page actually
            knows: whether the order row was created, and what the payment
            gateway (or the absence of one) reported. Nothing here states a
            delivery date, a courier, a confirmation call or a shipping
            window — ZELI has set none of those. */}
        {isPaymentSuccess && (
          <>
            <h1 className='zeli-section-title'>Order placed</h1>
            <p className='mt-2 text-[length:var(--zeli-text-body)] text-zeli-ink-muted'>
              Your order has been received.
              {paymentState === "success" &&
                verifiedPaymentStatus === "paid" &&
                " Payment received."}
            </p>
          </>
        )}
        {isPaymentPending && (
          <>
            <h1 className='zeli-section-title'>Payment pending</h1>
            <p className='mt-2 text-[length:var(--zeli-text-body)] text-zeli-ink-muted'>
              Your order has been created. The payment provider has not
              confirmed the payment yet.
            </p>
          </>
        )}
        {isPaymentFailed && (
          <>
            <h1 className='zeli-section-title'>
              Payment {paymentState === "cancelled" ? "cancelled" : "failed"}
            </h1>
            <p className='mt-2 text-[length:var(--zeli-text-body)] text-zeli-ink-muted'>
              {paymentState === "cancelled"
                ? "The payment was cancelled. Your order has been saved and is unpaid."
                : "The payment did not go through. Your order has been saved and is unpaid."}
            </p>
          </>
        )}

        {/* Order Details Card */}
        <div className='mt-8 mb-8 space-y-3 overflow-x-auto bg-zeli-surface p-6 text-start'>
          {shortId && (
            <div className='flex justify-between items-center flex-wrap gap-2'>
              <span className='text-sm text-zeli-ink-muted'>Order number</span>
              <span className='font-mono text-sm font-medium text-zeli-ink'>
                #{shortId}
              </span>
            </div>
          )}
          {orderTotal && (
            <div className='flex justify-between items-center flex-wrap gap-2'>
              <span className='text-sm text-zeli-ink-muted'>Total</span>
              <span className='text-sm font-semibold text-zeli-ink'>
                {Number.parseFloat(orderTotal).toFixed(2)} EGP
              </span>
            </div>
          )}
          {customerEmail && (
            <div className='flex justify-between items-center flex-wrap gap-2 '>
              <span className='text-sm text-zeli-ink-muted'>
                Order email
              </span>
              <span className='whitespace-nowrap text-sm text-zeli-ink'>{customerEmail}</span>
            </div>
          )}
          <div className='flex justify-between items-center flex-wrap gap-2'>
            <span className='text-sm text-zeli-ink-muted'>Status</span>
            {isPaymentSuccess && (
              <span className='inline-flex items-center gap-1.5 rounded-full bg-zeli-blush-soft px-2.5 py-0.5 text-sm font-medium text-zeli-ink-secondary'>
                <Package aria-hidden className='h-3.5 w-3.5' />
                Processing
              </span>
            )}
            {isPaymentPending && (
              <span className='inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-zeli-blush-soft px-2.5 py-0.5 text-sm font-medium text-zeli-ink-secondary'>
                <Clock aria-hidden className='h-3.5 w-3.5' />
                Awaiting payment
              </span>
            )}
            {isPaymentFailed && (
              <span className='inline-flex items-center gap-1.5 rounded-full bg-zeli-blush-soft px-2.5 py-0.5 text-sm font-medium text-zeli-sale'>
                <AlertTriangle aria-hidden className='h-3.5 w-3.5' />
                Payment {paymentState === "cancelled" ? "cancelled" : "failed"}
              </span>
            )}
          </div>
        </div>

        {/* Info text */}
        {/* "We've sent a confirmation email … You'll receive shipping
            updates as your order progresses" was asserted unconditionally.
            The email only goes out when SMTP is configured, and there is no
            shipping-update pipeline at all — so the page promised two things
            an unconfigured store does not do. "Don't worry — no charges were
            made" was likewise asserted for a *failed* payment, which this
            page cannot know. */}
        {isPaymentPending && (
          <p className='mb-8 text-sm text-zeli-ink-muted'>
            A completed payment can take a few minutes to show here.
          </p>
        )}
        {isPaymentFailed && (
          <p className='mb-8 text-sm text-zeli-ink-muted'>
            Any amount the provider authorised is released by the provider, not
            by this store.
          </p>
        )}

        {/* Actions */}
        <div className='mt-6 flex flex-col justify-center gap-3 sm:flex-row'>
          <Button asChild variant='outline' className='min-h-11 gap-2'>
            <Link href='/'>
              <Home aria-hidden className='h-4 w-4' />
              <span className='text-xs md:text-sm'>Back to home</span>
            </Link>
          </Button>
          <Button asChild className='min-h-11 gap-2'>
            <Link href='/shop'>
              <ShoppingBag aria-hidden className='h-4 w-4' />
              <span className='text-xs md:text-sm'>Continue shopping</span>
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
