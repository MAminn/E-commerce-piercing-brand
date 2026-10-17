/**
 * Order emails — the customer confirmation and the store notification.
 *
 * Flow (replaces the old inline send inside createOrder):
 *
 *   1. After the order transaction has COMMITTED, `queueOrderPlacedEmails`
 *      writes one `scheduled_email` row per recipient, keyed
 *      `order_confirmation:<orderId>` / `order_admin_notification:<orderId>:<email>`.
 *      The unique dedupe key means however many times this runs for an
 *      order — a retry, a duplicate payment webhook — at most one row, and
 *      so at most one email, exists per recipient.
 *   2. The email worker (backend/email-automations/worker.ts) is nudged to
 *      run immediately; it also polls every minute. It claims the row, loads
 *      the order FRESH from the database, renders it here and sends it,
 *      retrying a failed send up to MAX_ATTEMPTS times.
 *   3. The customer row's outcome is written to the order activity log as
 *      `confirmation_email_sent` / `confirmation_email_failed`.
 *
 * Nothing here can fail the order: every entry point resolves, never
 * rejects, and createOrder only calls it after the commit.
 *
 * Payment safety: a cash-on-delivery order is queued when it is placed. An
 * online-payment order is queued only when its payment is confirmed paid
 * (backend/payments/*), and the renderer re-checks that at send time — an
 * unpaid online order's row is cancelled, never sent.
 */

import { db } from "#root/shared/database/drizzle/db";
import {
  file,
  order,
  orderBundle,
  orderItem,
  product,
  promoCode,
  user,
  type ScheduledEmailRow,
} from "#root/shared/database/drizzle/schema";
import { asc, eq } from "drizzle-orm";
import { render } from "@react-email/components";
import { enqueueScheduledEmail } from "#root/backend/email-automations/queue/service";
import {
  registerEmailRenderer,
  type RenderedScheduledEmail,
} from "#root/backend/email-automations/render";
import { logOrderEvent } from "#root/backend/orders/order-log";
import { getEmailBranding } from "#root/backend/emails/branding";
import {
  OrderConfirmationEmail,
  orderConfirmationSubject,
} from "#root/backend/emails/minimal/order-confirmation";
import {
  OrderAdminNotificationEmail,
  orderAdminNotificationSubject,
} from "#root/backend/emails/minimal/order-admin-notification";
import { getHomepageContentRaw } from "#root/backend/homepage/get-homepage-content/raw";
import { getTemplateSelectionRaw } from "#root/backend/settings/get-template-selection-raw";
import { resolveLandingTemplateId } from "#root/shared/config/storefront";
import { getStoreOwnerId } from "#root/shared/config/store";
import { returnsPolicyEmailLines } from "#root/shared/legal/return-policy-content";
import { toAbsoluteUrl } from "#root/shared/config/site-url";
import { formatOrderNumber } from "#root/shared/orders/order-number";
import {
  buildOrderEmailModel,
  type OrderEmailInput,
  type OrderEmailModel,
  type OrderEmailPaymentMethod,
} from "./model";

export const ORDER_CONFIRMATION = "order_confirmation" as const;
export const ORDER_ADMIN_NOTIFICATION = "order_admin_notification" as const;

export const confirmationDedupeKey = (orderId: string) => `order_confirmation:${orderId}`;
export const adminNotificationDedupeKey = (orderId: string, email: string) =>
  `order_admin_notification:${orderId}:${email.toLowerCase()}`;

/** Same cache-busting as the logo — see backend/emails/branding.ts. */
function emailImageUrl(diskname: string | null | undefined): string | null {
  if (!diskname || diskname.startsWith("data:")) return null;
  const path = /^(https?:)?\/\//.test(diskname) || diskname.startsWith("/") ? diskname : `/uploads/${diskname}`;
  return `${toAbsoluteUrl(path)}?cb=corp-fix-20260811`;
}

// ─── Queueing ───────────────────────────────────────────────────────────────

export interface QueueOrderEmailsDeps {
  enqueue: typeof enqueueScheduledEmail;
  listAdminEmails: () => Promise<string[]>;
  logEvent: typeof logOrderEvent;
  kickWorker: () => void;
}

async function listAdminEmails(): Promise<string[]> {
  const rows = await db()
    .select({ email: user.email })
    .from(user)
    .where(eq(user.role, "admin"));
  return rows.map((r) => r.email).filter((e): e is string => !!e && e.includes("@"));
}

let workerKick: () => void = () => {};

/** Called by the email worker on start-up so a freshly queued order email goes out now, not at the next poll. */
export function setOrderEmailWorkerKick(kick: () => void): void {
  workerKick = kick;
}

const defaultDeps = (): QueueOrderEmailsDeps => ({
  enqueue: enqueueScheduledEmail,
  listAdminEmails,
  logEvent: logOrderEvent,
  kickWorker: () => workerKick(),
});

