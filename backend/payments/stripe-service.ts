/**
 * Stripe Payment Gateway Service
 *
 * Creates Stripe Checkout Sessions and verifies webhook signatures.
 * Only active when STRIPE_SECRET_KEY is set in environment.
 */

import { Effect } from "effect";
import { ServerError } from "#root/shared/error/server";
import { getStripeConfig, isStripeConfigured } from "#root/shared/config/payment";

// Lazy-loaded Stripe instance (avoids import errors when Stripe isn't installed)
let stripeInstance: any = null;

async function getStripe() {
  if (!isStripeConfigured()) {
    throw new Error("Stripe is not configured");
  }
  if (!stripeInstance) {
    const { default: Stripe } = await import("stripe");
    stripeInstance = new Stripe(getStripeConfig().secretKey, {
      apiVersion: "2024-12-18.acacia" as any,
    });
  }
  return stripeInstance;
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CreateStripeSessionInput {
  orderId: string;
  customerEmail: string;
  customerName: string;
  items: Array<{
    name: string;
    quantity: number;
    priceInCents: number; // unit price in smallest currency unit
  }>;
  totalInCents: number;
  currency: string;
  successUrl: string;
  cancelUrl: string;
  shippingInCents?: number;
  taxInCents?: number;
  discountInCents?: number;
}

export interface StripeSessionResult {
  sessionId: string;
  checkoutUrl: string;
}

// ─── Service ────────────────────────────────────────────────────────────────

/**
 * Create a Stripe Checkout Session for an order
 */
export const createStripeCheckoutSession = (
  input: CreateStripeSessionInput,
) =>
  Effect.tryPromise({
    try: async () => {
      const stripe = await getStripe();

      const lineItems = input.items.map((item) => ({
        price_data: {
          currency: input.currency.toLowerCase(),
          product_data: {
            name: item.name,
          },
          unit_amount: item.priceInCents,
        },
        quantity: item.quantity,
      }));

      // Add shipping as a line item if present
      if (input.shippingInCents && input.shippingInCents > 0) {
        lineItems.push({
          price_data: {
            currency: input.currency.toLowerCase(),
            product_data: {
              name: "Shipping",
            },
            unit_amount: input.shippingInCents,
          },
          quantity: 1,
        });
      }

      // Add tax as a line item if present
      if (input.taxInCents && input.taxInCents > 0) {
        lineItems.push({
          price_data: {
            currency: input.currency.toLowerCase(),
            product_data: {
              name: "Tax",
            },
            unit_amount: input.taxInCents,
          },
          quantity: 1,
        });
      }

      const sessionParams: any = {
        mode: "payment",
        payment_method_types: ["card"],
        line_items: lineItems,
        customer_email: input.customerEmail,
        metadata: {
          orderId: input.orderId,
        },
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
      };

      // Add discount as a coupon if present
      if (input.discountInCents && input.discountInCents > 0) {
        const coupon = await stripe.coupons.create({
          amount_off: input.discountInCents,
          currency: input.currency.toLowerCase(),
          duration: "once",
          name: "Order Discount",
        });
        sessionParams.discounts = [{ coupon: coupon.id }];
      }

      const session = await stripe.checkout.sessions.create(sessionParams);

      return {
        sessionId: session.id,
        checkoutUrl: session.url!,
      } as StripeSessionResult;
    },
    catch: (error) =>
      new ServerError({
        tag: "PaymentError",
        message: `Failed to create Stripe checkout session: ${error instanceof Error ? error.message : "Unknown error"}`,
        statusCode: 502,
        clientMessage: "Failed to create payment session",
      }),
  });

/**
 * Verify and parse a Stripe webhook event
 */
export const verifyStripeWebhook = (rawBody: string | Buffer, signature: string) =>
  Effect.tryPromise({
    try: async () => {
      const stripe = await getStripe();
      const { webhookSecret } = getStripeConfig();

      if (!webhookSecret) {
        throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
      }

      const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
      return event;
    },
    catch: (error) =>
      new ServerError({
        tag: "WebhookError",
        message: `Stripe webhook verification failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        statusCode: 400,
        clientMessage: "Webhook verification failed",
      }),
  });

/**
 * Retrieve a Stripe Checkout Session by ID
 */
export const getStripeSession = (sessionId: string) =>
  Effect.tryPromise({
    try: async () => {
      const stripe = await getStripe();
      return await stripe.checkout.sessions.retrieve(sessionId);
    },
    catch: (error) =>
      new ServerError({
        tag: "PaymentError",
        message: `Failed to retrieve Stripe session: ${error instanceof Error ? error.message : "Unknown error"}`,
        statusCode: 502,
        clientMessage: "Failed to check payment status",
      }),
  });
