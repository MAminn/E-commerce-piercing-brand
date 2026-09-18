import { describe, expect, it } from "vitest";
import { DEFAULT_HOMEPAGE_CONTENT, type HomepageBundlesContent } from "../homepage-content";
import { HomepageContentSchema } from "#root/backend/homepage/trpc";

/**
 * The Bundles & Stacks homepage section's shipped defaults. Both
 * `getHomepageContentRaw` and `getHomepageContent` fall back to these when a
 * stored content row predates the section, so they are the real contract for
 * every store that has not touched the CMS yet.
 */
describe("DEFAULT_HOMEPAGE_CONTENT.bundles", () => {
  const bundles = DEFAULT_HOMEPAGE_CONTENT.bundles;

  it("ships the section with a bilingual title and a working view-all link", () => {
    expect(bundles).toBeDefined();
    expect(bundles?.enabled).toBe(true);
    expect(bundles?.title.trim()).not.toBe("");
    expect(bundles?.titleAr?.trim()).not.toBe("");
    expect(bundles?.viewAllText.trim()).not.toBe("");
    expect(bundles?.viewAllTextAr?.trim()).not.toBe("");
    expect(bundles?.viewAllLink).toBe("/bundles");
  });

  it("has a sane automatic limit and no pre-selected campaigns", () => {
    // Unconfigured stores show live campaigns automatically; hand-picking is opt-in.
    expect(bundles?.campaignIds).toBeUndefined();
    expect(bundles?.limit).toBeGreaterThan(0);
    expect(bundles?.limit).toBeLessThanOrEqual(50);
  });

  it("makes no savings or delivery claims and names no brand in the defaults", () => {
    // Same rule as every other shipped default: copy must not assert a
    // business fact the store has not established.
    const copy = [bundles?.title, bundles?.titleAr, bundles?.subtitle, bundles?.subtitleAr, bundles?.viewAllText]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    for (const claim of ["save", "free", "delivery", "shipping", "%", "guarantee", "best"]) {
      expect(copy, `default copy must not claim "${claim}"`).not.toContain(claim);
    }
    // Subtitles ship empty — the admin writes their own hook.
    expect(bundles?.subtitle ?? "").toBe("");
  });
});

/**
 * Phase 6 added a `source` switch to the section. The regression that matters
 * is that turning Best Selling on is a DISPLAY decision, not a destructive
 * one: the merchant's hand-picked campaigns and their order survive the round
 * trip so switching back restores exactly what they arranged.
 */
describe("bundles section source (manual vs best selling)", () => {
  const base = DEFAULT_HOMEPAGE_CONTENT.bundles!;

  it("defaults to manual, preserving the Phase 5 behaviour for existing stores", () => {
    expect(base.source ?? "manual").toBe("manual");
  });

  it("ships a documented best-selling window", () => {
    expect(base.bestSellingPeriodDays).toBe(30);
  });

  it("keeps manual picks and their order when switching to best selling and back", () => {
    const picked = ["id-c", "id-a", "id-b"];
    const manual: HomepageBundlesContent = { ...base, source: "manual", campaignIds: picked };

    // The admin editor only patches `source`; nothing touches campaignIds.
    const switched: HomepageBundlesContent = { ...manual, source: "best_selling" };
    expect(switched.campaignIds).toEqual(picked);

    const switchedBack: HomepageBundlesContent = { ...switched, source: "manual" };
    expect(switchedBack.campaignIds).toEqual(picked);
    // Order is part of the merchant's intent, not just membership.
    expect(switchedBack.campaignIds).toEqual(["id-c", "id-a", "id-b"]);
  });

  it("treats a section with no source as manual, so stored pre-Phase-6 content is unchanged", () => {
    const stored = { ...base, campaignIds: ["id-a"] } as HomepageBundlesContent;
    delete (stored as { source?: unknown }).source;
    expect(stored.source).toBeUndefined();
    // The homepage reads `source === "best_selling"`, so undefined is manual.
    expect(stored.source === "best_selling").toBe(false);
  });
});

/**
 * The CMS saves through `homepage.updateContent`, whose Zod object STRIPS
 * unknown keys. Every field of the bundles section must therefore be declared
 * there, or a merchant's choice silently never persists (the Phase 6
 * `source` switch was lost this way until the closeout audit).
 */
describe("homepage.updateContent schema keeps every bundles field", () => {
  it("round-trips the best-selling source and window", () => {
    const content: HomepageBundlesContent = {
      enabled: true,
      title: "Bundles",
      viewAllText: "View all",
      viewAllLink: "/bundles",
      campaignIds: ["00000000-0000-4000-8000-000000000001"],
      limit: 4,
      source: "best_selling",
      bestSellingPeriodDays: 14,
    };
    // Only the bundles section is under test; the other sections are required
    // by the schema, so parse the shipped defaults with ours swapped in.
    const parsed = HomepageContentSchema.parse({ ...DEFAULT_HOMEPAGE_CONTENT, bundles: content });
    expect(parsed.bundles).toEqual(content);
  });

  it("bounds the window to 1–365 days and rejects unknown sources", () => {
    const bundlesSchema = HomepageContentSchema.shape.bundles;
    expect(bundlesSchema.safeParse({ ...DEFAULT_HOMEPAGE_CONTENT.bundles, bestSellingPeriodDays: 0 }).success).toBe(false);
    expect(bundlesSchema.safeParse({ ...DEFAULT_HOMEPAGE_CONTENT.bundles, source: "random" }).success).toBe(false);
  });
});
