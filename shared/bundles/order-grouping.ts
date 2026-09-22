/**
 * Grouping purchased order lines by their bundle instance — pure, no I/O.
 *
 * An order that contained a bundle stores the bundle TWICE over, on purpose:
 *
 *   • `order_bundle` — one snapshot row per bundle instance, holding the
 *     campaign title/type/slug as they were and, crucially, the money the
 *     shopper was actually charged (`bundleTotal`) plus the regular value the
 *     children would have cost (`regularTotal`).
 *   • `order_item`  — the individual child SKUs, each still a normal order
 *     line carrying the product's REGULAR price, so picking, packing, stock
 *     and edit-order keep treating them like any other item.
 *
 * This module turns those two lists into the shape the admin renders: bundle
 * groups with their children nested, standalone products left alone.
 *
 * ── Two rules that matter ───────────────────────────────────────────────────
 *
 * 1. HISTORY, NOT THE LIVE CAMPAIGN. Everything shown about a bundle comes
 *    from the snapshot. Deleting or editing the campaign afterwards must not
 *    change a past order, so nothing here reads `bundle_campaign`. The
 *    snapshot's `campaignId` may be null (campaign deleted) and the display
 *    still works — it is only ever an optional link.
 *
 * 2. NO DOUBLE COUNTING. A bundle's children carry regular unit prices that
 *    the customer did NOT pay; `bundleTotal` is what they paid. Summing both
 *    would invent revenue. `chargedTotal` below is the only sum this module
 *    offers, and it counts each bundle once at its charged price.
 *
 * Grouping is by `orderBundleId`, i.e. by bundle INSTANCE. Two stacks bought
 * from the same campaign are two snapshots with two ids and stay two groups.
 */

import { fromMinorUnits, toMinorUnits } from "./evaluate";
import { formatSelectedOptionValues, formatSelectedOptions } from "#root/shared/products/options";

// ─── Inputs ───────────────────────────────────────────────────────────────────

/** The `order_bundle` fields the admin display needs. Money arrives as decimal strings. */
export interface OrderBundleSnapshot {
  id: string;
  instanceId: string;
  /** Null once the campaign is deleted — a reference, never a data source. */
  campaignId: string | null;
  campaignSlug: string;
  campaignTitle: string;
  campaignType: "build_your_stack" | "curated_stack";
  /** Which pricing tier was bought. A reference only — never resolved against live data. */
  tierId?: string | null;
  /** Units in one bundle: the purchased tier's quantity, as sold. */
  requiredQuantity: number;
  regularTotal: string;
  bundleTotal: string;
  offerStacking: "exclusive" | "stackable";
}

/** The `order_item` fields grouping needs; callers may carry extra fields through. */
export interface GroupableOrderItem {
  id: string;
  name: string;
  quantity: number;
  price: string;
  discountPrice?: string | null;
  /** Set on bundle children; null/absent on standalone products. */
  orderBundleId?: string | null;
}

// ─── Outputs ──────────────────────────────────────────────────────────────────

export interface StandaloneGroup<I> {
  kind: "item";
  item: I;
}

export interface BundleGroup<I> {
  kind: "bundle";
  bundle: OrderBundleSnapshot;
  /** The child SKUs, in order-item order. Never collapsed into one fake line. */
  items: I[];
  /** Σ child quantities — the units actually shipped for this bundle. */
  unitCount: number;
  /** What the shopper paid for this bundle instance. */
  bundleTotal: number;
  /** Σ regular child prices at purchase, from the snapshot. */
  regularTotal: number;
  /** regularTotal − bundleTotal, as recorded at purchase. Negative is shown truthfully. */
  savings: number;
}

export type OrderLineGroup<I> = StandaloneGroup<I> | BundleGroup<I>;

// ─── Grouping ─────────────────────────────────────────────────────────────────

/**
 * Groups an order's lines for display.
 *
 * Output order follows the order items: a bundle group takes the position of
 * its first child, so a mixed order reads in the sequence it was built
 * (standalone, stack, standalone, stack…). A snapshot whose children have all
 * been removed by an order edit still appears, at the end, with an empty child
 * list — an empty group is a visible anomaly, a silently dropped one is not.
 *
 * A child pointing at a snapshot that is not in `bundles` falls back to being
 * rendered standalone rather than vanishing.
 */
export function groupOrderLines<I extends GroupableOrderItem>(
  items: readonly I[],
  bundles: readonly OrderBundleSnapshot[],
): OrderLineGroup<I>[] {
  const byId = new Map(bundles.map((b) => [b.id, b]));

  // Pass 1 — collect each instance's children and remember where its first
  // child appeared, so the group can take that slot.
  const children = new Map<string, I[]>();
  const slots: ({ kind: "item"; item: I } | { kind: "bundle"; bundle: OrderBundleSnapshot })[] = [];
  for (const item of items) {
    const bundleId = item.orderBundleId ?? null;
    const snapshot = bundleId === null ? undefined : byId.get(bundleId);
    if (bundleId === null || snapshot === undefined) {
      slots.push({ kind: "item", item });
      continue;
    }
    const existing = children.get(bundleId);
    if (existing) {
      existing.push(item);
      continue;
    }
    children.set(bundleId, [item]);
    slots.push({ kind: "bundle", bundle: snapshot });
  }

  // Pass 2 — materialise, then append any snapshot whose children are all gone.
  const groups: OrderLineGroup<I>[] = slots.map((slot) =>
    slot.kind === "item"
      ? slot
      : makeBundleGroup(slot.bundle, children.get(slot.bundle.id) ?? []),
  );
  for (const snapshot of bundles) {
    if (children.has(snapshot.id)) continue;
    groups.push(makeBundleGroup(snapshot, []));
  }
  return groups;
}

