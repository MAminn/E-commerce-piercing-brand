import { db } from "#root/shared/database/drizzle/db";
import { emailSubscription } from "#root/shared/database/drizzle/schema";
import { eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { toAbsoluteUrl } from "#root/shared/config/site-url";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function generateToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Ensures a subscription row exists for this email and returns its
 * unsubscribe token. Idempotent — calling this repeatedly for the same
 * email never resets an existing unsubscribe, and never rotates an
 * already-issued token (a previously-sent email's unsubscribe link must
 * keep working). Every marketing send must go through this before it can
 * link to /unsubscribe, so call it from the enqueue path, not per-renderer.
 */
export async function getOrCreateSubscriptionToken(
  email: string,
): Promise<string> {
  const normalizedEmail = normalizeEmail(email);

  const inserted = await db()
    .insert(emailSubscription)
    .values({ email: normalizedEmail, unsubscribeToken: generateToken() })
    .onConflictDoNothing({ target: emailSubscription.email })
    .returning({ unsubscribeToken: emailSubscription.unsubscribeToken });

  if (inserted.length > 0 && inserted[0]) {
    return inserted[0].unsubscribeToken;
  }

  const [existing] = await db()
    .select({ unsubscribeToken: emailSubscription.unsubscribeToken })
    .from(emailSubscription)
    .where(eq(emailSubscription.email, normalizedEmail))
    .limit(1);

  if (!existing) {
    // Extremely unlikely race (insert lost the conflict AND the immediate
    // select missed it) — fail loudly rather than send an email with no
    // working unsubscribe link.
    throw new Error(
      `Failed to get or create subscription token for ${normalizedEmail}`,
    );
  }
  return existing.unsubscribeToken;
}

/**
 * Send-time unsubscribe check. No row at all counts as "not unsubscribed"
 * (they've never had the chance to opt out) — in practice every queued
 * marketing email already has a row by the time this runs, since enqueueing
 * goes through getOrCreateSubscriptionToken first.
 */
export async function isEmailUnsubscribed(email: string): Promise<boolean> {
  const normalizedEmail = normalizeEmail(email);
  const [row] = await db()
    .select({ unsubscribedAt: emailSubscription.unsubscribedAt })
    .from(emailSubscription)
    .where(eq(emailSubscription.email, normalizedEmail))
    .limit(1);
  return row?.unsubscribedAt != null;
}

export interface SubscriptionTokenResult {
  success: boolean;
  email?: string;
}

export async function unsubscribeByToken(
  token: string,
): Promise<SubscriptionTokenResult> {
  const [row] = await db()
    .update(emailSubscription)
    .set({ unsubscribedAt: new Date(), updatedAt: new Date() })
    .where(eq(emailSubscription.unsubscribeToken, token))
    .returning({ email: emailSubscription.email });

  if (!row) return { success: false };
  return { success: true, email: row.email };
}

export async function resubscribeByToken(
  token: string,
): Promise<SubscriptionTokenResult> {
  const [row] = await db()
    .update(emailSubscription)
    .set({ unsubscribedAt: null, updatedAt: new Date() })
    .where(eq(emailSubscription.unsubscribeToken, token))
    .returning({ email: emailSubscription.email });

  if (!row) return { success: false };
  return { success: true, email: row.email };
}

export interface SubscriptionStatus {
  email: string;
  unsubscribed: boolean;
}

export async function getSubscriptionStatusByToken(
  token: string,
): Promise<SubscriptionStatus | null> {
  const [row] = await db()
    .select({
      email: emailSubscription.email,
      unsubscribedAt: emailSubscription.unsubscribedAt,
    })
    .from(emailSubscription)
    .where(eq(emailSubscription.unsubscribeToken, token))
    .limit(1);

  if (!row) return null;
  return { email: row.email, unsubscribed: row.unsubscribedAt != null };
}

export interface UnsubscribeHeaders {
  unsubscribeUrl: string;
  headers: Record<string, string>;
}

/**
 * Builds the unsubscribe link + List-Unsubscribe / List-Unsubscribe-Post
 * headers every marketing email must carry (RFC 8058 one-click unsubscribe —
 * required by Gmail/Yahoo bulk-sender rules). List-Unsubscribe-Post tells
 * mail clients they may POST to /api/unsubscribe directly from the inbox UI
 * without opening the page at all; that endpoint (backend/email-subscription/api.ts)
 * must accept that exact POST shape.
 */
export function buildUnsubscribeHeaders(token: string): UnsubscribeHeaders {
  const unsubscribeUrl = toAbsoluteUrl(`/unsubscribe?token=${token}`);
  const postUrl = toAbsoluteUrl(`/api/unsubscribe?token=${token}`);
  return {
    unsubscribeUrl,
    headers: {
      "List-Unsubscribe": `<${postUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
}
