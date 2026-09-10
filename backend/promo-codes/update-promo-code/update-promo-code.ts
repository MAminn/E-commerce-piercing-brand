import type { ClientSession } from "#root/backend/auth/shared/entities";
import { query } from "#root/shared/database/drizzle/db";
import {
  promoCode,
  promoCodeProducts,
  promoCodeCategories,
  user,
} from "#root/shared/database/drizzle/schema";
import { ServerError } from "#root/shared/error/server";
import { Effect } from "effect";
import { z } from "zod";
import { eq, and, sql, ne, inArray } from "drizzle-orm";

const discountTypes = ["percentage", "fixed_amount"] as const;
const promoCodeStatusesList = [
  "active",
  "inactive",
  "expired",
  "exhausted",
  "scheduled",
] as const;
export type PromoCodeStatus = (typeof promoCodeStatusesList)[number];

export const updatePromoCodeSchema = z
  .object({
    id: z.string().uuid(),
    code: z
      .string()
      .min(3, "Code must be at least 3 characters")
      .max(50, "Code can be at most 50 characters")
      .regex(
        /^[a-zA-Z0-9_-]+$/,
        "Code can only contain alphanumeric characters, underscores, and hyphens"
      )
      .transform((val) => val.toUpperCase())
      .optional(),
    description: z
      .string()
      .max(255, "Description can be at most 255 characters")
      .nullable()
      .optional(),
    discountType: z.enum(discountTypes).optional(),
    discountValue: z
      .number()
      .positive("Discount value must be positive")
      .optional(),
    status: z.enum(promoCodeStatusesList).optional(),
    startDate: z.coerce.date().nullable().optional(),
    endDate: z.coerce.date().nullable().optional(),
    usageLimit: z
      .number()
      .int()
      .min(0, "Usage limit cannot be negative")
      .nullable()
      .optional(),
    usageLimitPerUser: z
      .number()
      .int()
      .min(0, "Usage limit per user cannot be negative")
      .nullable()
      .optional(),
    minPurchaseAmount: z
      .number()
      .nonnegative("Minimum purchase amount cannot be negative")
      .nullable()
      .optional(),
    appliesToAllProducts: z.boolean().optional(),
    applicableProductIds: z.array(z.string().uuid()).optional(),
    applicableCategoryIds: z.array(z.string().uuid()).optional(),
    showOnOffersPage: z.boolean().optional(),
  })
  .refine(
    (data) => {
      if (
        data.discountType === "percentage" &&
        data.discountValue !== undefined &&
        (data.discountValue <= 0 || data.discountValue > 100)
      ) {
        return false;
      }
      return true;
    },
    {
      message:
        "Percentage discount must be between 0 (exclusive) and 100 (inclusive)",
      path: ["discountValue"],
    }
  );

export type UpdatePromoCodeInput = z.infer<typeof updatePromoCodeSchema>;

