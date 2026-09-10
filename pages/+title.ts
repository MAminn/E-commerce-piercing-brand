import type { PageContext } from "vike/types";
import type { LayoutSettings } from "#root/shared/types/layout-settings";
import { STORE_NAME } from "#root/shared/config/branding";

export default function title(pageContext: PageContext) {
  const layoutSettings = pageContext.layoutSettingsData as LayoutSettings | undefined;
  return pageContext.brandName || layoutSettings?.siteTitle || STORE_NAME;
}
