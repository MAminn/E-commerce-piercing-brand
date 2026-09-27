import type {
  HomepageContent,
  HomepageLegalPageContent,
} from "#root/shared/types/homepage-content";
import type { FooterLinkGroup } from "#root/shared/types/layout-settings";

/**
 * Prefix of every placeholder in the shipped legal drafts
 * (./default-legal-pages.ts). While any remains, the page is a draft.
 */
export const OWNER_INPUT_MARKER = "[Owner input required";

export type LegalPageKey = "returnPolicy" | "terms" | "privacy";

export const LEGAL_PAGE_HREFS: Record<LegalPageKey, string> = {
  returnPolicy: "/return-policy",
  terms: "/terms",
  privacy: "/privacy",
};

/** A legal page that is live — what the footer links to. */
export interface PublishedLegalPage {
  key: LegalPageKey;
  href: string;
  title: string;
  titleAr?: string;
}

/** Every piece of text on a legal page, in both languages. */
function legalPageText(page: HomepageLegalPageContent): string[] {
  return [
    page.title,
    page.titleAr,
    page.lastUpdated,
    page.lastUpdatedAr,
    page.intro,
    page.introAr,
    ...page.sections.flatMap((s) => [s.title, s.titleAr, s.body, s.bodyAr]),
  ].filter((t): t is string => typeof t === "string");
}

/** How many owner-input placeholders are still in the page. */
export function countOwnerInputPlaceholders(
  page: HomepageLegalPageContent,
): number {
  return legalPageText(page).reduce(
    (n, text) => n + text.split(OWNER_INPUT_MARKER).length - 1,
    0,
  );
}

/**
 * A Terms / Privacy page is live only when the admin switched it on AND no
 * owner-input placeholder is left — an unfinished draft is never shown to
 * customers, even if the switch was flipped early.
 */
export function isLegalPagePublished(
  page: HomepageLegalPageContent | undefined,
): page is HomepageLegalPageContent {
  return (
    !!page?.enabled &&
    page.title.trim() !== "" &&
    countOwnerInputPlaceholders(page) === 0
  );
}

/**
 * The legal pages a customer can actually open, in footer order. The return
 * policy keeps its own existing rule (its `enabled` switch).
 */
export function getPublishedLegalPages(
  content: HomepageContent,
): PublishedLegalPage[] {
  const published: PublishedLegalPage[] = [];
  if (content.returnPolicy?.enabled) {
    published.push({
      key: "returnPolicy",
      href: LEGAL_PAGE_HREFS.returnPolicy,
      title: content.returnPolicy.title,
      titleAr: content.returnPolicy.titleAr,
    });
  }
  for (const key of ["terms", "privacy"] as const) {
    const page = content[key];
    if (isLegalPagePublished(page)) {
      published.push({
        key,
        href: LEGAL_PAGE_HREFS[key],
        title: page.title,
        titleAr: page.titleAr,
      });
    }
  }
  return published;
}

/** "/terms/", "/terms?x=1" and "/terms#top" all name the /terms page. */
function pathOf(url: string): string {
  const path = url.trim().split(/[?#]/)[0] ?? "";
  return path.replace(/\/+$/, "") || "/";
}

const LEGAL_PATHS = new Set(Object.values(LEGAL_PAGE_HREFS));

/**
 * Footer link groups with the legal pages applied:
 *  - a CMS link to a legal page that is not live is dropped (it would open
 *    "not available yet"), and a group left empty disappears;
 *  - every live legal page the CMS does not already link is added under a
 *    "Policies" group.
 * Placeholder hrefs are the caller's concern (MinimalFooter drops them first).
 */
export function withLegalFooterLinks(
  groups: FooterLinkGroup[],
  published: PublishedLegalPage[],
): FooterLinkGroup[] {
  const livePaths = new Set(published.map((p) => p.href));
  const kept = groups
    .map((g) => ({
      ...g,
      links: g.links.filter((l) => {
        const path = pathOf(l.url);
        return !LEGAL_PATHS.has(path) || livePaths.has(path);
      }),
    }))
    .filter((g) => g.links.length > 0);

  const linked = new Set(kept.flatMap((g) => g.links.map((l) => pathOf(l.url))));
  const missing = published.filter((p) => !linked.has(p.href));
  if (missing.length === 0) return kept;

  return [
    ...kept,
    {
      id: "policies",
      title: "Policies",
      titleAr: "السياسات",
      links: missing.map((p) => ({
        id: `policy-${p.key}`,
        label: p.title,
        labelAr: p.titleAr,
        url: p.href,
      })),
    },
  ];
}
