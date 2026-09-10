import type { PageContext } from "vike/types";
import { getHomepageContentRaw } from "#root/backend/homepage/get-homepage-content/raw";
import { DEFAULT_HOMEPAGE_CONTENT } from "#root/shared/types/homepage-content";
import type { HomepageContent } from "#root/shared/types/homepage-content";
import { getStoreOwnerId } from "#root/shared/config/store";

export type Data = {
  homepageContent: HomepageContent;
  /** The template ID this content was fetched for (so the client knows) */
  ssrTemplateId: string;
};

/**
 * SSR data loader for the homepage.
 *
 * Reads the active landing template from `ctx.templateSelection` (injected
 * during SSR by server.ts / vike-handler.ts) and fetches the matching CMS
 * content from the database.  The result is serialised into the HTML payload
 * so the client hydrates with the correct content — no flash of defaults.
 */
export const data = async (ctx: PageContext): Promise<Data> => {
  const merchantId = getStoreOwnerId();

  // Determine which landing template is active from the SSR-injected selection
  const templateSelection = ctx.templateSelection as
    | Record<string, string>
    | undefined;
  const activeTemplateId =
    templateSelection?.landing ?? "landing-modern";

  try {
    const homepageContent = await getHomepageContentRaw(
      ctx.db,
      merchantId,
      activeTemplateId,
    );

    return { homepageContent, ssrTemplateId: activeTemplateId };
  } catch {
    return {
      homepageContent: DEFAULT_HOMEPAGE_CONTENT,
      ssrTemplateId: activeTemplateId,
    };
  }
};
