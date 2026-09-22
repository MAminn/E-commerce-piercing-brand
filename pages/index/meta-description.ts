import { STORE_DESCRIPTION } from "#root/shared/config/branding";
import type { Data } from "./+data";

/**
 * The `<meta name="description">` (and og/twitter description) for a page.
 *
 * Only the homepage has CMS-editable meta (Dashboard > Homepage > SEO /
 * Meta → homepage_content.content.meta.pageDescription). It is used there
 * when non-empty; every other route, and an empty or disabled CMS value,
 * keeps the global STORE_DESCRIPTION. Same rule as pages/index/+title.ts.
 */
export function resolveMetaDescription(pageContext: {
  urlPathname?: string;
  data?: unknown;
}): string {
  if (pageContext.urlPathname !== "/") return STORE_DESCRIPTION;
  const meta = (pageContext.data as Partial<Data> | undefined)?.homepageContent
    ?.meta;
  const cmsDescription = meta?.enabled ? meta.pageDescription?.trim() : "";
  return cmsDescription || STORE_DESCRIPTION;
}
