"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTracking } from "#root/frontend/contexts/TrackingContext";
import { TrackingEventName } from "#root/shared/types/pixel-tracking";
import { STORE_CURRENCY } from "#root/shared/config/branding";
import { useCart } from "#root/lib/context/CartContext";
import { trpc } from "#root/shared/trpc/client";
import { OrderConfirmationCard } from "./OrderConfirmationCard";
import {
  deriveConfirmationView,
  isOrderReference,
  parsePaymentParam,
  type OrderLookup,
  type OrderPaymentStatus,
} from "./confirmation-state";

const POLL_INTERVAL_MS = 4000;
const POLL_TIMEOUT_MS = 60000;

export default function OrderConfirmationPage() {
  // There is no query string to read during SSR, so the server cannot know
  // which order this is. It renders the neutral loading card and the browser
  // resolves the real state on hydration — never a confirmation, and never a
  // not-found flash in front of a customer whose order is fine.
  const isBrowser = typeof window !== "undefined";
  const searchParams = isBrowser
    ? new URLSearchParams(window.location.search)
    : null;
  const orderIdParam = searchParams?.get("id") ?? "";
  const orderTotal = searchParams?.get("total") ?? "";
  const customerEmail = searchParams?.get("email") ?? "";
  const paymentParam = parsePaymentParam(searchParams?.get("payment") ?? null);

  // Only a well-formed reference is worth a round trip; anything else is a
  // direct visit and resolves to the not-found state without a request.
  const orderId = isOrderReference(orderIdParam) ? orderIdParam : null;

  // `loading` until the server has answered.
  const [lookup, setLookup] = useState<OrderLookup>(
    orderId || !isBrowser ? { status: "loading" } : { status: "missing" },
  );

  // ─── Verify the order against the backend ───────────────────────────────
  // This runs for EVERY flow, not just the online-payment return. It is what
  // makes "Order placed" conditional on an order actually existing: a COD
  // order verifies as `not_required`, and a fabricated id 404s.
  useEffect(() => {
    if (!orderId) {
      setLookup({ status: "missing" });
      return;
    }

    setLookup({ status: "loading" });

    let cancelled = false;
    let interval: number | undefined;

    const stopPolling = () => {
      if (interval) {
        window.clearInterval(interval);
        interval = undefined;
      }
    };

    const verify = async () => {
      try {
        const result = await trpc.payment.verify.query({ orderId });
        if (cancelled) return;

        if (!result || !("success" in result) || !result.success) {
          // Order not found (or the server refused) — say so rather than
          // assuming the happy path.
          setLookup({ status: "missing" });
          stopPolling();
          return;
        }

        const paymentStatus = result.result
          ?.paymentStatus as OrderPaymentStatus | undefined;
        if (!paymentStatus) {
          setLookup({ status: "missing" });
          stopPolling();
          return;
        }

        setLookup({ status: "found", order: { paymentStatus } });
        if (paymentStatus !== "pending" && paymentStatus !== "processing") {
          stopPolling();
        }
      } catch {
        // A transport failure is not evidence that the order exists — but it
        // is not evidence that it doesn't, either. Leave a lookup that has
        // already succeeded alone and only fail an as-yet-unanswered one, so
        // one dropped poll cannot turn a confirmed order into "not found".
        if (!cancelled) {
          setLookup((prev) =>
            prev.status === "found" ? prev : { status: "missing" },
          );
        }
      }
    };

    void verify();
    interval = window.setInterval(verify, POLL_INTERVAL_MS);
    const timeout = window.setTimeout(stopPolling, POLL_TIMEOUT_MS);

    return () => {
      cancelled = true;
      stopPolling();
      window.clearTimeout(timeout);
    };
  }, [orderId]);

  const view = useMemo(
    () =>
      isBrowser
        ? deriveConfirmationView({ orderRef: orderId, paymentParam, lookup })
        : ({ kind: "loading" } as const),
    [isBrowser, orderId, paymentParam, lookup],
  );

  const { trackEvent } = useTracking();
  const { clearCart } = useCart();
  const hasTrackedCompletion = useRef<string | null>(null);

  // ─── Clear cart once the order is known to exist ───────────────────────
  // For online payments, clearCart is NOT called before redirect (so pressing
  // back in the browser keeps the cart intact). This effect clears it once
  // the server has confirmed the order.
  useEffect(() => {
    if (!orderId) return;
    if (view.kind !== "placed" && view.kind !== "pending") return;
    try {
      const key = `pending_cart_clear:${orderId}`;
      if (sessionStorage.getItem(key)) {
        clearCart();
        sessionStorage.removeItem(key);
      }
    } catch {
      /* best-effort */
    }
  }, [orderId, view.kind, clearCart]);

  // ─── Fire checkout_completed once per order ────────────────────────────
  // Only for a verified, placed order — a direct visit must not emit a
  // Purchase event. Uses sessionStorage keyed by orderId to survive refresh;
  // the ref guards React strict-mode double-effects within one mount.
  useEffect(() => {
    if (!orderId || view.kind !== "placed") return;
    if (hasTrackedCompletion.current === orderId) return;

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
  }, [orderId, orderTotal, view.kind, trackEvent]);

  // Order number, total and email are shown only alongside a verified order,
  // so a crafted `?total=` on a direct visit renders nothing.
  const shortId =
    lookup.status === "found" && orderId
      ? orderId.substring(0, 8).toUpperCase()
      : "";

  return (
    <OrderConfirmationCard
      view={view}
      shortId={shortId}
      orderTotal={orderTotal}
      customerEmail={customerEmail}
    />
  );
}
