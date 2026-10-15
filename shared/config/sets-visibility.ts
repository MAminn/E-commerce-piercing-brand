import type { LayoutSettings } from "#root/shared/types/layout-settings";

/**
 * Temporary storefront hide for Sets (bundle campaigns).
 *
 * Until SETS_HIDDEN_UNTIL, shoppers see no Sets anywhere: the public bundle
 * procedures (`bundle.listLive`, `bundle.getLiveBySlug`) answer as if nothing
 * is live — which empties the auto "Sets" nav link, the category and homepage
 * rails and the /offers set cards, all of which already render nothing for
 * an empty list — CMS header/footer links to /bundles are dropped at render,
 * and /bundles redirects to /shop.
 *
 * Nothing else changes: campaigns, pricing, eligibility, admin management,
 * `bundle.evaluateSelection` and the order path keep working, so a set already
 * in a cart still checks out at its set price.
 *
 * Restores itself at the date below. To end the hide early, set it to a past
 * date; once it has passed, this module (and its call sites) can be removed.
 */

/** Midnight in Cairo at the start of Oct 29 2026 (Egypt is still on summer time, UTC+3). */
export const SETS_HIDDEN_UNTIL = new Date("2026-10-29T00:00:00+03:00");

export function areSetsVisibleToShoppers(now: Date = new Date()): boolean {
  return now.getTime() >= SETS_HIDDEN_UNTIL.getTime();
}

/** True for /bundles and anything under it (query and hash ignored). */
export function isSetsHref(href: string | undefined | null): boolean {
  if (!href) return false;
  const path = href.split(/[?#]/)[0]?.replace(/\/+$/, "") ?? "";
  return path === "/bundles" || path.startsWith("/bundles/");
}

/**
 * The storefront's view of the CMS layout: while Sets are hidden, header and
 * footer links to /bundles are dropped (and any footer group left empty). The
 * stored settings are never modified, so the links come back on their own.
 */
export function withSetsLinksHidden(settings: LayoutSettings, now: Date = new Date()): LayoutSettings {
  if (areSetsVisibleToShoppers(now)) return settings;
  return {
    ...settings,
    header: {
      ...settings.header,
      navigationLinks: settings.header.navigationLinks.filter((l) => !isSetsHref(l.url)),
    },
    footer: {
      ...settings.footer,
      footerLinkGroups: (settings.footer.footerLinkGroups ?? [])
        .map((g) => ({ ...g, links: g.links.filter((l) => !isSetsHref(l.url)) }))
        .filter((g) => g.links.length > 0),
    },
  };
}
