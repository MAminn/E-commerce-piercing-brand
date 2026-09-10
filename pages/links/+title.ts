import type { PageContext } from "vike/types";
import { STORE_NAME } from "#root/shared/config/branding";

export default function title(pageContext: PageContext) {
  const brand = pageContext.brandName || STORE_NAME;
  return `${brand} — Links`;
}
