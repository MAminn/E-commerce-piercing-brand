import { describe, expect, it } from "vitest";
import {
  type GroupableOrderItem,
  type OrderBundleSnapshot,
  bundleTypeLabel,
  chargedMerchandiseTotal,
  childDisplayName,
  groupOrderLines,
  orderLineDisplay,
  standaloneLineTotal,
  totalUnits,
} from "../order-grouping";

const snapshot = (overrides: Partial<OrderBundleSnapshot> = {}): OrderBundleSnapshot => ({
  id: "ob-1",
  instanceId: "inst-1",
  campaignId: "camp-1",
  campaignSlug: "build-your-ear-stack",
  campaignTitle: "Build Your Ear Stack",
  campaignType: "build_your_stack",
  requiredQuantity: 6,
  regularTotal: "600.00",
  bundleTotal: "480.00",
  offerStacking: "exclusive",
  ...overrides,
});

const item = (
  id: string,
  overrides: Partial<GroupableOrderItem> = {},
): GroupableOrderItem => ({
  id,
  name: `Product ${id}`,
  quantity: 1,
  price: "100.00",
  discountPrice: null,
  orderBundleId: null,
  ...overrides,
});

const idsOf = (groups: ReturnType<typeof groupOrderLines>) =>
  groups.map((g) => (g.kind === "item" ? g.item.id : `bundle:${g.bundle.id}`));

describe("groupOrderLines — standalone products only", () => {
  it("returns every line as its own group, in order", () => {
    const groups = groupOrderLines([item("a"), item("b")], []);
    expect(idsOf(groups)).toEqual(["a", "b"]);
    expect(groups.every((g) => g.kind === "item")).toBe(true);
  });

  it("handles an empty order", () => {
    expect(groupOrderLines([], [])).toEqual([]);
  });
});

describe("groupOrderLines — one Build Your Stack", () => {
  const bundle = snapshot();
  const items = [
    item("c1", { orderBundleId: "ob-1", name: "Flower Stud — Build Your Ear Stack" }),
    item("c2", { orderBundleId: "ob-1", name: "Mini Hoop — Build Your Ear Stack" }),
  ];

  it("collapses the children under one group", () => {
    const groups = groupOrderLines(items, [bundle]);
    expect(groups).toHaveLength(1);
    const g = groups[0]!;
    expect(g.kind).toBe("bundle");
    if (g.kind !== "bundle") return;
    expect(g.items.map((i) => i.id)).toEqual(["c1", "c2"]);
    expect(g.unitCount).toBe(2);
  });

  it("takes every money figure from the snapshot, not the children", () => {
    const g = groupOrderLines(items, [bundle])[0]!;
    if (g.kind !== "bundle") throw new Error("expected bundle");
    expect(g.bundleTotal).toBe(480);
    expect(g.regularTotal).toBe(600);
    expect(g.savings).toBe(120);
  });

  it("keeps working when the campaign has since been deleted", () => {
    const orphaned = snapshot({ campaignId: null });
    const g = groupOrderLines(items, [orphaned])[0]!;
    if (g.kind !== "bundle") throw new Error("expected bundle");
    expect(g.bundle.campaignTitle).toBe("Build Your Ear Stack");
    expect(g.bundleTotal).toBe(480);
  });

  it("reports a negative saving truthfully rather than clamping it", () => {
    const upsell = snapshot({ regularTotal: "400.00", bundleTotal: "480.00" });
    const g = groupOrderLines(items, [upsell])[0]!;
    if (g.kind !== "bundle") throw new Error("expected bundle");
    expect(g.savings).toBe(-80);
  });
});

