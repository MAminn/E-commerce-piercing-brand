import { describe, expect, it } from "vitest";
import {
  DEFAULT_HOMEPAGE_CONTENT,
  type HomepageContent,
  type HomepageLegalPageContent,
} from "#root/shared/types/homepage-content";
import type { FooterLinkGroup } from "#root/shared/types/layout-settings";
import { HomepageContentSchema } from "#root/backend/homepage/trpc";
import { getHomepageContentRaw } from "#root/backend/homepage/get-homepage-content/raw";
import type { DatabaseClient } from "#root/shared/database/drizzle/db";
import {
  OWNER_INPUT_MARKER,
  countOwnerInputPlaceholders,
  getPublishedLegalPages,
  isLegalPagePublished,
  withLegalFooterLinks,
} from "../legal-pages";
import { DEFAULT_PRIVACY_PAGE, DEFAULT_TERMS_PAGE } from "../default-legal-pages";

/**
 * /terms and /privacy. A legal page is only ever shown — and only ever
 * linked from the footer — once it is switched on AND its owner-input
 * placeholders are gone, so a half-written draft cannot go live.
 */

const finished = (over: Partial<HomepageLegalPageContent> = {}): HomepageLegalPageContent => ({
  enabled: true,
  title: "Terms & conditions",
  titleAr: "الشروط والأحكام",
  intro: "These terms apply to every order.",
  sections: [{ title: "Who we are", body: "Percé Trading, Cairo." }],
  ...over,
});

const returnPolicy = DEFAULT_HOMEPAGE_CONTENT.returnPolicy as NonNullable<HomepageContent["returnPolicy"]>;

const content = (over: Partial<HomepageContent>): HomepageContent => ({
  ...DEFAULT_HOMEPAGE_CONTENT,
  ...over,
});

describe("isLegalPagePublished", () => {
  it("is live when switched on with no placeholders left", () => {
    expect(isLegalPagePublished(finished())).toBe(true);
  });

  it("is not live while switched off", () => {
    expect(isLegalPagePublished(finished({ enabled: false }))).toBe(false);
  });

  it("is not live without a title", () => {
    expect(isLegalPagePublished(finished({ title: "  " }))).toBe(false);
  });

  it.each([
    ["an English body", { sections: [{ title: "Law", body: `${OWNER_INPUT_MARKER}: governing law.]` }] }],
    ["an Arabic body", { sections: [{ title: "Law", body: "Egyptian law.", bodyAr: `${OWNER_INPUT_MARKER}]` }] }],
    ["the intro", { intro: `Hello. ${OWNER_INPUT_MARKER}: who we are.]` }],
    ["a heading", { sections: [{ title: `${OWNER_INPUT_MARKER}]`, body: "x" }] }],
  ])("stays a draft while %s still holds a placeholder, even when switched on", (_, over) => {
    expect(isLegalPagePublished(finished(over))).toBe(false);
  });

  it("is not live when the page is missing", () => {
    expect(isLegalPagePublished(undefined)).toBe(false);
  });
});

describe("shipped drafts", () => {
  it.each([
    ["terms", DEFAULT_TERMS_PAGE],
    ["privacy", DEFAULT_PRIVACY_PAGE],
  ])("%s ships switched off, as an unpublishable draft", (_, page) => {
    expect(page.enabled).toBe(false);
    expect(countOwnerInputPlaceholders(page)).toBeGreaterThan(0);
    // Switching it on without finishing it still does not publish it.
    expect(isLegalPagePublished({ ...page, enabled: true })).toBe(false);
  });

  it("are the defaults every store loads", () => {
    expect(DEFAULT_HOMEPAGE_CONTENT.terms).toBe(DEFAULT_TERMS_PAGE);
    expect(DEFAULT_HOMEPAGE_CONTENT.privacy).toBe(DEFAULT_PRIVACY_PAGE);
    expect(getPublishedLegalPages(DEFAULT_HOMEPAGE_CONTENT)).toEqual([]);
  });

  it("do not invent business facts outside a placeholder", () => {
    for (const page of [DEFAULT_TERMS_PAGE, DEFAULT_PRIVACY_PAGE]) {
      const settled = [page.intro, ...page.sections.map((s) => s.body)]
        .map((t) => t.replace(/\[Owner input required[^\]]*\]/g, ""))
        .join(" ")
        .toLowerCase();
      // No durations, windows or deadlines…
      expect(settled).not.toMatch(/\d/);
      expect(settled).not.toMatch(/\b(days?|weeks?|months?|years?|hours?)\b/);
      // …and none of the claims docs/CURRENT_PROJECT.md rules out.
      for (const claim of [
        "warranty",
        "guarantee",
        "refund",
        "hypoallergenic",
        "titanium",
        "steel",
        "gold",
        "nickel",
        "gdpr",
        "meta",
        "facebook",
        "google",
        "tiktok",
        "paymob",
        "stripe",
        "bosta",
        "fincart",
      ]) {
        expect(settled, `draft must not state "${claim}"`).not.toContain(claim);
      }
    }
  });

  it("leave Arabic legal wording to a reviewed translation", () => {
    for (const page of [DEFAULT_TERMS_PAGE, DEFAULT_PRIVACY_PAGE]) {
      expect(page.titleAr?.trim()).not.toBe("");
      expect(page.introAr).toBe("");
      expect(page.sections.every((s) => !s.bodyAr)).toBe(true);
    }
  });

  it("are a valid save payload for the Homepage admin mutation", () => {
    expect(() => HomepageContentSchema.parse(DEFAULT_HOMEPAGE_CONTENT)).not.toThrow();
    const parsed = HomepageContentSchema.parse(
      content({ terms: finished(), privacy: finished({ title: "Privacy policy" }) }),
    );
    // The save schema keeps the pages rather than stripping unknown keys.
    expect(parsed.terms?.sections).toHaveLength(1);
    expect(parsed.privacy?.title).toBe("Privacy policy");
  });
});

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

  it("load the drafts when saved before the pages existed", async () => {
    const loaded = await getHomepageContentRaw(fakeDb([{ content: { meta: DEFAULT_HOMEPAGE_CONTENT.meta } }]), "m1", "landing-minimal");
    expect(loaded.terms).toEqual(DEFAULT_TERMS_PAGE);
    expect(loaded.privacy).toEqual(DEFAULT_PRIVACY_PAGE);
  });

  it("keep a stored page exactly as the admin saved it", async () => {
    const terms = finished();
    const loaded = await getHomepageContentRaw(fakeDb([{ content: { terms } }]), "m1", "landing-minimal");
    expect(loaded.terms).toEqual(terms);
    expect(loaded.privacy).toEqual(DEFAULT_PRIVACY_PAGE);
  });
});

