import { Effect } from "effect";
import { createEmailServiceFromEnv, type EmailEnvLogger } from "#root/shared/email/from-env";
import type { EmailServiceInterface } from "#root/shared/email/service";
import {
  claimDueScheduledEmails,
  markScheduledEmailSent,
  markScheduledEmailFailed,
  markScheduledEmailCancelled,
  isTransactionalEmailType,
  TRANSACTIONAL_EMAIL_TYPES,
  requeueStaleSendingEmails,
} from "./queue/service";
import { renderScheduledEmail } from "./render";
// Side effect: registers every automation type's HTML renderer. Must happen
// before the worker's first tick.
import "./templates/render";
// Side effect: registers the transactional order-email renderers.
import {
  recordOrderConfirmationOutcome,
  setOrderEmailWorkerKick,
} from "#root/backend/orders/order-emails/service";
import { isEmailUnsubscribed } from "./unsubscribe-check";
import {
  getOrCreateSubscriptionToken,
  buildUnsubscribeHeaders,
} from "#root/backend/email-subscription/service";
import { runTriggerScan } from "./triggers/scanner";
import type { ScheduledEmailRow } from "#root/shared/database/drizzle/schema";
import { getEmailAutomationSettingsRaw } from "./settings-service";

const TICK_INTERVAL_MS = 60_000;
const CLAIM_BATCH_SIZE = 20;
// Triggered automations (abandoned cart/browse, win-back) only need to be
// discovered periodically, not every minute — the underlying idle/delay
// thresholds are measured in hours/days, so a coarser scan interval is
// both sufficient and lighter on the DB.
const TRIGGER_SCAN_INTERVAL_MS = 10 * 60_000;
// A transactional row still "sending" after this long was orphaned by a crash.
const STALE_SENDING_MS = 15 * 60_000;

const consoleLogger: EmailEnvLogger = {
  info: (obj, msg) => console.info("[EmailWorker]", msg ?? obj, msg ? obj : undefined),
  warn: (obj, msg) => console.warn("[EmailWorker]", msg ?? obj, msg ? obj : undefined),
  error: (obj, msg) => console.error("[EmailWorker]", msg ?? obj, msg ? obj : undefined),
};

/**
 * Transactional order emails (order confirmation, store notification). They
 * share the queue's claim-locking, dedupe and retries, but none of the
 * marketing rules: no unsubscribe check (an order confirmation is not
 * marketing and goes to anyone who placed an order), no automation test
 * mode, no List-Unsubscribe headers or unsubscribe link.
 */
async function processTransactionalRow(
  row: ScheduledEmailRow,
  emailService: EmailServiceInterface,
): Promise<void> {
  try {
    const rendered = await renderScheduledEmail(row, "");
    if (rendered.skip) {
      await markScheduledEmailCancelled(row.id, rendered.skip);
      await recordOrderConfirmationOutcome(row, { status: "cancelled", reason: rendered.skip });
      return;
    }
    const result = await Effect.runPromise(
      emailService.sendEmail(row.recipientEmail, rendered.subject, rendered.html, {
        headers: rendered.headers,
      }),
    );
    if (result.success) {
      await markScheduledEmailSent(row.id);
      await recordOrderConfirmationOutcome(row, { status: "sent" });
      return;
    }
    const error = result.error ?? "Unknown send failure";
    const outcome = await markScheduledEmailFailed(row.id, row.attempts, error);
    await recordOrderConfirmationOutcome(row, { status: "failed", error, ...outcome });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[EmailWorker] Failed to process transactional email ${row.id} (${row.automationType}):`,
      err,
    );
    try {
      const outcome = await markScheduledEmailFailed(row.id, row.attempts, message);
      await recordOrderConfirmationOutcome(row, { status: "failed", error: message, ...outcome });
    } catch (markErr) {
      console.error(`[EmailWorker] Failed to record failure for ${row.id}:`, markErr);
    }
  }
}

/** Exported for the integration tests, which drive one row through render + send. */
export async function processScheduledEmailRow(
  row: ScheduledEmailRow,
  emailService: EmailServiceInterface,
  testMode: { enabled: boolean; email: string },
): Promise<void> {
  if (isTransactionalEmailType(row.automationType)) {
    await processTransactionalRow(row, emailService);
    return;
  }
  try {
    if (await isEmailUnsubscribed(row.recipientEmail)) {
      await markScheduledEmailCancelled(row.id);
      return;
    }

    // Test mode holds every row that isn't addressed to the admin's chosen
    // test inbox — the queue still runs (rows still get claimed/rendered),
    // real customers just never receive anything while it's on.
    if (
      testMode.enabled &&
      row.recipientEmail.toLowerCase() !== testMode.email.toLowerCase()
    ) {
      await markScheduledEmailCancelled(
        row.id,
        `Skipped: automation test mode is on (only sends to ${testMode.email || "the configured test email"})`,
      );
      return;
    }

    // Resolved fresh every send (not cached at enqueue time) — cheap,
    // idempotent, and guarantees the link in the email body is always
    // valid even for a row that sat in the queue for weeks.
    const token = await getOrCreateSubscriptionToken(row.recipientEmail);
    const { unsubscribeUrl, headers: unsubscribeHeaders } =
      buildUnsubscribeHeaders(token);

    const rendered = await renderScheduledEmail(row, unsubscribeUrl);

    // Unsubscribe headers are spread last so a renderer's own `headers`
    // can never accidentally override or omit them.
    const result = await Effect.runPromise(
      emailService.sendEmail(row.recipientEmail, rendered.subject, rendered.html, {
        headers: { ...rendered.headers, ...unsubscribeHeaders },
      }),
    );

    if (result.success) {
      await markScheduledEmailSent(row.id);
    } else {
      await markScheduledEmailFailed(
        row.id,
        row.attempts,
        result.error ?? "Unknown send failure",
      );
    }
  } catch (err) {
    // Covers renderer errors (e.g. no renderer registered yet) and any
    // unexpected throw — one bad row must never take down the rest of the
    // batch or the worker loop itself.
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[EmailWorker] Failed to process scheduled email ${row.id} (${row.automationType}):`,
      err,
    );
    try {
      await markScheduledEmailFailed(row.id, row.attempts, message);
    } catch (markErr) {
      console.error(
        `[EmailWorker] Failed to record failure for ${row.id}:`,
        markErr,
      );
    }
  }
}

