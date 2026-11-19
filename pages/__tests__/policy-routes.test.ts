import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  LEGAL_PAGE_HREFS,
  REFUND_POLICY_HREF,
  getPublishedLegalPages,
  withLegalFooterLinks,
} from "#root/shared/legal/legal-pages";
import { DEFAULT_HOMEPAGE_CONTENT } from "#root/shared/types/homepage-content";
import { DEFAULT_LAYOUT_SETTINGS } from "#root/shared/types/layout-settings";
import { guard as refundGuard } from "../refund-policy/+guard";

/**
 * Every policy URL the footer can link to must be a real route — a footer
 * link to a 404 is worse than no link. Vike routes by folder, so a URL is
 * served exactly when pages/<path>/+Page.tsx exists.
 */
const pagesDir = resolve(__dirname, "..");
const hasRoute = (href: string) => existsSync(resolve(pagesDir, `.${href}`, "+Page.tsx"));

describe("policy routes", () => {
  it.each([...Object.values(LEGAL_PAGE_HREFS), REFUND_POLICY_HREF])("%s is a route", (href) => {
    expect(hasRoute(href), `pages${href}/+Page.tsx`).toBe(true);
  });

  it("/return-policy keeps its page and data loader", () => {
    expect(existsSync(resolve(pagesDir, "return-policy", "+data.ts"))).toBe(true);
  });

  it("/refund-policy temporarily (302) redirects to the one Returns & Refunds page", () => {
    let thrown: unknown;
    try {
      refundGuard();
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toMatchObject({
      _isAbortError: true,
      _pageContextAbort: { _urlRedirect: { url: "/return-policy", statusCode: 302 } },
    });
  });

  it("every link the default footer can render points at a route", () => {
    const groups = withLegalFooterLinks(
      DEFAULT_LAYOUT_SETTINGS.footer.footerLinkGroups,
      getPublishedLegalPages(DEFAULT_HOMEPAGE_CONTENT),
    );
    const paths = groups.flatMap((g) => g.links.map((l) => l.url.split(/[?#]/)[0] ?? ""));
    expect(paths).toContain("/shipping-policy");
    for (const path of paths) {
      expect(hasRoute(path), `footer link ${path} has no route`).toBe(true);
    }
  });
});
