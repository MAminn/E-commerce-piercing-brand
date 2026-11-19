import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { STORE_DESCRIPTION } from "#root/shared/config/branding";
import { DEFAULT_HOMEPAGE_CONTENT } from "#root/shared/types/homepage-content";
import { resolveMetaDescription } from "#root/pages/index/meta-description";

let pageContext: Record<string, unknown> = {};
vi.mock("vike-react/usePageContext", () => ({
  usePageContext: () => pageContext,
}));

import HeadDefault from "../+Head";

const CMS_DESCRIPTION = "Percé piercing jewellery — hand-picked studs and rings.";

function homepageData(pageDescription: string) {
  return {
    homepageContent: {
      ...DEFAULT_HOMEPAGE_CONTENT,
      meta: { ...DEFAULT_HOMEPAGE_CONTENT.meta, pageDescription },
    },
    ssrTemplateId: "landing-minimal",
  };
}

function renderHead(ctx: Record<string, unknown>) {
  pageContext = ctx;
  return renderToStaticMarkup(createElement(HeadDefault));
}

function descriptionTags(html: string) {
  const pick = (re: RegExp) => html.match(re)?.[1];
  return {
    description: pick(/<meta name="description" content="([^"]*)"/),
    og: pick(/<meta property="og:description" content="([^"]*)"/),
    twitter: pick(/<meta name="twitter:description" content="([^"]*)"/),
  };
}

describe("resolveMetaDescription", () => {
  it("uses the stored CMS description on the homepage when it is non-empty", () => {
    expect(
      resolveMetaDescription({ urlPathname: "/", data: homepageData(CMS_DESCRIPTION) }),
    ).toBe(CMS_DESCRIPTION);
  });

  it("falls back to STORE_DESCRIPTION when the CMS description is empty or blank", () => {
    expect(resolveMetaDescription({ urlPathname: "/", data: homepageData("") })).toBe(STORE_DESCRIPTION);
    expect(resolveMetaDescription({ urlPathname: "/", data: homepageData("   ") })).toBe(STORE_DESCRIPTION);
    expect(resolveMetaDescription({ urlPathname: "/", data: undefined })).toBe(STORE_DESCRIPTION);
  });

  it("keeps the approved fallback text", () => {
    expect(STORE_DESCRIPTION).toBe("Piercing jewellery, delivered to selected governorates across Egypt.");
  });

  it("uses the dashboard description (siteDescription) on every other route when it is set", () => {
    for (const path of ["/privacy", "/return-policy", "/contact", "/shop", "/bundles"]) {
      expect(resolveMetaDescription({ urlPathname: path, siteDescription: CMS_DESCRIPTION })).toBe(
        CMS_DESCRIPTION,
      );
    }
  });

  it("falls back to STORE_DESCRIPTION on other routes when no dashboard description is set", () => {
    for (const siteDescription of [null, undefined, "", "   "]) {
      expect(resolveMetaDescription({ urlPathname: "/privacy", siteDescription })).toBe(STORE_DESCRIPTION);
    }
    // A page's own data (e.g. /contact loads homepageContent) is not the source.
    expect(resolveMetaDescription({ urlPathname: "/contact", data: homepageData(CMS_DESCRIPTION) })).toBe(
      STORE_DESCRIPTION,
    );
  });
});

describe("+Head description meta on the homepage", () => {
  it("emits the CMS description as description, og:description and twitter:description", () => {
    const tags = descriptionTags(renderHead({ urlPathname: "/", data: homepageData(CMS_DESCRIPTION) }));
    expect(tags.description).toContain("hand-picked studs and rings");
    expect(tags.og).toBe(tags.description);
    expect(tags.twitter).toBe(tags.description);
  });

  it("emits STORE_DESCRIPTION when the CMS description is empty", () => {
    const tags = descriptionTags(renderHead({ urlPathname: "/", data: homepageData("") }));
    expect(tags.description).toBe(STORE_DESCRIPTION);
    expect(tags.og).toBe(STORE_DESCRIPTION);
    expect(tags.twitter).toBe(STORE_DESCRIPTION);
  });

  it("emits the dashboard description on inner pages (e.g. /privacy) when it is set", () => {
    const tags = descriptionTags(renderHead({ urlPathname: "/privacy", siteDescription: CMS_DESCRIPTION }));
    expect(tags.description).toContain("hand-picked studs and rings");
    expect(tags.og).toBe(tags.description);
    expect(tags.twitter).toBe(tags.description);
  });

  it("emits STORE_DESCRIPTION on inner pages without a dashboard description — never the old claim", () => {
    const html = renderHead({ urlPathname: "/return-policy", siteDescription: null });
    const tags = descriptionTags(html);
    expect(tags.description).toBe(STORE_DESCRIPTION);
    expect(html).not.toContain("delivered across Egypt.");
  });
});
