/**
 * Bundle instance — a completed "Build Your Stack" selection living in the
 * cart as ONE logical unit. Shared by CartContext (browser), the checkout
 * payload and the server, so the shape is defined once here.
 *
 * Children keep their real product identity (`productId`, `selectedOptions`)
 * so inventory, fulfilment, analytics and support all stay product-level;
 * the `instanceId` is what groups them and keeps two identical stacks apart.
 */

import type { BundleOfferStacking } from "./evaluate";

export interface CartBundleInstanceItem {
  productId: string;
  name: string;
  quantity: number;
  /** Regular per-unit price the store would otherwise charge (discountPrice ?? price). Display only — the server re-derives it. */
  unitPrice: number;
  imageUrl: string | null;
  selectedOptions: Record<string, string>;
  categoryName?: string | null;
  /** Stock as known when the stack was built; the server re-checks. */
  stock?: number | null;
}

export interface CartBundleInstance {
  /** Client-generated UUID; distinguishes two otherwise identical stacks. */
  instanceId: string;
  campaignId: string;
  campaignSlug: string;
  campaignTitle: string;
  /**
   * Which pricing tier the SERVER matched when the stack was added (Phase 5).
   * Carried for display and support only: checkout re-resolves the tier from
   * the selection's unit count against the live campaign, so a deleted or
   * repriced tier is caught rather than honoured. Null on carts saved before
   * Phase 5 and on curated stacks.
   */
  tierId?: string | null;
  /** Units in this stack — i.e. the matched tier's quantity. */
  requiredQuantity: number;
  /** Bundle total as the server quoted it when the stack was added. Sent back only so the server can detect a price change — never used to price the order. */
  bundlePrice: number;
  /** Σ unitPrice × quantity of the children at add time. */
  regularTotal: number;
  offerStacking: BundleOfferStacking;
  isRepeatable: boolean;
  items: CartBundleInstanceItem[];
  /** ISO timestamp — lets the cart show/sort stacks and helps debugging. */
  addedAt: string;
}

export function bundleUnitCount(bundle: Pick<CartBundleInstance, "items">): number {
  return bundle.items.reduce((sum, item) => sum + item.quantity, 0);
}

export function bundleRegularTotal(items: readonly Pick<CartBundleInstanceItem, "unitPrice" | "quantity">[]): number {
  // Minor-unit sum so 6 × 79.99 doesn't drift.
  const minor = items.reduce((sum, item) => sum + Math.round(item.unitPrice * 100) * item.quantity, 0);
  return minor / 100;
}

// ─── Cart state transitions (pure, so CartContext stays thin and testable) ──

/**
 * Appends a stack to the cart. A non-repeatable campaign holds ONE instance
 * per cart: adding again replaces the earlier stack (the shopper rebuilt it)
 * rather than merging children or silently keeping both. Repeatable
 * campaigns simply get another independent instance.
 */
export function addBundleInstance(
  bundles: readonly CartBundleInstance[],
  instance: CartBundleInstance,
): { next: CartBundleInstance[]; replaced: boolean } {
  if (instance.isRepeatable) return { next: [...bundles, instance], replaced: false };
  const kept = bundles.filter((b) => b.campaignId !== instance.campaignId);
  return { next: [...kept, instance], replaced: kept.length !== bundles.length };
}

export function removeBundleInstance(
  bundles: readonly CartBundleInstance[],
  instanceId: string,
): CartBundleInstance[] {
  return bundles.filter((b) => b.instanceId !== instanceId);
}

// ─── Persistence normalisation ────────────────────────────────────────────────

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.length > 0;

const isPositiveInt = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0;

const isMoney = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

function parseItem(raw: unknown): CartBundleInstanceItem | null {
  if (!isRecord(raw)) return null;
  if (!isNonEmptyString(raw.productId) || !isNonEmptyString(raw.name)) return null;
  if (!isPositiveInt(raw.quantity) || !isMoney(raw.unitPrice)) return null;
  const selectedOptions: Record<string, string> = {};
  if (isRecord(raw.selectedOptions)) {
    for (const [key, value] of Object.entries(raw.selectedOptions)) {
      if (typeof value === "string") selectedOptions[key] = value;
    }
  }
  return {
    productId: raw.productId,
    name: raw.name,
    quantity: raw.quantity,
    unitPrice: raw.unitPrice,
    imageUrl: typeof raw.imageUrl === "string" ? raw.imageUrl : null,
    selectedOptions,
    categoryName: typeof raw.categoryName === "string" ? raw.categoryName : null,
    stock: typeof raw.stock === "number" ? raw.stock : null,
  };
}

function parseInstance(raw: unknown): CartBundleInstance | null {
  if (!isRecord(raw)) return null;
  if (
    !isNonEmptyString(raw.instanceId) ||
    !isNonEmptyString(raw.campaignId) ||
    !isNonEmptyString(raw.campaignSlug) ||
    !isNonEmptyString(raw.campaignTitle)
  ) {
    return null;
  }
  if (!isPositiveInt(raw.requiredQuantity) || !isMoney(raw.bundlePrice)) return null;
  if (!Array.isArray(raw.items) || raw.items.length === 0) return null;
  const items = raw.items.map(parseItem);
  if (items.some((item) => item === null)) return null;
  const validItems = items as CartBundleInstanceItem[];
  const offerStacking: BundleOfferStacking = raw.offerStacking === "stackable" ? "stackable" : "exclusive";
  return {
    instanceId: raw.instanceId,
    campaignId: raw.campaignId,
    campaignSlug: raw.campaignSlug,
    campaignTitle: raw.campaignTitle,
    tierId: isNonEmptyString(raw.tierId) ? raw.tierId : null,
    requiredQuantity: raw.requiredQuantity,
    bundlePrice: raw.bundlePrice,
    regularTotal: isMoney(raw.regularTotal) ? raw.regularTotal : bundleRegularTotal(validItems),
    offerStacking,
    isRepeatable: raw.isRepeatable === true,
    items: validItems,
    addedAt: typeof raw.addedAt === "string" ? raw.addedAt : new Date(0).toISOString(),
  };
}

/**
 * Turns whatever is in localStorage into a clean list of instances. Anything
 * malformed (pre-Phase-2 carts never had this key; a future shape change; a
 * hand-edited value) is dropped silently rather than crashing the cart.
 * Duplicate instance ids keep the first occurrence.
 */
export function parseStoredBundleInstances(raw: unknown): CartBundleInstance[] {
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: CartBundleInstance[] = [];
  for (const entry of value) {
    const parsed = parseInstance(entry);
    if (!parsed || seen.has(parsed.instanceId)) continue;
    seen.add(parsed.instanceId);
    result.push(parsed);
  }
  return result;
}

/** Cheap unique id for a new instance; falls back when crypto.randomUUID is unavailable (older WebViews). */
export function newBundleInstanceId(): string {
  const cryptoObj = typeof globalThis.crypto !== "undefined" ? globalThis.crypto : undefined;
  if (cryptoObj && typeof cryptoObj.randomUUID === "function") return cryptoObj.randomUUID();
  const hex = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, "0");
  return `${hex()}${hex()}-${hex()}-4${hex().slice(1)}-a${hex().slice(1)}-${hex()}${hex()}${hex()}`;
}
