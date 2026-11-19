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

export type LegalPageKey = "returnPolicy" | "shippingPolicy" | "terms" | "privacy";

export const LEGAL_PAGE_HREFS: Record<LegalPageKey, string> = {
  returnPolicy: "/return-policy",
  shippingPolicy: "/shipping-policy",
  terms: "/terms",
  privacy: "/privacy",
};

/**
 * /refund-policy is not a second policy: it redirects (302) to the one
 * Returns & Refunds page at /return-policy (pages/refund-policy/+guard.ts),
 * so the content is stored and edited once. It is live exactly when the
 * return policy is.
 */
export const REFUND_POLICY_HREF = "/refund-policy";

/** Alias path → the legal page it opens. */
const LEGAL_PAGE_ALIASES: Record<string, LegalPageKey> = {
  [REFUND_POLICY_HREF]: "returnPolicy",
};

/**
 * Footer label for the shipping page. It has no CMS record — the page is
 * generated from the live shipping settings (shared/shipping/shipping-policy.ts)
 * — so its title is fixed here.
 */
export const SHIPPING_POLICY_TITLE = { en: "Shipping", ar: "الشحن" } as const;

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
 * policy keeps its own existing rule (its `enabled` switch). The shipping
 * page is always available: it states only what the live shipping settings
 * say, so there is no draft to hide.
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
  published.push({
    key: "shippingPolicy",
    href: LEGAL_PAGE_HREFS.shippingPolicy,
    title: SHIPPING_POLICY_TITLE.en,
    titleAr: SHIPPING_POLICY_TITLE.ar,
  });
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

const LEGAL_PATHS = new Set([
  ...Object.values(LEGAL_PAGE_HREFS),
  ...Object.keys(LEGAL_PAGE_ALIASES),
]);

/** An admin-made group that already holds policies — where missing ones go. */
function isPoliciesGroup(group: FooterLinkGroup): boolean {
  const titles = [group.title, group.titleAr].map((t) => t?.trim().toLowerCase());
  return group.id === "policies" || titles.includes("policies") || titles.includes("السياسات");
}

/**
 * Footer link groups with the legal pages applied:
 *  - a CMS link to a legal page that is not live is dropped (it would open
 *    "not available yet"), and a group left empty disappears. A link to the
 *    /refund-policy alias lives and dies with the return policy;
 *  - every live legal page the CMS does not already link is added — to the
 *    admin's own "Policies" group when there is one, otherwise under a new
 *    "Policies" group. The /refund-policy alias is never added on its own:
 *    it shows only where an admin chose to link it.
 * Placeholder hrefs are the caller's concern (MinimalFooter drops them first).
 */
export function withLegalFooterLinks(
  groups: FooterLinkGroup[],
  published: PublishedLegalPage[],
): FooterLinkGroup[] {
  const liveKeys = new Set(published.map((p) => p.key));
  const livePaths = new Set(published.map((p) => p.href));
  for (const [alias, key] of Object.entries(LEGAL_PAGE_ALIASES)) {
    if (liveKeys.has(key)) livePaths.add(alias);
  }
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

  const added = missing.map((p) => ({
    id: `policy-${p.key}`,
    label: p.title,
    labelAr: p.titleAr,
    url: p.href,
  }));

  const own = kept.findIndex(isPoliciesGroup);
  if (own !== -1) {
    return kept.map((g, i) =>
      i === own ? { ...g, links: [...g.links, ...added] } : g,
    );
  }

  return [
    ...kept,
    {
      id: "policies",
      title: "Policies",
      titleAr: "السياسات",
      links: added,
    },
  ];
}
