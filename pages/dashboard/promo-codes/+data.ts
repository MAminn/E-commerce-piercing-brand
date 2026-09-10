import type { PageContext } from "vike/types";
import {
  runBackendEffect, // Import runBackendEffect
  serializeBackendEffectResult,
} from "#root/shared/backend/effect";
import { DatabaseClientService } from "#root/shared/database/drizzle/db";
import { Effect } from "effect";

// Import service functions
import {
  viewPromoCodes,
  type viewPromoCodesSchema,
} from "#root/backend/promo-codes/view-promo-codes/view-promo-codes";
import {
  viewProducts,
  type viewProductsSchema,
} from "#root/backend/products/view-products/service";
import { viewCategories } from "#root/backend/categories/view-categories/service";
import type { z } from "zod";

const DEFAULT_LIMIT = 10;
const DEFAULT_PROMO_SORT_BY: z.infer<typeof viewPromoCodesSchema>["sortBy"] =
  "createdAt";
const DEFAULT_PROMO_SORT_ORDER: z.infer<
  typeof viewPromoCodesSchema
>["sortOrder"] = "desc";

export async function data(ctx: PageContext) {
  const session = ctx.clientSession;

  if (!session || (session.role !== "admin" && session.role !== "superadmin")) {
    return {
      success: false,
      error: "Unauthorized",
      promoCodesData: null,
      productsData: null,
      categoriesData: null,
    } as const;
  }

  const dbServicePipe = Effect.provideService(DatabaseClientService, ctx.db);

  // --- Promo Codes Data ---
  const promoPage =
    Number.parseInt(ctx.urlParsed.search.promoPage || "1", 10) || 1;
  const promoLimit =
    Number.parseInt(
      ctx.urlParsed.search.promoLimit || String(DEFAULT_LIMIT),
      10
    ) || DEFAULT_LIMIT;
  const promoSearchCode = ctx.urlParsed.search.promoSearch || undefined;
  const promoStatus = ctx.urlParsed.search.promoStatus as
    | z.infer<typeof viewPromoCodesSchema>["status"]
    | undefined;
  const promoSortBy = (ctx.urlParsed.search.promoSortBy ||
    DEFAULT_PROMO_SORT_BY) as z.infer<typeof viewPromoCodesSchema>["sortBy"];
  const promoSortOrder = (ctx.urlParsed.search.promoSortOrder ||
    DEFAULT_PROMO_SORT_ORDER) as z.infer<
    typeof viewPromoCodesSchema
  >["sortOrder"];

  const promoCodesResult = await runBackendEffect(
    viewPromoCodes(
      {
        page: promoPage,
        limit: promoLimit,
        searchCode: promoSearchCode,
        status: promoStatus,
        sortBy: promoSortBy,
        sortOrder: promoSortOrder,
      },
      session
    ).pipe(dbServicePipe)
  ).then(serializeBackendEffectResult);

  // --- Products Data ---
  const productsResult = await runBackendEffect(
    viewProducts({
      limit: 1000,
      offset: 0,
      includeHidden: true,
    }).pipe(dbServicePipe)
  ).then(serializeBackendEffectResult);

  // --- Categories Data ---
  const categoriesResult = await runBackendEffect(
    viewCategories().pipe(dbServicePipe)
  ).then(serializeBackendEffectResult);

  if (
    !promoCodesResult.success ||
    !productsResult.success ||
    !categoriesResult.success
  ) {
    let errorDetail = "Unknown error";
    if (!promoCodesResult.success) {
      errorDetail = promoCodesResult.error;
    } else if (!productsResult.success) {
      errorDetail = productsResult.error;
    } else if (!categoriesResult.success) {
      errorDetail = categoriesResult.error;
    }

    return {
      success: false,
      error: `Failed to load data: ${errorDetail}`,
      // Provide partial data if some calls succeeded
      promoCodesData: promoCodesResult.success ? promoCodesResult.result : null,
      productsData: productsResult.success
        ? productsResult.result.products
        : [],
      categoriesData: categoriesResult.success ? categoriesResult.result : [],
    } as const;
  }

  return {
    success: true,
    promoCodesData: promoCodesResult.result,
    productsData: productsResult.result.products,
    categoriesData: categoriesResult.result,
  } as const;
}

export type PromoCodesPageData = Awaited<ReturnType<typeof data>>;
