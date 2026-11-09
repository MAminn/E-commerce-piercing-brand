import { describe, expect, it } from "vitest";
import {
  DEFAULT_UPSELL_SETTINGS,
  normalizeUpsellMode,
  normalizeUpsellSettings,
  type UpsellSettings,
} from "../config";
import {
  pickUpsells,
  resolveUpsells,
  seededOrder,
  upsellPoolSize,
  type UpsellCandidate,
  type UpsellSubject,
} from "../select";

/**
 * The upsell decision rules, shared by the server resolver and the storefront.
 * Everything that decides *what* is recommended is pinned here.
 */

const CAT_SUPPS = "cat-supps";
const CAT_GEAR = "cat-gear";

function c(
  id: string,
  over: Partial<UpsellCandidate> = {},
): UpsellCandidate & { name: string } {
  return { id, name: id, stock: 10, categoryIds: [CAT_SUPPS], ...over };
}

const CATALOGUE = [
  c("whey"),
  c("creatine"),
  c("citrulline"),
  c("carb"),
  c("rice"),
  c("knee-wrap", { categoryIds: [CAT_GEAR] }),
  c("wrist-wrap", { categoryIds: [CAT_GEAR] }),
  c("straps", { categoryIds: [CAT_GEAR] }),
];

const SUBJECT: UpsellSubject = {
  id: "whey",
  mode: "global",
  manualIds: [],
  categoryIds: [CAT_SUPPS],
};

function run(
  over: {
    settings?: Partial<UpsellSettings>;
    product?: Partial<UpsellSubject>;
    candidates?: UpsellCandidate[];
    excludeIds?: string[];
    seed?: string;
    poolSize?: number;
  } = {},
) {
  return resolveUpsells({
    // These cover behaviour once the owner has switched upsells on; the
    // shipped default (off) is pinned in "settings normalisation" below.
    settings: { ...DEFAULT_UPSELL_SETTINGS, enabled: true, ...over.settings },
    product: { ...SUBJECT, ...over.product },
    candidates: over.candidates ?? CATALOGUE,
    excludeIds: over.excludeIds,
    seed: over.seed ?? "seed-1",
    poolSize: over.poolSize ?? 10,
  });
}

const ids = (r: { items: { id: string }[] }) => r.items.map((i) => i.id);

describe("global default (random) mode", () => {
  it("recommends other eligible products, sourced as random", () => {
    const r = run();
    expect(r.source).toBe("random");
    expect(r.items.length).toBe(CATALOGUE.length - 1);
  });

  it("never includes the current product", () => {
    for (const seed of ["a", "b", "c", "d", "e"]) {
      expect(ids(run({ seed }))).not.toContain("whey");
    }
  });

  it("excludes out-of-stock, hidden and deleted products", () => {
    const r = run({
      candidates: [
        ...CATALOGUE.filter((x) => !["carb", "rice", "straps"].includes(x.id)),
        c("carb", { stock: 0 }),
        c("rice", { hidden: true }),
        c("straps", { deleted: true }),
      ],
    });
    expect(ids(r)).not.toContain("carb");
    expect(ids(r)).not.toContain("rice");
    expect(ids(r)).not.toContain("straps");
  });

  it("never returns duplicates, even if the catalogue repeats a row", () => {
    const r = run({ candidates: [...CATALOGUE, ...CATALOGUE] });
    expect(new Set(ids(r)).size).toBe(ids(r).length);
  });

  it("excludes products already in the bag", () => {
    const r = run({ excludeIds: ["creatine", "straps"] });
    expect(ids(r)).not.toContain("creatine");
    expect(ids(r)).not.toContain("straps");
  });

  it("is stable for the same seed and differs across seeds", () => {
    expect(ids(run({ seed: "s1" }))).toEqual(ids(run({ seed: "s1" })));
    const orders = new Set(
      ["s1", "s2", "s3", "s4", "s5", "s6"].map((seed) =>
        ids(run({ seed })).join(","),
      ),
    );
    expect(orders.size).toBeGreaterThan(1);
  });

  it("does not reorder the rest when an item is excluded (replacement moves up)", () => {
    const full = ids(run({ seed: "s9" }));
    const without = ids(run({ seed: "s9", excludeIds: [full[0]!] }));
    expect(without).toEqual(full.slice(1));
  });

  it("is independent of the order the catalogue was loaded in", () => {
    const a = ids(run({ seed: "x" }));
    const b = ids(run({ seed: "x", candidates: [...CATALOGUE].reverse() }));
    expect(a).toEqual(b);
  });

  it("caps at the pool size", () => {
    expect(run({ poolSize: 3 }).items).toHaveLength(3);
  });

  it("applies the other-categories rule", () => {
    const r = run({ settings: { randomPool: "other-categories" } });
    expect(ids(r).sort()).toEqual(["knee-wrap", "straps", "wrist-wrap"]);
  });

  it("applies the same-category rule", () => {
    const r = run({ settings: { randomPool: "same-category" } });
    expect(ids(r).sort()).toEqual(["carb", "citrulline", "creatine", "rice"]);
  });
});

