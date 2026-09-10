import type { ClientSession } from "#root/backend/auth/shared/entities";
import { query } from "#root/shared/database/drizzle/db";
import {
  promoCode,
  promoCodeProducts,
  promoCodeCategories,
  product,
  order,
  user,
} from "#root/shared/database/drizzle/schema";
import { ServerError } from "#root/shared/error/server";
import { Effect } from "effect";
import { z } from "zod";
import { and, eq, inArray, count } from "drizzle-orm";

const CartItemSchema = z.object({
  id: z.string().uuid(),
  quantity: z.number().min(1),
  price: z.number().min(0),
});

export const validatePromoCodeSchema = z.object({
  code: z
    .string()
    .transform((val) => val.trim().toUpperCase())
    .pipe(
      z
        .string()
        .min(3, "Promo codes are at least 3 characters long")
        .max(50, "That code is too long to be a valid promo code")
        .regex(
          /^[A-Z0-9_-]+$/,
          "Promo codes only contain letters, numbers, hyphens and underscores",
        ),
    ),
  cartItems: z.array(CartItemSchema).optional(),
  subtotal: z.number().min(0).optional(),
});

export type ValidatePromoCodeInput = z.infer<typeof validatePromoCodeSchema>;

/** Human-readable label for a discount, used in success/summary messaging. */
const describeDiscount = (
  discountType: "percentage" | "fixed_amount",
  discountValue: number,
) =>
  discountType === "percentage"
    ? `${discountValue}% off`
    : `${discountValue.toFixed(2)} EGP off`;

/**
 * Validates a promo code against the current cart.
 *
 * Every rejection path returns a specific, user-facing `clientMessage` so the
 * storefront can tell the shopper exactly why a code didn't work rather than
 * showing a generic "invalid code". Checks, in order: code exists → status →
 * date window → total usage limit → per-user usage limit → cart not empty →
 * minimum purchase → product/category applicability.
 */
