import { STORE_DESCRIPTION } from "#root/shared/config/branding";
import type { Data } from "./+data";

/**
 * The `<meta name="description">` (and og/twitter description) for a page.
 *
 * The dashboard's meta description (Dashboard > Homepage > SEO / Meta →
 * homepage_content.content.meta.pageDescription) is the store's description:
 *  - on the homepage it comes from the page's own data, as before;
 *  - on every other route it comes from `pageContext.siteDescription`, read
 *    once per SSR request with the legal pages (getStorefrontShellContentRaw).
 * An empty or disabled CMS value falls back to STORE_DESCRIPTION, so a
 * corrected dashboard description never sits next to a stale code default.
 */
export function resolveMetaDescription(pageContext: {
  urlPathname?: string;
  data?: unknown;
  siteDescription?: string | null;
}): string {
  if (pageContext.urlPathname !== "/") {
    return pageContext.siteDescription?.trim() || STORE_DESCRIPTION;
  }
  const meta = (pageContext.data as Partial<Data> | undefined)?.homepageContent
    ?.meta;
  const cmsDescription = meta?.enabled ? meta.pageDescription?.trim() : "";
  return cmsDescription || STORE_DESCRIPTION;
}