function makeBundleGroup<I extends GroupableOrderItem>(
  bundle: OrderBundleSnapshot,
  items: I[],
): BundleGroup<I> {
  const bundleTotal = Number(bundle.bundleTotal);
  const regularTotal = Number(bundle.regularTotal);
  return {
    kind: "bundle",
    bundle,
    items,
    unitCount: items.reduce((sum, i) => sum + (i.quantity ?? 0), 0),
    bundleTotal,
    regularTotal,
    savings: fromMinorUnits(toMinorUnits(regularTotal) - toMinorUnits(bundleTotal)),
  };
}

// ─── Money ────────────────────────────────────────────────────────────────────

/** A standalone line's charged value: effective unit price × quantity. */
export function standaloneLineTotal(item: GroupableOrderItem): number {
  const price = Number(item.price);
  const discount = item.discountPrice == null ? null : Number(item.discountPrice);
  const unit = discount !== null && discount < price ? discount : price;
  return fromMinorUnits(toMinorUnits(unit) * item.quantity);
}

/**
 * What the grouped lines add up to: standalone lines at their line value plus
 * each bundle ONCE at its charged bundle price. Bundle children are
 * deliberately excluded — they are the same money, listed for fulfilment.
 *
 * This is a display cross-check for the merchandise portion, not the order's
 * authoritative total. Shipping, tax and cart-level offers/promo codes live on
 * the order row, which stays the source of truth for what was charged.
 */
export function chargedMerchandiseTotal<I extends GroupableOrderItem>(
  groups: readonly OrderLineGroup<I>[],
): number {
  let minor = 0;
  for (const g of groups) {
    minor += toMinorUnits(g.kind === "bundle" ? g.bundleTotal : standaloneLineTotal(g.item));
  }
  return fromMinorUnits(minor);
}

/** Units across every group — bundle children included, since they all ship. */
export function totalUnits<I extends GroupableOrderItem>(
  groups: readonly OrderLineGroup<I>[],
): number {
  let units = 0;
  for (const g of groups) {
    units += g.kind === "bundle" ? g.unitCount : (g.item.quantity ?? 0);
  }
  return units;
}

// ─── Labels ───────────────────────────────────────────────────────────────────

/** Admin-facing name of a snapshot's bundle type. */
export function bundleTypeLabel(type: OrderBundleSnapshot["campaignType"]): string {
  return type === "curated_stack" ? "Ready Set" : "Pick Your Set";
}

/**
 * "6-piece tier" — which pricing tier a Build Your Stack order was sold at,
 * taken from the snapshot's own `requiredQuantity`. Nothing here reads the
 * live campaign, so editing or deleting that tier later cannot change what a
 * past order says. Null for curated stacks, which have no tiers.
 */
export function bundleTierLabel(bundle: OrderBundleSnapshot): string | null {
  if (bundle.campaignType === "curated_stack") return null;
  if (!Number.isInteger(bundle.requiredQuantity) || bundle.requiredQuantity < 1) return null;
  return `${bundle.requiredQuantity}-piece tier`;
}

/**
 * Child order items are stored as "Product — Campaign Title" so a flat receipt,
 * packing list or Bosta manifest still says what the line belonged to. Inside a
 * group the campaign title is already the heading, so the suffix is redundant
 * noise; strip it for display only. The stored name is never modified.
 */
export function childDisplayName(name: string, campaignTitle: string): string {
  const suffix = ` — ${campaignTitle}`;
  return name.endsWith(suffix) ? name.slice(0, -suffix.length) : name;
}

/**
 * Phase 7: how an order line reads in the admin — product name on one line,
 * the bought options ("Gold · 8mm") on another. Everything comes from the
 * order line's OWN snapshot: the stored name already carries the label
 * ("Flower Stud (Color: Gold)") and `selectedOptions` is the structured copy
 * written at purchase. Nothing here consults the live product, so renaming or
 * deleting an option later changes nothing about a past order.
 *
 * A pre-Phase-7 line has no `selectedOptions`; its name (label included) is
 * shown untouched.
 */
export function orderLineDisplay(
  name: string,
  selectedOptions: Record<string, string> | null | undefined,
  campaignTitle?: string,
): { name: string; options: string | null } {
  let displayName = campaignTitle ? childDisplayName(name, campaignTitle) : name;
  if (!selectedOptions || Object.keys(selectedOptions).length === 0) return { name: displayName, options: null };
  const label = ` (${formatSelectedOptions(selectedOptions)})`;
  if (displayName.endsWith(label)) displayName = displayName.slice(0, -label.length);
  return { name: displayName, options: formatSelectedOptionValues(selectedOptions) };
}
