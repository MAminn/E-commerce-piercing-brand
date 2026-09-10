import { viewCategories } from "#root/backend/categories/view-categories/service";
import {
  runBackendEffect,
  serializeBackendEffectResult,
} from "#root/shared/backend/effect";
import { DatabaseClientService } from "#root/shared/database/drizzle/db";
import { Effect } from "effect";
import type { PageContext } from "vike/types";

export const data = async (ctx: PageContext) => {
  const categoryType = ctx.routeParams.categoryType;

  if (!categoryType) {
    return {
      success: false,
      error: "Invalid category type",
    } as const;
  }

  const fetchSubcategories = await runBackendEffect(
    viewCategories().pipe(Effect.provideService(DatabaseClientService, ctx.db)),
  ).then(serializeBackendEffectResult);

  if (!fetchSubcategories.success) {
    return fetchSubcategories;
  }

  const subcategories = fetchSubcategories.result.filter(
    (s) => s.type === categoryType,
  );

  // If no categories match this type, it's not a valid category
  if (subcategories.length === 0) {
    return {
      success: false,
      error: "Category not found",
    } as const;
  }

  return {
    success: true,
    categoryType,
    subcategories,
  } as const;
};

export type Data = Awaited<ReturnType<typeof data>>;
