import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";

// Real-Postgres integration test proving the full template pipeline works
// end to end: DB defaults merge -> admin override round-trip -> every
// registered automation renderer produces valid HTML with sample data.
// See docs/MARKETING_SUITE_PLAN.md "Running the DB integration tests".

const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = TEST_DB_URL ? describe : describe.skip;

describeIfDb("email template system (integration)", () => {
  let db: ReturnType<typeof import("drizzle-orm/node-postgres").drizzle>;
  let schema: typeof import("#root/shared/database/drizzle/schema");
  let templateService: typeof import("#root/backend/email-automations/templates/service");
  let defaults: typeof import("#root/backend/email-automations/templates/defaults");
  let renderApi: typeof import("#root/backend/email-automations/render");
  let samplePayload: typeof import("#root/backend/email-automations/templates/sample-payload");
  let testPromoCodeId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    const { drizzle } = await import("drizzle-orm/node-postgres");
    schema = await import("#root/shared/database/drizzle/schema");
    db = drizzle(TEST_DB_URL!, { schema });
    templateService = await import("#root/backend/email-automations/templates/service");
    defaults = await import("#root/backend/email-automations/templates/defaults");
    samplePayload = await import("#root/backend/email-automations/templates/sample-payload");
    // Registers every renderer as a side effect.
    await import("#root/backend/email-automations/templates/render");
    renderApi = await import("#root/backend/email-automations/render");

    await db.delete(schema.emailTemplate);
    await db.delete(schema.promoCode).where(eq(schema.promoCode.code, "TEST-RENDER-CODE"));
    const [inserted] = await db
      .insert(schema.promoCode)
      .values({ code: "TEST-RENDER-CODE", discountType: "percentage", discountValue: "10" })
      .returning({ id: schema.promoCode.id });
    testPromoCodeId = inserted!.id;
  });

  afterAll(async () => {
    await db.delete(schema.emailTemplate);
    await db.delete(schema.promoCode).where(eq(schema.promoCode.id, testPromoCodeId));
  });

  it("listEffectiveTemplates returns exactly the shipped default keys, all unmodified", async () => {
    const templates = await templateService.listEffectiveTemplates();
    const expectedKeys = defaults.listAllTemplateKeys();

    expect(templates).toHaveLength(expectedKeys.length);
    expect(templates.every((t) => t.isCustomized === false)).toBe(true);
    // 8 automation types, +2 extra rows for abandoned_cart's step2/step3
    expect(templates).toHaveLength(10);
  });

  it("upsertTemplate + getEffectiveTemplate round-trips an admin override correctly", async () => {
    await templateService.upsertTemplate({
      automationType: "welcome",
      stepKey: "default",
      enabled: true,
      delayMinutes: 0,
      subjectEn: "Custom subject!",
      subjectAr: "موضوع مخصص!",
      content: {
        headlineEn: "Custom headline",
        headlineAr: "عنوان مخصص",
        bodyEn: "Custom body",
        bodyAr: "نص مخصص",
        ctaLabelEn: "Go",
        ctaLabelAr: "اذهب",
        ctaHref: "/shop",
        showFeaturedItem: false,
        showReviewStars: false,
        showDiscountCode: false,
        discountBadgeTextEn: "",
        discountBadgeTextAr: "",
      },
      promoCodeId: null,
    });

    const result = await templateService.getEffectiveTemplate("welcome", "default");
    expect(result.isCustomized).toBe(true);
    expect(result.subjectEn).toBe("Custom subject!");
    expect(result.content.headlineEn).toBe("Custom headline");
  });

  it("upsertTemplate rejects an unknown (automationType, stepKey) pair", async () => {
    await expect(
      templateService.upsertTemplate({
        automationType: "welcome",
        stepKey: "not-a-real-step",
        enabled: true,
        delayMinutes: 0,
        subjectEn: "x",
        subjectAr: "x",
        content: {
          headlineEn: "",
          headlineAr: "",
          bodyEn: "",
          bodyAr: "",
          ctaLabelEn: "",
          ctaLabelAr: "",
          ctaHref: "",
          showFeaturedItem: false,
          showReviewStars: false,
          showDiscountCode: false,
          discountBadgeTextEn: "",
          discountBadgeTextAr: "",
        },
        promoCodeId: null,
      }),
    ).rejects.toThrow();
  });

  it("a disabled template's renderer throws instead of silently sending", async () => {
    await templateService.upsertTemplate({
      automationType: "flash_offer",
      stepKey: "default",
      enabled: false,
      delayMinutes: 0,
      subjectEn: "x",
      subjectAr: "x",
      content: defaults.getDefaultTemplate("flash_offer", "default")!.content,
      promoCodeId: testPromoCodeId,
    });

    const row = {
      id: "test",
      automationType: "flash_offer" as const,
      recipientEmail: "test@example.com",
      locale: "en" as const,
      payload: samplePayload.buildSamplePayload("flash_offer", "default"),
      scheduledFor: new Date(),
      status: "sending" as const,
      attempts: 0,
      lastError: null,
      dedupeKey: "test",
      sentAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await expect(
      renderApi.renderScheduledEmail(row, "https://example.com/unsubscribe?token=x"),
    ).rejects.toThrow(/disabled/);

    // Re-enable for the "every automation renders" test below
    await templateService.upsertTemplate({
      automationType: "flash_offer",
      stepKey: "default",
      enabled: true,
      delayMinutes: 0,
      subjectEn: defaults.getDefaultTemplate("flash_offer", "default")!.subjectEn,
      subjectAr: defaults.getDefaultTemplate("flash_offer", "default")!.subjectAr,
      content: defaults.getDefaultTemplate("flash_offer", "default")!.content,
      promoCodeId: testPromoCodeId,
    });
  });

  it("every registered automation type + step renders valid, non-empty HTML with sample data", async () => {
    const keys = defaults.listAllTemplateKeys();
    expect(keys.length).toBeGreaterThan(0);

    for (const { automationType, stepKey } of keys) {
      const row = {
        id: `test-${automationType}-${stepKey}`,
        automationType,
        recipientEmail: "test@example.com",
        locale: "en" as const,
        payload: samplePayload.buildSamplePayload(automationType, stepKey),
        scheduledFor: new Date(),
        status: "sending" as const,
        attempts: 0,
        lastError: null,
        dedupeKey: `test-${automationType}-${stepKey}`,
        sentAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const rendered = await renderApi.renderScheduledEmail(
        row,
        "https://example.com/unsubscribe?token=x",
      );

      expect(rendered.subject.length).toBeGreaterThan(0);
      expect(rendered.html).toContain("<html");
      expect(rendered.html).toContain("Unsubscribe");
      // Every rendered email must carry its own unsubscribe link, not just the header
      expect(rendered.html).toContain("unsubscribe?token=x");
    }
  });

  it("renders Arabic locale with dir=rtl and Arabic copy substituted", async () => {
    const row = {
      id: "test-ar",
      automationType: "welcome" as const,
      recipientEmail: "test@example.com",
      locale: "ar" as const,
      payload: samplePayload.buildSamplePayload("welcome", "default"),
      scheduledFor: new Date(),
      status: "sending" as const,
      attempts: 0,
      lastError: null,
      dedupeKey: "test-ar",
      sentAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const rendered = await renderApi.renderScheduledEmail(
      row,
      "https://example.com/unsubscribe?token=x",
    );

    expect(rendered.html).toContain('dir="rtl"');
    // An earlier test in this file overrode welcome's content (including
    // its Arabic headline) via upsertTemplate — assert on that override
    // to also prove the DB-stored content (not just the shipped default)
    // is what actually gets rendered for a customized template.
    expect(rendered.html).toContain("عنوان مخصص");
  });
});