describe("manual mode", () => {
  const manual = { mode: "manual" as const, manualIds: ["straps", "rice", "creatine"] };

  it("overrides random: only the picked products, sourced as manual", () => {
    const r = run({ product: manual });
    expect(r.source).toBe("manual");
    expect(ids(r)).toEqual(["straps", "rice", "creatine"]);
  });

  it("preserves the admin's order regardless of seed or catalogue order", () => {
    for (const seed of ["a", "b", "c"]) {
      expect(
        ids(run({ product: manual, seed, candidates: [...CATALOGUE].reverse() })),
      ).toEqual(["straps", "rice", "creatine"]);
    }
  });

  it("skips unavailable picks without substituting random products", () => {
    const r = run({
      product: manual,
      candidates: CATALOGUE.map((x) => (x.id === "rice" ? c("rice", { stock: 0 }) : x)),
    });
    expect(ids(r)).toEqual(["straps", "creatine"]);
  });

  it("drops duplicates, the current product and missing ids", () => {
    const r = run({
      product: {
        mode: "manual",
        manualIds: ["straps", "whey", "straps", "ghost", "carb"],
      },
    });
    expect(ids(r)).toEqual(["straps", "carb"]);
  });

  it("excludes products already in the bag", () => {
    const r = run({ product: manual, excludeIds: ["rice"] });
    expect(ids(r)).toEqual(["straps", "creatine"]);
  });

  it("returns nothing for an empty manual list", () => {
    const r = run({ product: { mode: "manual", manualIds: [] } });
    expect(r).toEqual({ source: "manual", items: [] });
  });
});

describe("disabled", () => {
  it("returns nothing when the product is disabled", () => {
    expect(run({ product: { mode: "disabled" } })).toEqual({
      source: "none",
      items: [],
    });
  });

  it("returns nothing when upsells are off store-wide, whatever the product says", () => {
    for (const mode of ["global", "manual"] as const) {
      expect(
        run({
          settings: { enabled: false },
          product: { mode, manualIds: ["straps"] },
        }).items,
      ).toEqual([]);
    }
  });
});

describe("pickUpsells (storefront narrowing)", () => {
  const pool = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];

  it("keeps server order and takes the limit", () => {
    expect(pickUpsells(pool, [], 2).map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("replaces an already-added item with the next one", () => {
    expect(pickUpsells(pool, ["a"], 2).map((p) => p.id)).toEqual(["b", "c"]);
  });

  it("returns an empty list when everything is excluded", () => {
    expect(pickUpsells(pool, ["a", "b", "c", "d"], 3)).toEqual([]);
  });

  it("drops duplicates", () => {
    expect(
      pickUpsells([...pool, { id: "a" }], [], 10).map((p) => p.id),
    ).toEqual(["a", "b", "c", "d"]);
  });
});

describe("helpers", () => {
  it("seededOrder is a permutation", () => {
    const out = seededOrder(CATALOGUE, "z").map((x) => x.id);
    expect(out.sort()).toEqual(CATALOGUE.map((x) => x.id).sort());
  });

  it("pool size leaves room for replacements", () => {
    expect(upsellPoolSize(3, "global")).toBeGreaterThan(3);
    expect(upsellPoolSize(6, "global")).toBeLessThanOrEqual(18);
    expect(upsellPoolSize(3, "manual")).toBe(24);
  });
});

describe("settings normalisation", () => {
  it("defaults everything for a missing row", () => {
    expect(normalizeUpsellSettings(null)).toEqual(DEFAULT_UPSELL_SETTINGS);
  });

  it("ships OFF: no saved config, an empty config or a partial one without the switch all resolve to disabled", () => {
    expect(DEFAULT_UPSELL_SETTINGS.enabled).toBe(false);
    for (const raw of [null, undefined, {}, { maxItems: 4 }, { productPageEnabled: true, postAddEnabled: true }]) {
      expect(normalizeUpsellSettings(raw).enabled).toBe(false);
    }
  });

  it("with the defaults, the resolver recommends nothing — for any product mode", () => {
    for (const mode of ["global", "manual"] as const) {
      expect(
        resolveUpsells({
          settings: normalizeUpsellSettings(null),
          product: { ...SUBJECT, mode, manualIds: ["straps"] },
          candidates: CATALOGUE,
          seed: "s",
          poolSize: 10,
        }),
      ).toEqual({ source: "none", items: [] });
    }
  });

  it("an explicit enable turns it on", () => {
    expect(normalizeUpsellSettings({ enabled: true }).enabled).toBe(true);
  });

  it("keeps stored values and inherits fields added later", () => {
    expect(normalizeUpsellSettings({ enabled: false, maxItems: 5 })).toEqual({
      ...DEFAULT_UPSELL_SETTINGS,
      enabled: false,
      maxItems: 5,
    });
  });

  it("clamps or discards out-of-range values", () => {
    expect(normalizeUpsellSettings({ maxItems: 99 }).maxItems).toBe(6);
    expect(normalizeUpsellSettings({ maxItems: 0 }).maxItems).toBe(1);
    expect(normalizeUpsellSettings({ randomPool: "bogus" }).randomPool).toBe("any");
    expect(normalizeUpsellSettings({ enabled: "yes" }).enabled).toBe(false);
  });

  it("maps unknown product modes to the global default", () => {
    expect(normalizeUpsellMode(undefined)).toBe("global");
    expect(normalizeUpsellMode("weird")).toBe("global");
    expect(normalizeUpsellMode("manual")).toBe("manual");
  });
});
