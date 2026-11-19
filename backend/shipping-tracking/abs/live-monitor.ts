import { sql, type SQL } from "drizzle-orm";
import { Effect } from "effect";
import { v7 } from "uuid";
import type { DatabaseClient } from "#root/shared/database/drizzle/db";
import type { EmailServiceInterface } from "#root/shared/email/service";
import { parseNotificationEmails, ORDER_NOTIFICATION_EMAILS_ENV } from "#root/backend/orders/order-emails/notification-recipients";
import { ATTENTION_REASONS, cairoDay, cairoHour } from "./live-rules";
import type { LivePassReport } from "./live";

/**
 * ABS Live monitoring: deduped alert emails and the 09:00 Cairo digest, sent
 * with the existing SMTP mailer (createEmailServiceFromEnv). Live mode only —
 * Shadow sends nothing, exactly as before.
 *
 * Recipients: ABS_ALERT_EMAILS, else ORDER_NOTIFICATION_EMAILS (same parser);
 * none → the boot / tick log says so and nothing is sent.
 *
 * Dedupe: one email per alert type per 6 h, tracked in abs_audit_log
 * (`alert_email`, after.type); the digest once per Cairo day (`digest_email`,
 * after.day). Bodies carry order numbers, AWB last 4 and counts only — never
 * a phone, name or address.
 */

export const ABS_ALERT_EMAILS_ENV = "ABS_ALERT_EMAILS" as const;
export const ALERT_DEDUPE_MS = 6 * 3_600_000;
export const DIGEST_HOUR_CAIRO = 9;
export const STALE_AFTER_MS = 60 * 60_000;
export const FAILED_TICKS_ALERT = 3;

export type AlertType = "sync_failing" | "sync_stale" | "daily_cap" | "apply_failed" | "unknown_status";

type Env = Record<string, string | undefined>;
type Q = Pick<DatabaseClient, "execute">;
const rows = async <T>(q: Q, query: SQL): Promise<T[]> => ((await q.execute(query)) as unknown as { rows: T[] }).rows;

export function alertRecipients(env: Env = process.env): { emails: string[]; source: "abs" | "orders" | "none" } {
  const abs = parseNotificationEmails(env[ABS_ALERT_EMAILS_ENV]);
  if (abs.emails.length > 0) return { emails: abs.emails, source: "abs" };
  const orders = parseNotificationEmails(env[ORDER_NOTIFICATION_EMAILS_ENV]);
  if (orders.emails.length > 0) return { emails: orders.emails, source: "orders" };
  return { emails: [], source: "none" };
}

export type SendFn = (to: string, subject: string, html: string) => Promise<boolean>;

export interface MonitorDeps {
  db: DatabaseClient;
  env?: Env;
  now?: () => Date;
  /** Injected in tests; defaults to the SMTP mailer from the env. */
  send?: SendFn;
  log?: (m: string) => void;
}

let defaultSender: Promise<SendFn> | null = null;
function smtpSender(): Promise<SendFn> {
  defaultSender ??= (async () => {
    const { createEmailServiceFromEnv } = await import("#root/shared/email/from-env");
    const quiet = { info: () => {}, warn: (o: unknown) => console.warn("[ABS live] email:", o), error: (o: unknown) => console.error("[ABS live] email:", o) };
    const svc: EmailServiceInterface = await createEmailServiceFromEnv(quiet);
    return async (to, subject, html) => {
      try {
        const r = await Effect.runPromise(svc.sendEmail(to, subject, html));
        return r?.success === true;
      } catch {
        return false;
      }
    };
  })();
  return defaultSender;
}

const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export function renderLines(title: string, lines: string[]): string {
  return `<div style="font-family:system-ui,sans-serif;font-size:14px;line-height:1.5"><h2 style="font-size:16px">${esc(title)}</h2>${lines
    .map((l) => `<p style="margin:4px 0">${esc(l)}</p>`)
    .join("")}<p style="color:#666;margin-top:16px">Open Dashboard → ABS Tracking for details.</p></div>`;
}

async function sendAll(deps: MonitorDeps, subject: string, lines: string[]): Promise<{ sent: number; recipients: number }> {
  const { emails } = alertRecipients(deps.env ?? process.env);
  if (emails.length === 0) {
    (deps.log ?? console.warn)(`[ABS live] no alert recipients (${ABS_ALERT_EMAILS_ENV} / ${ORDER_NOTIFICATION_EMAILS_ENV} unset): ${subject}`);
    return { sent: 0, recipients: 0 };
  }
  const send = deps.send ?? (await smtpSender());
  const html = renderLines(subject, lines);
  let sent = 0;
  for (const to of emails) if (await send(to, `[Percé ABS] ${subject}`, html)) sent++;
  return { sent, recipients: emails.length };
}

async function auditSystem(q: Q, action: string, after: Record<string, unknown>, now: Date) {
  await q.execute(sql`INSERT INTO abs_audit_log (id, at, actor, action, after) VALUES (${v7()}, ${now.toISOString()}::timestamptz, 'system:abs', ${action}, ${JSON.stringify(after)}::jsonb)`);
}

