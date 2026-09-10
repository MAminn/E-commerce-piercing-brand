"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import {
  useCart,
  type CartItem as ContextCartItem,
  type PromoCodeInfo,
} from "#root/lib/context/CartContext";
import { useTemplate } from "#root/frontend/contexts/TemplateContext";
import { getTemplateComponent } from "#root/components/template-system/templateConfig";
import { trpc } from "#root/shared/trpc/client";
import type {
  CheckoutPageModernTemplateProps,
  CheckoutCustomerInfo,
  CheckoutAddress,
  CheckoutOrderSummaryItem,
  CheckoutTotals,
} from "#root/components/template-system";
import { STORE_CURRENCY } from "#root/shared/config/branding";
import { navigate } from "vike/client/router";
import { useTracking } from "#root/frontend/contexts/TrackingContext";
import { TrackingEventName } from "#root/shared/types/pixel-tracking";
import { getCartSessionToken } from "#root/lib/cart-session";

/** Parse a Zod validation error (JSON array) into a friendly message */
function parseOrderError(error: unknown): string {
  if (error instanceof Error) {
    const msg = error.message;
    // Try to parse Zod-style array of issues
    try {
      const issues = JSON.parse(msg);
      if (Array.isArray(issues)) {
        const fieldLabels: Record<string, string> = {
          customerName: "Full Name",
          customerEmail: "Email",
          customerPhone: "Phone Number",
          shippingAddress: "Shipping Address",
          shippingCity: "City",
          shippingState: "Governorate",
          shippingPostalCode: "Postal Code",
          shippingCountry: "Country",
          buildingNumber: "Building Number",
          apartment: "Apartment",
        };
        return issues
          .map((issue: { path?: string[]; message?: string }) => {
            const field = issue.path?.[0];
            const label = field
              ? (fieldLabels[field] ?? field)
              : "Unknown field";
            return `${label}: ${issue.message ?? "Invalid value"}`;
          })
          .join("\n");
      }
    } catch {
      // Not JSON — use raw message
    }
    return msg;
  }
  return "Failed to submit order. Please try again.";
}

