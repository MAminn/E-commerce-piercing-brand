import { db } from "#root/shared/database/drizzle/db";
import { capturedCart, viewedProduct } from "#root/shared/database/drizzle/schema";
import type { CapturedCartItem } from "#root/shared/database/drizzle/schema";
import { and, eq, isNotNull, isNull, lte } from "drizzle-orm";
import { cancelScheduledEmailsByPrefix } from "#root/backend/email-automations/queue/service";

export type CartLocale = "en" | "ar";

export interface SyncCartInput {
  sessionToken: string;
  items: CapturedCartItem[];
  subtotal: number;
  locale?: CartLocale;
  email?: string;
  phone?: string;
  userId?: string;
}

/**
 * Upserts the server-side mirror of a browser cart. Debounced on the
 * frontend, called on every meaningful cart change. Contact fields
 * (email/phone/userId) are only ever SET, never cleared — an anonymous sync
 * after the email is already known must not blank it back out, so each
 * field is conditionally included in the update rather than always written.
 * Never throws — a capture failure must not break the shopping experience.
 */
export async function syncCart(input: SyncCartInput): Promise<void> {
  try {
    const contactFields = {
      ...(input.email ? { email: input.email } : {}),
      ...(input.phone ? { phone: input.phone } : {}),
      ...(input.userId ? { userId: input.userId } : {}),
    };

    const updated = await db()
      .update(capturedCart)
      .set({
        items: input.items,
        subtotal: input.subtotal.toFixed(2),
        locale: input.locale ?? "en",
        lastActivityAt: new Date(),
        updatedAt: new Date(),
        ...contactFields,
      })
      .where(eq(capturedCart.sessionToken, input.sessionToken))
      .returning({ id: capturedCart.id });

    if (updated.length > 0) return;

    await db()
      .insert(capturedCart)
      .values({
        sessionToken: input.sessionToken,
        items: input.items,
        subtotal: input.subtotal.toFixed(2),
        locale: input.locale ?? "en",
        email: input.email ?? null,
        phone: input.phone ?? null,
        userId: input.userId ?? null,
      });
  } catch (err) {
    console.error(
      `[CartCapture] Failed to sync cart for session ${input.sessionToken}:`,
      err,
    );
  }
}

/**
 * Attaches contact info to an existing cart session — called the moment
 * email/phone becomes known (checkout entry, login, popup signup) even if
 * it happens before/without a cart sync ever having run. No-op if no cart
 * row exists yet for this session (nothing to attach to).
 */
export async function attachContactToCart(input: {
  sessionToken: string;
  email?: string;
  phone?: string;
  userId?: string;
}): Promise<void> {
  if (!input.email && !input.phone && !input.userId) return;
  try {
    await db()
      .update(capturedCart)
      .set({
        ...(input.email ? { email: input.email } : {}),
        ...(input.phone ? { phone: input.phone } : {}),
        ...(input.userId ? { userId: input.userId } : {}),
        updatedAt: new Date(),
      })
      .where(eq(capturedCart.sessionToken, input.sessionToken));
  } catch (err) {
    console.error(
      `[CartCapture] Failed to attach contact info for session ${input.sessionToken}:`,
      err,
    );
  }
}

/**
 * Marks a cart session as converted to a real order, and cancels any
 * pending abandoned-cart follow-up emails for it — emailing someone about a
 * cart they already bought is worse than not emailing at all. Uses the
 * `abandoned_cart:{capturedCartId}:` dedupeKey prefix convention (see
 * backend/email-automations/queue/service.ts's cancelScheduledEmailsByPrefix).
 */
export async function markCartConverted(
  sessionToken: string,
  orderId: string,
): Promise<void> {
  try {
    const [row] = await db()
      .update(capturedCart)
      .set({ convertedOrderId: orderId, updatedAt: new Date() })
      .where(eq(capturedCart.sessionToken, sessionToken))
      .returning({ id: capturedCart.id });

    if (row) {
      await cancelScheduledEmailsByPrefix(`abandoned_cart:${row.id}:`);
    }
  } catch (err) {
    console.error(
      `[CartCapture] Failed to mark cart converted for session ${sessionToken}:`,
      err,
    );
  }
}

export interface RecordProductViewInput {
  sessionToken: string;
  productId: string;
  productName: string;
  productImageUrl?: string;
  email?: string;
}

/** Upserts a "last viewed" record for abandoned-browse targeting — one row per (session, product), not a full clickstream. */
export async function recordProductView(input: RecordProductViewInput): Promise<void> {
  try {
    await db()
      .insert(viewedProduct)
      .values({
        sessionToken: input.sessionToken,
        productId: input.productId,
        productName: input.productName,
        productImageUrl: input.productImageUrl ?? null,
        email: input.email ?? null,
      })
      .onConflictDoUpdate({
        target: [viewedProduct.sessionToken, viewedProduct.productId],
        set: {
          viewedAt: new Date(),
          productName: input.productName,
          productImageUrl: input.productImageUrl ?? null,
          ...(input.email ? { email: input.email } : {}),
        },
      });
  } catch (err) {
    console.error(
      `[CartCapture] Failed to record product view for session ${input.sessionToken}:`,
      err,
    );
  }
}

/**
 * Carts eligible for an abandoned-cart email: contact known, not converted,
 * idle since before the cutoff. Ordered oldest-idle-first so a trigger scan
 * processes the longest-waiting carts first.
 */
export async function findAbandonedCarts(idleSinceBefore: Date, limit = 100) {
  return db()
    .select()
    .from(capturedCart)
    .where(
      and(
        isNotNull(capturedCart.email),
        isNull(capturedCart.convertedOrderId),
        lte(capturedCart.lastActivityAt, idleSinceBefore),
      ),
    )
    .orderBy(capturedCart.lastActivityAt)
    .limit(limit);
}

/** Viewed products eligible for an abandoned-browse email: contact known, viewed before the cutoff. */
export async function findAbandonedBrowses(viewedBefore: Date, limit = 100) {
  return db()
    .select()
    .from(viewedProduct)
    .where(
      and(isNotNull(viewedProduct.email), lte(viewedProduct.viewedAt, viewedBefore)),
    )
    .orderBy(viewedProduct.viewedAt)
    .limit(limit);
}
