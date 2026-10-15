import { redirect } from "vike/abort";
import { areSetsVisibleToShoppers } from "#root/shared/config/sets-visibility";

/**
 * Sets are temporarily hidden from shoppers (shared/config/sets-visibility):
 * /bundles and every /bundles/<slug> send old links and ads to the shop with
 * a temporary redirect. Applies to the nested @slug route too. Lifts itself
 * once the hide window ends.
 */
export async function guard() {
  if (!areSetsVisibleToShoppers()) {
    throw redirect("/shop");
  }
}
