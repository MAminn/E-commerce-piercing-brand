import { viewCategories } from "#root/backend/categories/view-categories/service";
import { viewMainCategories } from "#root/backend/categories/view-main-categories/service";
import {
  runBackendEffect,
  serializeBackendEffectResult,
} from "#root/shared/backend/effect";
import { DatabaseClientService } from "#root/shared/database/drizzle/db";
import { Effect } from "effect";
import type { PageContext } from "vike/types";

export const data = async (ctx: PageContext) => {
  const fetchSubcategories = await runBackendEffect(
    viewCategories().pipe(Effect.provideService(DatabaseClientService, ctx.db)),
  ).then(serializeBackendEffectResult);

  if (!fetchSubcategories.success) {
    return fetchSubcategories;
  }

  const fetchMainCategories = await runBackendEffect(
    viewMainCategories().pipe(
      Effect.provideService(DatabaseClientService, ctx.db),
    ),
  ).then(serializeBackendEffectResult);

  if (!fetchMainCategories.success) {
    return fetchMainCategories;
  }

  const subcategories = fetchSubcategories.result;
  const mainCategories = fetchMainCategories.result;

  return {
    success: true,
    subcategories,
    mainCategories,
  } as const;
};

export type Data = Awaited<ReturnType<typeof data>>;