/** One email per type per 6 h. Returns what happened (for tests and the log). */
export async function sendDedupedAlert(deps: MonitorDeps, type: AlertType, subject: string, lines: string[]): Promise<"sent" | "deduped" | "no_recipients" | "failed"> {
  const now = (deps.now ?? (() => new Date()))();
  const since = new Date(now.getTime() - ALERT_DEDUPE_MS).toISOString();
  const [recent] = await rows<{ hit: boolean }>(
    deps.db,
    sql`SELECT EXISTS (SELECT 1 FROM abs_audit_log WHERE action = 'alert_email' AND after->>'type' = ${type} AND at >= ${since}::timestamptz) AS hit`,
  );
  if (recent?.hit) return "deduped";
  const r = await sendAll(deps, subject, lines);
  // Recorded even without recipients, so the log line is not repeated every tick.
  await auditSystem(deps.db, "alert_email", { type, subject, recipients: r.recipients, sent: r.sent }, now);
  if (r.recipients === 0) return "no_recipients";
  return r.sent > 0 ? "sent" : "failed";
}

export interface SyncHealth {
  lastOkAt: Date | null;
  consecutiveFailures: number;
  /** First stored run ever (no alert for "no success in 60 min" before the poller has run that long). */
  firstRunAt: Date | null;
  unknownStatuses: number;
}

export async function readSyncHealth(q: Q): Promise<SyncHealth> {
  const recent = await rows<{ outcome: string | null }>(
    q,
    sql`SELECT outcome FROM abs_sync_run WHERE outcome IS NOT NULL AND outcome NOT LIKE 'skipped%' ORDER BY started_at DESC LIMIT 20`,
  );
  let consecutiveFailures = 0;
  for (const r of recent) {
    if (r.outcome !== "failed") break;
    consecutiveFailures++;
  }
  const [h] = await rows<Record<string, unknown>>(
    q,
    sql`SELECT (SELECT max(finished_at) FROM abs_sync_run WHERE outcome = 'ok') AS last_ok,
               (SELECT min(started_at) FROM abs_sync_run) AS first_run,
               (SELECT count(*)::int FROM abs_shipment WHERE status = 'UNKNOWN') AS unknown`,
  );
  const d = (v: unknown) => (v ? new Date(String(v)) : null);
  return { lastOkAt: d(h?.last_ok), consecutiveFailures, firstRunAt: d(h?.first_run), unknownStatuses: Number(h?.unknown ?? 0) };
}

/** After every scheduled tick in live mode. Never throws. */
export async function runLiveMonitoring(deps: MonitorDeps, live: LivePassReport | null): Promise<string[]> {
  const now = (deps.now ?? (() => new Date()))();
  const done: string[] = [];
  const log = deps.log ?? console.warn;
  try {
    const h = await readSyncHealth(deps.db);
    if (h.consecutiveFailures >= FAILED_TICKS_ALERT) {
      done.push(`sync_failing:${await sendDedupedAlert(deps, "sync_failing", `ABS sync failing (${h.consecutiveFailures} checks in a row)`, [
        `The last ${h.consecutiveFailures} ABS checks failed. Nothing is marked Delivered automatically while ABS cannot be read.`,
        `Last successful check: ${h.lastOkAt ? h.lastOkAt.toISOString() : "never"}.`,
      ])}`);
    }
    const staleSince = h.lastOkAt ?? h.firstRunAt;
    if (staleSince && now.getTime() - staleSince.getTime() > STALE_AFTER_MS) {
      done.push(`sync_stale:${await sendDedupedAlert(deps, "sync_stale", "No successful ABS check for over 60 minutes", [
        `Last successful check: ${h.lastOkAt ? h.lastOkAt.toISOString() : "never"}.`,
      ])}`);
    }
    if (h.unknownStatuses > 0) {
      done.push(`unknown_status:${await sendDedupedAlert(deps, "unknown_status", "ABS sent a status we do not know", [
        `${h.unknownStatuses} shipment(s) have an unknown ABS status. They are never acted on automatically.`,
      ])}`);
    }
    if (live?.capHit) {
      done.push(`daily_cap:${await sendDedupedAlert(deps, "daily_cap", "Daily limit of automatic Delivered reached", [
        "The daily cap (ABS_LIVE_DAILY_CAP) was reached; automatic Delivered stopped until tomorrow (Cairo time).",
        `Applied in this check: ${live.applied}.`,
      ])}`);
    }
    if (live && live.failed > 0) {
      done.push(`apply_failed:${await sendDedupedAlert(deps, "apply_failed", "An automatic Delivered failed", [
        ...live.failures.slice(0, 10).map((f) => `Order ${f.orderNumber ? `#${f.orderNumber}` : "(unknown)"} — AWB …${f.awbLast4}: not changed (rolled back).`),
        "Nothing was changed for these orders. Check them on the ABS screen.",
      ])}`);
    }
    done.push(`digest:${await maybeSendDigest(deps)}`);
  } catch (err) {
    log(`[ABS live] monitoring failed: ${String((err as Error)?.message ?? err).slice(0, 200)}`);
  }
  return done;
}

