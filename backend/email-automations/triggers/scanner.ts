import { db } from "#root/shared/database/drizzle/db";
import { order } from "#root/shared/database/drizzle/schema";
import { sql } from "drizzle-orm";
import {
  findAbandonedCarts,
  findAbandonedBrowses,
} from "#root/backend/cart-capture/service";
import { enqueueScheduledEmail } from "#root/backend/email-automations/queue/service";
import { getEffectiveTemplate } from "#root/backend/email-automations/templates/service";
import type { ScheduledEmailLocale } from "#root/backend/email-automations/queue/service";

const ABANDONED_CART_STEPS = ["step1", "step2", "step3"] as const;

/**
 * Scans captured carts and enqueues whichever abandoned-cart step is due for
 * each one. Safe to call repeatedly — enqueueScheduledEmail upserts by
 * dedupeKey, so re-finding the same idle cart on the next tick just
 * refreshes the same pending row instead of creating a duplicate.
 */
export async function scanAbandonedCarts(): Promise<void> {
  for (const step of ABANDONED_CART_STEPS) {
    const template = await getEffectiveTemplate("abandoned_cart", step);
    if (!template.enabled) continue;

    const cutoff = new Date(Date.now() - template.delayMinutes * 60_000);
    const carts = await findAbandonedCarts(cutoff);

    for (const cart of carts) {
      if (!cart.email) continue; // findAbandonedCarts already filters this, but keep the type narrow
      await enqueueScheduledEmail({
        automationType: "abandoned_cart",
        recipientEmail: cart.email,
        locale: (cart.locale as ScheduledEmailLocale) ?? "en",
        payload: {
          step,
          items: cart.items,
          cartTotal: cart.subtotal,
        },
        scheduledFor: new Date(),
        dedupeKey: `abandoned_cart:${cart.id}:${step}`,
      });
    }
  }
}

/** Scans viewed-but-not-carted products and enqueues an abandoned-browse email for each one due. */
export async function scanAbandonedBrowses(): Promise<void> {
  const template = await getEffectiveTemplate("abandoned_browse", "default");
  if (!template.enabled) return;

  const cutoff = new Date(Date.now() - template.delayMinutes * 60_000);
  const views = await findAbandonedBrowses(cutoff);

  for (const view of views) {
    if (!view.email) continue;
    await enqueueScheduledEmail({
      automationType: "abandoned_browse",
      recipientEmail: view.email,
      payload: {
        productName: view.productName,
        productImageUrl: view.productImageUrl ?? undefined,
      },
      scheduledFor: new Date(),
      dedupeKey: `abandoned_browse:${view.id}`,
    });
  }
}

/**
 * Finds customers whose most recent order is older than the win-back
 * threshold and enqueues one win-back email per customer. The dedupeKey
 * includes the last-order timestamp, so if they order again and go quiet
 * for another full threshold period, a NEW win-back fires — this is not a
 * one-time-ever email, it's "N days since your LAST order."
 */
export async function scanWinBack(): Promise<void> {
  const template = await getEffectiveTemplate("win_back", "default");
  if (!template.enabled) return;

  const cutoff = new Date(Date.now() - template.delayMinutes * 60_000);

  const rows = await db()
    .select({
      customerEmail: order.customerEmail,
      lastOrderAt: sql<string>`max(${order.createdAt})`,
    })
    .from(order)
    .groupBy(order.customerEmail)
    .having(sql`max(${order.createdAt}) <= ${cutoff}`);

  for (const row of rows) {
    if (!row.customerEmail) continue;
    await enqueueScheduledEmail({
      automationType: "win_back",
      recipientEmail: row.customerEmail,
      payload: {},
      scheduledFor: new Date(),
      dedupeKey: `win_back:${row.customerEmail}:${row.lastOrderAt}`,
    });
  }
}

/** Runs every trigger scan. Each scan is isolated — one failing must not block the others. */
export async function runTriggerScan(): Promise<void> {
  const scans: Array<[string, () => Promise<void>]> = [
    ["abandoned_cart", scanAbandonedCarts],
    ["abandoned_browse", scanAbandonedBrowses],
    ["win_back", scanWinBack],
  ];

  for (const [name, scan] of scans) {
    try {
      await scan();
    } catch (err) {
      console.error(`[TriggerScanner] "${name}" scan failed:`, err);
    }
  }
}