export default function CheckoutPage() {
  const {
    items,
    totalItems,
    subtotal,
    discount,
    shipping,
    total,
    promoCode,
    clearCart,
    appliedOffers,
    applyPromoCode,
    removePromoCode,
    promoCodeNotice,
    clearPromoCodeNotice,
  } = useCart();
  const { getTemplateId } = useTemplate();
  const { trackEvent } = useTracking();
  const hasTrackedCheckoutStart = useRef(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(
    undefined,
  );

  // ─── Fetch available payment methods from server ──────────────────────────
  const [paymentMethods, setPaymentMethods] = useState<
    Array<{ id: string; label: string; description: string }>
  >([]);
  const [paymentMethodsLoading, setPaymentMethodsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await trpc.payment.methods.query();
        if (!cancelled && res?.methods) {
          setPaymentMethods(res.methods);
        }
      } catch (err) {
        console.warn(
          "[Checkout] Could not fetch payment methods, defaulting to COD:",
          err,
        );
        // Fallback — just show COD
        if (!cancelled) {
          setPaymentMethods([
            {
              id: "cod",
              label: "Cash on Delivery",
              description: "Pay when your order is delivered",
            },
          ]);
        }
      } finally {
        if (!cancelled) setPaymentMethodsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ─── Fire checkout_started once per cart state per session ────────────────
  // Uses sessionStorage with a cart fingerprint to avoid re-firing on refresh
  // while still firing if the user returns with a meaningfully different cart.
  useEffect(() => {
    if (hasTrackedCheckoutStart.current || items.length === 0) return;

    // Build a simple fingerprint: sorted item IDs + quantities
    const fingerprint = items
      .map((item) => `${item.id}:${item.quantity}`)
      .sort()
      .join(",");
    const storageKey = "tracked_checkout_started";

    try {
      if (sessionStorage.getItem(storageKey) === fingerprint) return;
    } catch {
      /* SSR or private browsing — fall through to ref guard */
    }

    hasTrackedCheckoutStart.current = true;

    try {
      sessionStorage.setItem(storageKey, fingerprint);
    } catch {
      /* best-effort */
    }

    trackEvent(TrackingEventName.CHECKOUT_STARTED, {
      ecommerce: {
        currency: STORE_CURRENCY,
        value: total,
        items: items.map((item) => ({
          itemId: item.id,
          itemName: item.name,
          price: item.price,
          quantity: item.quantity,
          category: item.categoryName ?? undefined,
        })),
        coupon: promoCode?.code ?? undefined,
      },
    });
  }, [items, total, promoCode, trackEvent]);

  // Convert cart items to checkout order summary items
  const orderItems: CheckoutOrderSummaryItem[] = useMemo(() => {
    return items.map((item: ContextCartItem) => ({
      id: item.id,
      name: item.name,
      price: item.price,
      originalPrice: item.originalPrice ?? undefined,
      quantity: item.quantity,
      imageUrl: item.imageUrl ?? undefined,
      variant: item.selectedOptions
        ? Object.entries(item.selectedOptions)
            .map(([key, value]) => `${key}: ${value}`)
            .join(", ") || undefined
        : undefined,
    }));
  }, [items]);

  // Build totals object
  const totals: CheckoutTotals = useMemo(() => {
    return {
      subtotal,
      discount: discount > 0 ? discount : undefined,
      shipping: shipping > 0 ? shipping : undefined,
      grandTotal: total,
      appliedOffers: appliedOffers.length > 0 ? appliedOffers : undefined,
    };
  }, [subtotal, discount, shipping, total, appliedOffers]);

  // Handle form submit
  const handleSubmit = async (
    formValues: Record<string, string>,
  ): Promise<void> => {
    setIsSubmitting(true);
    setErrorMessage(undefined);

    const selectedPaymentMethod = formValues.paymentMethod || "cod";
    const isOnlinePayment =
      selectedPaymentMethod === "stripe" || selectedPaymentMethod === "paymob";

    try {
      // Validate cart has items
      if (items.length === 0) {
        throw new Error(
          "Your cart is empty. Please add items before placing an order.",
        );
      }

      // Prepare order items
      const orderItemsPayload = items.map((item) => {
        const variantStr = item.selectedOptions
          ? Object.entries(item.selectedOptions)
              .map(([k, v]) => `${k}: ${v}`)
              .join(", ")
          : "";
        return {
          productId: item.id,
          quantity: item.quantity,
          selectedOptions: variantStr || undefined,
        };
      });

      // Submit order via tRPC (with paymentMethod)
      const result = await trpc.order.create.mutate({
        customerName: formValues.fullName || "",
        customerEmail: formValues.email || "",
        customerPhone: formValues.phoneNumber || "",
        shippingAddress: formValues.address || "",
        shippingCity: formValues.city || "",
        shippingState: formValues.state ?? "",
        shippingPostalCode: formValues.postalCode ?? "",
        shippingCountry: formValues.country || "Egypt",
        items: orderItemsPayload,
        notes: formValues.notes || undefined,
        promoCodeId: promoCode?.id,
        paymentMethod: selectedPaymentMethod as "cod" | "stripe" | "paymob",
        buildingNumber: formValues.buildingNumber || undefined,
        apartment: formValues.apartment || undefined,
      });

      if (!result.success) {
        throw new Error(result.error || "Failed to create order");
      }

      const orderId = result.result?.id ?? "";
      const orderTotal = result.result?.total ?? "";
      const email = encodeURIComponent(formValues.email || "");

      // Stop any pending abandoned-cart emails for this browser session now
      // that a real order exists. Fire-and-forget by design — this must
      // never delay or block checkout. A failure here is rare and would
      // only mean a stale abandoned-cart email could still go out for an
      // order that already completed.
      if (orderId) {
        trpc.cartCapture.markConverted
          .mutate({ sessionToken: getCartSessionToken(), orderId })
          .catch(() => {});
      }

      // Persist cart items for the Purchase tracking event on confirmation page
      try {
        sessionStorage.setItem(
          `checkout_items:${orderId}`,
          JSON.stringify(
            items.map((item) => ({
              itemId: item.id,
              itemName: item.name,
              price: item.price,
              quantity: item.quantity,
              category: item.categoryName ?? undefined,
            })),
          ),
        );
      } catch {
        /* best-effort — tracking still works with value/transactionId */
      }

      // ─── Online payment: create payment session & redirect ──────────
      if (isOnlinePayment && orderId) {
        try {
          const origin =
            typeof window !== "undefined" ? window.location.origin : "";
          const paymentResult = await trpc.payment.createSession.mutate({
            orderId,
            paymentMethod: selectedPaymentMethod as "stripe" | "paymob",
            successUrl: `${origin}/order-confirmation?id=${orderId}&total=${orderTotal}&email=${email}&payment=success`,
            cancelUrl: `${origin}/order-confirmation?id=${orderId}&total=${orderTotal}&email=${email}&payment=cancelled`,
          });

          if (paymentResult.success && paymentResult.result?.paymentUrl) {
            // Do NOT clear the cart before redirecting — the user may press back.
            // Mark the order as pending-clear so the confirmation page clears it on success.
            try {
              sessionStorage.setItem(`pending_cart_clear:${orderId}`, "1");
            } catch { /* best-effort */ }
            // Redirect to payment gateway
            window.location.href = paymentResult.result.paymentUrl;
            return;
          }

          throw new Error(
            "Could not create payment session. Please try again.",
          );
        } catch (payErr) {
          console.error("[Checkout] Payment session creation failed:", payErr);
          setErrorMessage(
            "Failed to initialize payment. Your order was created — you can pay later from your order history, or contact support.",
          );
          // Still clear cart and navigate to confirmation (order exists, payment pending)
          clearCart();
          navigate(
            `/order-confirmation?id=${orderId}&total=${orderTotal}&email=${email}&payment=pending`,
          );
          return;
        }
      }

      // ─── COD flow: just navigate to confirmation ──────────────────────
      clearCart();
      navigate(
        `/order-confirmation?id=${orderId}&total=${orderTotal}&email=${email}`,
      );
    } catch (error) {
      console.error("[Checkout] Order submission failed:", error);
      setErrorMessage(parseOrderError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle edit cart
  const handleEditCart = (): void => {
    navigate("/cart");
  };

  const handleApplyCoupon = async (
    code: string,
  ): Promise<{ success: boolean; message: string }> => {
    return await applyPromoCode(code);
  };

  // Get template component
  const templateId = getTemplateId("checkoutPage");
  const Template = getTemplateComponent(
    "checkoutPage",
    templateId || "checkout-modern",
  );

  if (!Template) {
    return <div>Template not found: {templateId}</div>;
  }

  const templateProps: CheckoutPageModernTemplateProps = {
    items: orderItems,
    totals,
    isSubmitting,
    errorMessage,
    onSubmit: handleSubmit,
    onEditCart: handleEditCart,
    currency: STORE_CURRENCY,
    paymentMethods,
    paymentMethodsLoading,
    onApplyCoupon: handleApplyCoupon,
    appliedCoupon: promoCode
      ? {
          code: promoCode.code,
          discountLabel:
            promoCode.discountLabel ??
            (promoCode.discountType === "percentage"
              ? `${promoCode.discountValue}% off`
              : `${promoCode.discountValue.toFixed(2)} EGP off`),
        }
      : null,
    onRemoveCoupon: removePromoCode,
    couponNotice: promoCodeNotice,
    onDismissCouponNotice: clearPromoCodeNotice,
  };

  return <Template.component {...templateProps} />;
}
