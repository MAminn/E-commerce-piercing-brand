import { db } from "#root/shared/database/drizzle/db";
import { emailSubscription, order } from "#root/shared/database/drizzle/schema";
import { isNull, isNotNull, sql } from "drizzle-orm";
import { v7 } from "uuid";
import { enqueueScheduledEmail } from "#root/backend/email-automations/queue/service";
import { getEffectiveTemplate } from "#root/backend/email-automations/templates/service";

export type BroadcastAutomationType = "new_drops" | "flash_offer" | "retention";
export type BroadcastSegment = "all_subscribers" | "customers" | "inactive_customers";

/**
 * Resolves the recipient list for a broadcast segment. Subscribed-only
 * even at resolution time (not just at send time) — no point queuing a
 * broadcast to someone who's already opted out.
 */
export async function resolveBroadcastRecipients(
  segment: BroadcastSegment,
  inactiveDays = 90,
): Promise<string[]> {
  if (segment === "all_subscribers") {
    const rows = await db()
      .select({ email: emailSubscription.email })
      .from(emailSubscription)
      .where(isNull(emailSubscription.unsubscribedAt));
    return rows.map((r) => r.email);
  }

  if (segment === "customers") {
    const rows = await db()
      .select({ email: order.customerEmail })
      .from(order)
      .groupBy(order.customerEmail);
    const emails = rows.map((r) => r.email).filter(Boolean);
    return excludeUnsubscribed(emails);
  }

  // inactive_customers: most recent order older than the threshold
  const cutoff = new Date(Date.now() - inactiveDays * 24 * 60 * 60_000);
  const rows = await db()
    .select({ email: order.customerEmail })
    .from(order)
    .groupBy(order.customerEmail)
    .having(sql`max(${order.createdAt}) <= ${cutoff}`);
  const emails = rows.map((r) => r.email).filter(Boolean);
  return excludeUnsubscribed(emails);
}

async function excludeUnsubscribed(emails: string[]): Promise<string[]> {
  if (emails.length === 0) return [];
  const unsubscribed = await db()
    .select({ email: emailSubscription.email })
    .from(emailSubscription)
    .where(isNotNull(emailSubscription.unsubscribedAt));
  const unsubscribedSet = new Set(unsubscribed.map((r) => r.email));
  return emails.filter((e) => !unsubscribedSet.has(e));
}

export interface SendBroadcastResult {
  campaignId: string;
  recipientCount: number;
}

/**
 * Enqueues one scheduled_email row per resolved recipient, all sharing a
 * fresh campaignId so this send is independent of any previous broadcast
 * of the same automation type (dedupeKey is per-campaign-per-recipient,
 * not per-automation-type-per-recipient — otherwise a second "flash offer"
 * broadcast a week later would silently no-op against the first).
 */
export async function sendBroadcast(
  automationType: BroadcastAutomationType,
  segment: BroadcastSegment,
  inactiveDays?: number,
): Promise<SendBroadcastResult> {
  const template = await getEffectiveTemplate(automationType, "default");
  if (!template.enabled) {
    throw new Error(
      `The "${automationType}" template is disabled — enable it in Marketing Emails before sending.`,
    );
  }

  const recipients = await resolveBroadcastRecipients(segment, inactiveDays);
  const campaignId = v7();

  for (const email of recipients) {
    await enqueueScheduledEmail({
      automationType,
      recipientEmail: email,
      payload: {},
      scheduledFor: new Date(),
      dedupeKey: `broadcast:${campaignId}:${email}`,
    });
  }

  return { campaignId, recipientCount: recipients.length };
}