export const validatePromoCode = (
  input: ValidatePromoCodeInput,
  session?: ClientSession,
) =>
  Effect.gen(function* ($) {
    const now = new Date();
    const subtotal = input.subtotal ?? 0;
    const cartItems = input.cartItems ?? [];

    // Find the promo code by code
    const foundPromoCode = yield* $(
      query(async (db) =>
        db
          .select()
          .from(promoCode)
          .where(eq(promoCode.code, input.code))
          .limit(1)
          .then((res) => res[0]),
      ),
    );

    if (!foundPromoCode) {
      return yield* $(
        Effect.fail(
          new ServerError({
            tag: "NotFound",
            statusCode: 404,
            clientMessage: `"${input.code}" isn't a valid promo code. Check the spelling and try again.`,
          }),
        ),
      );
    }

    // ── Status ──
    if (
      foundPromoCode.status !== "active" &&
      foundPromoCode.status !== "scheduled"
    ) {
      return yield* $(
        Effect.fail(
          new ServerError({
            tag: "BadRequest",
            statusCode: 400,
            clientMessage:
              foundPromoCode.status === "expired"
                ? "This promo code has expired."
                : foundPromoCode.status === "exhausted"
                  ? "This promo code has reached its usage limit and can no longer be used."
                  : "This promo code isn't active right now.",
          }),
        ),
      );
    }

    // ── Date window ──
    if (foundPromoCode.startDate && foundPromoCode.startDate > now) {
      return yield* $(
        Effect.fail(
          new ServerError({
            tag: "BadRequest",
            statusCode: 400,
            clientMessage: `This promo code isn't active yet — it starts on ${foundPromoCode.startDate.toLocaleDateString()}.`,
          }),
        ),
      );
    }

    if (foundPromoCode.endDate && foundPromoCode.endDate < now) {
      // Auto-update status to expired so admin dashboard reflects reality
      yield* $(
        query((db) =>
          db
            .update(promoCode)
            .set({ status: "expired" })
            .where(eq(promoCode.id, foundPromoCode.id)),
        ),
      );

      return yield* $(
        Effect.fail(
          new ServerError({
            tag: "BadRequest",
            statusCode: 400,
            clientMessage: `This promo code expired on ${foundPromoCode.endDate.toLocaleDateString()}.`,
          }),
        ),
      );
    }

    // ── Total usage limit ──
    if (
      foundPromoCode.usageLimit !== null &&
      foundPromoCode.usedCount >= foundPromoCode.usageLimit
    ) {
      // Keep the dashboard honest about it too.
      yield* $(
        query((db) =>
          db
            .update(promoCode)
            .set({ status: "exhausted" })
            .where(eq(promoCode.id, foundPromoCode.id)),
        ),
      );

      return yield* $(
        Effect.fail(
          new ServerError({
            tag: "BadRequest",
            statusCode: 400,
            clientMessage:
              "This promo code has reached its usage limit and can no longer be used.",
          }),
        ),
      );
    }

    // ── Per-user usage limit ──
    // Enforced by counting the signed-in shopper's previous orders that used
    // this code. Guests can't be identified reliably at this stage, so the
    // per-user cap is re-checked against their email when the order is placed.
    if (session && foundPromoCode.usageLimitPerUser !== null) {
      const timesUsed = yield* $(
        query(async (db) => {
          const userRow = await db
            .select({ id: user.id })
            .from(user)
            .where(eq(user.email, session.email))
            .limit(1)
            .then((res) => res[0]);

          if (!userRow) return 0;

          const result = await db
            .select({ value: count() })
            .from(order)
            .where(
              and(
                eq(order.userId, userRow.id),
                eq(order.promoCodeId, foundPromoCode.id),
              ),
            );

          return Number(result[0]?.value ?? 0);
        }),
      );

      if (timesUsed >= foundPromoCode.usageLimitPerUser) {
        return yield* $(
          Effect.fail(
            new ServerError({
              tag: "BadRequest",
              statusCode: 400,
              clientMessage:
                foundPromoCode.usageLimitPerUser === 1
                  ? "You've already used this promo code."
                  : `You've already used this promo code the maximum of ${foundPromoCode.usageLimitPerUser} times.`,
            }),
          ),
        );
      }
    }

    // ── Cart must have something in it ──
    if (cartItems.length === 0) {
      return yield* $(
        Effect.fail(
          new ServerError({
            tag: "BadRequest",
            statusCode: 400,
            clientMessage:
              "Add something to your cart before applying a promo code.",
          }),
        ),
      );
    }

    // ── Minimum purchase amount ──
    const minPurchase = foundPromoCode.minPurchaseAmount
      ? Number(foundPromoCode.minPurchaseAmount)
      : 0;

    if (minPurchase > 0 && subtotal < minPurchase) {
      const shortfall = minPurchase - subtotal;
      return yield* $(
        Effect.fail(
          new ServerError({
            tag: "BadRequest",
            statusCode: 400,
            clientMessage: `This promo code needs a minimum order of ${minPurchase.toFixed(2)} EGP — add ${shortfall.toFixed(2)} EGP more to use it.`,
          }),
        ),
      );
    }

    // ── Product / category applicability ──
    if (!foundPromoCode.appliesToAllProducts) {
      const cartProductIds = cartItems.map((item) => item.id);

      const applicableProducts = yield* $(
        query((db) =>
          db
            .select({ productId: promoCodeProducts.productId })
            .from(promoCodeProducts)
            .where(
              and(
                eq(promoCodeProducts.promoCodeId, foundPromoCode.id),
                inArray(promoCodeProducts.productId, cartProductIds),
              ),
            ),
        ),
      );

      const productCategories = yield* $(
        query((db) =>
          db
            .select({ productId: product.id, categoryId: product.categoryId })
            .from(product)
            .where(inArray(product.id, cartProductIds)),
        ),
      );

      const categoryIds = productCategories
        .map((pc) => pc.categoryId)
        .filter((id): id is string => id !== null);

      const applicableCategories =
        categoryIds.length > 0
          ? yield* $(
              query((db) =>
                db
                  .select({ categoryId: promoCodeCategories.categoryId })
                  .from(promoCodeCategories)
                  .where(
                    and(
                      eq(promoCodeCategories.promoCodeId, foundPromoCode.id),
                      inArray(promoCodeCategories.categoryId, categoryIds),
                    ),
                  ),
              ),
            )
          : [];

      if (
        applicableProducts.length === 0 &&
        applicableCategories.length === 0
      ) {
        return yield* $(
          Effect.fail(
            new ServerError({
              tag: "BadRequest",
              statusCode: 400,
              clientMessage:
                "This promo code doesn't apply to any of the items in your cart.",
            }),
          ),
        );
      }
    }

    // ── Valid ──
    const discountType = foundPromoCode.discountType;
    const discountValue = Number(foundPromoCode.discountValue);
    const discountAmount =
      discountType === "percentage"
        ? (subtotal * discountValue) / 100
        : Math.min(discountValue, subtotal);

    return {
      id: foundPromoCode.id,
      code: foundPromoCode.code,
      discountType,
      discountValue,
      appliesToAllProducts: foundPromoCode.appliesToAllProducts,
      /** Discount this code produces against the submitted subtotal. */
      discountAmount,
      /** e.g. "10% off" / "50.00 EGP off" — ready to show to the shopper. */
      discountLabel: describeDiscount(discountType, discountValue),
      description: foundPromoCode.description,
    };
  });
