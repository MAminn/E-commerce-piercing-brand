import { describe, expect, it } from "vitest";
import {
  addBundleInstance,
  bundleRegularTotal,
  bundleUnitCount,
  newBundleInstanceId,
  parseStoredBundleInstances,
  removeBundleInstance,
  type CartBundleInstance,
} from "../cart-instance";

const validInstance: CartBundleInstance = {
  instanceId: "inst-1",
  campaignId: "camp-1",
  campaignSlug: "build-your-ear-stack",
  campaignTitle: "Build Your Ear Stack",
  requiredQuantity: 6,
  bundlePrice: 480,
  regularTotal: 600,
  offerStacking: "exclusive",
  isRepeatable: false,
  addedAt: "2026-09-17T10:00:00.000Z",
  items: ["A", "B", "C", "D", "E", "F"].map((id) => ({
    productId: id,
    name: `Product ${id}`,
    quantity: 1,
    unitPrice: 100,
    imageUrl: null,
    selectedOptions: {},
    categoryName: null,
    stock: 5,
  })),
};

describe("parseStoredBundleInstances — persistence safety", () => {
  it("returns [] for a legacy browser with no bundles key", () => {
    expect(parseStoredBundleInstances(null)).toEqual([]);
    expect(parseStoredBundleInstances(undefined)).toEqual([]);
  });

  it("returns [] for malformed JSON or a non-array value instead of throwing", () => {
    expect(parseStoredBundleInstances("{not json")).toEqual([]);
    expect(parseStoredBundleInstances('{"instanceId":"x"}')).toEqual([]);
    expect(parseStoredBundleInstances(42)).toEqual([]);
  });

  it("round-trips a valid instance through JSON", () => {
    const parsed = parseStoredBundleInstances(JSON.stringify([validInstance]));
    expect(parsed).toHaveLength(1);
    // Phase 5 added `tierId`; a cart saved before it simply has none, which is
    // exactly what a pre-Phase-5 localStorage entry looks like.
    expect(parsed[0]).toEqual({ ...validInstance, tierId: null });
  });

  it("keeps the server-resolved tier id when one was stored", () => {
    const withTier = { ...validInstance, tierId: "tier-abc" };
    const [parsed] = parseStoredBundleInstances(JSON.stringify([withTier]));
    expect(parsed?.tierId).toBe("tier-abc");
  });

  it("normalises a malformed tier id to null rather than trusting it", () => {
    const [parsed] = parseStoredBundleInstances(JSON.stringify([{ ...validInstance, tierId: 42 }]));
    expect(parsed?.tierId).toBeNull();
  });

  it("drops entries that are missing required fields, keeping the good ones", () => {
    const broken = { ...validInstance, instanceId: "inst-2", items: [] };
    const noPrice = { ...validInstance, instanceId: "inst-3", bundlePrice: "480" };
    const parsed = parseStoredBundleInstances([validInstance, broken, noPrice, "junk", null]);
    expect(parsed.map((b) => b.instanceId)).toEqual(["inst-1"]);
  });

  it("drops an instance whose child is malformed rather than half-loading it", () => {
    const badChild = {
      ...validInstance,
      instanceId: "inst-4",
      items: [...validInstance.items, { productId: "Z", name: "Z", quantity: 0, unitPrice: 10 }],
    };
    expect(parseStoredBundleInstances([badChild])).toEqual([]);
  });

  it("de-duplicates instance ids and defaults unknown offer stacking to exclusive", () => {
    const dup = { ...validInstance, campaignTitle: "Other" };
    const weird = { ...validInstance, instanceId: "inst-5", offerStacking: "everything" };
    const parsed = parseStoredBundleInstances([validInstance, dup, weird]);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]!.campaignTitle).toBe("Build Your Ear Stack");
    expect(parsed[1]!.offerStacking).toBe("exclusive");
  });

  it("recomputes regularTotal from the children when the stored value is missing", () => {
    const { regularTotal: _omit, ...withoutTotal } = validInstance;
    const parsed = parseStoredBundleInstances([withoutTotal]);
    expect(parsed[0]!.regularTotal).toBe(600);
  });
});

describe("helpers", () => {
  it("counts units across children with quantity > 1", () => {
    expect(bundleUnitCount({ items: [{ ...validInstance.items[0]!, quantity: 4 }, { ...validInstance.items[1]!, quantity: 2 }] })).toBe(6);
  });

  it("sums regular value in minor units", () => {
    expect(bundleRegularTotal(Array.from({ length: 6 }, () => ({ unitPrice: 79.99, quantity: 1 })))).toBe(479.94);
  });

  it("generates distinct instance ids", () => {
    const ids = new Set(Array.from({ length: 50 }, () => newBundleInstanceId()));
    expect(ids.size).toBe(50);
  });
});