let tickInFlight = false;
/** A run was requested while one was in flight — run once more when it ends. */
let rerunRequested = false;

async function tick(emailService: EmailServiceInterface): Promise<void> {
  if (tickInFlight) {
    // previous tick still running (slow send/DB) — don't overlap, but make
    // sure a just-queued order email isn't left waiting for the next poll.
    rerunRequested = true;
    return;
  }
  tickInFlight = true;
  try {
    // Re-read every tick (not cached) so the admin's on/off + test-mode
    // toggles take effect within a minute, no redeploy needed. The toggle
    // only governs MARKETING sends: transactional order emails are always
    // claimed, even while automations are switched off.
    const settings = await getEmailAutomationSettingsRaw();

    const requeued = await requeueStaleSendingEmails(TRANSACTIONAL_EMAIL_TYPES, STALE_SENDING_MS);
    if (requeued > 0) {
      console.warn(`[EmailWorker] Re-queued ${requeued} order email(s) orphaned in "sending"`);
    }

    const rows = await claimDueScheduledEmails(
      CLAIM_BATCH_SIZE,
      settings.workerEnabled ? undefined : TRANSACTIONAL_EMAIL_TYPES,
    );
    if (rows.length === 0) return;

    console.info(`[EmailWorker] Claimed ${rows.length} due email(s)`);
    const testMode = {
      enabled: settings.testModeEnabled,
      email: settings.testModeEmail,
    };
    // Sequential, not parallel: this is a low-volume background queue, not
    // a bulk sender — sequential sends are gentler on SMTP rate limits and
    // keep failures isolated and easy to reason about.
    for (const row of rows) {
      await processScheduledEmailRow(row, emailService, testMode);
    }
  } catch (err) {
    console.error("[EmailWorker] Tick failed:", err);
  } finally {
    tickInFlight = false;
    if (rerunRequested) {
      rerunRequested = false;
      void tick(emailService);
    }
  }
}

/**
 * Trigger scanning (abandoned cart/browse, win-back) enqueues rows for
 * future sends — gated by the same master toggle as tick() so a paused
 * worker doesn't quietly build up a backlog that would all fire at once
 * the moment it's turned back on.
 */
async function scanIfEnabled(): Promise<void> {
  const settings = await getEmailAutomationSettingsRaw();
  if (!settings.workerEnabled) return;
  await runTriggerScan();
}

export interface EmailAutomationWorkerHandle {
  stop(): void;
}

/**
 * Starts the background poller that sends due marketing-automation emails.
 * The interval always runs; whether it actually claims/sends anything is
 * decided per-tick from the admin's DB-backed settings (see
 * settings-service.ts / emailAutomationSettingsRouter) so the on/off and
 * test-mode toggles in the marketing-emails admin page take effect live,
 * without a redeploy. Returns a handle to stop the interval (used by
 * graceful shutdown and tests).
 */
export async function startEmailAutomationWorker(): Promise<EmailAutomationWorkerHandle> {
  const emailService = await createEmailServiceFromEnv(consoleLogger);

  const intervalId = setInterval(() => {
    void tick(emailService);
  }, TICK_INTERVAL_MS);
  // Don't let this interval keep the process alive on its own during shutdown.
  intervalId.unref?.();

  const scanIntervalId = setInterval(() => {
    void scanIfEnabled();
  }, TRIGGER_SCAN_INTERVAL_MS);
  scanIntervalId.unref?.();

  console.info(
    `[EmailWorker] Started — polling every ${TICK_INTERVAL_MS / 1000}s, scanning triggers every ${TRIGGER_SCAN_INTERVAL_MS / 60_000}m (actual sending gated by admin settings, off by default)`,
  );

  // A newly placed order nudges the worker so its confirmation goes out
  // within seconds instead of at the next poll.
  setOrderEmailWorkerKick(() => {
    void tick(emailService);
  });

  // Run one tick/scan immediately rather than waiting a full interval on startup.
  void tick(emailService);
  void scanIfEnabled();

  return {
    stop: () => {
      clearInterval(intervalId);
      clearInterval(scanIntervalId);
      setOrderEmailWorkerKick(() => {});
    },
  };
}