/** Yesterday's Cairo day. */
function previousCairoDay(now: Date): string {
  return cairoDay(new Date(now.getTime() - 86_400_000));
}

export async function buildDigest(q: Q, now: Date): Promise<{ day: string; subject: string; lines: string[] }> {
  const yesterday = previousCairoDay(now);
  const applied = await rows<{ order_number: number | null; undone: boolean }>(
    q,
    sql`SELECT o.order_number, (a.undone_at IS NOT NULL) AS undone FROM abs_live_application a LEFT JOIN "order" o ON o.id = a.order_id
        WHERE a.outcome = 'applied' AND a.cairo_day = ${yesterday}::date ORDER BY o.order_number`,
  );
  const reasons = [...ATTENTION_REASONS];
  const attention = await rows<{ reason_code: string; n: number }>(
    q,
    sql`WITH latest AS (
          SELECT DISTINCT ON (awb) id, awb, decision, applied, acknowledged_at FROM abs_tracking_decision ORDER BY awb, last_seen_at DESC, created_at DESC
        ), last_eval AS (
          SELECT DISTINCT ON (awb) awb, decision_id, outcome, reason_code, last_seen_at FROM abs_live_application
          WHERE outcome IN ('skipped', 'failed') ORDER BY awb, last_seen_at DESC
        )
        SELECT e.reason_code, count(*)::int AS n FROM last_eval e JOIN latest d ON d.awb = e.awb AND d.id = e.decision_id
        WHERE d.decision = 'would_mark_delivered' AND d.applied = false AND d.acknowledged_at IS NULL
          AND e.last_seen_at >= ${new Date(now.getTime() - 2 * 86_400_000).toISOString()}::timestamptz
          AND (e.outcome = 'failed' OR e.reason_code IN (${sql.join(reasons.map((r) => sql`${r}`), sql`, `)}) OR e.reason_code = 'awaiting_approval')
        GROUP BY e.reason_code ORDER BY e.reason_code`,
  );
  const [other] = await rows<Record<string, number>>(
    q,
    sql`WITH latest AS (
          SELECT DISTINCT ON (awb) awb, decision, reason_code, acknowledged_at FROM abs_tracking_decision ORDER BY awb, last_seen_at DESC, created_at DESC
        )
        SELECT (SELECT count(*)::int FROM abs_order_link WHERE state IN ('needs_review', 'unmatched')) AS review,
               (SELECT count(*)::int FROM latest WHERE decision = 'alert' AND acknowledged_at IS NULL) AS alerts,
               (SELECT count(*)::int FROM latest WHERE decision = 'needs_return_confirmation' AND acknowledged_at IS NULL) AS returns`,
  );
  const h = await readSyncHealth(q);
  const [runs] = await rows<{ ok: number; failed: number }>(
    q,
    sql`SELECT count(*) FILTER (WHERE outcome = 'ok')::int AS ok, count(*) FILTER (WHERE outcome = 'failed')::int AS failed
        FROM abs_sync_run WHERE started_at >= ${new Date(now.getTime() - 86_400_000).toISOString()}::timestamptz`,
  );
  const nums = applied.filter((a) => a.order_number !== null).map((a) => `#${a.order_number}${a.undone ? " (undone)" : ""}`);
  const lines = [
    `Delivered automatically on ${yesterday}: ${applied.length}${nums.length ? ` — ${nums.join(", ")}` : ""}.`,
    `Needs your attention: ${(other?.review ?? 0)} match(es) to decide, ${(other?.alerts ?? 0)} problem(s), ${(other?.returns ?? 0)} return(s) to confirm.`,
    ...attention.map((a) => `Not marked automatically — ${a.reason_code}: ${a.n}`),
    `ABS checks in the last 24 h: ${runs?.ok ?? 0} ok, ${runs?.failed ?? 0} failed. Last success: ${h.lastOkAt ? h.lastOkAt.toISOString() : "never"}.`,
  ];
  return { day: cairoDay(now), subject: `Daily ABS summary for ${yesterday}`, lines };
}

/** Once per Cairo day, from 09:00 Cairo. */
export async function maybeSendDigest(deps: MonitorDeps): Promise<"sent" | "not_yet" | "already" | "no_recipients" | "failed"> {
  const now = (deps.now ?? (() => new Date()))();
  if (cairoHour(now) < DIGEST_HOUR_CAIRO) return "not_yet";
  const today = cairoDay(now);
  const [done] = await rows<{ hit: boolean }>(
    deps.db,
    sql`SELECT EXISTS (SELECT 1 FROM abs_audit_log WHERE action = 'digest_email' AND after->>'day' = ${today}) AS hit`,
  );
  if (done?.hit) return "already";
  const d = await buildDigest(deps.db, now);
  const r = await sendAll(deps, d.subject, d.lines);
  await auditSystem(deps.db, "digest_email", { day: today, recipients: r.recipients, sent: r.sent }, now);
  if (r.recipients === 0) return "no_recipients";
  return r.sent > 0 ? "sent" : "failed";
}
