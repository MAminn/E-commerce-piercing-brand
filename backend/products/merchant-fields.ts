import { z } from "zod";

/**
 * Merchant-only product columns.
 *
 * `internal_code` and `cost_price` exist for the internal inventory/supplier
 * system and for margin reporting we have not built yet. A customer must
 * never see either one — not in a tRPC response, not in the SSR payload, not
 * in a search/category listing, not in cart or order data, not in a pixel
 * event, not in JSON-LD.
 *
 * Two public read paths select the whole `product` row rather than naming
 * columns (`viewProducts` and `getProductById`), so a new column there is
 * public by default. `stripMerchantFields` is what makes them safe, and the
 * list below is the one definition both of them — and the leakage tests —
 * read from. Adding another merchant-only column means adding its key here
 * and nothing else.
 */
export const MERCHANT_ONLY_PRODUCT_FIELDS = [
  "internalCode",
  "costPrice",
] as const;

export type MerchantOnlyProductField =
  (typeof MERCHANT_ONLY_PRODUCT_FIELDS)[number];

/**
 * Returns a copy of `row` with every merchant-only key removed.
 *
 * Deleting the keys rather than setting them to null matters: a `null` still
 * tells a customer the field exists and is empty, and `superjson` would ship
 * it over the wire. The result is typed as "the row minus those keys" so a
 * caller that tries to read `costPrice` off a stripped row fails to compile.
 */
export function stripMerchantFields<T extends object>(
  row: T,
): Omit<T, MerchantOnlyProductField> {
  const copy = { ...row } as Record<string, unknown>;
  for (const key of MERCHANT_ONLY_PRODUCT_FIELDS) {
    delete copy[key];
  }
  return copy as Omit<T, MerchantOnlyProductField>;
}

/** Longest internal code we accept. Codes are short references like FB001. */
export const INTERNAL_CODE_MAX_LENGTH = 64;

/**
 * Canonical form of an admin-entered internal code: surrounding whitespace
 * trimmed and letters upper-cased, so `" fb001 "`, `"fb001"` and `"FB001"`
 * are one code rather than three. An empty or whitespace-only entry is
 * "not entered yet" and normalizes to `null` — never to `""`, which would
 * occupy the unique index and block the next blank product.
 */
export function normalizeInternalCode(
  value: string | null | undefined,
): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim().toUpperCase();
  return trimmed === "" ? null : trimmed;
}

/**
 * Admin input for the internal code. Accepts the raw string the form sends
 * (including `""` for "cleared") and yields the normalized value, so every
 * caller downstream sees `string | null` and never has to re-trim.
 */
export const internalCodeInputSchema = z
  .string()
  .max(
    INTERNAL_CODE_MAX_LENGTH,
    `Internal code must be ${INTERNAL_CODE_MAX_LENGTH} characters or fewer`,
  )
  .nullable()
  .optional()
  // `undefined` is preserved rather than folded into `null`: on the edit
  // contract an absent key means "leave the stored code alone", while an
  // explicit empty string means "clear it". Normalizing undefined to null
  // here would collapse those two into one and let a client that never sends
  // the field wipe it.
  .transform((v) => (v === undefined ? undefined : normalizeInternalCode(v)));

/**
 * Admin input for the unit cost, in EGP.
 *
 * Non-negative and nullable. A blank field arrives as `null` and is STORED as
 * NULL — it is never coerced to 0, because 0 is a genuine cost and the two
 * must stay distinguishable for margin reporting. The upper bound mirrors the
 * `numeric(10,2)` column.
 */
export const costPriceInputSchema = z
  .number()
  .min(0, "Cost cannot be negative")
  .max(99999999.99, "Cost is too large")
  .nullable()
  .optional();

/**
 * Serializes a cost for the `numeric(10,2)` column, preserving the two
 * decimal places the admin typed. `null` stays `null`.
 */
export function costPriceToColumn(
  value: number | null | undefined,
): string | null {
  if (value === null || value === undefined) return null;
  return value.toFixed(2);
}
