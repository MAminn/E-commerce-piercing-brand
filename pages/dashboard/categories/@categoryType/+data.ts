import { viewCategoryAdminTree } from "#root/backend/categories/category-admin/service";
import {
  runBackendEffect,
  serializeBackendEffectResult,
} from "#root/shared/backend/effect";
import { DatabaseClientService } from "#root/shared/database/drizzle/db";
import { Effect } from "effect";
import type { PageContext } from "vike/types";

/**
 * `/dashboard/categories/<main category id>`.
 *
 * The route segment used to be the category's `type` string (e.g.
 * "ear piercings", with a space), which changed whenever a main category was
 * renamed. Links now use the id; a legacy type in an old bookmark still
 * resolves to the same main category.
 */
export const data = async (ctx: PageContext) => {
  const ref = decodeURIComponent(ctx.routeParams.categoryType ?? "");

  const fetchTree = await runBackendEffect(
    viewCategoryAdminTree(ctx.clientSession).pipe(
      Effect.provideService(DatabaseClientService, ctx.db),
    ),
  ).then(serializeBackendEffectResult);

  if (!fetchTree.success) {
    return fetchTree;
  }

  const tree = fetchTree.result;
  const main =
    tree.find((m) => m.id === ref) ?? tree.find((m) => m.type === ref);

  if (!main) {
    return { success: false, error: "Category not found" } as const;
  }

  return { success: true, mainId: main.id, tree } as const;
};

export type Data = Awaited<ReturnType<typeof data>>;
