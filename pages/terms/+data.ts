import type { PageContext } from "vike/types";
import type { HomepageLegalPageContent } from "#root/shared/types/homepage-content";
import { getPublishedLegalPageRaw } from "#root/backend/homepage/legal-pages";

export type Data = {
  /** Null until the page is published — a draft never reaches the browser. */
  content: HomepageLegalPageContent | null;
};

export const data = async (ctx: PageContext): Promise<Data> => ({
  content: await getPublishedLegalPageRaw(ctx.db, ctx.templateSelection, "terms"),
});
