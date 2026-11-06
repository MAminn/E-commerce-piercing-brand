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

  it("finds a measure wherever a real name puts it, and leaves the name reading properly", () => {
    expect(splitMeasures("Clicker 10mm – Gold")).toEqual({ title: "Clicker – Gold", measures: ["10 mm"] });
    expect(splitMeasures("Crystal Hoop – 8mm – Gold")).toEqual({ title: "Crystal Hoop – Gold", measures: ["8 mm"] });
    expect(splitMeasures("Crystal Hoop – Gold 8mm")).toEqual({ title: "Crystal Hoop – Gold", measures: ["8 mm"] });
    expect(splitMeasures("Crystal Hoop – 8mm")).toEqual({ title: "Crystal Hoop", measures: ["8 mm"] });
    expect(splitMeasures("8mm Crystal Hoop – Gold")).toEqual({ title: "Crystal Hoop – Gold", measures: ["8 mm"] });
    expect(splitMeasures("Labret 16g 8mm – Silver")).toEqual({ title: "Labret – Silver", measures: ["16G", "8 mm"] });
    expect(splitMeasures("Nose Stud (1.2mm) – Gold")).toEqual({ title: "Nose Stud – Gold", measures: ["1.2 mm"] });
    expect(splitMeasures("Labret (16g, 8mm)")).toEqual({ title: "Labret", measures: ["16G", "8 mm"] });
    expect(splitMeasures("Ring, 18 gauge – Gold")).toEqual({ title: "Ring – Gold", measures: ["18G"] });
    expect(splitMeasures("Hoop 8MM")).toEqual({ title: "Hoop", measures: ["8 mm"] });
  });

  it("leaves real names with no measure exactly as stored", () => {
    for (const name of [
      "Nose stud L-bend",
      "QA Piece 01 Titanium Stud",
      "Ring 3",
      // From the real catalogue:
      "Emerald Snake Piercing – Gold",
      "Crystal Crown Arc Piercing – Gold",
      "Four-Prong Crystal Solitaire Labret Piercing – Gold",
      "Crystal Chain-Link Fake Ear Cuff – Gold Plated",
      "Blue Crystal Chain Huggie Earring Set – Gold (3 Pieces)",
      "Butterfly & Bow Charm Huggie Earring Set – Gold (3 Pieces)",
    ]) {
      expect(splitMeasures(name)).toEqual({ title: name, measures: [] });
    }
  });

  it("does not mistake other numbers for measures — nothing is invented", () => {
    for (const name of [
      "Ring 3g", // a weight, not a gauge
      "18k Gold Hoop",
      "925 Silver Stud",
      "Plate 10 x 8 mm",
      "Plate 10x8mm",
      "Hoop 8-10mm",
      "Model 8mmX",
    ]) {
      expect(splitMeasures(name)).toEqual({ title: name, measures: [] });
    }
  });

  it("never empties a name that is only a measure", () => {
    expect(splitMeasures("10mm")).toEqual({ title: "10mm", measures: [] });
    expect(splitMeasures("– 10mm –")).toEqual({ title: "– 10mm –", measures: [] });
  });
});

describe("placementLabel", () => {
  it("names a placement by the body part", () => {
    expect(placementLabel("Ear Piercings")).toBe("Ear");
    expect(placementLabel("Nose piercing")).toBe("Nose");
    expect(placementLabel("Daith")).toBe("Daith");
    expect(placementLabel("Piercings")).toBe("Piercings");
    expect(placementLabel("Ear piercings")).toBe("Ear");
    expect(placementLabel("Lip Piercing")).toBe("Lip");
  });

  it('keeps "Fake Piercings" whole: "Fake" is not a place on the body', () => {
    expect(placementLabel("Fake Piercings")).toBe("Fake Piercings");
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
