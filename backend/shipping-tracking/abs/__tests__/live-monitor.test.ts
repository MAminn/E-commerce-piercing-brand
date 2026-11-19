import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { alertRecipients, renderLines } from "../live-monitor";

/**
 * ABS Live monitoring: recipients, the 6-hour alert dedupe, the alert
 * triggers, and the 09:00 Cairo digest (once a day, no PII). The DB part is
 * skipped without TEST_DATABASE_URL; the mailer is always a fake.
 */

describe("alert recipients", () => {
  it("ABS_ALERT_EMAILS first, then ORDER_NOTIFICATION_EMAILS, else none", () => {
    expect(alertRecipients({ ABS_ALERT_EMAILS: "Ops@Shop.test, x", ORDER_NOTIFICATION_EMAILS: "o@shop.test" })).toEqual({ emails: ["ops@shop.test"], source: "abs" });
    expect(alertRecipients({ ABS_ALERT_EMAILS: "not-an-address", ORDER_NOTIFICATION_EMAILS: "'o@shop.test'" })).toEqual({ emails: ["o@shop.test"], source: "orders" });
    expect(alertRecipients({})).toEqual({ emails: [], source: "none" });
  });
  it("renders escaped text lines", () => {
    expect(renderLines("A <b>", ["x & y"])).toContain("A &lt;b&gt;");
    expect(renderLines("A", ["x & y"])).toContain("x &amp; y");
  });
});

const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = TEST_DB_URL ? describe : describe.skip;

describeIfDb("live monitoring (integration)", () => {
  type Db = import("#root/shared/database/drizzle/db").DatabaseClient;
  let db: Db;
  let mon: typeof import("../live-monitor");
  const sent: Array<{ to: string; subject: string; html: string }> = [];
  const send = async (to: string, subject: string, html: string) => {
    sent.push({ to, subject, html });
    return true;
  };
  const ENV = { ABS_ALERT_EMAILS: "ops@shop.test" };
  const run = (outcome: string, minutesAgo: number) =>
    db.execute(sql`INSERT INTO abs_sync_run (id, started_at, finished_at, trigger, outcome) VALUES (gen_random_uuid(), now() - ${`${minutesAgo} minutes`}::interval, now() - ${`${minutesAgo} minutes`}::interval, 'schedule', ${outcome})`);

  beforeAll(async () => {
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const schema = await import("#root/shared/database/drizzle/schema");
    db = drizzle(TEST_DB_URL as string, { schema }) as unknown as Db;
    mon = await import("../live-monitor");
    const readiness = await import("../readiness");
    expect((await readiness.checkAbsLiveReadiness(db)).ready, "run abs-live.integration first or apply 0072").toBe(true);
  });
  beforeEach(async () => {
    sent.length = 0;
    await db.execute(sql`TRUNCATE abs_sync_run, abs_audit_log, abs_live_application`);
  });
  afterAll(async () => {
    if (!db) return;
    await db.execute(sql`TRUNCATE abs_sync_run, abs_audit_log, abs_live_application`);
    await (db as unknown as { $client: { end(): Promise<void> } }).$client.end();
  });

  it("3 failed checks in a row → one email; deduped for 6 hours; sent again after", async () => {
    await run("ok", 40);
    for (const m of [30, 20, 10]) await run("failed", m);
    const now = new Date();
    const deps = { db, env: ENV, send, now: () => now };
    expect(await mon.runLiveMonitoring(deps, null)).toContain("sync_failing:sent");
    expect(sent.filter((s) => s.subject.includes("ABS sync failing"))).toHaveLength(1);
    expect(sent[0]?.to).toBe("ops@shop.test");
    expect(await mon.runLiveMonitoring(deps, null)).toContain("sync_failing:deduped");
    const later = new Date(now.getTime() + 6 * 3_600_000 + 60_000);
    expect(await mon.runLiveMonitoring({ ...deps, now: () => later }, null)).toContain("sync_failing:sent");
  });

  it("no successful check for over 60 minutes → stale alert; a healthy poller sends nothing", async () => {
    await run("ok", 5);
    const now = new Date();
    const quiet = await mon.runLiveMonitoring({ db, env: ENV, send, now: () => new Date(now.getTime()) }, null);
    expect(quiet.filter((x) => !x.startsWith("digest:"))).toEqual([]);
    const late = new Date(now.getTime() + 70 * 60_000);
    expect(await mon.runLiveMonitoring({ db, env: ENV, send, now: () => late }, null)).toContain("sync_stale:sent");
  });

  it("daily cap and a failed apply each send one alert, with order numbers and AWB last 4 only", async () => {
    await run("ok", 1);
    const report = { ran: true, paused: false, evaluated: 3, applied: 2, ready: 0, skipped: 1, failed: 1, capHit: true, appliedOrders: [10501, 10502], failures: [{ awbLast4: "4321", orderNumber: 10503 }] };
    const out = await mon.runLiveMonitoring({ db, env: ENV, send, now: () => new Date() }, report);
    expect(out).toEqual(expect.arrayContaining(["daily_cap:sent", "apply_failed:sent"]));
    const failedMail = sent.find((s) => s.subject.includes("failed"));
    expect(failedMail?.html).toContain("#10503");
    expect(failedMail?.html).toContain("…4321");
  });

  it("no recipients: nothing sent, recorded once (no log spam every tick)", async () => {
    for (const m of [30, 20, 10]) await run("failed", m);
    const deps = { db, env: {}, send, now: () => new Date(), log: () => {} };
    expect(await mon.runLiveMonitoring(deps, null)).toContain("sync_failing:no_recipients");
    expect(await mon.runLiveMonitoring(deps, null)).toContain("sync_failing:deduped");
    expect(sent).toHaveLength(0);
  });

  it("digest: not before 09:00 Cairo, then once per Cairo day; counts and order numbers only", async () => {
    await run("ok", 1);
    const at = (iso: string) => new Date(iso);
    // 08:59 Cairo = 06:59Z (UTC+2 in November).
    expect(await mon.maybeSendDigest({ db, env: ENV, send, now: () => at("2026-11-20T06:59:00Z") })).toBe("not_yet");
    await db.execute(sql`INSERT INTO abs_live_application (id, decision_id, awb, to_status, outcome, trigger, actor, cairo_day, applied_at)
                         VALUES (gen_random_uuid(), gen_random_uuid(), 'DIG0001234', 'delivered', 'applied', 'auto', 'system:abs', '2026-11-19', now())`);
    expect(await mon.maybeSendDigest({ db, env: ENV, send, now: () => at("2026-11-20T07:05:00Z") })).toBe("sent");
    expect(await mon.maybeSendDigest({ db, env: ENV, send, now: () => at("2026-11-20T09:00:00Z") })).toBe("already");
    expect(sent).toHaveLength(1);
    expect(sent[0]?.subject).toBe("[Percé ABS] Daily ABS summary for 2026-11-19");
    expect(sent[0]?.html).toContain("Delivered automatically on 2026-11-19: 1");
    // No phone numbers or addresses: the digest has no 10+ digit runs.
    expect(sent[0]?.html.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, "")).not.toMatch(/\d{10,}/);
    // Next Cairo day → sent again.
    expect(await mon.maybeSendDigest({ db, env: ENV, send, now: () => at("2026-11-21T07:01:00Z") })).toBe("sent");
  });
});
