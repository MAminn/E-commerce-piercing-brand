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
import { eq } from "drizzle-orm";

// Define enum values directly for Zod, matching the Drizzle schema pgEnums
const discountTypes = ["percentage", "fixed_amount"] as const;
const promoCodeStatuses = [
  "active",
  "inactive",
  "expired",
  "exhausted",
  "scheduled",
] as const;

export const createPromoCodeSchema = z
  .object({
    code: z
      .string()
      .min(3, "Code must be at least 3 characters")
      .max(50, "Code can be at most 50 characters")
      .regex(
        /^[a-zA-Z0-9_-]+$/,
        "Code can only contain alphanumeric characters, underscores, and hyphens"
      )
      .transform((val) => val.toUpperCase()), // Convert code to uppercase
    description: z
      .string()
      .max(255, "Description can be at most 255 characters")
      .optional(),
    discountType: z.enum(discountTypes),
    discountValue: z.number().positive("Discount value must be positive"),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
    usageLimit: z
      .number()
      .int()
      .min(0, "Usage limit cannot be negative")
      .optional(), // 0 could mean unlimited if we decide so, or handle null as unlimited
    usageLimitPerUser: z
      .number()
      .int()
      .min(0, "Usage limit per user cannot be negative")
      .optional(),
    minPurchaseAmount: z
      .number()
      .nonnegative("Minimum purchase amount cannot be negative")
      .optional(),
    appliesToAllProducts: z.boolean().default(true),
    applicableProductIds: z.array(z.string().uuid()).optional().default([]),
    applicableCategoryIds: z.array(z.string().uuid()).optional().default([]),
    showOnOffersPage: z.boolean().default(false),
  })
  .refine(
    (data) => {
      if (data.endDate && data.startDate && data.endDate < data.startDate) {
        return false;
      }
      return true;
    },
    {
      message: "End date must be after start date",
      path: ["endDate"],
    }
  )
  .refine(
    (data) => {
      if (
        data.discountType === "percentage" &&
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
  )
  .refine(
    (data) => {
      if (
        !data.appliesToAllProducts &&
        (!data.applicableProductIds ||
          data.applicableProductIds.length === 0) &&
        (!data.applicableCategoryIds || data.applicableCategoryIds.length === 0)
      ) {
        return false;
      }
      return true;
    },
    {
      message:
        "If not applicable to all products, please specify at least one product or category.",
      path: ["appliesToAllProducts"], // Or a more general path
    }
  );

export type CreatePromoCodeInput = z.infer<typeof createPromoCodeSchema>;

export const createPromoCode = (
  input: CreatePromoCodeInput,
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

    const upperCaseCode = input.code; // Already transformed by Zod

    const existingCode = yield* $(
      query(async (db) =>
        db
          .select({ id: promoCode.id })
          .from(promoCode)
          .where(eq(promoCode.code, upperCaseCode))
          .limit(1)
          .then((res) => res[0])
      )
    );

    if (existingCode) {
      return yield* $(
        Effect.fail(
          new ServerError({
            tag: "Conflict",
            statusCode: 409,
            clientMessage: "A promo code with this code already exists.",
          })
        )
      );
    }

    const currentAdmin = yield* $(
      query(async (db) =>
        db
          .select({ id: user.id })
          .from(user)
          .where(eq(user.email, session.email))
          .limit(1)
          .then((res) => res[0])
      )
    );

    if (!currentAdmin) {
      return yield* $(
        Effect.fail(
          new ServerError({
            tag: "NotFound",
            statusCode: 404,
            clientMessage: "Admin user not found.",
          })
        )
      );
    }

    let status: (typeof promoCodeStatuses)[number] = "inactive";
    const now = new Date();
    if (input.startDate) {
      if (input.startDate > now) {
        status = "scheduled";
      } else if (input.endDate && input.endDate < now) {
        status = "expired";
      } else {
        status = "active";
      }
    } else {
      if (input.endDate && input.endDate < now) {
        status = "expired";
      } else {
        status = "active";
      }
    }
    if (
      input.usageLimit === 0 &&
      (status === "active" || status === "scheduled")
    ) {
      status = "exhausted";
    }

    const newPromo = yield* $(
      query(async (db) =>
        db.transaction(async (tx) => {
          const [insertedPromoCode] = await tx
            .insert(promoCode)
            .values({
              ...input,
              code: upperCaseCode,
              discountValue: String(input.discountValue),
              minPurchaseAmount: input.minPurchaseAmount
                ? String(input.minPurchaseAmount)
                : undefined,
              createdBy: currentAdmin.id,
              status: status,
              startDate: input.startDate,
              endDate: input.endDate,
              usageLimit: input.usageLimit,
              usageLimitPerUser: input.usageLimitPerUser,
              appliesToAllProducts: input.appliesToAllProducts,
            })
            .returning();

          if (!insertedPromoCode) {
            throw new Error("Promo code creation failed unexpectedly.");
          }

          if (!input.appliesToAllProducts) {
            if (
              input.applicableProductIds &&
              input.applicableProductIds.length > 0
            ) {
              await tx.insert(promoCodeProducts).values(
                input.applicableProductIds.map((productId) => ({
                  promoCodeId: insertedPromoCode.id,
                  productId: productId,
                }))
              );
            }
            if (
              input.applicableCategoryIds &&
              input.applicableCategoryIds.length > 0
            ) {
              await tx.insert(promoCodeCategories).values(
                input.applicableCategoryIds.map((categoryId) => ({
                  promoCodeId: insertedPromoCode.id,
                  categoryId: categoryId,
                }))
              );
            }
          }
          return insertedPromoCode;
        })
      )
    );
    return newPromo;
  });
