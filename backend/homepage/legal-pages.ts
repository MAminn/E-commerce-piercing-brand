import type { DatabaseClient } from "#root/shared/database/drizzle/db";
import type { HomepageLegalPageContent } from "#root/shared/types/homepage-content";
import { getHomepageContentRaw } from "#root/backend/homepage/get-homepage-content/raw";
import { resolveLandingTemplateId } from "#root/shared/config/storefront";
import { getStoreOwnerId } from "#root/shared/config/store";
import {
  getPublishedLegalPages,
  isLegalPagePublished,
  type PublishedLegalPage,
} from "#root/shared/legal/legal-pages";

type TemplateSelection = Parameters<typeof resolveLandingTemplateId>[0];

/**
 * Legal pages live in the same homepage_content row as /return-policy,
 * resolved against the active landing template exactly the way the
 * /return-policy page resolves it.
 */
function loadContent(
  database: DatabaseClient,
  templateSelection: TemplateSelection,
) {
  return getHomepageContentRaw(
    database,
    getStoreOwnerId(),
    resolveLandingTemplateId(templateSelection),
  );
}

/**
 * The /terms or /privacy content when it is live, otherwise null — so an
 * unpublished draft (placeholders included) is never serialised to the page.
 */
export async function getPublishedLegalPageRaw(
  database: DatabaseClient,
  templateSelection: TemplateSelection,
  key: "terms" | "privacy",
): Promise<HomepageLegalPageContent | null> {
  const page = (await loadContent(database, templateSelection))[key];
  return isLegalPagePublished(page) ? page : null;
}

/**
 * What the footer may link to, resolved once per SSR request alongside the
 * layout settings. getHomepageContentRaw already falls back to defaults on a
 * database error, where no page is live, so this never breaks rendering.
 */
export async function getPublishedLegalPagesRaw(
  database: DatabaseClient,
  templateSelection: TemplateSelection,
): Promise<PublishedLegalPage[]> {
  return getPublishedLegalPages(await loadContent(database, templateSelection));
}
