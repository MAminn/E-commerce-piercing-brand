import { describe, expect, it } from "vitest";
import {
  buildCategoryTree,
  isGenericSubcategory,
  landingCategories,
  normalizeCategoryName,
  resolveCategoryRef,
  storefrontCategoryNav,
  uniqueSlug,
  visibleToShoppers,
} from "../tree";
import { summarizeCategoryTree } from "../summary";

type Row = {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  sortOrder: number;
  hidden: boolean;
  showOnLanding: boolean;
  productCount: number;
  createdAt: string;
};

let t = 0;
const row = (over: Partial<Row> & Pick<Row, "id" | "name">): Row => ({
  slug: over.name.toLowerCase().replace(/\s+/g, "-"),
  parentId: null,
  sortOrder: 0,
  hidden: false,
  showOnLanding: false,
  productCount: 3,
  createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, t++)).toISOString(),
  ...over,
});

const ear = row({ id: "ear", name: "Ear Piercings", showOnLanding: true });
const nose = row({ id: "nose", name: "Nose Piercings", showOnLanding: true });
const helix = row({ id: "helix", name: "Helix", parentId: "ear", sortOrder: 2 });
const lobe = row({ id: "lobe", name: "Lobe", parentId: "ear", sortOrder: 1 });
const daith = row({ id: "daith", name: "Daith", parentId: "ear", sortOrder: 3, productCount: 0 });
const hoops = row({ id: "hoops", name: "Hoops", parentId: "nose" });
const rows = [helix, nose, daith, ear, lobe, hoops];

describe("buildCategoryTree", () => {
  it("nests subcategories under their main category in admin order", () => {
    const tree = buildCategoryTree(rows);
    expect(tree.map((m) => m.id)).toEqual(["ear", "nose"]);
    expect(tree[0]!.children.map((c) => c.id)).toEqual(["lobe", "helix", "daith"]);
  });

  it("falls back to creation order when positions tie", () => {
    const a = row({ id: "a", name: "A" });
    const b = row({ id: "b", name: "B" });
    expect(buildCategoryTree([b, a]).map((m) => m.id)).toEqual(["a", "b"]);
  });

  it("promotes a subcategory whose parent is missing instead of dropping it", () => {
    const orphan = row({ id: "orphan", name: "Orphan", parentId: "gone" });
    expect(buildCategoryTree([orphan]).map((m) => m.id)).toEqual(["orphan"]);
  });
});

describe("generic subcategories", () => {
  it("treats case, punctuation and plural differences as the same name", () => {
    expect(normalizeCategoryName("Ear piercings")).toBe(normalizeCategoryName("Ear-Piercing"));
    expect(isGenericSubcategory({ name: "Ear piercings" }, { name: "Ear Piercings" })).toBe(true);
    expect(isGenericSubcategory({ name: "Lip Piercing" }, { name: "Lip Piercings" })).toBe(true);
    expect(isGenericSubcategory({ name: "Helix" }, { name: "Ear Piercings" })).toBe(false);
  });
});

describe("resolveCategoryRef", () => {
  it("prefers an exact id, then a main category over a same-slug subcategory", () => {
    const legacy = row({ id: "legacy", name: "Ear piercings", slug: "ear-piercings", parentId: "ear" });
    const withLegacy = [legacy, ...rows];
    expect(resolveCategoryRef(withLegacy, "ear-piercings")?.id).toBe("ear");
    expect(resolveCategoryRef(withLegacy, "legacy")?.id).toBe("legacy");
    expect(resolveCategoryRef(withLegacy, "nope")).toBeUndefined();
  });

  it("decodes URL-encoded slugs", () => {
    const arabic = row({ id: "ar", name: "أقراط", slug: "أقراط" });
    expect(resolveCategoryRef([arabic], encodeURIComponent("أقراط"))?.id).toBe("ar");
  });
});

