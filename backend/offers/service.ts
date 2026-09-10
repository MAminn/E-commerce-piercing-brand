import { query } from "#root/shared/database/drizzle/db";
import {
  cartOffer,
  type CartOfferRow,
  type OfferCondition,
  type OfferReward,
} from "#root/shared/database/drizzle/schema";
import { ServerError } from "#root/shared/error/server";
import { and, asc, eq, isNull, lte, gte, or } from "drizzle-orm";
import { Effect } from "effect";
import { z } from "zod";

// ─── Input schemas ────────────────────────────────────────────────────────────

const CartItemInputSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  quantity: z.number().int().min(1),
  /** Effective price (after any per-product discount) in the store's currency */
  price: z.number().nonnegative(),
  categoryIds: z.array(z.string()).optional(),
});

export type CartItemInput = z.infer<typeof CartItemInputSchema>;

export const evaluateOffersSchema = z.object({
  cartItems: z.array(CartItemInputSchema),
  subtotal: z.number().nonnegative(),
});

export type EvaluateOffersInput = z.infer<typeof evaluateOffersSchema>;

// ─── Offer CRUD schemas ───────────────────────────────────────────────────────

const conditionSchema: z.ZodType<OfferCondition> = z.discriminatedUnion("type", [
  z.object({ type: z.literal("always") }),
  z.object({
    type: z.literal("quantity_threshold"),
    minQuantity: z.number().int().min(1),
    productIds: z.array(z.string().uuid()).optional(),
    categoryIds: z.array(z.string().uuid()).optional(),
    repeatsPerMultiple: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("cart_total"),
    minTotal: z.number().positive(),
  }),
  z.object({
    type: z.literal("product_bundle"),
    requiredProductIds: z.array(z.string().uuid()).min(2),
  }),
]);

const rewardSchema: z.ZodType<OfferReward> = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("percentage_off"),
    percentOff: z.number().min(1).max(100),
  }),
  z.object({
    type: z.literal("fixed_off"),
    amountOff: z.number().positive(),
  }),
  z.object({ type: z.literal("free_shipping") }),
  z.object({
    type: z.literal("free_items"),
    quantity: z.number().int().min(1),
    which: z.enum(["cheapest", "most_expensive"]),
  }),
]);

export const createOfferSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(500).optional(),
  isActive: z.boolean().default(true),
  priority: z.number().int().min(0).default(0),
  isExclusive: z.boolean().default(false),
  condition: conditionSchema,
  reward: rewardSchema,
  startsAt: z.coerce.date().optional(),
  endsAt: z.coerce.date().optional(),
});

export type CreateOfferInput = z.infer<typeof createOfferSchema>;

export const updateOfferSchema = createOfferSchema.partial().extend({
  id: z.string().uuid(),
});

export type UpdateOfferInput = z.infer<typeof updateOfferSchema>;

// ─── Applied offer result ─────────────────────────────────────────────────────

export interface AppliedOffer {
  id: string;
  name: string;
  description: string | null;
  reward: OfferReward;
  /** Amount deducted from the cart total (0 for free_shipping) */
  discountAmount: number;
  /** True when reward includes free shipping */
  freeShipping: boolean;
  /** Human-readable summary shown in cart e.g. "Buy 3 Get 1 Free" */
  label: string;
}

// ─── Evaluation logic (pure, no Effect) ──────────────────────────────────────

function conditionMet(condition: OfferCondition, cartItems: CartItemInput[], subtotal: number): boolean {
  switch (condition.type) {
    case "always":
      return true;

    case "quantity_threshold": {
      let relevantItems = cartItems;
      if (condition.productIds?.length) {
        relevantItems = cartItems.filter((i) => condition.productIds!.includes(i.id));
      } else if (condition.categoryIds?.length) {
        relevantItems = cartItems.filter((i) =>
          i.categoryIds?.some((c) => condition.categoryIds!.includes(c))
        );
      }
      const totalQty = relevantItems.reduce((s, i) => s + i.quantity, 0);
      return totalQty >= condition.minQuantity;
    }

    case "cart_total":
      return subtotal >= condition.minTotal;

    case "product_bundle": {
      const presentIds = new Set(cartItems.map((i) => i.id));
      return condition.requiredProductIds.every((id) => presentIds.has(id));
    }

    default:
      return false;
  }
}