/**
 * Queues the customer confirmation and the store notification for a
 * committed order. NEVER rejects — every failure is caught, logged, and (for
 * the customer email) recorded on the order's activity log.
 */
export async function queueOrderPlacedEmails(
  params: { orderId: string; customerEmail: string; orderNumber?: number | null },
  deps: Partial<QueueOrderEmailsDeps> = {},
): Promise<void> {
  const d = { ...defaultDeps(), ...deps };
  const label = formatOrderNumber(params.orderNumber) || params.orderId;
  try {
    const queued = await d.enqueue({
      automationType: ORDER_CONFIRMATION,
      recipientEmail: params.customerEmail,
      payload: { orderId: params.orderId },
      scheduledFor: new Date(),
      dedupeKey: confirmationDedupeKey(params.orderId),
    });
    if (!queued) {
      await d.logEvent({
        orderId: params.orderId,
        action: "confirmation_email_failed",
        note: `Order confirmation email for ${label} could not be queued — it was not sent.`,
      });
    }

    let admins: string[] = [];
    try {
      admins = await d.listAdminEmails();
    } catch (err) {
      console.error(`[OrderEmails] Admin lookup failed for order ${params.orderId}:`, err);
    }
    for (const email of admins) {
      await d.enqueue({
        automationType: ORDER_ADMIN_NOTIFICATION,
        recipientEmail: email,
        payload: { orderId: params.orderId },
        scheduledFor: new Date(),
        dedupeKey: adminNotificationDedupeKey(params.orderId, email),
      });
    }
  } catch (err) {
    console.error(`[OrderEmails] Failed to queue emails for order ${params.orderId}:`, err);
  }
  try {
    d.kickWorker();
  } catch (err) {
    console.error("[OrderEmails] Worker kick failed (the next poll will send):", err);
  }
}

/**
 * The customer row's outcome → the order activity log. Called by the worker
 * after every attempt on an `order_confirmation` row. Never throws
 * (logOrderEvent swallows its own errors).
 */
export async function recordOrderConfirmationOutcome(
  row: ScheduledEmailRow,
  outcome:
    | { status: "sent" }
    | { status: "failed"; error: string; attempts: number; willRetry: boolean }
    | { status: "cancelled"; reason: string },
): Promise<void> {
  if (row.automationType !== ORDER_CONFIRMATION) return;
  const orderId = readOrderId(row);
  if (!orderId) return;
  if (outcome.status === "sent") {
    await logOrderEvent({
      orderId,
      action: "confirmation_email_sent",
      note: `Order confirmation email sent to ${row.recipientEmail}`,
    });
  } else if (outcome.status === "failed") {
    await logOrderEvent({
      orderId,
      action: "confirmation_email_failed",
      note: `Order confirmation email to ${row.recipientEmail} failed (attempt ${outcome.attempts}): ${outcome.error}${
        outcome.willRetry ? " — will retry" : " — giving up"
      }`,
    });
  } else {
    await logOrderEvent({
      orderId,
      action: "confirmation_email_failed",
      note: `Order confirmation email not sent: ${outcome.reason}`,
    });
  }
}

function readOrderId(row: ScheduledEmailRow): string | null {
  const payload = row.payload as Record<string, unknown> | null;
  const id = payload?.orderId;
  return typeof id === "string" && id.length > 0 ? id : null;
}

// ─── Loading ────────────────────────────────────────────────────────────────

