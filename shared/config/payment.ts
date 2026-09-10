/**
 * Payment Gateway Configuration
 *
 * Auto-detects which payment gateways are available based on environment variables.
 * If no gateway keys are configured, the system falls back to COD-only mode.
 *
 * Supported gateways:
 * - Stripe: Set STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET
 * - Paymob: Set PAYMOB_API_KEY + PAYMOB_INTEGRATION_ID + PAYMOB_HMAC_SECRET
 */

// ─── Gateway detection ──────────────────────────────────────────────────────

export type PaymentGateway = "stripe" | "paymob";
export type PaymentMethod = "cod" | "stripe" | "paymob";

function isNonEmpty(val: string | undefined): boolean {
  return typeof val === "string" && val.trim().length > 0;
}

/** Check if Stripe is configured (requires secret key at minimum) */
export function isStripeConfigured(): boolean {
  return isNonEmpty(process.env.STRIPE_SECRET_KEY);
}

/** Check if Paymob is configured (requires secret key + at least one integration ID) */
export function isPaymobConfigured(): boolean {
  const hasKey =
    isNonEmpty(process.env.PAYMOB_SECRET_KEY) ||
    isNonEmpty(process.env.PAYMOB_API_KEY);
  const hasIntegration =
    isNonEmpty(process.env.PAYMOB_CARD_INTEGRATION_ID) ||
    isNonEmpty(process.env.PAYMOB_WALLET_INTEGRATION_ID) ||
    isNonEmpty(process.env.PAYMOB_INTEGRATION_ID);
  return hasKey && hasIntegration;
}

/** Returns array of all active gateways (empty = COD only) */
export function getActiveGateways(): PaymentGateway[] {
  const gateways: PaymentGateway[] = [];
  if (isStripeConfigured()) gateways.push("stripe");
  if (isPaymobConfigured()) gateways.push("paymob");
  return gateways;
}

/** Returns all available payment methods (always includes COD) */
export function getAvailablePaymentMethods(): PaymentMethod[] {
  const methods: PaymentMethod[] = ["cod"];
  if (isStripeConfigured()) methods.push("stripe");
  if (isPaymobConfigured()) methods.push("paymob");
  return methods;
}

/** Whether any online payment gateway is configured */
export function hasOnlinePayment(): boolean {
  return isStripeConfigured() || isPaymobConfigured();
}

// ─── Config accessors (server-side only) ────────────────────────────────────

export function getStripeConfig() {
  return {
    secretKey: process.env.STRIPE_SECRET_KEY ?? "",
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
    publicKey: process.env.VITE_STRIPE_PUBLIC_KEY ?? "",
  };
}

export function getPaymobConfig() {
  return {
    // New-format keys (preferred)
    secretKey:
      process.env.PAYMOB_SECRET_KEY ?? process.env.PAYMOB_API_KEY ?? "",
    publicKey: process.env.PAYMOB_PUBLIC_KEY ?? "",
    cardIntegrationId:
      process.env.PAYMOB_CARD_INTEGRATION_ID ??
      process.env.PAYMOB_INTEGRATION_ID ??
      "",
    walletIntegrationId: process.env.PAYMOB_WALLET_INTEGRATION_ID ?? "",
    hmacSecret: process.env.PAYMOB_HMAC_SECRET ?? "",
    baseUrl: process.env.PAYMOB_BASE_URL ?? "https://accept.paymob.com",
    // Legacy aliases kept for any old call-sites
    apiKey:
      process.env.PAYMOB_API_KEY ?? process.env.PAYMOB_SECRET_KEY ?? "",
    integrationId:
      process.env.PAYMOB_CARD_INTEGRATION_ID ??
      process.env.PAYMOB_INTEGRATION_ID ??
      "",
    iframeId: process.env.PAYMOB_IFRAME_ID ?? "",
  };
}

// ─── Display helpers ────────────────────────────────────────────────────────

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cod: "Cash on Delivery",
  stripe: "Credit / Debit Card",
  paymob: "Online Payment",
};

export const PAYMENT_METHOD_DESCRIPTIONS: Record<PaymentMethod, string> = {
  cod: "Pay when your order is delivered to your doorstep",
  stripe: "Pay securely with Visa, Mastercard, or other cards via Stripe",
  paymob: "Pay securely online via Paymob (cards, wallets, installments)",
};
