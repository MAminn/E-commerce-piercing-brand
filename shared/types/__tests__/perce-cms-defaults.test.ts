import { describe, expect, it } from "vitest";
import { DEFAULT_LAYOUT_SETTINGS } from "../layout-settings";
import { DEFAULT_HOMEPAGE_CONTENT, type HomepageContent } from "../homepage-content";
import { HomepageContentSchema } from "#root/backend/homepage/trpc";
import { getHomepageContentRaw } from "#root/backend/homepage/get-homepage-content/raw";
import type { DatabaseClient } from "#root/shared/database/drizzle/db";

/**
 * Shipped CMS defaults for the Percé storefront. These are what every store
 * renders before an admin touches Dashboard > Homepage / Layout Settings,
 * and they are merged into every stored row — so no default may carry
 * offer/pricing language or unapproved brand copy.
 */
describe("DEFAULT_LAYOUT_SETTINGS.footer", () => {
  const footer = DEFAULT_LAYOUT_SETTINGS.footer;
  const links = footer.footerLinkGroups.flatMap((g) => g.links);

  it("links no Offers page — the offers/pricing phase has not started", () => {
    expect(links.map((l) => l.url)).not.toContain("/offers");
    expect(links.map((l) => l.label)).not.toContain("Offers");
  });

  it("keeps exactly the approved default links", () => {
    expect(links.map((l) => l.label)).toEqual([
      "Shop all",
      "New in",
      "Sets",
      "Contact",
      "My account",
    ]);
  });

  it("ships an empty Arabic marketing description", () => {
    expect(footer.descriptionAr).toBe("");
  });

  it("keeps the newsletter switch on by default", () => {
    expect(footer.showNewsletter).toBe(true);
  });
});

describe("DEFAULT_HOMEPAGE_CONTENT", () => {
  const c = DEFAULT_HOMEPAGE_CONTENT;

  it("uses the approved homepage meta title and description", () => {
    expect(c.meta.pageTitle).toBe("Percé — Piercing jewellery, delivered across Egypt");
    expect(c.meta.pageDescription).toBe("Piercing jewellery, delivered across Egypt.");
  });

  it("ships empty copy where the brand wording is not approved yet", () => {
    expect(c.newsletter.subtitle).toBe("");
    expect(c.brandStatement.title).toBe("");
    expect(c.brandStatement.description).toBe("");
    expect(c.aboutUs?.description).toBe("");
    expect(c.categories.subtitle).toBe("");
  });

  it("keeps the newsletter heading without an offers line", () => {
    expect(c.newsletter.title).toBe("Join the list");
    expect(c.newsletter.subtitle).not.toMatch(/offer/i);
  });

  it("keeps the neutral pre-rebrand contact banner copy", () => {
    expect(c.contactBanner?.heading).toBe("We Would Love To Hear From You");
    expect(c.contactBanner?.description).toBe(
      "Have a question, feedback, or just want to say hello? Drop us a message and we'll get back to you as soon as possible.",
    );
  });

  it("is a valid save payload for the Homepage admin mutation", () => {
    expect(() => HomepageContentSchema.parse(c)).not.toThrow();
  });
});

/**
 * Backwards compatibility: rows saved before these inputs existed still
 * load, keep what the admin stored, and fill in only the missing keys.
 */
describe("existing homepage_content rows", () => {
  function fakeDb(rows: Array<{ content: unknown }>): DatabaseClient {
    const chain = {
      from: () => chain,
      where: () => chain,
      limit: () => chain,
      execute: async () => rows,
    };
    return { select: () => chain } as unknown as DatabaseClient;
  }

  it("keeps stored meta and categories text so the new inputs show what is live", async () => {
    const stored: Partial<HomepageContent> = {
      meta: { enabled: true, pageTitle: "Welcome to Our Store", pageDescription: "" },
      categories: {
        enabled: true,
        title: "Shop by Category",
        subtitle: "Browse our curated selection of product categories",
        ctaText: "View All",
        ctaLink: "/shop",
      },
    };
    const loaded = await getHomepageContentRaw(fakeDb([{ content: stored }]), "m1", "landing-minimal");

    // Persisted values win — nothing is silently overwritten…
    expect(loaded.meta.pageTitle).toBe("Welcome to Our Store");
    expect(loaded.categories.subtitle).toBe("Browse our curated selection of product categories");
    // …and a partial row is still completed from the defaults.
    expect(loaded.newsletter.title).toBe("Join the list");
    expect(loaded.contactBanner?.heading).toBe(DEFAULT_HOMEPAGE_CONTENT.contactBanner?.heading);
    // The loaded row is itself a valid save payload, so it can be edited and saved back.
    expect(() => HomepageContentSchema.parse(loaded)).not.toThrow();
  });

  it("accepts an admin clearing the meta and categories subtitle", () => {
    const cleared: HomepageContent = {
      ...DEFAULT_HOMEPAGE_CONTENT,
      meta: { ...DEFAULT_HOMEPAGE_CONTENT.meta, pageTitle: "", pageDescription: "" },
      categories: { ...DEFAULT_HOMEPAGE_CONTENT.categories, subtitle: "" },
    };
    expect(() => HomepageContentSchema.parse(cleared)).not.toThrow();
  });
});
