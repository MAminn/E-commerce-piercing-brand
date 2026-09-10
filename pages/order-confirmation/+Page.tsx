"use client";

import { useEffect, useRef, useState } from "react";
import { usePageContext } from "vike-react/usePageContext";
import { Link } from "#root/components/utils/Link";
import {
  CheckCircle,
  Package,
  ArrowRight,
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
  const pageContext = usePageContext();
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
    <div className='min-h-screen bg-gray-50 flex items-center justify-center px-4 py-16'>
      <div
        className='max-w-2xl w-full bg-white rounded-2xl shadow-sm border border-gray-100 text-center flex flex-col'
        style={{ padding: '2rem 2rem 3.5rem', }}>
        {/* Icon */}
        {isPaymentSuccess && (
          <div className='mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-6'>
            <CheckCircle className='w-8 h-8 text-green-600' />
          </div>
        )}
        {isPaymentPending && (
          <div className='mx-auto w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mb-6'>
            <Clock className='w-8 h-8 text-amber-600' />
          </div>
        )}
        {isPaymentFailed && (
          <div className='mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-6'>
            <XCircle className='w-8 h-8 text-red-600' />
          </div>
        )}

        {/* Heading */}
        {isPaymentSuccess && (
          <>
            <h1 className='text-2xl md:text-3xl font-semibold text-gray-900 mb-2'>
              Order Confirmed!
            </h1>
            <p className='text-gray-500 mb-6'>
              Thank you for your purchase. Your order has been placed
              successfully.
              {paymentState === "success" && verifiedPaymentStatus === "paid" && " Payment received."}
            </p>
          </>
        )}
        {isPaymentPending && (
          <>
            <h1 className='text-2xl md:text-3xl font-semibold text-gray-900 mb-2'>
              Payment Pending
            </h1>
            <p className='text-gray-500 mb-6'>
              Your order has been created, but payment is still being processed.
              You'll receive a confirmation email once payment is complete.
            </p>
          </>
        )}
        {isPaymentFailed && (
          <>
            <h1 className='text-2xl md:text-3xl font-semibold text-amber-900 mb-2'>
              Payment {paymentState === "cancelled" ? "Cancelled" : "Failed"}
            </h1>
            <p className='text-gray-500 mb-6'>
              {paymentState === "cancelled"
                ? "You cancelled the payment. Your order has been saved — you can retry payment or contact support."
                : "There was an issue processing your payment. Your order has been saved — please try again or contact support."}
            </p>
          </>
        )}

        {/* Order Details Card */}
        <div className='bg-gray-50 rounded-xl p-6 mb-8 text-left space-y-3 overflow-x-auto'>
          {shortId && (
            <div className='flex justify-between items-center flex-wrap gap-2'>
              <span className='text-sm text-gray-500'>Order Number</span>
              <span className='text-sm font-mono font-medium text-gray-900'>
                #{shortId}
              </span>
            </div>
          )}
          {orderTotal && (
            <div className='flex justify-between items-center flex-wrap gap-2'>
              <span className='text-sm text-gray-500'>Total</span>
              <span className='text-sm font-semibold text-gray-900'>
                {Number.parseFloat(orderTotal).toFixed(2)} EGP
              </span>
            </div>
          )}
          {customerEmail && (
            <div className='flex justify-between items-center flex-wrap gap-2 '>
              <span className='text-sm text-gray-500'>
                Confirmation sent to
              </span>
              <span className='text-sm text-gray-900 whitespace-nowrap '>{customerEmail}</span>
            </div>
          )}
          <div className='flex justify-between items-center flex-wrap gap-2'>
            <span className='text-sm text-gray-500'>Status</span>
            {isPaymentSuccess && (
              <span className='inline-flex items-center gap-1.5 text-sm font-medium text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-full'>
                <Package className='w-3.5 h-3.5' />
                Processing
              </span>
            )}
            {isPaymentPending && (
              <span className='inline-flex items-center gap-1.5 text-sm font-medium text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-full whitespace-nowrap'>
                <Clock className='w-3.5 h-3.5' />
                Awaiting Payment
              </span>
            )}
            {isPaymentFailed && (
              <span className='inline-flex items-center gap-1.5 text-sm font-medium text-red-700 bg-red-50 px-2.5 py-0.5 rounded-full'>
                <AlertTriangle className='w-3.5 h-3.5' />
                Payment {paymentState === "cancelled" ? "Cancelled" : "Failed"}
              </span>
            )}
          </div>
        </div>

        {/* Info text */}
        {isPaymentSuccess && (
          <p className='text-sm text-gray-400 mb-8'>
            We've sent a confirmation email with your order details. You'll
            receive shipping updates as your order progresses.
          </p>
        )}
        {isPaymentPending && (
          <p className='text-sm text-gray-400 mb-8'>
            If your payment was completed, it may take a few minutes to process.
            Check your email for updates.
          </p>
        )}
        {isPaymentFailed && (
          <p className='text-sm text-gray-400 mb-8'>
            Don't worry — no charges were made. You can contact us at support
            for help.
          </p>
        )}

        {/* Actions */}
        <div className='flex flex-col sm:flex-row gap-3 justify-center mt-6'>
          <Button asChild variant='outline' className='gap-2'>
            <Link href='/'>
              <Home className='w-4 h-4' />
              <span className='text-xs md:text-sm'>Back to Home</span>
            </Link>
          </Button>
          <Button
            asChild
            className='gap-2 text-white'>
            <Link href='/shop'>
              <ShoppingBag className='w-4 h-4' />
              <span className='text-xs md:text-sm'>Continue Shopping</span>
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
