import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";

// Real-Postgres integration test for the popup abuse gate — see
// docs/MARKETING_SUITE_PLAN.md "Running the DB integration tests".

const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = TEST_DB_URL ? describe : describe.skip;

describeIfDb("popup claim service (integration)", () => {
  let db: ReturnType<typeof import("drizzle-orm/node-postgres").drizzle>;
  let schema: typeof import("#root/shared/database/drizzle/schema");
  let claimService: typeof import("#root/backend/popup/claim-service");
  let configService: typeof import("#root/backend/popup/config-service");
  let templatePromoCodeId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    const { drizzle } = await import("drizzle-orm/node-postgres");
    schema = await import("#root/shared/database/drizzle/schema");
    db = drizzle(TEST_DB_URL!, { schema });
    claimService = await import("#root/backend/popup/claim-service");
    configService = await import("#root/backend/popup/config-service");

    const { v7 } = await import("uuid");
    templatePromoCodeId = v7();
    await db.insert(schema.promoCode).values({
      id: templatePromoCodeId,
      code: "WELCOME5",
      discountType: "percentage",
      discountValue: "5",
      status: "active",
      appliesToAllProducts: true,
      showOnOffersPage: false,
    });

    // The "default" storeSettings row must exist BEFORE any test's raw
    // `.update(...).where(key='default')` call below — updating a row that
    // doesn't exist yet is a silent no-op, not an error, which would make
    // every test in this file see stale/default discount config.
    await db
      .insert(schema.storeSettings)
      .values({ key: "default" })
      .onConflictDoNothing({ target: schema.storeSettings.key });
  });

  beforeEach(async () => {
    await db.delete(schema.popupClaim);
    await db.delete(schema.scheduledEmail);
    await db.delete(schema.comingSoonSubscribers);
  });

  afterAll(async () => {
    await db.delete(schema.popupClaim);
    await db.delete(schema.promoCode);
    await db.delete(schema.scheduledEmail);
    await db.delete(schema.comingSoonSubscribers);
    await db.delete(schema.emailSubscription);
  });

  describe("codeMode: existing (shared code)", () => {
    beforeEach(async () => {
      const { db: rawDb } = await import("#root/shared/database/drizzle/db");
      await rawDb()
        .update(schema.storeSettings)
        .set({ popupDiscountConfig: { promoCodeId: templatePromoCodeId, codeMode: "existing" } })
        .where(eq(schema.storeSettings.key, "default"));
    });

    it("returns the template promo code's own code directly, without creating a new promo_code row", async () => {
      const promoCountBefore = (await db.select().from(schema.promoCode)).length;

      const result = await claimService.claimPopupDiscount({ email: "a@example.com" });

      expect(result.code).toBe("WELCOME5");
      expect(result.alreadyClaimed).toBe(false);

      const promoCountAfter = (await db.select().from(schema.promoCode)).length;
      expect(promoCountAfter).toBe(promoCountBefore); // no new row minted
    });

    it("a second claim with the SAME email returns the existing claim, not a fresh one", async () => {
      const first = await claimService.claimPopupDiscount({ email: "repeat@example.com" });
      const second = await claimService.claimPopupDiscount({ email: "repeat@example.com" });

      expect(first.alreadyClaimed).toBe(false);
      expect(second.alreadyClaimed).toBe(true);
      expect(second.code).toBe(first.code);

      const claims = await db
        .select()
        .from(schema.popupClaim)
        .where(eq(schema.popupClaim.email, "repeat@example.com"));
      expect(claims).toHaveLength(1);
    });

    it("a DIFFERENT email but the SAME phone number is blocked from claiming twice", async () => {
      await claimService.claimPopupDiscount({
        email: "person-a@example.com",
        phone: "+20 100 123 4567",
      });

      const result = await claimService.claimPopupDiscount({
        email: "person-b@example.com", // different email
        phone: "01001234567", // same phone, different format
      });

      expect(result.alreadyClaimed).toBe(true);

      const allClaims = await db.select().from(schema.popupClaim);
      expect(allClaims).toHaveLength(1); // only the first claim exists
    });

    it("writes to comingSoonSubscribers and enqueues a welcome automation on a NEW claim", async () => {
      await claimService.claimPopupDiscount({ email: "newsub@example.com" });

      const subscribers = await db
        .select()
        .from(schema.comingSoonSubscribers)
        .where(eq(schema.comingSoonSubscribers.email, "newsub@example.com"));
      expect(subscribers).toHaveLength(1);

      const emails = await db
        .select()
        .from(schema.scheduledEmail)
        .where(eq(schema.scheduledEmail.recipientEmail, "newsub@example.com"));
      expect(emails).toHaveLength(1);
      expect(emails[0]?.automationType).toBe("welcome");
      expect((emails[0]?.payload as { discountCode?: string })?.discountCode).toBe(
        "WELCOME5",
      );
    });

    it("does NOT re-enqueue a welcome email or re-insert the subscriber on a repeat claim", async () => {
      await claimService.claimPopupDiscount({ email: "onceonly@example.com" });
      await claimService.claimPopupDiscount({ email: "onceonly@example.com" });

      const emails = await db
        .select()
        .from(schema.scheduledEmail)
        .where(eq(schema.scheduledEmail.recipientEmail, "onceonly@example.com"));
      expect(emails).toHaveLength(1);
    });
  });

  describe("codeMode: generate (unique per-subscriber code)", () => {
    beforeEach(async () => {
      const { db: rawDb } = await import("#root/shared/database/drizzle/db");
      await rawDb()
        .update(schema.storeSettings)
        .set({ popupDiscountConfig: { promoCodeId: templatePromoCodeId, codeMode: "generate" } })
        .where(eq(schema.storeSettings.key, "default"));
    });

    it("mints a NEW single-use promo_code row derived from the template's discount terms", async () => {
      const result = await claimService.claimPopupDiscount({ email: "unique@example.com" });

      expect(result.code).not.toBe("WELCOME5");
      expect(result.code.startsWith("WELCOME5-")).toBe(true);

      const [minted] = await db
        .select()
        .from(schema.promoCode)
        .where(eq(schema.promoCode.code, result.code));
      expect(minted).toBeDefined();
      expect(minted?.discountType).toBe("percentage");
      expect(minted?.discountValue).toBe("5.00");
      expect(minted?.usageLimit).toBe(1);
      expect(minted?.showOnOffersPage).toBe(false);
    });

    it("mints a DIFFERENT code for a different person", async () => {
      const a = await claimService.claimPopupDiscount({ email: "unique-a@example.com" });
      const b = await claimService.claimPopupDiscount({ email: "unique-b@example.com" });
      expect(a.code).not.toBe(b.code);
    });
  });

  it("throws a clear error when no promo code has been configured yet", async () => {
    const { db: rawDb } = await import("#root/shared/database/drizzle/db");
    await rawDb()
      .update(schema.storeSettings)
      .set({ popupDiscountConfig: { promoCodeId: null, codeMode: "existing" } })
      .where(eq(schema.storeSettings.key, "default"));

    await expect(
      claimService.claimPopupDiscount({ email: "noconfig@example.com" }),
    ).rejects.toThrow(/not configured/);
  });

  it("handles a concurrent double-submit for the same email without creating two claims or crashing", async () => {
    const { db: rawDb } = await import("#root/shared/database/drizzle/db");
    await rawDb()
      .update(schema.storeSettings)
      .set({ popupDiscountConfig: { promoCodeId: templatePromoCodeId, codeMode: "existing" } })
      .where(eq(schema.storeSettings.key, "default"));

    const [a, b] = await Promise.all([
      claimService.claimPopupDiscount({ email: "racer@example.com" }),
      claimService.claimPopupDiscount({ email: "racer@example.com" }),
    ]);

    expect(a.code).toBe(b.code);

    const claims = await db
      .select()
      .from(schema.popupClaim)
      .where(eq(schema.popupClaim.email, "racer@example.com"));
    expect(claims).toHaveLength(1);
  });
});