/**
 * How many times a quantity_threshold condition's own reward should repeat,
 * given the cart. 1 for every other condition type, and for quantity_threshold
 * unless the admin opted into `repeatsPerMultiple` (this is separate from
 * `isExclusive`/offer-vs-offer stacking — see the schema.ts doc comment).
 */
function rewardMultiplier(condition: OfferCondition, cartItems: CartItemInput[]): number {
  if (condition.type !== "quantity_threshold" || !condition.repeatsPerMultiple) return 1;

  let relevantItems = cartItems;
  if (condition.productIds?.length) {
    relevantItems = cartItems.filter((i) => condition.productIds!.includes(i.id));
  } else if (condition.categoryIds?.length) {
    relevantItems = cartItems.filter((i) =>
      i.categoryIds?.some((c) => condition.categoryIds!.includes(c))
    );
  }
  const totalQty = relevantItems.reduce((s, i) => s + i.quantity, 0);
  return Math.max(1, Math.floor(totalQty / condition.minQuantity));
}

/**
 * Returns the reward as actually applied to this cart — identical to the
 * stored reward when multiplier is 1, otherwise scaled so downstream
 * consumers (discount math, free-item badges) see the effective amount
 * without needing to know about repeatsPerMultiple themselves.
 */
function effectiveReward(reward: OfferReward, multiplier: number): OfferReward {
  if (multiplier <= 1) return reward;
  switch (reward.type) {
    case "fixed_off":
      return { ...reward, amountOff: reward.amountOff * multiplier };
    case "free_items":
      return { ...reward, quantity: reward.quantity * multiplier };
    default:
      return reward;
  }
}

function computeDiscount(reward: OfferReward, cartItems: CartItemInput[], subtotal: number): { discountAmount: number; freeShipping: boolean } {
  switch (reward.type) {
    case "percentage_off":
      return { discountAmount: subtotal * (reward.percentOff / 100), freeShipping: false };

    case "fixed_off":
      return { discountAmount: Math.min(reward.amountOff, subtotal), freeShipping: false };

    case "free_shipping":
      return { discountAmount: 0, freeShipping: true };

    case "free_items": {
      const allItems = cartItems.flatMap((i) => Array(i.quantity).fill(i.price) as number[]);
      const sorted = reward.which === "cheapest"
        ? allItems.sort((a, b) => a - b)
        : allItems.sort((a, b) => b - a);
      const freeValue = sorted.slice(0, reward.quantity).reduce((s, p) => s + p, 0);
      return { discountAmount: freeValue, freeShipping: false };
    }

    default:
      return { discountAmount: 0, freeShipping: false };
  }
}

function rewardLabel(reward: OfferReward): string {
  switch (reward.type) {
    case "percentage_off": return `${reward.percentOff}% off`;
    case "fixed_off": return `${reward.amountOff} off`;
    case "free_shipping": return "Free shipping";
    case "free_items": return `${reward.quantity} item${reward.quantity > 1 ? "s" : ""} free`;
    default: return "Discount applied";
  }
}

// ─── Pure evaluation helper (no Effect, usable inside DB transactions) ───────

/**
 * Evaluate which offers apply to the given cart. Accepts pre-fetched offer rows
 * so callers (e.g. order creation) can run this inside an existing transaction
 * without needing to compose Effects.
 */
export function applyOffersToCart(
  offers: CartOfferRow[],
  cartItems: CartItemInput[],
  subtotal: number,
): AppliedOffer[] {
  const applied: AppliedOffer[] = [];
  let exclusiveTriggered = false;

  for (const offer of offers) {
    if (exclusiveTriggered) break;
    const condition = offer.condition as OfferCondition;
    if (!conditionMet(condition, cartItems, subtotal)) continue;

    const multiplier = rewardMultiplier(condition, cartItems);
    const reward = effectiveReward(offer.reward as OfferReward, multiplier);
    const { discountAmount, freeShipping } = computeDiscount(reward, cartItems, subtotal);

    applied.push({
      id: offer.id,
      name: offer.name,
      description: offer.description,
      reward,
      discountAmount,
      freeShipping,
      label: rewardLabel(reward),
    });

    if (offer.isExclusive) exclusiveTriggered = true;
  }

  return applied;
}

