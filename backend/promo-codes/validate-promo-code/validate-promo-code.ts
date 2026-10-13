import type { ClientSession } from "#root/backend/auth/shared/entities";
import { query } from "#root/shared/database/drizzle/db";
import {
  promoCode,
  product,
  order,
  user,
} from "#root/shared/database/drizzle/schema";
import { ServerError } from "#root/shared/error/server";
import { Effect } from "effect";
import { z } from "zod";
import { and, eq, inArray, count } from "drizzle-orm";
import { formatMoney } from "#root/shared/pricing/format-money";
import {
  checkEligibleQuantity,
  hasQuantityRule,
  percentOfMinor,
  quantityRuleRejection,
  summarizeEligibleUnits,
} from "#root/shared/pricing/eligible-units";
import { loadPromoEligibility, promoQuantityRule } from "../eligibility";

const CartItemSchema = z.object({
  id: z.string().uuid(),
  quantity: z.number().min(1),
  price: z.number().min(0),
  /**
   * True for a unit that is a child of a (stackable) bundle instance rather
   * than an ordinary cart line. A set code (quantity rule) never counts or
   * discounts bundled units — see planPromo in shared/bundles/cart-pricing.ts.
   * Absent on older clients, which never sent bundled units at all.
   */
  bundled: z.boolean().optional(),
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
  freeShipping = false,
) => {
  const discount =
    discountType === "percentage"
      ? `${discountValue}% off`
      : `${formatMoney(discountValue)} off`;
  return freeShipping ? `${discount} + free shipping` : discount;
};

/**
 * Validates a promo code against the current cart.
 *
 * Every rejection path returns a specific, user-facing `clientMessage` so the
 * storefront can tell the shopper exactly why a code didn't work rather than
 * showing a generic "invalid code". Checks, in order: code exists → status →
 * date window → total usage limit → per-user usage limit → cart not empty →
 * minimum purchase → eligible units present → eligible-quantity rule.
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
            clientMessage: `This promo code needs a minimum order of ${formatMoney(minPurchase)} — add ${formatMoney(shortfall)} more to use it.`,
          }),
        ),
      );
    }

    // ── Eligible units ──
    // Eligibility is the code's admin-controlled configuration (all products /
    // listed products / listed categories, minus excluded products), judged
    // per PRODUCT and counted in UNITS. The same loader and the same shared
    // functions decide this at order time.
    const eligibility = yield* $(query((db) => loadPromoEligibility(db, foundPromoCode)));
    const quantityRule = promoQuantityRule(foundPromoCode);
    const isSetCode = hasQuantityRule(quantityRule);
    // A set code counts ordinary lines only; an ordinary code also sees
    // stackable bundle children (planPromo's rule).
    const candidateItems = isSetCode ? cartItems.filter((item) => !item.bundled) : cartItems;
    const candidateIds = [...new Set(candidateItems.map((item) => item.id))];
    const categoriesById = new Map<string, string[]>();
    if (!eligibility.appliesToAllProducts && eligibility.categoryIds.length > 0 && candidateIds.length > 0) {
      const rows = yield* $(
        query((db) =>
          db
            .select({ productId: product.id, categoryId: product.categoryId })
            .from(product)
            .where(inArray(product.id, candidateIds)),
        ),
      );
      for (const row of rows) {
        if (row.categoryId) categoriesById.set(row.productId, [row.categoryId]);
      }
    }
    const summary = summarizeEligibleUnits(
      candidateItems.map((item) => ({
        id: item.id,
        quantity: item.quantity,
        price: item.price,
        categoryIds: categoriesById.get(item.id),
      })),
      eligibility,
    );

    if (summary.units === 0) {
      return yield* $(
        Effect.fail(
          new ServerError({
            tag: "BadRequest",
            statusCode: 400,
            clientMessage:
              isSetCode && cartItems.some((item) => item.bundled)
                ? "This promo code doesn't apply to any of the items in your cart. Pieces already inside a set don't count toward it."
                : "This promo code doesn't apply to any of the items in your cart.",
          }),
        ),
      );
    }

    const quantity = checkEligibleQuantity(quantityRule, summary.units);
    if (!quantity.ok) {
      return yield* $(
        Effect.fail(
          new ServerError({
            tag: "BadRequest",
            statusCode: 400,
            clientMessage: quantityRuleRejection(foundPromoCode.code, quantity),
          }),
        ),
      );
    }

    // ── Valid ──
    const discountType = foundPromoCode.discountType;
    const discountValue = Number(foundPromoCode.discountValue);
    // Preview only, against the submitted prices and before automatic offers:
    // the cart and create-order compute the real figure with
    // computeCartTotals, from server prices at order time.
    const discountMinor =
      discountType === "percentage"
        ? percentOfMinor(summary.subtotalMinor, discountValue)
        : Math.min(Math.round(discountValue * 100), summary.subtotalMinor);
    const eligibleProductIds = [
      ...new Set(summary.lineIndexes.flatMap((index) => candidateItems[index]?.id ?? [])),
    ];

    return {
      id: foundPromoCode.id,
      code: foundPromoCode.code,
      discountType,
      discountValue,
      appliesToAllProducts: foundPromoCode.appliesToAllProducts,
      /** Discount this code produces on the submitted eligible value (before offers). */
      discountAmount: discountMinor / 100,
      /** e.g. "10% off" / "50.00 EGP off" — ready to show to the shopper. */
      discountLabel: describeDiscount(discountType, discountValue, foundPromoCode.freeShipping),
      description: foundPromoCode.description,
      /** A qualifying code also waives the shipping charge of a deliverable destination. */
      freeShipping: foundPromoCode.freeShipping,
      eligibleMinQuantity: quantityRule.minQuantity,
      eligibleMaxQuantity: quantityRule.maxQuantity,
      /**
       * Which of the SUBMITTED cart's products this code counts and
       * discounts, resolved server-side from its products / categories /
       * exclusions. The cart prices with exactly this list and re-validates
       * on every change, so a product added later is judged by the server.
       */
      eligibleProductIds,
      eligibleUnits: summary.units,
    };
  });
