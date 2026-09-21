import type { PageContext } from "vike/types";
import { BRAND_LINE, STORE_NAME } from "#root/shared/config/branding";
import type { Data } from "./+data";

/**
 * Homepage <title>. Uses the CMS meta title when the admin has set one
 * (Dashboard > Homepage > Meta), otherwise "Percé — Made to mix." — the
 * brand name plus the brand line, never the raw H1 twice.
 */
export default function title(pageContext: PageContext) {
  const brand = pageContext.brandName || STORE_NAME;
  const data = pageContext.data as Data | undefined;
  const meta = data?.homepageContent?.meta;
  const cmsTitle = meta?.enabled ? meta.pageTitle?.trim() : "";
  return cmsTitle || `${brand} — ${BRAND_LINE}`;
}