describe("getPublishedLegalPages", () => {
  it("lists live pages in footer order with their titles", () => {
    const published = getPublishedLegalPages(
      content({
        returnPolicy: { ...returnPolicy, enabled: true },
        terms: finished(),
        privacy: finished({ title: "Privacy policy", titleAr: "سياسة الخصوصية" }),
      }),
    );
    expect(published).toEqual([
      { key: "returnPolicy", href: "/return-policy", title: "Returns & exchange", titleAr: "الاستبدال والإرجاع" },
      { key: "terms", href: "/terms", title: "Terms & conditions", titleAr: "الشروط والأحكام" },
      { key: "privacy", href: "/privacy", title: "Privacy policy", titleAr: "سياسة الخصوصية" },
    ]);
  });

  it("keeps the return policy on its existing enabled-only rule", () => {
    const published = getPublishedLegalPages(
      content({ returnPolicy: { ...returnPolicy, enabled: false } }),
    );
    expect(published).toEqual([]);
  });

  it("leaves out a switched-on draft", () => {
    const published = getPublishedLegalPages(
      content({ privacy: { ...DEFAULT_PRIVACY_PAGE, enabled: true } }),
    );
    expect(published).toEqual([]);
  });
});

describe("withLegalFooterLinks", () => {
  const help: FooterLinkGroup = {
    id: "help",
    title: "Help",
    links: [
      { id: "contact", label: "Contact", url: "/contact" },
      { id: "t", label: "Terms", url: "/terms" },
    ],
  };
  const terms = { key: "terms" as const, href: "/terms", title: "Terms & conditions", titleAr: "الشروط والأحكام" };
  const privacy = { key: "privacy" as const, href: "/privacy", title: "Privacy policy" };

  it("adds nothing when no legal page is live", () => {
    const shop: FooterLinkGroup = { id: "shop", title: "Shop", links: [{ id: "s", label: "Shop all", url: "/shop" }] };
    expect(withLegalFooterLinks([shop], [])).toEqual([shop]);
  });

  it("adds live pages under Policies", () => {
    const groups = withLegalFooterLinks([], [terms, privacy]);
    expect(groups).toEqual([
      {
        id: "policies",
        title: "Policies",
        titleAr: "السياسات",
        links: [
          { id: "policy-terms", label: "Terms & conditions", labelAr: "الشروط والأحكام", url: "/terms" },
          { id: "policy-privacy", label: "Privacy policy", labelAr: undefined, url: "/privacy" },
        ],
      },
    ]);
  });

  it("drops a CMS link to a legal page that is not live", () => {
    const [group] = withLegalFooterLinks([help], []);
    expect(group?.links.map((l) => l.url)).toEqual(["/contact"]);
  });

  it("drops a group left empty by that", () => {
    const legalOnly: FooterLinkGroup = {
      id: "legal",
      title: "Legal",
      links: [{ id: "p", label: "Privacy", url: "/privacy/" }],
    };
    expect(withLegalFooterLinks([legalOnly], [])).toEqual([]);
  });

  it("keeps an admin's own link to a live page and does not add it twice", () => {
    const groups = withLegalFooterLinks([help], [terms, privacy]);
    expect(groups[0]?.links.map((l) => l.url)).toEqual(["/contact", "/terms"]);
    expect(groups[1]?.links.map((l) => l.url)).toEqual(["/privacy"]);
  });

  it("treats /terms?x, /terms#y and /terms/ as the same page", () => {
    const variants: FooterLinkGroup = {
      id: "v",
      title: "V",
      links: [
        { id: "a", label: "A", url: "/terms?ref=footer" },
        { id: "b", label: "B", url: "/privacy#top" },
      ],
    };
    expect(withLegalFooterLinks([variants], [])).toEqual([]);
    expect(withLegalFooterLinks([variants], [terms, privacy])).toEqual([variants]);
  });
});
