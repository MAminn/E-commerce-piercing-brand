import type { PageContext } from "vike/types";
import { STORE_NAME } from "#root/shared/config/branding";
import type { Data } from "./+data";

export default function title(pageContext: PageContext) {
  const brand = pageContext.brandName || STORE_NAME;
  const campaign = (pageContext.data as Data | undefined)?.campaign;
  return campaign ? `${campaign.title} | ${brand}` : `Bundles & Stacks | ${brand}`;
}
