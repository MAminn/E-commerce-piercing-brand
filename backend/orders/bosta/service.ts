import { resolveBostaDropOffAddress } from "./districts";
import { resolveBostaPickupAddress } from "./pickup";

/**
 * Bosta Delivery API service
 *
 * Feature-flagged: all functions silently return null / no-op
 * when SYN_BOSTA_KEY is not set, so deployments without the key
 * are completely unaffected.
 *
 * API base: https://app.bosta.co/api/v2
 * Auth: Authorization: <API_KEY>  (no "Bearer" prefix)
 */

const BOSTA_API_BASE = "https://app.bosta.co/api/v2";

export function getBostaApiKey(): string | null {
  return process.env.SYN_BOSTA_KEY ?? null;
}

export function isBostaEnabled(): boolean {
  return !!getBostaApiKey();
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BostaReceiverAddress {
  firstLine: string;
  city: string;
  zone?: string;
  /** Free-text district name from checkout — used as a fuzzy-match hint when districtId isn't set. */
  districtHint?: string;
  districtId?: string;
  buildingNumber?: string;
  apartment?: string;
  floor?: string;
}

export interface BostaReceiver {
  firstName: string;
  lastName?: string;
  phone: string;
}

export interface BostaCreateDeliveryInput {
  /** Our internal order ID — stored in businessReference so webhook can find it */
  orderId: string;
  receiver: BostaReceiver;
  dropOffAddress: BostaReceiverAddress;
  /** COD amount — the total to collect. 0 for pre-paid orders */
  cod: number;
  notes?: string | null;
  itemsCount?: number;
}

export interface BostaDeliveryResult {
  /** Bosta internal _id (used for cancellation) */
  deliveryId: string;
  trackingNumber: string;
  /** Current state value string e.g. "PACKAGE_RECEIVED" */
  stateValue: string;
  stateCode: number;
}

export type CreateBostaDeliveryOutcome =
  | { success: true; result: BostaDeliveryResult }
  | { success: false; error: string };

function normalizeEgyptPhone(phone: string): string {
  let normalized = phone.replace(/\s+/g, "");
  if (normalized.startsWith("+20")) normalized = `0${normalized.slice(3)}`;
  else if (normalized.startsWith("20") && normalized.length >= 12) {
    normalized = `0${normalized.slice(2)}`;
  }
  return normalized;
}

function unwrapBostaData<T>(data: Record<string, unknown>): T {
  if (data.success === true && data.data && typeof data.data === "object") {
    return data.data as T;
  }
  return data as T;
}

async function bostaFetch<T>(
  method: "GET" | "POST" | "DELETE" | "PATCH",
  path: string,
  body?: unknown,
): Promise<T> {
  const apiKey = getBostaApiKey();
  if (!apiKey) throw new Error("[Bosta] SYN_BOSTA_KEY is not configured");

  const res = await fetch(`${BOSTA_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const data = await res.json() as Record<string, unknown>;

  if (!res.ok || data.success === false) {
    const msg =
      (typeof data.message === "string" ? data.message : undefined) ??
      (Array.isArray(data.message) ? (data.message as string[]).join(", ") : undefined) ??
      (typeof data.error === "string" ? data.error : undefined) ??
      (typeof data.msg === "string" ? data.msg : undefined) ??
      `Bosta API error ${res.status}`;
    console.error("[Bosta] API error response:", JSON.stringify(data));
    throw new Error(`[Bosta] ${msg}`);
  }

  return unwrapBostaData<T>(data);
}

// ─── Public functions ─────────────────────────────────────────────────────────

/**
 * Create a Bosta delivery for an order.
 * Returns null (silently) if Bosta is not configured.
 */
export async function createBostaDelivery(
  input: BostaCreateDeliveryInput,
): Promise<CreateBostaDeliveryOutcome | null> {
  if (!isBostaEnabled()) return null;

  try {
    const [dropOffAddress, pickupAddress] = await Promise.all([
      resolveBostaDropOffAddress({
        city: input.dropOffAddress.city,
        zone: input.dropOffAddress.zone,
        districtHint: input.dropOffAddress.districtHint,
        firstLine: input.dropOffAddress.firstLine,
        districtId: input.dropOffAddress.districtId,
        buildingNumber: input.dropOffAddress.buildingNumber,
        apartment: input.dropOffAddress.apartment,
        floor: input.dropOffAddress.floor,
      }),
      resolveBostaPickupAddress(),
    ]);
    console.log("[Bosta] Resolved dropOffAddress:", dropOffAddress);
    console.log("[Bosta] Resolved pickupAddress:", pickupAddress);

    const body = {
      type: 10, // 10 = SEND (standard delivery)
      cod: Math.round(input.cod),
      notes: input.notes ?? "",
      businessReference: input.orderId,
      specs: {
        packageType: "Parcel",
        size: "SMALL",
        packageDetails: {
          itemsCount: Math.max(1, input.itemsCount ?? 1),
          description: input.notes?.trim() || "Online store order",
        },
      },
      receiver: {
        firstName: input.receiver.firstName,
        lastName: input.receiver.lastName ?? "",
        phone: normalizeEgyptPhone(input.receiver.phone),
      },
      pickupAddress,
      dropOffAddress,
    };

    const data = await bostaFetch<{
      _id: string;
      trackingNumber: string;
      state?: { code: number; value: string };
    }>("POST", "/deliveries?apiVersion=1", body);

    console.log(`[Bosta] Delivery created: trackingNumber=${data.trackingNumber}`);

    return {
      success: true,
      result: {
        deliveryId: data._id,
        trackingNumber: data.trackingNumber,
        stateValue: data.state?.value ?? "PACKAGE_RECEIVED",
        stateCode: data.state?.code ?? 10,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[Bosta] createBostaDelivery failed:", message);
    return { success: false, error: message };
  }
}

/**
 * Cancel (terminate) a Bosta delivery by its internal delivery ID.
 * Returns false silently if Bosta is not configured.
 */
export async function cancelBostaDelivery(deliveryId: string): Promise<boolean> {
  if (!isBostaEnabled()) return false;

  try {
    await bostaFetch("DELETE", `/deliveries/${deliveryId}`);
    console.log(`[Bosta] Delivery ${deliveryId} cancelled`);
    return true;
  } catch (err) {
    console.error("[Bosta] cancelBostaDelivery failed:", err);
    return false;
  }
}

/**
 * Fetch current tracking state for a delivery.
 * Returns null if Bosta is not configured or on error.
 */
export async function trackBostaDelivery(trackingNumber: string): Promise<{
  stateValue: string;
  stateCode: number;
  updatedAt?: string;
} | null> {
  if (!isBostaEnabled()) return null;

  try {
    const data = await bostaFetch<{
      state?: { code: number; value: string };
      updatedAt?: string;
    }>("GET", `/deliveries/${trackingNumber}`);

    return {
      stateValue: data.state?.value ?? "UNKNOWN",
      stateCode: data.state?.code ?? 0,
      updatedAt: data.updatedAt,
    };
  } catch (err) {
    console.error("[Bosta] trackBostaDelivery failed:", err);
    return null;
  }
}

// ─── State mapping ────────────────────────────────────────────────────────────

/** Maps Bosta state code → our internal order status */
export function mapBostaStateToOrderStatus(
  stateCode: number,
): "pending" | "processing" | "shipped" | "delivered" | "cancelled" {
  switch (stateCode) {
    case 10: // Package Received
    case 11: // Waiting for pickup
      return "processing";
    case 20: // In Transit
    case 24: // Exception / On Hold
    case 30: // Out for Delivery
    case 40: // Failed Attempt
      return "shipped";
    case 45: // Delivered
      return "delivered";
    case 46: // Cancelled
    case 47: // Return In Progress
    case 48: // Returned to Business
      return "cancelled";
    default:
      return "processing";
  }
}
