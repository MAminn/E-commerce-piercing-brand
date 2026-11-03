import { describe, expect, it } from "vitest";
import { catalogueNoConflict, catalogueNoInputSchema } from "../catalogue-no";
import { ServerError } from "#root/shared/error/server";

describe("catalogueNoInputSchema", () => {
  it("accepts a whole number 1–999, null (clear) and undefined (leave alone)", () => {
    for (const v of [1, 14, 999, null, undefined]) expect(catalogueNoInputSchema.safeParse(v).success).toBe(true);
    expect(catalogueNoInputSchema.parse(undefined)).toBeUndefined();
    expect(catalogueNoInputSchema.parse(null)).toBeNull();
  });

  it("rejects 0, negatives, fractions and anything over three digits", () => {
    for (const v of [0, -1, 2.5, 1000, "14"]) expect(catalogueNoInputSchema.safeParse(v).success).toBe(false);
  });
});

describe("catalogueNoConflict", () => {
  const clash = { code: "23505", constraint: "product_catalogue_no_idx" };

  it("turns the unique-index race into the admin message", () => {
    const mapped = catalogueNoConflict(clash, 14);
    expect(mapped).toBeInstanceOf(ServerError);
    expect((mapped as { clientMessage?: string }).clientMessage).toContain("014");
  });

  it("passes every other error through untouched", () => {
    const other = { code: "23505", constraint: "product_slug_idx" };
    expect(catalogueNoConflict(other, 14)).toBe(other);
    expect(catalogueNoConflict(clash, null)).toBe(clash);
  });
});