// ─── Effect services ──────────────────────────────────────────────────────────

/** Returns all active, non-expired offers ordered by priority. */
export const listActiveOffers = () =>
  Effect.gen(function* ($) {
    const now = new Date();
    const offers = yield* $(
      query((db) =>
        db
          .select()
          .from(cartOffer)
          .where(
            and(
              eq(cartOffer.isActive, true),
              or(isNull(cartOffer.startsAt), lte(cartOffer.startsAt, now)),
              or(isNull(cartOffer.endsAt), gte(cartOffer.endsAt, now))
            )
          )
          .orderBy(asc(cartOffer.priority))
      )
    );
    return offers;
  });

/** Evaluates which offers apply to the given cart and returns the results. */
export const evaluateOffers = (input: EvaluateOffersInput) =>
  Effect.gen(function* ($) {
    const offers = yield* $(listActiveOffers());
    const applied: AppliedOffer[] = [];
    let exclusiveTriggered = false;

    for (const offer of offers) {
      if (exclusiveTriggered) break;
      const condition = offer.condition as OfferCondition;
      if (!conditionMet(condition, input.cartItems, input.subtotal)) continue;

      const multiplier = rewardMultiplier(condition, input.cartItems);
      const reward = effectiveReward(offer.reward as OfferReward, multiplier);
      const { discountAmount, freeShipping } = computeDiscount(reward, input.cartItems, input.subtotal);

      applied.push({
        id: offer.id,
        name: offer.name,
        description: offer.description,
        reward,
        discountAmount,
        freeShipping,
        label: rewardLabel(reward),
      });

      if (offer.isExclusive) exclusiveTriggered = true;
    }

    return applied;
  });

/** Admin: list all offers (including inactive) */
export const listAllOffers = () =>
  Effect.gen(function* ($) {
    const offers = yield* $(
      query((db) => db.select().from(cartOffer).orderBy(asc(cartOffer.priority)))
    );
    return offers;
  });

/** Admin: create an offer */
export const createOffer = (input: CreateOfferInput) =>
  Effect.gen(function* ($) {
    const [created] = yield* $(
      query((db) =>
        db
          .insert(cartOffer)
          .values({
            name: input.name,
            description: input.description ?? null,
            isActive: input.isActive,
            priority: input.priority,
            isExclusive: input.isExclusive,
            condition: input.condition,
            reward: input.reward,
            startsAt: input.startsAt ?? null,
            endsAt: input.endsAt ?? null,
          })
          .returning()
      )
    );
    if (!created) {
      return yield* $(
        Effect.fail(new ServerError({ tag: "Internal", statusCode: 500, clientMessage: "Failed to create offer" }))
      );
    }
    return created;
  });

/** Admin: update an offer */
export const updateOffer = (input: UpdateOfferInput) =>
  Effect.gen(function* ($) {
    const { id, ...rest } = input;
    const [updated] = yield* $(
      query((db) =>
        db
          .update(cartOffer)
          .set({ ...rest, updatedAt: new Date() })
          .where(eq(cartOffer.id, id))
          .returning()
      )
    );
    if (!updated) {
      return yield* $(
        Effect.fail(new ServerError({ tag: "NotFound", statusCode: 404, clientMessage: "Offer not found" }))
      );
    }
    return updated;
  });

/** Admin: delete an offer */
export const deleteOffer = (id: string) =>
  Effect.gen(function* ($) {
    const [deleted] = yield* $(
      query((db) => db.delete(cartOffer).where(eq(cartOffer.id, id)).returning())
    );
    if (!deleted) {
      return yield* $(
        Effect.fail(new ServerError({ tag: "NotFound", statusCode: 404, clientMessage: "Offer not found" }))
      );
    }
    return { success: true };
  });
