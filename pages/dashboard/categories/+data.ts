import { viewCategoryAdminTree } from "#root/backend/categories/category-admin/service";
import {
  runBackendEffect,
  serializeBackendEffectResult,
} from "#root/shared/backend/effect";
import { DatabaseClientService } from "#root/shared/database/drizzle/db";
import { Effect } from "effect";
import type { PageContext } from "vike/types";

/**
 * Main categories with their subcategories and product counts — the same
 * tree the category detail pages and their client-side refreshes use.
 */
export const data = async (ctx: PageContext) => {
  const fetchTree = await runBackendEffect(
    viewCategoryAdminTree(ctx.clientSession).pipe(
      Effect.provideService(DatabaseClientService, ctx.db),
    ),
  ).then(serializeBackendEffectResult);

  if (!fetchTree.success) {
    return fetchTree;
  }

  return {
    success: true,
    tree: fetchTree.result,
  } as const;
};

export type Data = Awaited<ReturnType<typeof data>>;
