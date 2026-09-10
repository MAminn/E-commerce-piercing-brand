import { Effect } from "effect";
import { createEmailServiceFromEnv, type EmailEnvLogger } from "#root/shared/email/from-env";
import type { EmailServiceInterface } from "#root/shared/email/service";
import {
  claimDueScheduledEmails,
  markScheduledEmailSent,
  markScheduledEmailFailed,
  markScheduledEmailCancelled,
} from "./queue/service";
import { renderScheduledEmail } from "./render";
// Side effect: registers every automation type's HTML renderer. Must happen
// before the worker's first tick.
import "./templates/render";
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

const consoleLogger: EmailEnvLogger = {
  info: (obj, msg) => console.info("[EmailWorker]", msg ?? obj, msg ? obj : undefined),
  warn: (obj, msg) => console.warn("[EmailWorker]", msg ?? obj, msg ? obj : undefined),
  error: (obj, msg) => console.error("[EmailWorker]", msg ?? obj, msg ? obj : undefined),
};

async function processRow(
  row: ScheduledEmailRow,
  emailService: EmailServiceInterface,
  testMode: { enabled: boolean; email: string },
): Promise<void> {
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

async function tick(emailService: EmailServiceInterface): Promise<void> {
  if (tickInFlight) return; // previous tick still running (slow send/DB) — skip, don't overlap
  tickInFlight = true;
  try {
    // Re-read every tick (not cached) so the admin's on/off + test-mode
    // toggles take effect within a minute, no redeploy needed.
    const settings = await getEmailAutomationSettingsRaw();
    if (!settings.workerEnabled) return;

    const rows = await claimDueScheduledEmails(CLAIM_BATCH_SIZE);
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
      await processRow(row, emailService, testMode);
    }
  } catch (err) {
    console.error("[EmailWorker] Tick failed:", err);
  } finally {
    tickInFlight = false;
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

  // Run one tick/scan immediately rather than waiting a full interval on startup.
  void tick(emailService);
  void scanIfEnabled();

  return {
    stop: () => {
      clearInterval(intervalId);
      clearInterval(scanIntervalId);
    },
  };
}
