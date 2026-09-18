/**
 * Product options ("variants") — the canonical, framework-free rules.
 *
 * ── The real model ───────────────────────────────────────────────────────────
 *
 * This store has NO per-combination variant rows. A `product_variant` row is
 * an OPTION GROUP on a product — `{ name: "Color", values: [{ value: "Gold",
 * priceModifier: 20 }, …] }` — and a purchasable "variant" is one value picked
 * from every group the product has. Its identity is therefore the canonical
 * map `{ [groupName]: value }`, its price is the product's effective price
 * plus the sum of the chosen values' modifiers, and its stock is the
 * PRODUCT's stock (options never own inventory). A value can be made
 * unavailable store-wide by a preset's `strikethroughValues` (store settings),
 * which a product may lift per value with `enabledOverride: true`.
 *
 * Everything that has to agree about an option — the product page, the
 * bundle builder, cart lines, checkout, order snapshots — goes through this
 * module, so no surface can invent an option combination the catalogue does
 * not sell, price one differently, or trust what a browser labelled it.
 */

// Minor-unit helpers, local so this module depends on nothing (the bundle
// evaluator has its own identical pair).
const toMinorUnits = (amount: number): number => Math.round(amount * 100);
const fromMinorUnits = (minor: number): number => minor / 100;

// ─── Stored shapes ────────────────────────────────────────────────────────────

/** One value of an option group as stored in `product_variant.values`. */
export interface ProductOptionValue {
  value: string;
  /** Added to the product's effective unit price when this value is chosen. */
  priceModifier?: number;
  /** True lifts a store-wide strikethrough for this value on this product only. */
  enabledOverride?: boolean;
}

/** One `product_variant` row: an option group with its values. */
export interface ProductOptionGroup {
  name: string;
  values: readonly ProductOptionValue[];
}

/** `{ Color: "Gold", Size: "8mm" }` — the identity of a chosen configuration. */
export type SelectedOptions = Record<string, string>;

/**
 * Store-wide unavailable values per option-group name (from
 * `store_settings.variant_presets[].strikethroughValues`). Keys are compared
 * case-insensitively, the way the product page matches presets to groups.
 */
export type OptionStrikethroughMap = Readonly<Record<string, readonly string[]>>;

// ─── Purchasable shape ────────────────────────────────────────────────────────

/** A value with its availability already decided — what every consumer works from. */
export interface PurchasableOptionValue {
  value: string;
  priceModifier: number;
  /** False when a store-wide strikethrough applies and the product has not lifted it. */
  available: boolean;
}

export interface PurchasableOptionGroup {
  name: string;
  values: PurchasableOptionValue[];
}

