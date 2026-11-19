import type { PageContext } from "vike/types";
import { render } from "vike/abort";
import type { HomepageLegalPageContent } from "#root/shared/types/homepage-content";
import { getPublishedLegalPageRaw } from "#root/backend/homepage/legal-pages";

export type Data = {
  content: HomepageLegalPageContent;
};

/**
 * An unpublished page (switched off, or owner-input placeholders left) is a
 * real 404 rendered by pages/_error — not a 200 "not available yet" soft-404
 * that search engines would index. A draft never reaches the browser.
 */
export const data = async (ctx: PageContext): Promise<Data> => {
  const content = await getPublishedLegalPageRaw(ctx.db, ctx.templateSelection, "privacy");
  if (!content) throw render(404);
  return { content };
};
