import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_HOMEPAGE_CONTENT,
  type HomepageContent,
  type HomepageLegalPageContent,
} from "#root/shared/types/homepage-content";

/**
 * An unpublished legal page is a real 404 (pages/_error), not a 200
 * "This page is not available yet" soft-404. A published one renders.
 */

let published: HomepageLegalPageContent | null = null;
vi.mock("#root/backend/homepage/legal-pages", () => ({
  getPublishedLegalPageRaw: async () => published,
}));
let homepageContent: HomepageContent = DEFAULT_HOMEPAGE_CONTENT;
vi.mock("#root/backend/homepage/get-homepage-content/raw", () => ({
  getHomepageContentRaw: async () => homepageContent,
}));

const { data: termsData } = await import("../terms/+data");
const { data: privacyData } = await import("../privacy/+data");
const { data: returnData } = await import("../return-policy/+data");

const ctx = { db: {}, templateSelection: {} } as never;
const page: HomepageLegalPageContent = {
  enabled: true,
  title: "Privacy policy",
  intro: "What we collect.",
  sections: [{ title: "Orders", body: "Name and address." }],
};

async function abortOf(run: () => Promise<unknown>) {
  try {
    await run();
  } catch (e) {
    return e as { _isAbortError?: boolean; _pageContextAbort?: { abortStatusCode?: number } };
  }
  return null;
}

beforeEach(() => {
  published = null;
  homepageContent = DEFAULT_HOMEPAGE_CONTENT;
});

describe("legal pages: unpublished → 404, published → 200", () => {
  it.each([
    ["/terms", termsData],
    ["/privacy", privacyData],
  ])("%s throws render(404) while unpublished", async (_path, data) => {
    const abort = await abortOf(() => data(ctx));
    expect(abort?._isAbortError).toBe(true);
    expect(abort?._pageContextAbort?.abortStatusCode).toBe(404);
  });

  it.each([
    ["/terms", termsData],
    ["/privacy", privacyData],
  ])("%s returns the content once published", async (_path, data) => {
    published = page;
    await expect(data(ctx)).resolves.toEqual({ content: page });
  });

  it("/return-policy renders while enabled", async () => {
    await expect(returnData(ctx)).resolves.toEqual({ homepageContent });
  });

  it("/return-policy (and so /refund-policy) is a 404 when switched off", async () => {
    homepageContent = {
      ...DEFAULT_HOMEPAGE_CONTENT,
      returnPolicy: { ...(DEFAULT_HOMEPAGE_CONTENT.returnPolicy as NonNullable<HomepageContent["returnPolicy"]>), enabled: false },
    };
    const abort = await abortOf(() => returnData(ctx));
    expect(abort?._pageContextAbort?.abortStatusCode).toBe(404);
  });
});
