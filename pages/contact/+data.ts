import type { PageContext } from "vike/types";
import { getHomepageContentRaw } from "#root/backend/homepage/get-homepage-content/raw";
import { DEFAULT_HOMEPAGE_CONTENT, type HomepageContent } from "#root/shared/types/homepage-content";
import { getStoreOwnerId } from "#root/shared/config/store";

export type Data = {
  homepageContent: HomepageContent;
};

export const data = async (ctx: PageContext): Promise<Data> => {
  const merchantId = getStoreOwnerId();

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
    return { homepageContent };
  } catch {
    return { homepageContent: DEFAULT_HOMEPAGE_CONTENT };
  }
};
