/**
 * Paymob Payment Gateway Service
 *
 * Creates Paymob payment sessions using the Intention API.
 * Only active when PAYMOB_API_KEY + PAYMOB_INTEGRATION_ID are set.
 *
 * Flow:
 * 1. Create a payment intention via Paymob API
 * 2. Redirect customer to Paymob's hosted checkout page
 * 3. Receive webhook callback on payment completion
 */

import { Effect } from "effect";
import { ServerError } from "#root/shared/error/server";
import { getPaymobConfig, isPaymobConfigured } from "#root/shared/config/payment";
import { getPublicOrigin } from "#root/shared/config/site-url";
import axios from "axios";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CreatePaymobSessionInput {
  orderId: string;
  customerEmail: string;
  customerName: string;
  customerPhone: string;
  totalInCents: number; // amount in smallest currency unit (piasters for EGP)
  currency: string;
  items: Array<{
    name: string;
    quantity: number;
    priceInCents: number;
  }>;
  successUrl: string;
  cancelUrl: string;
}

export interface PaymobSessionResult {
  sessionId: string;
  paymentUrl: string;
  clientSecret: string;
}

// ─── Service ────────────────────────────────────────────────────────────────

/**
 * Create a Paymob payment intention
 */
export const createPaymobPaymentSession = (
  input: CreatePaymobSessionInput,
) =>
  Effect.tryPromise({
    try: async () => {
      if (!isPaymobConfigured()) {
        throw new Error("Paymob is not configured");
      }

      const config = getPaymobConfig();

      const items = input.items.map((item) => ({
        name: item.name,
        amount: item.priceInCents,
        quantity: item.quantity,
        description: item.name,
      }));

      // Paymob requires sum(item.amount * item.quantity) === total amount exactly.
      // Since totalInCents includes shipping and discounts, the per-product items
      // won't match. Represent the whole order as one line item to guarantee alignment.
      const paymobItems = [
        {
          name: `Order (${input.items.length} item${input.items.length !== 1 ? "s" : ""})`,
          amount: input.totalInCents,
          quantity: 1,
          description: input.items.map((i) => i.name).join(", ").slice(0, 200),
        },
      ];

      const [firstName, ...lastParts] = input.customerName.split(" ");
      const lastName = lastParts.join(" ") || firstName;

      // Normalize phone to E.164 — Paymob requires +XXXXXXXXXXXX format
      const normalizePhone = (phone: string): string => {
        const digits = phone.replace(/\D/g, "");
        if (phone.startsWith("+")) return phone; // already international
        if (digits.startsWith("20") && digits.length === 12) return `+${digits}`; // 2012XXXXXXXX
        if (digits.startsWith("01") && digits.length === 11) return `+2${digits}`; // Egyptian mobile
        if (digits.startsWith("1") && digits.length === 10) return `+20${digits}`; // without leading 0
        return phone.startsWith("+") ? phone : `+${digits}`;
      };
      const phoneE164 = input.customerPhone
        ? normalizePhone(input.customerPhone)
        : "+201000000000";

      // Build integration ID list — include card and/or wallet IDs that are configured
      const paymentMethods = [
        config.cardIntegrationId,
        config.walletIntegrationId,
      ]
        .filter((id) => id.trim().length > 0)
        .map((id) => Number.parseInt(id, 10));

      const payload = {
        amount: input.totalInCents,
        currency: input.currency.toUpperCase(),
        payment_methods: paymentMethods,
        items: paymobItems,
        billing_data: {
          first_name: firstName,
          last_name: lastName,
          email: input.customerEmail,
          phone_number: phoneE164,
          apartment: "N/A",
          floor: "N/A",
          street: "N/A",
          building: "N/A",
          shipping_method: "N/A",
          postal_code: "N/A",
          city: "N/A",
          country: "EG",
          state: "N/A",
        },
        extras: {
          orderId: input.orderId,
        },
        special_reference: input.orderId,
        redirection_url: input.successUrl,
        notification_url: `${getPublicOrigin()}/api/webhooks/paymob`,
      };

      const response = await axios.post(
        `${config.baseUrl}/v1/intention/`,
        payload, {
        headers: {
          // New-format secret key; falls back to legacy API key for backward compat
          Authorization: `Token ${config.secretKey}`,
          "Content-Type": "application/json",
        },
      });

      const data = response.data;

      // Unified Checkout URL — publicKey + clientSecret (no iFrame ID needed)
      const paymentToken = data.client_secret;
      const paymentUrl = `${config.baseUrl}/unifiedcheckout/?publicKey=${config.publicKey}&clientSecret=${paymentToken}`;

      return {
        sessionId: data.id?.toString() ?? data.intention_id?.toString() ?? "",
        paymentUrl,
        clientSecret: paymentToken,
      } as PaymobSessionResult;
    },
    catch: (error) => {
      const msg =
        axios.isAxiosError(error) && error.response?.data
          ? JSON.stringify(error.response.data)
          : error instanceof Error
            ? error.message
            : "Unknown error";
      return new ServerError({
        tag: "PaymentError",
        message: `Failed to create Paymob payment session: ${msg}`,
        statusCode: 502,
        clientMessage: "Failed to create payment session",
      });
    },
  });