export const updatePromoCode = (
  input: UpdatePromoCodeInput,
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

    const existingPromo = yield* $(
      query(async (db) =>
        db
          .select()
          .from(promoCode)
          .where(eq(promoCode.id, input.id))
          .limit(1)
          .then((res) => res[0])
      )
    );

    if (!existingPromo) {
      return yield* $(
        Effect.fail(
          new ServerError({
            tag: "NotFound",
            statusCode: 404,
            clientMessage: "Promo code not found.",
          })
        )
      );
    }

    if (input.code && input.code !== existingPromo.code) {
      const codeToUpdate = input.code;
      const conflictingCode = yield* $(
        query(async (db) =>
          db
            .select({ id: promoCode.id })
            .from(promoCode)
            .where(
              and(eq(promoCode.code, codeToUpdate), ne(promoCode.id, input.id))
            )
            .limit(1)
            .then((res) => res[0])
        )
      );
      if (conflictingCode) {
        return yield* $(
          Effect.fail(
            new ServerError({
              tag: "Conflict",
              statusCode: 409,
              clientMessage:
                "Another promo code with this code already exists.",
            })
          )
        );
      }
    }

    const finalStartDate =
      input.startDate === null
        ? null
        : (input.startDate ?? existingPromo.startDate);
    const finalEndDate =
      input.endDate === null ? null : (input.endDate ?? existingPromo.endDate);

    if (finalStartDate && finalEndDate && finalEndDate < finalStartDate) {
      return yield* $(
        Effect.fail(
          new ServerError({
            tag: "BadRequest",
            statusCode: 400,
            clientMessage: "End date must be after start date.",
          })
        )
      );
    }

    const currentApplicableProductIds = yield* $(
      query((db) =>
        db
          .select({ id: promoCodeProducts.productId })
          .from(promoCodeProducts)
          .where(eq(promoCodeProducts.promoCodeId, input.id))
      )
    );
    const currentApplicableCategoryIds = yield* $(
      query((db) =>
        db
          .select({ id: promoCodeCategories.categoryId })
          .from(promoCodeCategories)
          .where(eq(promoCodeCategories.promoCodeId, input.id))
      )
    );

    const finalAppliesToAll =
      input.appliesToAllProducts ?? existingPromo.appliesToAllProducts;
    const finalProductIds =
      input.applicableProductIds ??
      currentApplicableProductIds.map((p) => p.id);
    const finalCategoryIds =
      input.applicableCategoryIds ??
      currentApplicableCategoryIds.map((c) => c.id);

    if (
      !finalAppliesToAll &&
      finalProductIds.length === 0 &&
      finalCategoryIds.length === 0
    ) {
      return yield* $(
        Effect.fail(
          new ServerError({
            tag: "BadRequest",
            statusCode: 400,
            clientMessage:
              "If not applicable to all products, please specify at least one product or category.",
          })
        )
      );
    }

    const valuesToUpdate: Partial<typeof promoCode.$inferInsert> = {};
    if (input.code !== undefined) valuesToUpdate.code = input.code;
    if (input.description !== undefined)
      valuesToUpdate.description = input.description;
    if (input.discountType !== undefined)
      valuesToUpdate.discountType = input.discountType;
    if (input.discountValue !== undefined)
      valuesToUpdate.discountValue = String(input.discountValue);
    if (input.status !== undefined) valuesToUpdate.status = input.status;
    if (input.startDate !== undefined)
      valuesToUpdate.startDate = input.startDate;
    if (input.endDate !== undefined) valuesToUpdate.endDate = input.endDate;
    if (input.usageLimit !== undefined)
      valuesToUpdate.usageLimit = input.usageLimit;
    if (input.usageLimitPerUser !== undefined)
      valuesToUpdate.usageLimitPerUser = input.usageLimitPerUser;
    if (input.minPurchaseAmount !== undefined)
      valuesToUpdate.minPurchaseAmount =
        input.minPurchaseAmount !== null
          ? String(input.minPurchaseAmount)
          : null;
    if (input.appliesToAllProducts !== undefined)
      valuesToUpdate.appliesToAllProducts = input.appliesToAllProducts;
    if (input.showOnOffersPage !== undefined)
      valuesToUpdate.showOnOffersPage = input.showOnOffersPage;

    if (
      input.status === undefined &&
      (input.startDate !== undefined ||
        input.endDate !== undefined ||
        input.usageLimit !== undefined)
    ) {
      let newStatus: PromoCodeStatus = existingPromo.status as PromoCodeStatus; // Cast existing status to our defined type
      const now = new Date();
      const checkStartDate =
        input.startDate === null
          ? null
          : (input.startDate ?? existingPromo.startDate);
      const checkEndDate =
        input.endDate === null
          ? null
          : (input.endDate ?? existingPromo.endDate);

      if (checkStartDate) {
        if (checkStartDate > now) newStatus = "scheduled";
        else if (checkEndDate && checkEndDate < now) newStatus = "expired";
        else newStatus = "active";
      } else {
        if (checkEndDate && checkEndDate < now) newStatus = "expired";
        else newStatus = "active";
      }

      const finalUsageLimit =
        input.usageLimit === null
          ? null
          : (input.usageLimit ?? existingPromo.usageLimit);
      const currentUsedCount = existingPromo.usedCount;

      if (
        finalUsageLimit !== null &&
        finalUsageLimit <= currentUsedCount &&
        finalUsageLimit !== 0
      ) {
        newStatus = "exhausted"; // Already exhausted or becomes exhausted if limit is reduced below current usage
      } else if (
        finalUsageLimit === 0 &&
        (newStatus === "active" || newStatus === "scheduled")
      ) {
        newStatus = "exhausted"; // Explicitly set to 0 usage limit means exhausted
      }

      // Prevent auto-transitioning from a terminal state (expired/exhausted) to a non-terminal one (active/scheduled)
      // unless the status is explicitly being changed by the user input.
      const isExistingTerminal =
        existingPromo.status === "expired" ||
        existingPromo.status === "exhausted";
      const isNewActiveOrScheduled =
        newStatus === "active" || newStatus === "scheduled";

      if (!(isExistingTerminal && isNewActiveOrScheduled)) {
        valuesToUpdate.status = newStatus;
      }
    }

    if (Object.keys(valuesToUpdate).length > 0) {
      valuesToUpdate.updatedAt = new Date();
    }

    const updatedPromo = yield* $(
      query(async (db) =>
        db.transaction(async (tx) => {
          let finalUpdatedPromoCode = existingPromo;
          if (Object.keys(valuesToUpdate).length > 0) {
            const [updated] = await tx
              .update(promoCode)
              .set(valuesToUpdate)
              .where(eq(promoCode.id, input.id))
              .returning();
            if (!updated)
              throw new Error(
                "Promo code update failed during main table update."
              );
            finalUpdatedPromoCode = updated;
          }

          const newAppliesToAll =
            valuesToUpdate.appliesToAllProducts ??
            finalUpdatedPromoCode.appliesToAllProducts;

          let applicabilityChanged = false;
          if (
            input.appliesToAllProducts !== undefined &&
            input.appliesToAllProducts !== existingPromo.appliesToAllProducts
          )
            applicabilityChanged = true;
          if (input.applicableProductIds !== undefined)
            applicabilityChanged = true; // If array provided, assume change intent
          if (input.applicableCategoryIds !== undefined)
            applicabilityChanged = true;

          if (applicabilityChanged) {
            await tx
              .delete(promoCodeProducts)
              .where(eq(promoCodeProducts.promoCodeId, input.id));
            await tx
              .delete(promoCodeCategories)
              .where(eq(promoCodeCategories.promoCodeId, input.id));

            if (!newAppliesToAll) {
              if (
                input.applicableProductIds &&
                input.applicableProductIds.length > 0
              ) {
                await tx
                  .insert(promoCodeProducts)
                  .values(
                    input.applicableProductIds.map((productId) => ({
                      promoCodeId: input.id,
                      productId: productId,
                    }))
                  )
                  .catch((e) => {
                    throw new Error(
                      `Failed to insert promo code products: ${e.message}`
                    );
                  });
              }
              if (
                input.applicableCategoryIds &&
                input.applicableCategoryIds.length > 0
              ) {
                await tx
                  .insert(promoCodeCategories)
                  .values(
                    input.applicableCategoryIds.map((categoryId) => ({
                      promoCodeId: input.id,
                      categoryId: categoryId,
                    }))
                  )
                  .catch((e) => {
                    throw new Error(
                      `Failed to insert promo code categories: ${e.message}`
                    );
                  });
              }
            }
          }
          return finalUpdatedPromoCode;
        })
      )
    );

    const base = yield* $(
      query((db) =>
        db
          .select()
          .from(promoCode)
          .where(eq(promoCode.id, updatedPromo.id))
          .limit(1)
          .then((r) => r[0])
      )
    );
    if (!base) {
      return yield* $(
        Effect.fail(
          new ServerError({
            tag: "InternalServerError",
            clientMessage: "Failed to refetch promo code after update.",
          })
        )
      );
    }

    let applicablePds: string[] = [];
    let applicableCats: string[] = [];

    if (!base.appliesToAllProducts) {
      const pdsResult = yield* $(
        query((db) =>
          db
            .select({ id: promoCodeProducts.productId })
            .from(promoCodeProducts)
            .where(eq(promoCodeProducts.promoCodeId, base.id))
        )
      );
      applicablePds = pdsResult.map((p) => p.id);
      const catsResult = yield* $(
        query((db) =>
          db
            .select({ id: promoCodeCategories.categoryId })
            .from(promoCodeCategories)
            .where(eq(promoCodeCategories.promoCodeId, base.id))
        )
      );
      applicableCats = catsResult.map((c) => c.id);
    }
    return {
      ...base,
      discountValue: Number.parseFloat(base.discountValue),
      minPurchaseAmount: base.minPurchaseAmount
        ? Number.parseFloat(base.minPurchaseAmount)
        : null,
      applicableProductIds: applicablePds,
      applicableCategoryIds: applicableCats,
    };
  });
