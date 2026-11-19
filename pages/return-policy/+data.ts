import type { PageContext } from "vike/types";
import { render } from "vike/abort";
import { getHomepageContentRaw } from "#root/backend/homepage/get-homepage-content/raw";
import {
  DEFAULT_HOMEPAGE_CONTENT,
  type HomepageContent,
} from "#root/shared/types/homepage-content";
import { resolveLandingTemplateId } from "#root/shared/config/storefront";
import { getStoreOwnerId } from "#root/shared/config/store";

export type Data = {
  homepageContent: HomepageContent;
};

export const data = async (ctx: PageContext): Promise<Data> => {
  const merchantId = getStoreOwnerId();

  const templateSelection = ctx.templateSelection as
    | Record<string, string>
    | undefined;
  const activeTemplateId = resolveLandingTemplateId(templateSelection);

  let homepageContent: HomepageContent;
  try {
    homepageContent = await getHomepageContentRaw(ctx.db, merchantId, activeTemplateId);
  } catch {
    homepageContent = DEFAULT_HOMEPAGE_CONTENT;
  }
  // Switched off in Dashboard > Homepage > Returns & Refunds → a real 404
  // (pages/_error), not a 200 "not available yet" soft-404. /refund-policy
  // redirects here, so it follows the same rule.
  if (!homepageContent.returnPolicy?.enabled) throw render(404);
  return { homepageContent };
};
