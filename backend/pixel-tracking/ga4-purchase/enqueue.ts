import { ga4PurchaseContext, ga4PurchaseOutbox } from "#root/shared/database/drizzle/schema";
import type { DatabaseClient } from "#root/shared/database/drizzle/db";
import { effectiveGa4PurchaseOwner, type Ga4PurchaseOwner } from "#root/shared/config/ga4-purchase-owner";
import type { PurchaseSource } from "./eligibility";
import { readConsentSnapshot, readGa4Identifiers, type Ga4CookieInput } from "./identifiers";

/**
 * Writes that run INSIDE the caller's order / payment transaction, so the
 * purchase row commits or rolls back with the milestone itself.
 *
 * Each runs in a SAVEPOINT (a nested drizzle transaction) and never throws:
 * a failure here rolls back only the GA4 row, logs a fixed message (no data)
 * and lets the order commit. Losing one analytics row is recoverable and
 * shows up in the diagnostics gap count; losing an order is not.
 *
 * In `browser` mode (the default) both are no-ops that touch nothing.
 */

type Tx = Pick<DatabaseClient, "transaction">;

export type EnqueueResult = "enqueued" | "duplicate" | "skipped_browser_mode" | "error";

let kick: () => void = () => {};

/** Installed by the worker; called by callers AFTER their transaction commits. */
export function setGa4PurchaseWorkerKick(fn: () => void): void {
  kick = fn;
}

export function kickGa4PurchaseWorker(): void {
  try {
    kick();
  } catch {
    /* the interval picks it up */
  }
}

export async function enqueueGa4PurchaseInTx(
  tx: Tx,
  input: { orderId: string; source: PurchaseSource; eligibleAt: Date },
  owner: Ga4PurchaseOwner = effectiveGa4PurchaseOwner(),
): Promise<EnqueueResult> {
  if (owner === "browser") return "skipped_browser_mode";
  try {
    const inserted = await tx.transaction(async (sp) =>
      sp
        .insert(ga4PurchaseOutbox)
        .values({
          orderId: input.orderId,
          mode: owner,
          source: input.source,
          status: owner === "shadow" ? "shadow" : "pending",
          eligibleAt: input.eligibleAt,
          nextAttemptAt: input.eligibleAt,
        })
        .onConflictDoNothing({ target: ga4PurchaseOutbox.orderId })
        .returning({ id: ga4PurchaseOutbox.id }),
    );
    return inserted.length > 0 ? "enqueued" : "duplicate";
  } catch {
    console.error(`[GA4 Purchase] enqueue failed (order ${input.orderId}, ${input.source}) — order kept, row not written`);
    return "error";
  }
}

/** Store the GA4 ids / consent snapshot from the order.create request cookies. */
export async function captureGa4PurchaseContextInTx(
  tx: Tx,
  input: { orderId: string; cookies: Ga4CookieInput; measurementId: string | null },
  owner: Ga4PurchaseOwner = effectiveGa4PurchaseOwner(),
): Promise<"captured" | "skipped_browser_mode" | "error"> {
  if (owner === "browser") return "skipped_browser_mode";
  const ids = readGa4Identifiers(input.cookies, input.measurementId);
  const consent = readConsentSnapshot(input.cookies);
  try {
    await tx.transaction(async (sp) =>
      sp
        .insert(ga4PurchaseContext)
        .values({
          orderId: input.orderId,
          gaClientId: ids.clientId,
          gaSessionId: ids.sessionId,
          gaSessionNumber: ids.sessionNumber,
          consentAnalytics: consent.analytics,
          consentMarketing: consent.marketing,
        })
        .onConflictDoNothing({ target: ga4PurchaseContext.orderId }),
    );
    return "captured";
  } catch {
    console.error(`[GA4 Purchase] context capture failed (order ${input.orderId}) — order kept`);
    return "error";
  }
}