describe("groupOrderLines — one Curated Stack", () => {
  const curated = snapshot({
    id: "ob-c",
    campaignType: "curated_stack",
    campaignTitle: "Golden Ear Stack",
    requiredQuantity: 4,
    regularTotal: "700.00",
    bundleTotal: "550.00",
  });

  it("groups the composition and counts multi-unit lines", () => {
    const groups = groupOrderLines(
      [
        item("x1", { orderBundleId: "ob-c", quantity: 1 }),
        item("x2", { orderBundleId: "ob-c", quantity: 1 }),
        item("x3", { orderBundleId: "ob-c", quantity: 2 }),
      ],
      [curated],
    );
    const g = groups[0]!;
    if (g.kind !== "bundle") throw new Error("expected bundle");
    expect(g.unitCount).toBe(4);
    // The stored campaign type is an internal identifier and is deliberately
    // unchanged; only the label an administrator reads was renamed.
    expect(g.bundle.campaignType).toBe("curated_stack");
    expect(bundleTypeLabel(g.bundle.campaignType)).toBe("Ready Set");
    expect(bundleTypeLabel("build_your_stack")).toBe("Pick Your Set");
  });
});

describe("groupOrderLines — bundle instance identity", () => {
  it("keeps two instances of the SAME campaign in separate groups", () => {
    const a = snapshot({ id: "ob-a", instanceId: "inst-a" });
    const b = snapshot({ id: "ob-b", instanceId: "inst-b" });
    const groups = groupOrderLines(
      [
        item("a1", { orderBundleId: "ob-a" }),
        item("a2", { orderBundleId: "ob-a" }),
        item("b1", { orderBundleId: "ob-b" }),
      ],
      [a, b],
    );
    expect(idsOf(groups)).toEqual(["bundle:ob-a", "bundle:ob-b"]);
    const first = groups[0]!;
    const second = groups[1]!;
    if (first.kind !== "bundle" || second.kind !== "bundle") throw new Error("expected bundles");
    expect(first.items).toHaveLength(2);
    expect(second.items).toHaveLength(1);
    expect(first.bundle.instanceId).not.toBe(second.bundle.instanceId);
  });

  it("does not merge instances even when their children interleave", () => {
    const a = snapshot({ id: "ob-a" });
    const b = snapshot({ id: "ob-b" });
    const groups = groupOrderLines(
      [
        item("a1", { orderBundleId: "ob-a" }),
        item("b1", { orderBundleId: "ob-b" }),
        item("a2", { orderBundleId: "ob-a" }),
      ],
      [a, b],
    );
    expect(idsOf(groups)).toEqual(["bundle:ob-a", "bundle:ob-b"]);
    const first = groups[0]!;
    if (first.kind !== "bundle") throw new Error("expected bundle");
    expect(first.items.map((i) => i.id)).toEqual(["a1", "a2"]);
  });
});

describe("groupOrderLines — mixed order (scenario D)", () => {
  const bys1 = snapshot({ id: "ob-1", bundleTotal: "480.00", regularTotal: "600.00" });
  const bys2 = snapshot({ id: "ob-2", bundleTotal: "480.00", regularTotal: "620.00" });
  const curated = snapshot({
    id: "ob-3",
    campaignType: "curated_stack",
    campaignTitle: "Golden Ear Stack",
    bundleTotal: "550.00",
    regularTotal: "700.00",
  });

  const items = [
    item("n1", { price: "150.00" }),
    item("s1", { orderBundleId: "ob-1" }),
    item("s2", { orderBundleId: "ob-1" }),
    item("n2", { price: "90.00", quantity: 2 }),
    item("t1", { orderBundleId: "ob-2" }),
    item("c1", { orderBundleId: "ob-3" }),
  ];

  it("keeps standalone items outside every group and each bundle independent", () => {
    const groups = groupOrderLines(items, [bys1, bys2, curated]);
    expect(idsOf(groups)).toEqual(["n1", "bundle:ob-1", "n2", "bundle:ob-2", "bundle:ob-3"]);
  });

  it("places each group where its first child appeared", () => {
    const groups = groupOrderLines(items, [bys1, bys2, curated]);
    expect(groups[1]!.kind).toBe("bundle");
    expect(groups[2]!.kind).toBe("item");
  });

  it("counts every shipped unit, bundle children included", () => {
    const groups = groupOrderLines(items, [bys1, bys2, curated]);
    // 1 (n1) + 2 (ob-1) + 2 (n2) + 1 (ob-2) + 1 (ob-3)
    expect(totalUnits(groups)).toBe(7);
  });

  it("charges each bundle once and never sums its children on top", () => {
    const groups = groupOrderLines(items, [bys1, bys2, curated]);
    // 150 (n1) + 480 (ob-1) + 180 (n2) + 480 (ob-2) + 550 (ob-3)
    expect(chargedMerchandiseTotal(groups)).toBe(1840);
  });

  it("would be far higher if children were double-counted — guarding the regression", () => {
    const groups = groupOrderLines(items, [bys1, bys2, curated]);
    const naive = items.reduce((sum, i) => sum + standaloneLineTotal(i), 0);
    expect(chargedMerchandiseTotal(groups)).toBeLessThan(naive + 1510);
    expect(chargedMerchandiseTotal(groups)).toBe(1840);
  });
});

