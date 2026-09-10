import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";

const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = TEST_DB_URL ? describe : describe.skip;

describeIfDb("broadcast service (integration)", () => {
  let db: ReturnType<typeof import("drizzle-orm/node-postgres").drizzle>;
  let schema: typeof import("#root/shared/database/drizzle/schema");
  let broadcast: typeof import("#root/backend/email-automations/broadcast/service");
  let subscriptionService: typeof import("#root/backend/email-subscription/service");

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    const { drizzle } = await import("drizzle-orm/node-postgres");
    schema = await import("#root/shared/database/drizzle/schema");
    db = drizzle(TEST_DB_URL!, { schema });
    broadcast = await import("#root/backend/email-automations/broadcast/service");
    subscriptionService = await import("#root/backend/email-subscription/service");
  });

  beforeEach(async () => {
    await db.delete(schema.scheduledEmail);
    await db.delete(schema.emailSubscription);
    await db.delete(schema.order);
  });

  afterAll(async () => {
    await db.delete(schema.scheduledEmail);
    await db.delete(schema.emailSubscription);
    await db.delete(schema.order);
  });

  async function insertOrder(email: string, createdAt: Date) {
    const { v7 } = await import("uuid");
    await db.insert(schema.order).values({
      id: v7(),
      customerName: "Test",
      customerEmail: email,
      customerPhone: "01000000000",
      shippingAddress: "x",
      shippingCity: "x",
      shippingState: "x",
      shippingPostalCode: "x",
      shippingCountry: "Egypt",
      subtotal: "10.00",
      shipping: "0.00",
      tax: "0.00",
      total: "10.00",
      createdAt,
    });
  }

  describe("resolveBroadcastRecipients", () => {
    it("all_subscribers: includes subscribed, excludes unsubscribed", async () => {
      await subscriptionService.getOrCreateSubscriptionToken("subbed@example.com");
      const token = await subscriptionService.getOrCreateSubscriptionToken(
        "unsubbed@example.com",
      );
      await subscriptionService.unsubscribeByToken(token);

      const recipients = await broadcast.resolveBroadcastRecipients("all_subscribers");
      expect(recipients).toContain("subbed@example.com");
      expect(recipients).not.toContain("unsubbed@example.com");
    });

    it("customers: includes anyone who has ordered, deduplicated", async () => {
      await insertOrder("buyer@example.com", new Date());
      await insertOrder("buyer@example.com", new Date()); // second order, same email

      const recipients = await broadcast.resolveBroadcastRecipients("customers");
      const matches = recipients.filter((e) => e === "buyer@example.com");
      expect(matches).toHaveLength(1); // not duplicated
    });

    it("customers: excludes a customer who has since unsubscribed", async () => {
      await insertOrder("will-unsub@example.com", new Date());
      const token = await subscriptionService.getOrCreateSubscriptionToken(
        "will-unsub@example.com",
      );
      await subscriptionService.unsubscribeByToken(token);

      const recipients = await broadcast.resolveBroadcastRecipients("customers");
      expect(recipients).not.toContain("will-unsub@example.com");
    });

    it("inactive_customers: only includes customers whose MOST RECENT order is past the threshold", async () => {
      const now = Date.now();
      await insertOrder("old-buyer@example.com", new Date(now - 100 * 24 * 60 * 60_000));
      await insertOrder("recent-buyer@example.com", new Date(now - 5 * 24 * 60 * 60_000));

      const recipients = await broadcast.resolveBroadcastRecipients(
        "inactive_customers",
        90,
      );
      expect(recipients).toContain("old-buyer@example.com");
      expect(recipients).not.toContain("recent-buyer@example.com");
    });
  });

  describe("sendBroadcast", () => {
    it("enqueues one scheduled_email row per resolved recipient", async () => {
      await subscriptionService.getOrCreateSubscriptionToken("r1@example.com");
      await subscriptionService.getOrCreateSubscriptionToken("r2@example.com");

      const result = await broadcast.sendBroadcast("new_drops", "all_subscribers");
      expect(result.recipientCount).toBe(2);

      const rows = await db.select().from(schema.scheduledEmail);
      expect(rows).toHaveLength(2);
      expect(rows.every((r) => r.automationType === "new_drops")).toBe(true);
    });

    it("two separate broadcasts of the same automation type to the same recipient both get sent — campaigns are independent", async () => {
      await subscriptionService.getOrCreateSubscriptionToken("repeat-recipient@example.com");

      const first = await broadcast.sendBroadcast("flash_offer", "all_subscribers");
      const second = await broadcast.sendBroadcast("flash_offer", "all_subscribers");

      expect(first.campaignId).not.toBe(second.campaignId);

      const rows = await db
        .select()
        .from(schema.scheduledEmail)
        .where(eq(schema.scheduledEmail.recipientEmail, "repeat-recipient@example.com"));
      expect(rows).toHaveLength(2); // both campaigns' sends exist, neither deduped away
    });

    it("throws when the automation's template is disabled", async () => {
      const templateService = await import(
        "#root/backend/email-automations/templates/service"
      );
      const defaults = await import("#root/backend/email-automations/templates/defaults");
      await templateService.upsertTemplate({
        automationType: "retention",
        stepKey: "default",
        enabled: false,
        delayMinutes: 0,
        subjectEn: "x",
        subjectAr: "x",
        content: defaults.getDefaultTemplate("retention", "default")!.content,
        promoCodeId: null,
      });

      await expect(
        broadcast.sendBroadcast("retention", "all_subscribers"),
      ).rejects.toThrow(/disabled/);

      await db.delete(schema.emailTemplate);
    });
  });
});
