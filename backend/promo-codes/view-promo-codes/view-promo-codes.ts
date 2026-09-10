import type { ClientSession } from "#root/backend/auth/shared/entities";
import { query } from "#root/shared/database/drizzle/db";
import {
  promoCode,
  promoCodeProducts,
  promoCodeCategories,
  product,
  category,
} from "#root/shared/database/drizzle/schema";
import { ServerError } from "#root/shared/error/server";
import { Effect } from "effect";
import { z } from "zod";
import { and, asc, desc, eq, ilike, or, count, sql, lt, inArray } from "drizzle-orm";

const promoCodeStatuses = [
  "active",
  "inactive",
  "expired",
  "exhausted",
  "scheduled",
] as const;

export const viewPromoCodesSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().default(10),
  searchCode: z.string().optional(),
  status: z.enum(promoCodeStatuses).optional(),
  sortBy: z
    .enum([
      "createdAt",
      "code",
      "status",
      "endDate",
      "startDate",
      "discountValue",
    ])
    .default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type ViewPromoCodesInput = z.infer<typeof viewPromoCodesSchema>;

// Schema for a single promo code (can be used for getById later)
export const getPromoCodeByIdSchema = z.object({
  id: z.string().uuid(),
});
export type GetPromoCodeByIdInput = z.infer<typeof getPromoCodeByIdSchema>;

export const viewPromoCodes = (
  input: ViewPromoCodesInput,
  session?: ClientSession
) =>
  Effect.gen(function* ($) {
    if (!session || (session.role !== "admin" && session.role !== "superadmin")) {
      return yield* $(
        Effect.fail(
          new ServerError({
            tag: "Unauthorized",
            statusCode: 401,
            clientMessage: "Unauthorized",
          })
        )
      );
    }

    const { page, limit, searchCode, status, sortBy, sortOrder } = input;
    const offset = (page - 1) * limit;

    // Auto-expire promo codes whose endDate has passed
    yield* $(
      query((db) =>
        db
          .update(promoCode)
          .set({ status: "expired" })
          .where(
            and(
              inArray(promoCode.status, ["active", "scheduled"]),
              lt(promoCode.endDate, new Date())
            )
          )
      )
    );

    const conditions = [];
    if (searchCode) {
      conditions.push(ilike(promoCode.code, `%${searchCode}%`));
    }
    if (status) {
      conditions.push(eq(promoCode.status, status));
    }

    const whereCondition =
      conditions.length > 0 ? and(...conditions) : undefined;

    const orderByClause =
      sortOrder === "asc" ? asc(promoCode[sortBy]) : desc(promoCode[sortBy]);

    const codesQuery = query(async (db) =>
      db
        .select()
        .from(promoCode)
        .where(whereCondition)
        .orderBy(orderByClause)
        .limit(limit)
        .offset(offset)
    );

    const totalCountQuery = query(async (db) =>
      db
        .select({ count: count(promoCode.id) })
        .from(promoCode)
        .where(whereCondition)
        .then((res) => res[0]?.count ?? 0)
    );

    const [codes, totalCount] = yield* $(
      Effect.all([codesQuery, totalCountQuery])
    );

    // Fetch applicability details for each code
    const codesWithDetails = yield* $(
      Effect.all(
        codes.map((pc) =>
          Effect.gen(function* (scope) {
            let applicableProductIds: string[] = [];
            let applicableCategoryIds: string[] = [];

            if (!pc.appliesToAllProducts) {
              const products = yield* scope(
                query((db) =>
                  db
                    .select({ productId: promoCodeProducts.productId })
                    .from(promoCodeProducts)
                    .where(eq(promoCodeProducts.promoCodeId, pc.id))
                )
              );
              applicableProductIds = products.map((p) => p.productId);

              const categories = yield* scope(
                query((db) =>
                  db
                    .select({ categoryId: promoCodeCategories.categoryId })
                    .from(promoCodeCategories)
                    .where(eq(promoCodeCategories.promoCodeId, pc.id))
                )
              );
              applicableCategoryIds = categories.map((c) => c.categoryId);
            }
            return {
              ...pc,
              applicableProductIds,
              applicableCategoryIds,
              // Convert decimal string values from DB back to numbers for frontend
              discountValue: Number.parseFloat(pc.discountValue),
              minPurchaseAmount: pc.minPurchaseAmount
                ? Number.parseFloat(pc.minPurchaseAmount)
                : null,
            };
          })
        )
      )
    );

    return {
      items: codesWithDetails,
      totalCount,
      totalPages: Math.ceil(totalCount / limit),
      currentPage: page,
    };
  });

// Service to get a single promo code by ID (for edit or detailed view)
export const getPromoCodeById = (
  input: GetPromoCodeByIdInput,
  session?: ClientSession
) =>
  Effect.gen(function* ($) {
    if (!session || (session.role !== "admin" && session.role !== "superadmin")) {
      return yield* $(
        Effect.fail(
          new ServerError({
            tag: "Unauthorized",
            statusCode: 401,
            clientMessage: "Unauthorized",
          })
        )
      );
    }

    const foundPromoCode = yield* $(
      query(async (db) =>
        db
          .select()
          .from(promoCode)
          .where(eq(promoCode.id, input.id))
          .limit(1)
          .then((res) => res[0])
      )
    );

    if (!foundPromoCode) {
      return yield* $(
        Effect.fail(
          new ServerError({
            tag: "NotFound",
            statusCode: 404,
            clientMessage: "Promo code not found",
          })
        )
      );
    }

    let applicableProductIds: string[] = [];
    let applicableCategoryIds: string[] = [];

    if (!foundPromoCode.appliesToAllProducts) {
      const products = yield* $(
        query((db) =>
          db
            .select({ productId: promoCodeProducts.productId })
            .from(promoCodeProducts)
            .where(eq(promoCodeProducts.promoCodeId, foundPromoCode.id))
        )
      );
      applicableProductIds = products.map((p) => p.productId);

      const categories = yield* $(
        query((db) =>
          db
            .select({ categoryId: promoCodeCategories.categoryId })
            .from(promoCodeCategories)
            .where(eq(promoCodeCategories.promoCodeId, foundPromoCode.id))
        )
      );
      applicableCategoryIds = categories.map((c) => c.categoryId);
    }

    return {
      ...foundPromoCode,
      applicableProductIds,
      applicableCategoryIds,
      discountValue: Number.parseFloat(foundPromoCode.discountValue),
      minPurchaseAmount: foundPromoCode.minPurchaseAmount
        ? Number.parseFloat(foundPromoCode.minPurchaseAmount)
        : null,
    };
  });
