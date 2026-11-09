import { describe, expect, it } from "vitest";
import { DEFAULT_SOCIAL_PROOF_CONFIG, MAX_PUBLIC_EVENTS } from "../defaults";
import { socialProofConfigSchema } from "../trpc";

const valid = { ...DEFAULT_SOCIAL_PROOF_CONFIG };

/** The shipped defaults must themselves satisfy the bounds they document. */
describe("DEFAULT_SOCIAL_PROOF_CONFIG", () => {
  it("ships disabled — publishing customer activity is an explicit decision", () => {
    expect(DEFAULT_SOCIAL_PROOF_CONFIG.enabled).toBe(false);
  });

  it("matches the documented defaults", () => {
    expect(DEFAULT_SOCIAL_PROOF_CONFIG).toEqual({
      enabled: false,
      firstDelaySeconds: 5,
      displayDurationSeconds: 6,
      intervalSeconds: 12,
      maxPerSession: 5,
      lookbackDays: 30,
      showLocation: true,
      locationSource: "city",
      showRelativeTime: true,
      allowedProductIds: [],
      eligibleStatuses: ["processing", "shipped", "delivered"],
    });
  });

  it("excludes pending and cancelled orders by default", () => {
    expect(DEFAULT_SOCIAL_PROOF_CONFIG.eligibleStatuses).not.toContain("pending");
    expect(DEFAULT_SOCIAL_PROOF_CONFIG.eligibleStatuses).not.toContain("cancelled");
  });

  it("passes its own validation schema", () => {
    expect(socialProofConfigSchema.safeParse(DEFAULT_SOCIAL_PROOF_CONFIG).success).toBe(
      true,
    );
  });

  it("caps the public feed independently of the session maximum", () => {
    expect(MAX_PUBLIC_EVENTS).toBeGreaterThan(0);
    expect(MAX_PUBLIC_EVENTS).toBeLessThanOrEqual(50);
  });
});

describe("socialProofConfigSchema bounds", () => {
  const rejects = (patch: Record<string, unknown>) =>
    expect(socialProofConfigSchema.safeParse({ ...valid, ...patch }).success).toBe(
      false,
    );
  const accepts = (patch: Record<string, unknown>) =>
    expect(socialProofConfigSchema.safeParse({ ...valid, ...patch }).success).toBe(
      true,
    );

  it("rejects negative timers", () => {
    rejects({ firstDelaySeconds: -1 });
    rejects({ displayDurationSeconds: -1 });
    rejects({ intervalSeconds: -1 });
  });

  it("rejects sub-second notification spam", () => {
    rejects({ intervalSeconds: 0 });
    rejects({ intervalSeconds: 4 });
    rejects({ displayDurationSeconds: 1 });
    accepts({ intervalSeconds: 5 });
    accepts({ displayDurationSeconds: 2 });
  });

  it("rejects absurd timer ceilings", () => {
    rejects({ firstDelaySeconds: 61 });
    rejects({ displayDurationSeconds: 21 });
    rejects({ intervalSeconds: 121 });
    accepts({ firstDelaySeconds: 60 });
    accepts({ displayDurationSeconds: 20 });
    accepts({ intervalSeconds: 120 });
  });

  it("bounds the per-session maximum", () => {
    rejects({ maxPerSession: 0 });
    rejects({ maxPerSession: 21 });
    accepts({ maxPerSession: 1 });
    accepts({ maxPerSession: 20 });
  });

  it("bounds the lookback window so the feed can't scan the whole order table", () => {
    rejects({ lookbackDays: 0 });
    rejects({ lookbackDays: 366 });
    accepts({ lookbackDays: 1 });
    accepts({ lookbackDays: 365 });
  });

  it("rejects fractional timers", () => {
    rejects({ intervalSeconds: 7.5 });
    rejects({ lookbackDays: 1.5 });
  });

  it("refuses ineligible order statuses", () => {
    rejects({ eligibleStatuses: ["pending"] });
    rejects({ eligibleStatuses: ["cancelled"] });
    rejects({ eligibleStatuses: [] });
    accepts({ eligibleStatuses: ["delivered"] });
  });

  it("only accepts city or governorate as the location source", () => {
    rejects({ locationSource: "address" });
    rejects({ locationSource: "postalCode" });
    accepts({ locationSource: "governorate" });
  });

  it("requires product ids to be uuids and caps the list", () => {
    rejects({ allowedProductIds: ["not-a-uuid"] });
    rejects({
      allowedProductIds: Array.from(
        { length: 201 },
        () => "22222222-2222-7222-8222-222222222222",
      ),
    });
    accepts({ allowedProductIds: ["22222222-2222-7222-8222-222222222222"] });
    accepts({ allowedProductIds: [] });
  });
});