/** Reads everything both order emails print. Null when the order no longer exists. */
export async function loadOrderEmailInput(orderId: string): Promise<OrderEmailInput | null> {
  const database = db();
  const [row] = await database.select().from(order).where(eq(order.id, orderId)).limit(1);
  if (!row) return null;

  const [items, bundles, promo] = await Promise.all([
    database
      .select({
        id: orderItem.id,
        name: orderItem.name,
        quantity: orderItem.quantity,
        price: orderItem.price,
        discountPrice: orderItem.discountPrice,
        selectedOptions: orderItem.selectedOptions,
        orderBundleId: orderItem.orderBundleId,
        diskname: file.diskname,
      })
      .from(orderItem)
      .leftJoin(product, eq(orderItem.productId, product.id))
      .leftJoin(file, eq(product.imageId, file.id))
      .where(eq(orderItem.orderId, orderId))
      .orderBy(asc(orderItem.createdAt), asc(orderItem.id)),
    database
      .select()
      .from(orderBundle)
      .where(eq(orderBundle.orderId, orderId))
      .orderBy(asc(orderBundle.createdAt), asc(orderBundle.id)),
    row.promoCodeId
      ? database
          .select({ code: promoCode.code })
          .from(promoCode)
          .where(eq(promoCode.id, row.promoCodeId))
          .limit(1)
      : Promise.resolve([] as Array<{ code: string }>),
  ]);

  return {
    orderId: row.id,
    orderNumber: row.orderNumber ?? null,
    createdAt: row.createdAt,
    customerName: row.customerName,
    customerEmail: row.customerEmail,
    customerPhone: row.customerPhone,
    shippingAddress: row.shippingAddress,
    shippingCity: row.shippingCity,
    shippingState: row.shippingState,
    shippingGovernorateCode: row.shippingGovernorateCode,
    shippingCountry: row.shippingCountry,
    subtotal: row.subtotal,
    shipping: row.shipping,
    discount: row.discount,
    total: row.total,
    paymentMethod: row.paymentMethod as OrderEmailPaymentMethod,
    paymentStatus: row.paymentStatus,
    promoCode: promo[0]?.code ?? null,
    notes: row.notes,
    items: items.map((item) => ({
      id: item.id,
      name: item.name ?? "",
      quantity: item.quantity,
      price: item.price,
      discountPrice: item.discountPrice,
      selectedOptions: (item.selectedOptions as Record<string, string> | null) ?? null,
      orderBundleId: item.orderBundleId,
      imageUrl: emailImageUrl(item.diskname),
    })),
    bundles: bundles.map((b) => ({
      id: b.id,
      instanceId: b.instanceId,
      campaignId: b.campaignId,
      campaignSlug: b.campaignSlug,
      campaignTitle: b.campaignTitle,
      campaignType: b.campaignType,
      tierId: b.tierId,
      requiredQuantity: b.requiredQuantity,
      regularTotal: b.regularTotal,
      bundleTotal: b.bundleTotal,
      pricingType: b.pricingType,
      discountPercent: b.discountPercent,
      freeShipping: b.freeShipping,
      offerStacking: b.offerStacking,
    })),
  };
}

async function loadModel(row: ScheduledEmailRow): Promise<OrderEmailModel | { skip: string }> {
  const orderId = readOrderId(row);
  if (!orderId) return { skip: "payload has no orderId" };
  const input = await loadOrderEmailInput(orderId);
  // Thrown, not skipped: the worker retries, then records the failure.
  if (!input) throw new Error(`Order ${orderId} no longer exists`);
  if (input.paymentMethod !== "cod" && input.paymentStatus !== "paid") {
    return {
      skip: `online payment (${input.paymentMethod}) is ${input.paymentStatus}, not paid — confirmation is sent only after payment is confirmed`,
    };
  }
  const model = buildOrderEmailModel(input);
  for (const warning of model.warnings) {
    console.warn(`[OrderEmails] Order ${orderId}: ${warning}`);
  }
  return model;
}

/** The published /return-policy content, read exactly as the storefront reads it. */
async function loadReturnsSection(websiteUrl: string) {
  try {
    const database = db();
    const templateId = resolveLandingTemplateId(await getTemplateSelectionRaw(database));
    const content = await getHomepageContentRaw(database, getStoreOwnerId(), templateId);
    const { lines, published } = returnsPolicyEmailLines(content.returnPolicy);
    return { lines, policyUrl: published ? `${websiteUrl}/return-policy` : undefined };
  } catch (err) {
    console.error("[OrderEmails] Could not read the published return policy, using the approved default:", err);
    return { ...returnsPolicyEmailLines(undefined), policyUrl: undefined };
  }
}

// ─── Rendering ──────────────────────────────────────────────────────────────

export async function renderOrderConfirmation(
  row: ScheduledEmailRow,
): Promise<RenderedScheduledEmail> {
  const model = await loadModel(row);
  if ("skip" in model) return { subject: "", html: "", skip: model.skip };
  const branding = await getEmailBranding();
  const returns = await loadReturnsSection(branding.websiteUrl);
  const html = await render(
    OrderConfirmationEmail({
      order: model,
      storeName: branding.storeName,
      logoUrl: branding.logoUrl,
      supportEmail: branding.contactEmail,
      whatsappDisplay: branding.whatsappDisplay,
      whatsappUrl: branding.whatsappUrl,
      websiteUrl: branding.websiteUrl,
      websiteLabel: branding.websiteLabel,
      returns,
    }),
  );
  return { subject: orderConfirmationSubject(model, branding.storeName), html };
}

export async function renderOrderAdminNotification(
  row: ScheduledEmailRow,
): Promise<RenderedScheduledEmail> {
  const model = await loadModel(row);
  if ("skip" in model) return { subject: "", html: "", skip: model.skip };
  const branding = await getEmailBranding();
  const html = await render(
    OrderAdminNotificationEmail({
      order: model,
      storeName: branding.storeName,
      dashboardUrl: `${branding.websiteUrl}/dashboard/orders`,
    }),
  );
  return { subject: orderAdminNotificationSubject(model), html };
}

registerEmailRenderer(ORDER_CONFIRMATION, (row) => renderOrderConfirmation(row));
registerEmailRenderer(ORDER_ADMIN_NOTIFICATION, (row) => renderOrderAdminNotification(row));
