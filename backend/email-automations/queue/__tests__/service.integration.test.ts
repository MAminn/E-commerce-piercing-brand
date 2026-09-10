import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";

// Real-Postgres integration test for the scheduled-email queue — in
// particular the SELECT ... FOR UPDATE SKIP LOCKED claim query, whose
// concurrency-safety cannot be meaningfully verified with a mocked DB
// client. Requires TEST_DATABASE_URL to point at a disposable Postgres
// (see docs/MARKETING_SUITE_PLAN.md). Skips entirely if unset so the
// regular `npm test` run (no local Postgres) still passes.

const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = TEST_DB_URL ? describe : describe.skip;

describeIfDb("scheduled email queue (integration)", () => {
  let db: ReturnType<typeof import("drizzle-orm/node-postgres").drizzle>;
  let schema: typeof import("#root/shared/database/drizzle/schema");
  let queue: typeof import("#root/backend/email-automations/queue/service");

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    const { drizzle } = await import("drizzle-orm/node-postgres");
    schema = await import("#root/shared/database/drizzle/schema");
    db = drizzle(TEST_DB_URL!, { schema });
    queue = await import("#root/backend/email-automations/queue/service");
  });

  beforeEach(async () => {
    await db.delete(schema.scheduledEmail);
  });

  afterAll(async () => {
    await db.delete(schema.scheduledEmail);
  });

  it("enqueues a new row", async () => {
    await queue.enqueueScheduledEmail({
      automationType: "welcome",
      recipientEmail: "a@example.com",
      payload: { code: "SYNT5-ABC" },
      scheduledFor: new Date(Date.now() - 1000),
      dedupeKey: "welcome:a@example.com",
    });

    const rows = await db.select().from(schema.scheduledEmail);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      automationType: "welcome",
      recipientEmail: "a@example.com",
      status: "pending",
      dedupeKey: "welcome:a@example.com",
    });
  });

  it("updates the still-pending row on re-enqueue with the same dedupeKey instead of duplicating", async () => {
    const firstTime = new Date(Date.now() + 60_000);
    const secondTime = new Date(Date.now() + 120_000);

    await queue.enqueueScheduledEmail({
      automationType: "abandoned_cart",
      recipientEmail: "b@example.com",
      payload: { step: 1 },
      scheduledFor: firstTime,
      dedupeKey: "abandoned_cart:step1:cart-1",
    });
    await queue.enqueueScheduledEmail({
      automationType: "abandoned_cart",
      recipientEmail: "b@example.com",
      payload: { step: 1, items: ["updated"] },
      scheduledFor: secondTime,
      dedupeKey: "abandoned_cart:step1:cart-1",
    });

    const rows = await db.select().from(schema.scheduledEmail);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.payload).toEqual({ step: 1, items: ["updated"] });
    expect(rows[0]?.scheduledFor.getTime()).toBe(secondTime.getTime());
  });

  it("does NOT resurrect a row that already sent, even if re-enqueued with the same dedupeKey", async () => {
    await queue.enqueueScheduledEmail({
      automationType: "win_back",
      recipientEmail: "c@example.com",
      payload: {},
      scheduledFor: new Date(Date.now() - 1000),
      dedupeKey: "win_back:c@example.com:2026-01",
    });
    const [row] = await db.select().from(schema.scheduledEmail);
    await queue.markScheduledEmailSent(row!.id);

    await queue.enqueueScheduledEmail({
      automationType: "win_back",
      recipientEmail: "c@example.com",
      payload: { shouldNotAppear: true },
      scheduledFor: new Date(Date.now() + 60_000),
      dedupeKey: "win_back:c@example.com:2026-01",
    });

    const rows = await db.select().from(schema.scheduledEmail);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("sent");
    expect(rows[0]?.payload).toEqual({}); // untouched, not overwritten
  });

  it("cancels all pending rows matching a dedupeKey prefix, leaving others alone", async () => {
    await queue.enqueueScheduledEmail({
      automationType: "abandoned_cart",
      recipientEmail: "d@example.com",
      payload: { step: 1 },
      scheduledFor: new Date(Date.now() + 1000),
      dedupeKey: "abandoned_cart:cart-9:step1",
    });
    await queue.enqueueScheduledEmail({
      automationType: "abandoned_cart",
      recipientEmail: "d@example.com",
      payload: { step: 2 },
      scheduledFor: new Date(Date.now() + 2000),
      dedupeKey: "abandoned_cart:cart-9:step2",
    });
    await queue.enqueueScheduledEmail({
      automationType: "welcome",
      recipientEmail: "unrelated@example.com",
      payload: {},
      scheduledFor: new Date(Date.now() + 1000),
      dedupeKey: "welcome:unrelated@example.com",
    });

    await queue.cancelScheduledEmailsByPrefix("abandoned_cart:cart-9:");

    const rows = await db.select().from(schema.scheduledEmail);
    const cartRows = rows.filter((r) => r.dedupeKey.startsWith("abandoned_cart:cart-9:"));
    const unrelatedRow = rows.find((r) => r.dedupeKey === "welcome:unrelated@example.com");

    expect(cartRows.every((r) => r.status === "cancelled")).toBe(true);
    expect(unrelatedRow?.status).toBe("pending");
  });

  it("only claims rows that are due (scheduledFor <= now)", async () => {
    await queue.enqueueScheduledEmail({
      automationType: "welcome",
      recipientEmail: "due@example.com",
      payload: {},
      scheduledFor: new Date(Date.now() - 1000),
      dedupeKey: "due-row",
    });
    await queue.enqueueScheduledEmail({
      automationType: "welcome",
      recipientEmail: "future@example.com",
      payload: {},
      scheduledFor: new Date(Date.now() + 60_000),
      dedupeKey: "future-row",
    });

    const claimed = await queue.claimDueScheduledEmails(10);

    expect(claimed).toHaveLength(1);
    expect(claimed[0]?.recipientEmail).toBe("due@example.com");
    expect(claimed[0]?.status).toBe("sending");
  });

  it("never lets two concurrent claimers grab the same row (SELECT ... FOR UPDATE SKIP LOCKED)", async () => {
    // Enqueue 10 due rows, then fire two claim batches concurrently
    // requesting up to 10 rows each. Without SKIP LOCKED (or with it
    // implemented wrong), both claimers could see the same pending rows and
    // double-claim them, causing duplicate sends of the same email.
    for (let i = 0; i < 10; i++) {
      await queue.enqueueScheduledEmail({
        automationType: "welcome",
        recipientEmail: `concurrent-${i}@example.com`,
        payload: {},
        scheduledFor: new Date(Date.now() - 1000),
        dedupeKey: `concurrent-${i}`,
      });
    }

    const [batchA, batchB] = await Promise.all([
      queue.claimDueScheduledEmails(10),
      queue.claimDueScheduledEmails(10),
    ]);

    const idsA = new Set(batchA.map((r) => r.id));
    const idsB = new Set(batchB.map((r) => r.id));
    const overlap = [...idsA].filter((id) => idsB.has(id));

    expect(overlap).toHaveLength(0);
    expect(idsA.size + idsB.size).toBe(10); // every row claimed exactly once, none lost
  });

  it("marks a row failed and retries (back to pending) until MAX_ATTEMPTS, then permanently failed", async () => {
    await queue.enqueueScheduledEmail({
      automationType: "welcome",
      recipientEmail: "retry@example.com",
      payload: {},
      scheduledFor: new Date(Date.now() - 1000),
      dedupeKey: "retry-row",
    });
    const [row] = await db.select().from(schema.scheduledEmail);

    await queue.markScheduledEmailFailed(row!.id, 0, "smtp down");
    let current = (
      await db
        .select()
        .from(schema.scheduledEmail)
        .where(eq(schema.scheduledEmail.id, row!.id))
    )[0];
    expect(current?.status).toBe("pending");
    expect(current?.attempts).toBe(1);

    // Drive it to MAX_ATTEMPTS (5)
    await queue.markScheduledEmailFailed(row!.id, 1, "smtp down");
    await queue.markScheduledEmailFailed(row!.id, 2, "smtp down");
    await queue.markScheduledEmailFailed(row!.id, 3, "smtp down");
    await queue.markScheduledEmailFailed(row!.id, 4, "smtp down");

    current = (
      await db
        .select()
        .from(schema.scheduledEmail)
        .where(eq(schema.scheduledEmail.id, row!.id))
    )[0];
    expect(current?.status).toBe("failed");
    expect(current?.attempts).toBe(5);
  });
});