describe("groupOrderLines — defensive cases", () => {
  it("renders a child whose snapshot is missing as a standalone line", () => {
    const groups = groupOrderLines([item("x", { orderBundleId: "gone" })], []);
    expect(idsOf(groups)).toEqual(["x"]);
  });

  it("still shows a snapshot whose children were all removed", () => {
    const groups = groupOrderLines([item("n1")], [snapshot()]);
    expect(idsOf(groups)).toEqual(["n1", "bundle:ob-1"]);
    const g = groups[1]!;
    if (g.kind !== "bundle") throw new Error("expected bundle");
    expect(g.items).toEqual([]);
    expect(g.unitCount).toBe(0);
  });
});

describe("standaloneLineTotal", () => {
  it("uses the discount price when it is lower", () => {
    expect(standaloneLineTotal(item("a", { price: "100.00", discountPrice: "80.00", quantity: 2 }))).toBe(160);
  });

  it("ignores a discount price that is not actually lower", () => {
    expect(standaloneLineTotal(item("a", { price: "100.00", discountPrice: "120.00" }))).toBe(100);
  });

  it("does not drift on repeated decimal prices", () => {
    expect(standaloneLineTotal(item("a", { price: "79.99", quantity: 6 }))).toBe(479.94);
  });
});

describe("childDisplayName", () => {
  it("strips the campaign suffix the order line carries", () => {
    expect(childDisplayName("Flower Stud — Build Your Ear Stack", "Build Your Ear Stack")).toBe("Flower Stud");
  });

  it("leaves a name that does not carry the suffix alone", () => {
    expect(childDisplayName("Flower Stud", "Build Your Ear Stack")).toBe("Flower Stud");
  });

  it("does not strip a different campaign's suffix", () => {
    expect(childDisplayName("Flower Stud — Other Stack", "Build Your Ear Stack")).toBe("Flower Stud — Other Stack");
  });
});

// ─── Phase 7: option snapshot on order lines ──────────────────────────────────

describe("orderLineDisplay — reads the line's own snapshot only", () => {
  it("splits a Phase 7 child line into name + options and strips the campaign suffix", () => {
    expect(
      orderLineDisplay("Flower Stud (Color: Gold, Size: 8mm) — Build Your Ear Stack", { Color: "Gold", Size: "8mm" }, "Build Your Ear Stack"),
    ).toEqual({ name: "Flower Stud", options: "Gold · 8mm" });
  });

  it("a standalone Phase 7 line", () => {
    expect(orderLineDisplay("Mini Hoop (Size: 8mm)", { Size: "8mm" })).toEqual({ name: "Mini Hoop", options: "8mm" });
  });

  it("pre-Phase-7 lines (no snapshot) keep their stored name untouched, label included", () => {
    expect(orderLineDisplay("Flower Stud (Color: Gold)", null)).toEqual({ name: "Flower Stud (Color: Gold)", options: null });
    expect(orderLineDisplay("Flower Stud — Stack", undefined, "Stack")).toEqual({ name: "Flower Stud", options: null });
  });

  it("does not depend on the name carrying the label (an edit-order line, say)", () => {
    expect(orderLineDisplay("Flower Stud", { Color: "Gold" })).toEqual({ name: "Flower Stud", options: "Gold" });
  });
});
