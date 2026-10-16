import { viewCategoryAdminTree } from "#root/backend/categories/category-admin/service";
import {
  runBackendEffect,
  serializeBackendEffectResult,
} from "#root/shared/backend/effect";
import { DatabaseClientService } from "#root/shared/database/drizzle/db";
import { Effect } from "effect";
import type { PageContext } from "vike/types";

/** The "not in a subcategory yet" work list instead of one subcategory. */
export const UNCLASSIFIED = "unclassified";

/**
 * `/dashboard/categories/<main id>/<subcategory id | "unclassified">` —
 * bulk product assignment for one subcategory, or the main category's list
 * of products that still need a subcategory.
 */
export const data = async (ctx: PageContext) => {
  const mainRef = decodeURIComponent(ctx.routeParams.categoryType ?? "");
  const subRef = ctx.routeParams.subcategoryId ?? "";

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
    tree.find((m) => m.id === mainRef) ?? tree.find((m) => m.type === mainRef);
  if (!main) {
    return { success: false, error: "Category not found" } as const;
  }

  if (subRef !== UNCLASSIFIED && !main.children.some((c) => c.id === subRef)) {
    return { success: false, error: "Subcategory not found", mainId: main.id } as const;
  }

  return {
    success: true,
    tree,
    mainId: main.id,
    subcategoryId: subRef === UNCLASSIFIED ? null : subRef,
  } as const;
};

export type Data = Awaited<ReturnType<typeof data>>;