/**
 * Verify Paymob webhook HMAC signature
 */
export function verifyPaymobHmac(
  data: Record<string, any>,
  receivedHmac: string,
): boolean {
  const config = getPaymobConfig();
  if (!config.hmacSecret) return false;

  try {
    const crypto = require("node:crypto");

    // Paymob HMAC calculation uses specific fields concatenated in order
    const hmacFields = [
      "amount_cents",
      "created_at",
      "currency",
      "error_occured",
      "has_parent_transaction",
      "id",
      "integration_id",
      "is_3d_secure",
      "is_auth",
      "is_capture",
      "is_refunded",
      "is_standalone_payment",
      "is_voided",
      "order.id",
      "owner",
      "pending",
      "source_data.pan",
      "source_data.sub_type",
      "source_data.type",
      "success",
    ];

    const getValue = (obj: any, path: string): string => {
      const parts = path.split(".");
      let val = obj;
      for (const p of parts) {
        val = val?.[p];
      }
      return val?.toString() ?? "";
    };

    const concatenated = hmacFields.map((f) => getValue(data, f)).join("");
    const expectedHmac = crypto
      .createHmac("sha512", config.hmacSecret)
      .update(concatenated)
      .digest("hex");

    return expectedHmac === receivedHmac;
  } catch {
    return false;
  }
}

function isPaymobPayloadPaid(data: Record<string, unknown>): boolean {
  if (data.success === true || data.success === "true") return true;

  const status = String(data.status ?? data.payment_status ?? "").toLowerCase();
  if (["paid", "confirmed", "successful", "success"].includes(status)) {
    return true;
  }

  const transactions = [
    ...(Array.isArray(data.transactions) ? data.transactions : []),
    ...(data.transaction ? [data.transaction] : []),
  ] as Array<Record<string, unknown>>;

  return transactions.some(
    (txn) => txn.success === true || txn.success === "true",
  );
}

/**
 * Poll Paymob for intention / transaction status (fallback when webhook is delayed).
 */
export const verifyPaymobIntentionPayment = (intentionId: string) =>
  Effect.tryPromise({
    try: async () => {
      if (!isPaymobConfigured()) {
        throw new Error("Paymob is not configured");
      }

      const config = getPaymobConfig();
      const headers = {
        Authorization: `Token ${config.secretKey}`,
        "Content-Type": "application/json",
      };

      const response = await axios.get(
        `${config.baseUrl}/v1/intention/${intentionId}/`,
        { headers },
      );

      const data = response.data as Record<string, unknown>;
      if (isPaymobPayloadPaid(data)) {
        return { paid: true as const, data };
      }

      // Some accounts expose nested payment attempts on the intention payload.
      const attempts = data.payment_attempts;
      if (Array.isArray(attempts)) {
        const paidAttempt = attempts.find(
          (attempt) =>
            attempt &&
            typeof attempt === "object" &&
            isPaymobPayloadPaid(attempt as Record<string, unknown>),
        );
        if (paidAttempt) {
          return { paid: true as const, data: paidAttempt as Record<string, unknown> };
        }
      }

      return { paid: false as const, data };
    },
    catch: (error) => {
      const msg =
        axios.isAxiosError(error) && error.response?.data
          ? JSON.stringify(error.response.data)
          : error instanceof Error
            ? error.message
            : "Unknown error";
      return new ServerError({
        tag: "PaymentError",
        message: `Failed to verify Paymob payment: ${msg}`,
        statusCode: 502,
        clientMessage: "Failed to verify payment status",
      });
    },
  });
