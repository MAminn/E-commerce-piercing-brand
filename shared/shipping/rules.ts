import { z } from "zod";
import { GOVERNORATE_CODES, type GovernorateCode } from "./egypt-governorates";

/**
 * Merchant-configured shipping rules, stored as `store_settings.shipping_rules`.
 *
 * Two modes:
 *   "flat"  — every order pays `store_settings.shipping_fee` (the pre-existing
 *             column), regardless of destination. A NULL `shipping_rules`
 *             column means exactly this, so deployments that never touch the
 *             new admin card keep their old behaviour byte for byte.
 *   "zones" — the fee comes from `rates[governorateCode]`; a governorate with
 *             no entry falls back to `fallbackFee`; `fallbackFee: null` means
 *             an unlisted governorate cannot be delivered to. The flat
 *             `shipping_fee` column is NOT consulted in this mode — a stale
 *             flat value must never become a hidden fallback.
 *
 * Per-governorate entry semantics:
 *   number  — the rate for that governorate
 *   null    — explicitly unavailable (even if a fallback is set)
 *   absent  — use `fallbackFee`
 *
 * EGP only. Shipping carries no FX logic.
 */
export const SHIPPING_CURRENCY = "EGP" as const;

/** Sanity ceiling so a typo like 60000 cannot be saved as a rate. */
export const MAX_SHIPPING_FEE = 10_000;

const feeSchema = z
  .number()
  .finite()
  .min(0)
  .max(MAX_SHIPPING_FEE)
  .refine((n) => Math.round(n * 100) === n * 100, {
    message: "Fees are whole piasters — at most two decimal places",
  });

export const shippingModeSchema = z.enum(["flat", "zones"]);
export type ShippingMode = z.infer<typeof shippingModeSchema>;

export const governorateCodeSchema = z.enum(GOVERNORATE_CODES);

export const shippingRulesConfigSchema = z.object({
  version: z.literal(1),
  mode: shippingModeSchema,
  currency: z.literal(SHIPPING_CURRENCY),
  rates: z.record(governorateCodeSchema, feeSchema.nullable()),
  fallbackFee: feeSchema.nullable(),
});

export type ShippingRulesConfig = z.infer<typeof shippingRulesConfigSchema>;

/** What a NULL `shipping_rules` column resolves to: the legacy flat behaviour. */
export const DEFAULT_SHIPPING_RULES: ShippingRulesConfig = {
  version: 1,
  mode: "flat",
  currency: SHIPPING_CURRENCY,
  rates: {},
  fallbackFee: null,
};

/** Parses whatever is in the jsonb column; anything unreadable is treated as "not configured" (flat). */
export function parseShippingRules(raw: unknown): ShippingRulesConfig {
  if (!raw || typeof raw !== "object") return DEFAULT_SHIPPING_RULES;
  const parsed = shippingRulesConfigSchema.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_SHIPPING_RULES;
}

export function countConfiguredRates(rules: ShippingRulesConfig): number {
  return Object.values(rules.rates).filter((v) => typeof v === "number").length;
}

/**
 * Business validation on top of the shape check. Returns a human-readable
 * problem or null. Shared so the admin form and the mutation refuse the same
 * configurations with the same wording.
 */
export function validateShippingRules(rules: ShippingRulesConfig): string | null {
  if (rules.mode === "zones") {
    if (countConfiguredRates(rules) === 0 && rules.fallbackFee === null) {
      return "Zone shipping needs at least one governorate rate or a fee for other governorates — otherwise no order could be placed.";
    }
  }
  return null;
}

/** How a governorate resolves under a zones config. Pure; used by the provider and its tests. */
export type ZoneRateResolution =
  | { kind: "governorate_rate"; fee: number }
  | { kind: "fallback"; fee: number }
  | { kind: "unavailable"; reason: "governorate_unavailable" | "no_fallback" };

export function resolveZoneRate(
  rules: ShippingRulesConfig,
  governorateCode: GovernorateCode,
): ZoneRateResolution {
  const entry = rules.rates[governorateCode];
  if (typeof entry === "number") return { kind: "governorate_rate", fee: entry };
  if (entry === null) return { kind: "unavailable", reason: "governorate_unavailable" };
  if (rules.fallbackFee === null) return { kind: "unavailable", reason: "no_fallback" };
  return { kind: "fallback", fee: rules.fallbackFee };
}
