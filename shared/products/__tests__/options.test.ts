import { describe, expect, it } from "vitest";
import {
  formatSelectedOptionValues,
  formatSelectedOptions,
  hasPurchasableConfiguration,
  normalizeSelectedOptionsInput,
  parseSelectedOptionsLabel,
  productLineKey,
  requiresOptionSelection,
  resolvePurchasableLinePrice,
  resolveSelectedOptions,
  toPurchasableOptionGroups,
} from "../options";

/**
 * The repository's variant model: `product_variant` rows are OPTION GROUPS
 * (name + values with price modifiers), a "variant" is one value per group,
 * price = effective product price + Σ modifiers, stock is product-level.
 */
const rawGroups = [
  { name: "Color", values: [{ value: "Gold", priceModifier: 20 }, { value: "Silver" }, { value: "Rose", enabledOverride: true }] },
  { name: "Size", values: [{ value: "6mm" }, { value: "8mm", priceModifier: 5.5 }] },
];
const strikethrough = { color: ["Silver", "Rose"] };
const groups = toPurchasableOptionGroups(rawGroups, strikethrough);

describe("toPurchasableOptionGroups — store-wide strikethrough + product override", () => {
  it("marks struck-through values unavailable, case-insensitively by group name", () => {
    const color = groups[0]!;
    expect(color.values.find((v) => v.value === "Gold")?.available).toBe(true);
    expect(color.values.find((v) => v.value === "Silver")?.available).toBe(false);
  });

  it("lets enabledOverride lift the strikethrough for that product only", () => {
    expect(groups[0]!.values.find((v) => v.value === "Rose")?.available).toBe(true);
  });

  it("normalises a missing modifier to 0", () => {
    expect(groups[1]!.values[0]).toEqual({ value: "6mm", priceModifier: 0, available: true });
  });
});

describe("resolveSelectedOptions — the canonical variant resolver", () => {
  it("simple product: no groups → resolves to {} with no modifier whatever the client sent", () => {
    expect(resolveSelectedOptions([], { Color: "Gold" })).toEqual({ ok: true, selectedOptions: {}, priceModifier: 0 });
    expect(resolveSelectedOptions([], undefined)).toEqual({ ok: true, selectedOptions: {}, priceModifier: 0 });
  });

  it("valid variant: canonical map in group order + summed modifiers", () => {
    const r = resolveSelectedOptions(groups, { Size: "8mm", Color: "Gold" });
    expect(r).toEqual({ ok: true, selectedOptions: { Color: "Gold", Size: "8mm" }, priceModifier: 25.5 });
    expect(Object.keys((r as { selectedOptions: object }).selectedOptions)).toEqual(["Color", "Size"]);
  });

  it("drops keys the product does not have — a client cannot invent an option", () => {
    const r = resolveSelectedOptions(groups, { Color: "Gold", Size: "6mm", Engraving: "ZELI" });
    expect(r.ok && r.selectedOptions).toEqual({ Color: "Gold", Size: "6mm" });
  });

  it("missing group → option_required naming the group", () => {
    expect(resolveSelectedOptions(groups, { Color: "Gold" })).toEqual({
      ok: false,
      code: "option_required",
      optionName: "Size",
      value: null,
    });
    expect(resolveSelectedOptions(groups, { Color: "Gold", Size: "  " })).toMatchObject({ code: "option_required" });
  });

  it("unknown value (deleted/renamed/invented) → option_not_found", () => {
    expect(resolveSelectedOptions(groups, { Color: "Platinum", Size: "6mm" })).toEqual({
      ok: false,
      code: "option_not_found",
      optionName: "Color",
      value: "Platinum",
    });
  });

  it("struck-through value → option_unavailable", () => {
    expect(resolveSelectedOptions(groups, { Color: "Silver", Size: "6mm" })).toMatchObject({
      ok: false,
      code: "option_unavailable",
      value: "Silver",
    });
  });

  it("values match exactly; keys are lenient about case", () => {
    expect(resolveSelectedOptions(groups, { color: "Gold", size: "6mm" }).ok).toBe(true);
    expect(resolveSelectedOptions(groups, { Color: "gold", Size: "6mm" })).toMatchObject({ code: "option_not_found" });
  });

  it("a group with no values can never resolve", () => {
    const empty = toPurchasableOptionGroups([{ name: "Color", values: [] }]);
    expect(resolveSelectedOptions(empty, { Color: "Gold" })).toMatchObject({ code: "option_not_found" });
    expect(hasPurchasableConfiguration(empty)).toBe(false);
  });
});

describe("purchasability", () => {
  it("requiresOptionSelection is true as soon as a group exists", () => {
    expect(requiresOptionSelection([])).toBe(false);
    expect(requiresOptionSelection(groups)).toBe(true);
  });

  it("hasPurchasableConfiguration needs an available value in EVERY group", () => {
    expect(hasPurchasableConfiguration(groups)).toBe(true);
    const allStruck = toPurchasableOptionGroups(rawGroups, { color: ["Gold", "Silver"], size: [] });
    // Rose is overridden → still purchasable
    expect(hasPurchasableConfiguration(allStruck)).toBe(true);
    const dead = toPurchasableOptionGroups([{ name: "Color", values: [{ value: "Gold" }] }], { Color: ["Gold"] });
    expect(hasPurchasableConfiguration(dead)).toBe(false);
  });
});

describe("resolvePurchasableLinePrice — minor-unit exact", () => {
  it("adds the modifier without float drift", () => {
    expect(resolvePurchasableLinePrice(79.99, 0.01)).toBe(80);
    expect(resolvePurchasableLinePrice(60, 25.5)).toBe(85.5);
    expect(resolvePurchasableLinePrice(60, 0)).toBe(60);
  });
});

describe("identity & display", () => {
  it("productLineKey is order-independent and empty for a simple product", () => {
    expect(productLineKey("p1", { Size: "8mm", Color: "Gold" })).toBe(productLineKey("p1", { Color: "Gold", Size: "8mm" }));
    expect(productLineKey("p1", {})).toBe("p1");
    expect(productLineKey("p1", null)).toBe("p1");
    expect(productLineKey("p1", { Color: "Gold" })).not.toBe(productLineKey("p1", { Color: "Silver" }));
  });

  it("formats the cart/order label and the compact values line", () => {
    expect(formatSelectedOptions({ Color: "Gold", Size: "8mm" })).toBe("Color: Gold, Size: 8mm");
    expect(formatSelectedOptionValues({ Color: "Gold", Size: "8mm" })).toBe("Gold · 8mm");
    expect(formatSelectedOptions({})).toBe("");
  });

  it("parses the legacy label back into a map and normalises either input shape", () => {
    expect(parseSelectedOptionsLabel("Color: Gold, Size: 8mm")).toEqual({ Color: "Gold", Size: "8mm" });
    expect(parseSelectedOptionsLabel("")).toEqual({});
    expect(normalizeSelectedOptionsInput("Color: Gold")).toEqual({ Color: "Gold" });
    expect(normalizeSelectedOptionsInput({ Color: "Gold", bad: 3 as unknown as string })).toEqual({ Color: "Gold" });
    expect(normalizeSelectedOptionsInput(undefined)).toEqual({});
  });
});
