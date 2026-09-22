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
    expect(STORE_DESCRIPTION).toBe("Piercing jewellery, delivered across Egypt.");
  });

  it("ignores the CMS description on every other route", () => {
    // /contact and /about-us also load homepageContent into their data.
    for (const path of ["/contact", "/about-us", "/shop", "/bundles"]) {
      expect(resolveMetaDescription({ urlPathname: path, data: homepageData(CMS_DESCRIPTION) })).toBe(
        STORE_DESCRIPTION,
      );
    }
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

  it("leaves other routes on STORE_DESCRIPTION even when their data carries homepage content", () => {
    const tags = descriptionTags(renderHead({ urlPathname: "/contact", data: homepageData(CMS_DESCRIPTION) }));
    expect(tags.description).toBe(STORE_DESCRIPTION);
    expect(tags.og).toBe(STORE_DESCRIPTION);
    expect(tags.twitter).toBe(STORE_DESCRIPTION);
  });
});