describe("cart state transitions", () => {
  const other: CartBundleInstance = { ...validInstance, instanceId: "inst-B", campaignId: "camp-2", campaignSlug: "other", campaignTitle: "Other" };

  it("adds one stack to an empty cart", () => {
    const { next, replaced } = addBundleInstance([], validInstance);
    expect(next).toEqual([validInstance]);
    expect(replaced).toBe(false);
  });

  it("keeps two stacks of different campaigns as independent instances", () => {
    const { next } = addBundleInstance([validInstance], other);
    expect(next.map((b) => b.instanceId)).toEqual(["inst-1", "inst-B"]);
  });

  it("non-repeatable: re-adding the same campaign replaces the earlier stack instead of duplicating or merging", () => {
    const rebuilt = { ...validInstance, instanceId: "inst-2", items: validInstance.items.slice(0, 5).concat({ ...validInstance.items[0]!, productId: "G" }) };
    const { next, replaced } = addBundleInstance([validInstance, other], rebuilt);
    expect(replaced).toBe(true);
    expect(next.map((b) => b.instanceId)).toEqual(["inst-B", "inst-2"]);
    expect(next.find((b) => b.instanceId === "inst-2")!.items).toHaveLength(6);
  });

  it("repeatable: adding the same campaign twice yields two distinguishable instances", () => {
    const first = { ...validInstance, isRepeatable: true };
    const second = { ...validInstance, isRepeatable: true, instanceId: "inst-2" };
    const { next, replaced } = addBundleInstance([first], second);
    expect(replaced).toBe(false);
    expect(next.map((b) => b.instanceId)).toEqual(["inst-1", "inst-2"]);
  });

  it("removes exactly one whole stack by instance id, leaving its twin alone", () => {
    const twin = { ...validInstance, isRepeatable: true, instanceId: "inst-2" };
    const next = removeBundleInstance([{ ...validInstance, isRepeatable: true }, twin, other], "inst-1");
    expect(next.map((b) => b.instanceId)).toEqual(["inst-2", "inst-B"]);
  });
});

// ─── Phase 7: variant identity in the cart ────────────────────────────────────

describe("parseStoredBundleInstances — options (Phase 7)", () => {
  it("round-trips selectedOptions and variant-aware unit prices", () => {
    const stored: CartBundleInstance = {
      ...validInstance,
      regularTotal: 355,
      items: [
        { ...validInstance.items[0]!, productId: "A", unitPrice: 120, selectedOptions: { Color: "Gold" } },
        { ...validInstance.items[1]!, productId: "B", unitPrice: 135, selectedOptions: { Size: "Large", Color: "Gold" } },
        { ...validInstance.items[2]!, productId: "C", unitPrice: 100, selectedOptions: {} },
      ],
    };
    const [parsed] = parseStoredBundleInstances(JSON.stringify([stored]));
    expect(parsed?.items.map((i) => [i.productId, i.selectedOptions, i.unitPrice])).toEqual([
      ["A", { Color: "Gold" }, 120],
      ["B", { Size: "Large", Color: "Gold" }, 135],
      ["C", {}, 100],
    ]);
    expect(parsed?.regularTotal).toBe(355);
    expect(bundleRegularTotal(parsed!.items)).toBe(355);
  });

  it("pre-Phase-7 carts with no selectedOptions on simple products still parse", () => {
    const legacy = {
      ...validInstance,
      items: validInstance.items.map(({ selectedOptions: _drop, ...rest }) => rest),
    };
    const [parsed] = parseStoredBundleInstances([legacy]);
    expect(parsed).not.toBeNull();
    expect(parsed?.items).toHaveLength(6);
    expect(parsed?.items.every((i) => Object.keys(i.selectedOptions).length === 0)).toBe(true);
  });

  it("non-string option values are dropped rather than crashing", () => {
    const odd = { ...validInstance, items: [{ ...validInstance.items[0]!, selectedOptions: { Color: "Gold", Size: 8 } }] };
    const [parsed] = parseStoredBundleInstances([odd]);
    expect(parsed?.items[0]?.selectedOptions).toEqual({ Color: "Gold" });
  });
});