describe("storefrontCategoryNav", () => {
  it("a main category lists itself plus every subcategory, with non-empty tabs", () => {
    const nav = storefrontCategoryNav(rows, "ear-piercings")!;
    expect(nav.current.id).toBe("ear");
    expect(nav.listingIds.sort()).toEqual(["daith", "ear", "helix", "lobe"].sort());
    // Daith is empty, so it is not offered as a tab.
    expect(nav.tabs.map((t) => t.id)).toEqual(["lobe", "helix"]);
  });

  it("a subcategory lists only itself and keeps its own tab even when empty", () => {
    const nav = storefrontCategoryNav(rows, "daith")!;
    expect(nav.main.id).toBe("ear");
    expect(nav.listingIds).toEqual(["daith"]);
    expect(nav.tabs.map((t) => t.id)).toContain("daith");
  });

  it("never mixes subcategories from another main category", () => {
    const nav = storefrontCategoryNav(rows, "nose-piercings")!;
    expect(nav.tabs.map((t) => t.id)).toEqual(["hoops"]);
  });

  it("hidden subcategories: no tab, page not found, products still in the main listing", () => {
    const hiddenHelix = { ...helix, hidden: true };
    const all = rows.map((r) => (r.id === "helix" ? hiddenHelix : r));
    const nav = storefrontCategoryNav(all, "ear-piercings")!;
    expect(nav.tabs.map((t) => t.id)).toEqual(["lobe"]);
    expect(nav.listingIds).toContain("helix");
    expect(storefrontCategoryNav(all, "helix")).toBeUndefined();
  });

  it("a hidden main category hides its subcategories too", () => {
    const all = rows.map((r) => (r.id === "ear" ? { ...r, hidden: true } : r));
    expect(storefrontCategoryNav(all, "lobe")).toBeUndefined();
    expect(visibleToShoppers(all).map((r) => r.id).sort()).toEqual(["hoops", "nose"]);
  });

  it("does not show a legacy same-name subcategory as a tab", () => {
    const legacy = row({ id: "legacy", name: "Ear piercings", slug: "ear-legacy", parentId: "ear" });
    const nav = storefrontCategoryNav([...rows, legacy], "ear-piercings")!;
    expect(nav.tabs.map((t) => t.id)).not.toContain("legacy");
    expect(nav.listingIds).toContain("legacy");
  });
});

describe("landingCategories", () => {
  it("shows featured categories in tree order, skipping hidden, empty and generic ones", () => {
    const featuredHelix = { ...helix, showOnLanding: true };
    const featuredEmpty = { ...daith, showOnLanding: true };
    const hiddenHoops = { ...hoops, showOnLanding: true, hidden: true };
    const generic = row({ id: "g", name: "Ear piercing", parentId: "ear", showOnLanding: true });
    const out = landingCategories([featuredHelix, featuredEmpty, hiddenHoops, generic, ear, nose, lobe]);
    expect(out.map((r) => r.id)).toEqual(["ear", "helix", "nose"]);
  });

  it("respects the limit", () => {
    const many = Array.from({ length: 12 }, (_, i) => row({ id: `m${i}`, name: `M${i}`, showOnLanding: true }));
    expect(landingCategories(many, 8)).toHaveLength(8);
  });
});

describe("uniqueSlug", () => {
  it("uses the plain slug, then scopes by parent, then numbers", () => {
    expect(uniqueSlug("hoops", new Set())).toBe("hoops");
    expect(uniqueSlug("hoops", new Set(["hoops"]), "nose-piercings")).toBe("nose-piercings-hoops");
    expect(
      uniqueSlug("hoops", new Set(["hoops", "nose-piercings-hoops"]), "nose-piercings"),
    ).toBe("nose-piercings-hoops-2");
  });
});

describe("summarizeCategoryTree", () => {
  it("counts distinct products and the ones still needing a specific subcategory", () => {
    const legacy = row({ id: "legacy", name: "Ear piercings", parentId: "ear" });
    const memberships = [
      // p1: main only → unclassified
      { productId: "p1", categoryId: "ear", productHidden: false },
      // p2: main (FK) + junction duplicate + Helix → classified, counted once
      { productId: "p2", categoryId: "ear", productHidden: false },
      { productId: "p2", categoryId: "ear", productHidden: false },
      { productId: "p2", categoryId: "helix", productHidden: false },
      // p3: only in the legacy catch-all → still unclassified
      { productId: "p3", categoryId: "legacy", productHidden: true },
      // p4: other category entirely
      { productId: "p4", categoryId: "nose", productHidden: false },
    ];
    const [earSummary, noseSummary] = summarizeCategoryTree(
      [ear, nose, helix, legacy],
      memberships,
    );
    expect(earSummary!.productCount).toBe(3);
    expect(earSummary!.visibleProductCount).toBe(2);
    expect(earSummary!.unclassifiedCount).toBe(2);
    expect(earSummary!.children.find((c) => c.id === "helix")?.productCount).toBe(1);
    expect(earSummary!.children.find((c) => c.id === "legacy")?.generic).toBe(true);
    // No specific subcategories → nothing to classify into.
    expect(noseSummary!.unclassifiedCount).toBe(0);
  });
});
