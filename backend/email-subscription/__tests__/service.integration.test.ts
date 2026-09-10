import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";

// Real-Postgres integration test for email-subscription — see
// docs/MARKETING_SUITE_PLAN.md "Running the DB integration tests" for how
// to run this. Skips entirely when TEST_DATABASE_URL is unset.

const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = TEST_DB_URL ? describe : describe.skip;

describeIfDb("email subscription (integration)", () => {
  let db: ReturnType<typeof import("drizzle-orm/node-postgres").drizzle>;
  let schema: typeof import("#root/shared/database/drizzle/schema");
  let subscriptionService: typeof import("#root/backend/email-subscription/service");
  let queue: typeof import("#root/backend/email-automations/queue/service");
  let unsubscribeCheck: typeof import("#root/backend/email-automations/unsubscribe-check");

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    const { drizzle } = await import("drizzle-orm/node-postgres");
    schema = await import("#root/shared/database/drizzle/schema");
    db = drizzle(TEST_DB_URL!, { schema });
    subscriptionService = await import("#root/backend/email-subscription/service");
    queue = await import("#root/backend/email-automations/queue/service");
    unsubscribeCheck = await import("#root/backend/email-automations/unsubscribe-check");
  });

  beforeEach(async () => {
    await db.delete(schema.scheduledEmail);
    await db.delete(schema.emailSubscription);
  });

  afterAll(async () => {
    await db.delete(schema.scheduledEmail);
    await db.delete(schema.emailSubscription);
  });

  it("creates a subscription row with a token on first call", async () => {
    const token = await subscriptionService.getOrCreateSubscriptionToken(
      "new@example.com",
    );
    expect(token).toMatch(/^[0-9a-f]{64}$/); // 32 bytes hex

    const rows = await db.select().from(schema.emailSubscription);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      email: "new@example.com",
      unsubscribeToken: token,
      unsubscribedAt: null,
    });
  });

  it("normalizes email case/whitespace so the same person always gets the same token", async () => {
    const tokenA = await subscriptionService.getOrCreateSubscriptionToken(
      "  Person@Example.com  ",
    );
    const tokenB = await subscriptionService.getOrCreateSubscriptionToken(
      "person@example.com",
    );
    expect(tokenA).toBe(tokenB);

    const rows = await db.select().from(schema.emailSubscription);
    expect(rows).toHaveLength(1);
  });

  it("returns the SAME token on repeated calls — a previously-sent email's link must keep working", async () => {
    const first = await subscriptionService.getOrCreateSubscriptionToken(
      "repeat@example.com",
    );
    const second = await subscriptionService.getOrCreateSubscriptionToken(
      "repeat@example.com",
    );
    expect(first).toBe(second);
  });

  it("isEmailUnsubscribed is false for a never-seen email (no row yet)", async () => {
    const result = await subscriptionService.isEmailUnsubscribed(
      "nobody@example.com",
    );
    expect(result).toBe(false);
  });

  it("unsubscribeByToken flips the flag, resubscribeByToken flips it back", async () => {
    const token = await subscriptionService.getOrCreateSubscriptionToken(
      "toggle@example.com",
    );

    expect(await subscriptionService.isEmailUnsubscribed("toggle@example.com")).toBe(
      false,
    );

    const unsubResult = await subscriptionService.unsubscribeByToken(token);
    expect(unsubResult).toEqual({ success: true, email: "toggle@example.com" });
    expect(await subscriptionService.isEmailUnsubscribed("toggle@example.com")).toBe(
      true,
    );

    const resubResult = await subscriptionService.resubscribeByToken(token);
    expect(resubResult).toEqual({ success: true, email: "toggle@example.com" });
    expect(await subscriptionService.isEmailUnsubscribed("toggle@example.com")).toBe(
      false,
    );
  });

  it("unsubscribeByToken is a no-op success for an unknown token — never throws", async () => {
    const result = await subscriptionService.unsubscribeByToken("does-not-exist");
    expect(result).toEqual({ success: false });
  });

  it("getSubscriptionStatusByToken reflects current state", async () => {
    const token = await subscriptionService.getOrCreateSubscriptionToken(
      "status@example.com",
    );
    let status = await subscriptionService.getSubscriptionStatusByToken(token);
    expect(status).toEqual({ email: "status@example.com", unsubscribed: false });

    await subscriptionService.unsubscribeByToken(token);
    status = await subscriptionService.getSubscriptionStatusByToken(token);
    expect(status).toEqual({ email: "status@example.com", unsubscribed: true });
  });

  it("enqueueScheduledEmail creates the subscription row as a side effect", async () => {
    await queue.enqueueScheduledEmail({
      automationType: "welcome",
      recipientEmail: "queued@example.com",
      payload: {},
      scheduledFor: new Date(),
      dedupeKey: "welcome:queued@example.com",
    });

    const rows = await db.select().from(schema.emailSubscription);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.email).toBe("queued@example.com");
  });

  it(
    "END-TO-END: a queued email whose recipient unsubscribes AFTER enqueueing is not sent — " +
      "the worker's unsubscribe-check module (checked at send time) reflects the DB state",
    async () => {
      await queue.enqueueScheduledEmail({
        automationType: "win_back",
        recipientEmail: "late-unsub@example.com",
        payload: {},
        scheduledFor: new Date(Date.now() - 1000),
        dedupeKey: "win_back:late-unsub@example.com",
      });

      // Confirm not unsubscribed yet (this is what the worker checks at
      // enqueue time — should be false)
      expect(
        await unsubscribeCheck.isEmailUnsubscribed("late-unsub@example.com"),
      ).toBe(false);

      // Recipient unsubscribes via the token before the worker gets to it
      const token = await subscriptionService.getOrCreateSubscriptionToken(
        "late-unsub@example.com",
      );
      await subscriptionService.unsubscribeByToken(token);

      // The SAME module the worker calls at send time must now say true —
      // proving the check is live, not cached from enqueue time.
      expect(
        await unsubscribeCheck.isEmailUnsubscribed("late-unsub@example.com"),
      ).toBe(true);
    },
  );
});