function normalizeModifier(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * Applies the store-wide strikethrough rules to a product's raw option groups.
 * Mirrors the product page exactly: a value is unavailable when its group's
 * preset lists it, unless the product marks that value `enabledOverride`.
 */
export function toPurchasableOptionGroups(
  groups: readonly ProductOptionGroup[],
  strikethrough: OptionStrikethroughMap = {},
): PurchasableOptionGroup[] {
  const struck = new Map<string, Set<string>>();
  for (const [name, values] of Object.entries(strikethrough)) {
    struck.set(name.toLowerCase(), new Set(values));
  }
  return groups.map((group) => {
    const struckValues = struck.get(group.name.toLowerCase());
    return {
      name: group.name,
      values: group.values.map((v) => ({
        value: v.value,
        priceModifier: normalizeModifier(v.priceModifier),
        available: v.enabledOverride === true || !struckValues?.has(v.value),
      })),
    };
  });
}

/**
 * Whether the product needs an option chosen before it can be bought: true
 * as soon as it has ANY option group. A group with no values still counts —
 * the product page cannot add such a product either, so nothing else may.
 */
export function requiresOptionSelection(groups: readonly { values: readonly unknown[] }[]): boolean {
  return groups.length > 0;
}

/**
 * Whether at least one complete configuration can be bought right now: every
 * group has an available value. A product with a group whose values are all
 * struck through (or empty) has NO purchasable configuration and must not be
 * counted as sellable anywhere — not in a builder, not in bundle capacity.
 */
export function hasPurchasableConfiguration(groups: readonly PurchasableOptionGroup[]): boolean {
  return groups.every((group) => group.values.some((v) => v.available));
}

// ─── Resolution ───────────────────────────────────────────────────────────────

export type OptionResolutionFailure =
  /** A group has no chosen value (or the value is blank). */
  | "option_required"
  /** The chosen value is not one of the group's values (renamed, removed, or invented by a client). */
  | "option_not_found"
  /** The value exists but is struck through store-wide for this product. */
  | "option_unavailable";

export type OptionResolution =
  | {
      ok: true;
      /** Canonical: every group of the product, in stored order, keys spelled as the group is. Extra keys the client sent are dropped. */
      selectedOptions: SelectedOptions;
      /** Σ chosen values' modifiers. */
      priceModifier: number;
    }
  | {
      ok: false;
      code: OptionResolutionFailure;
      /** The group that failed, as the merchant named it. */
      optionName: string;
      /** What was asked for, when there was something. */
      value: string | null;
    };

function findSelectedValue(selected: SelectedOptions | null | undefined, groupName: string): string | null {
  if (!selected) return null;
  const exact = selected[groupName];
  if (typeof exact === "string") return exact;
  // The product page keys by the stored group name, but be lenient about
  // case so a "color" key still finds the "Color" group — the VALUE is what
  // must match exactly.
  const lower = groupName.toLowerCase();
  for (const [key, value] of Object.entries(selected)) {
    if (key.toLowerCase() === lower && typeof value === "string") return value;
  }
  return null;
}

/**
 * Turns whatever a client sent into the one configuration the catalogue
 * actually sells, or says precisely why it cannot. The server never trusts
 * the display map it was handed: the returned `selectedOptions` is rebuilt
 * from the product's own groups and values, so a spoofed label, an extra
 * key or a stale value can never reach a cart line, an order or a price.
 *
 * A product with no option groups resolves to `{}` with no modifier, whatever
 * was sent — simple products are untouched by this whole mechanism.
 */
export function resolveSelectedOptions(
  groups: readonly PurchasableOptionGroup[],
  selected: SelectedOptions | null | undefined,
): OptionResolution {
  const canonical: SelectedOptions = {};
  let modifierMinor = 0;
  for (const group of groups) {
    const wanted = findSelectedValue(selected, group.name);
    if (wanted === null || wanted.trim() === "") {
      return { ok: false, code: "option_required", optionName: group.name, value: null };
    }
    const match = group.values.find((v) => v.value === wanted);
    if (!match) return { ok: false, code: "option_not_found", optionName: group.name, value: wanted };
    if (!match.available) return { ok: false, code: "option_unavailable", optionName: group.name, value: wanted };
    canonical[group.name] = match.value;
    modifierMinor += toMinorUnits(match.priceModifier);
  }
  return { ok: true, selectedOptions: canonical, priceModifier: fromMinorUnits(modifierMinor) };
}

/**
 * THE unit price of a purchasable line: the product's effective price (the
 * caller's `discountPrice ?? price`, exactly as the store already prices it)
 * plus the resolved option modifiers, in minor units so 79.99 + 0.01 is exact.
 * Both the normal checkout path and bundle pricing call this — there is no
 * second implementation.
 */
export function resolvePurchasableLinePrice(effectiveBasePrice: number, priceModifier: number): number {
  return fromMinorUnits(toMinorUnits(effectiveBasePrice) + toMinorUnits(priceModifier));
}

// ─── Identity & display ───────────────────────────────────────────────────────

/** Sorted-entry JSON, so `{a,b}` and `{b,a}` are the same configuration. */
export function selectedOptionsKey(selected: SelectedOptions | null | undefined): string {
  if (!selected) return "";
  const entries = Object.entries(selected)
    .filter(([, v]) => typeof v === "string" && v !== "")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return entries.length === 0 ? "" : JSON.stringify(entries);
}

/** A cart-line identity: the product plus its configuration. */
export function productLineKey(productId: string, selected: SelectedOptions | null | undefined): string {
  const key = selectedOptionsKey(selected);
  return key === "" ? productId : `${productId}|${key}`;
}

/** `Color: Gold, Size: 8mm` — the label format the cart, checkout and order names have always used. */
export function formatSelectedOptions(selected: SelectedOptions | null | undefined): string {
  if (!selected) return "";
  return Object.entries(selected)
    .filter(([, v]) => typeof v === "string" && v !== "")
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ");
}

/** `Gold · 8mm` — compact, values only, for tight cart/admin rows. */
export function formatSelectedOptionValues(selected: SelectedOptions | null | undefined): string {
  if (!selected) return "";
  return Object.values(selected)
    .filter((v) => typeof v === "string" && v !== "")
    .join(" · ");
}

/**
 * Inverse of `formatSelectedOptions` for the legacy checkout payload, which
 * sent options as that one string. Best effort: a value containing ", " or
 * ": " cannot round-trip, which is why new clients send the map itself.
 */
export function parseSelectedOptionsLabel(label: string | null | undefined): SelectedOptions {
  const result: SelectedOptions = {};
  if (!label) return result;
  for (const part of label.split(", ")) {
    const index = part.indexOf(": ");
    if (index <= 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 2).trim();
    if (key && value) result[key] = value;
  }
  return result;
}

/** Whatever shape a client sent — the map, the legacy label, or nothing — as a map. */
export function normalizeSelectedOptionsInput(input: SelectedOptions | string | null | undefined): SelectedOptions {
  if (!input) return {};
  if (typeof input === "string") return parseSelectedOptionsLabel(input);
  const result: SelectedOptions = {};
  for (const [k, v] of Object.entries(input)) {
    if (typeof v === "string") result[k] = v;
  }
  return result;
}
