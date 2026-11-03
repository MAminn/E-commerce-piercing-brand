import { describe, expect, it } from "vitest";
import { formatCatalogueNo, placementLabel, splitMeasures } from "../index-line";
import { placementChips, placementTree, productPlacement } from "#root/shared/categories/placements";

describe("formatCatalogueNo", () => {
  it("zero-pads to three digits", () => {
    expect(formatCatalogueNo(14)).toBe("014");
    expect(formatCatalogueNo(1)).toBe("001");
    expect(formatCatalogueNo(999)).toBe("999");
  });

  it("omits anything that is not a stored number 1–999 — nothing is invented", () => {
    for (const v of [null, undefined, 0, -3, 1000, 2.5, Number.NaN]) expect(formatCatalogueNo(v)).toBeNull();
  });
});

describe("splitMeasures", () => {
  it("splits trailing millimetre and gauge measures off the stored name", () => {
    expect(splitMeasures("Clicker 10mm")).toEqual({ title: "Clicker", measures: ["10 mm"] });
    expect(splitMeasures("Seamless ring 8 mm")).toEqual({ title: "Seamless ring", measures: ["8 mm"] });
    expect(splitMeasures("Labret 16g 8mm")).toEqual({ title: "Labret", measures: ["16G", "8 mm"] });
    expect(splitMeasures("Hoop 1.2mm")).toEqual({ title: "Hoop", measures: ["1.2 mm"] });
    expect(splitMeasures("Ring 18 gauge")).toEqual({ title: "Ring", measures: ["18G"] });
  });

  it("leaves names without a trailing measure alone", () => {
    for (const name of ["Nose stud L-bend", "QA Piece 01 Titanium Stud", "8mm crystal hoop", "Ring 3"]) {
      expect(splitMeasures(name)).toEqual({ title: name, measures: [] });
    }
  });

  it("never empties a name that is only a measure", () => {
    expect(splitMeasures("10mm")).toEqual({ title: "10mm", measures: [] });
  });
});

describe("placementLabel", () => {
  it("names a placement by the body part", () => {
    expect(placementLabel("Ear Piercings")).toBe("Ear");
    expect(placementLabel("Nose piercing")).toBe("Nose");
    expect(placementLabel("Daith")).toBe("Daith");
    expect(placementLabel("Piercings")).toBe("Piercings");
  });
});

const row = (id: string, name: string, parentId: string | null, sortOrder: number, productCount: number, hidden = false) => ({
  id,
  name,
  slug: name.toLowerCase().replace(/\s+/g, "-"),
  parentId,
  sortOrder,
  hidden,
  productCount,
});
const rows = [
  row("ear", "Ear Piercings", null, 1, 28),
  row("rook", "Rook", "ear", 2, 8),
  row("daith", "Daith", "ear", 1, 7),
  row("flat", "Flat Back", "ear", 3, 0),
  row("conch", "Conch", "ear", 4, 5, true),
  row("generic", "Ear piercing", "ear", 5, 3),
  row("nose", "Nose Piercings", null, 2, 8),
  row("empty", "Lip Piercings", null, 3, 0),
  row("hidden-main", "Tongue Piercings", null, 4, 6, true),
];

describe("placementTree", () => {
  it("lists visible placements with their visible, non-empty, non-generic sub-placements in order", () => {
    const tree = placementTree(rows);
    expect(tree.map((p) => p.label)).toEqual(["Ear", "Nose"]);
    expect(tree[0]!.children.map((c) => [c.label, c.count, c.href])).toEqual([
      ["Daith", 7, "/categories/daith"],
      ["Rook", 8, "/categories/rook"],
    ]);
  });

  it("states a main placement's count only when it has no sub-placements", () => {
    const [ear, nose] = placementTree(rows);
    expect(ear!.count).toBeNull();
    expect(nose!.count).toBe(8);
  });
});

describe("productPlacement", () => {
  it("reads placement first, whichever category is the product's primary one", () => {
    expect(productPlacement({ categoryName: "Rook", categories: [{ id: "ear", name: "Ear Piercings" }] }, rows)).toEqual([
      "Ear",
      "Rook",
    ]);
    expect(productPlacement({ categoryName: "Daith" }, rows)).toEqual(["Ear", "Daith"]);
    expect(productPlacement({ categoryName: "Nose Piercings" }, rows)).toEqual(["Nose"]);
  });

  it("leaves out hidden and generic categories, and falls back to the names without the tree", () => {
    expect(productPlacement({ categoryName: "Conch" }, rows)).toEqual([]);
    expect(productPlacement({ categoryName: "Ear piercing" }, rows)).toEqual(["Ear"]);
    expect(productPlacement({ categoryName: "Rook", categories: [{ id: "x", name: "Ear Piercings" }] }, null)).toEqual([
      "Rook",
      "Ear",
    ]);
  });
});

describe("placementChips", () => {
  const chips = (ref: string | null) =>
    placementChips(rows, ref, "All").map((c) => `${c.active ? "*" : ""}${c.label}`);

  it("/shop: All · Ear · Nose, All active", () => {
    expect(chips(null)).toEqual(["*All", "Ear", "Nose"]);
  });

  it("inside a placement with sub-placements: its own row", () => {
    expect(chips("ear-piercings")).toEqual(["*All", "Daith", "Rook"]);
    expect(chips("daith")).toEqual(["All", "*Daith", "Rook"]);
  });

  it("a placement without sub-placements keeps the main row with itself active", () => {
    expect(chips("nose-piercings")).toEqual(["All", "Ear", "*Nose"]);
  });

  it("links: All goes to /shop on the main row and to the placement inside it", () => {
    expect(placementChips(rows, null, "All")[0]!.href).toBe("/shop");
    expect(placementChips(rows, "daith", "All")[0]!.href).toBe("/categories/ear-piercings");
  });
});
