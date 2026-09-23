import { describe, expect, it } from "vitest";
import {
  MERCHANT_ONLY_PRODUCT_FIELDS,
  costPriceInputSchema,
  costPriceToColumn,
  internalCodeInputSchema,
  normalizeInternalCode,
  stripMerchantFields,
} from "../merchant-fields";

/**
 * Unit-level contract for the two merchant-only product fields.
 *
 * These are the rules the database and the admin UI both lean on:
 * normalization is what makes the unique index meaningful, and the
 * blank-is-NULL rule is what keeps a never-filled-in cost out of future
 * margin reporting.
 */
describe("normalizeInternalCode", () => {
  it("trims surrounding whitespace", () => {
    expect(normalizeInternalCode("  FB001  ")).toBe("FB001");
    expect(normalizeInternalCode("\tER001\n")).toBe("ER001");
  });

  it("upper-cases, so fb001 and FB001 are one code", () => {
    expect(normalizeInternalCode("fb001")).toBe("FB001");
    expect(normalizeInternalCode("Fb001")).toBe("FB001");
  });

  it("trims and upper-cases together", () => {
    expect(normalizeInternalCode(" fb002 ")).toBe("FB002");
  });

  it("treats blank input as 'not entered yet', never as an empty code", () => {
    // An empty string would occupy the unique index and block the next
    // product left blank; NULL is exempt from it.
    expect(normalizeInternalCode("")).toBeNull();
    expect(normalizeInternalCode("   ")).toBeNull();
    expect(normalizeInternalCode(null)).toBeNull();
    expect(normalizeInternalCode(undefined)).toBeNull();
  });

  it("leaves an already-canonical code untouched", () => {
    expect(normalizeInternalCode("FB001")).toBe("FB001");
  });
});

describe("internalCodeInputSchema", () => {
  it("normalizes on parse", () => {
    expect(internalCodeInputSchema.parse("  fb001 ")).toBe("FB001");
  });

  it("maps an explicitly cleared code to null", () => {
    expect(internalCodeInputSchema.parse("")).toBeNull();
    expect(internalCodeInputSchema.parse(null)).toBeNull();
  });

  it("preserves undefined so an omitted key means 'leave alone'", () => {
    // Folding undefined into null here would let a client that never sends
    // the field wipe a stored code on every save.
    expect(internalCodeInputSchema.parse(undefined)).toBeUndefined();
  });

  it("rejects an over-long code", () => {
    expect(internalCodeInputSchema.safeParse("X".repeat(65)).success).toBe(
      false,
    );
    expect(internalCodeInputSchema.safeParse("X".repeat(64)).success).toBe(
      true,
    );
  });
});

describe("costPriceInputSchema", () => {
  it("accepts a non-negative decimal", () => {
    expect(costPriceInputSchema.parse(129.5)).toBe(129.5);
    expect(costPriceInputSchema.parse(0)).toBe(0);
  });

  it("rejects a negative cost", () => {
    const res = costPriceInputSchema.safeParse(-1);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues[0]?.message).toMatch(/negative/i);
    }
  });

  it("rejects a cost wider than the numeric(10,2) column", () => {
    expect(costPriceInputSchema.safeParse(100000000).success).toBe(false);
  });

  it("accepts null for 'not entered yet'", () => {
    expect(costPriceInputSchema.parse(null)).toBeNull();
  });
});

describe("costPriceToColumn", () => {
  it("preserves two decimal places", () => {
    expect(costPriceToColumn(129.5)).toBe("129.50");
    expect(costPriceToColumn(1234.56)).toBe("1234.56");
    expect(costPriceToColumn(0.05)).toBe("0.05");
  });

  it("keeps a genuine zero cost as zero", () => {
    expect(costPriceToColumn(0)).toBe("0.00");
  });

  it("keeps a blank cost NULL rather than defaulting it to 0", () => {
    // The whole point of the nullable column: 0 means "this really costs
    // nothing", null means "nobody has filled it in".
    expect(costPriceToColumn(null)).toBeNull();
    expect(costPriceToColumn(undefined)).toBeNull();
  });
});

describe("stripMerchantFields", () => {
  const row = {
    id: "p1",
    name: "Titanium Labret",
    price: "450.00",
    internalCode: "FB001",
    costPrice: "120.00",
  };

  it("removes the keys outright rather than nulling them", () => {
    const stripped = stripMerchantFields(row);
    // A null would still tell a customer the field exists, and superjson
    // would put it on the wire.
    expect("internalCode" in stripped).toBe(false);
    expect("costPrice" in stripped).toBe(false);
    expect(Object.keys(stripped)).not.toContain("internalCode");
    expect(Object.keys(stripped)).not.toContain("costPrice");
  });

  it("leaves every other field alone", () => {
    expect(stripMerchantFields(row)).toEqual({
      id: "p1",
      name: "Titanium Labret",
      price: "450.00",
    });
  });

  it("does not mutate the row it was given", () => {
    stripMerchantFields(row);
    expect(row.internalCode).toBe("FB001");
    expect(row.costPrice).toBe("120.00");
  });

  it("is a no-op on a row that never had the fields", () => {
    expect(stripMerchantFields({ id: "p2", name: "Nose Stud" })).toEqual({
      id: "p2",
      name: "Nose Stud",
    });
  });

  it("survives JSON serialization with no trace of the fields", () => {
    const json = JSON.stringify(stripMerchantFields(row));
    expect(json).not.toContain("internalCode");
    expect(json).not.toContain("internal_code");
    expect(json).not.toContain("costPrice");
    expect(json).not.toContain("FB001");
    expect(json).not.toContain("120.00");
  });

  it("covers every field the shared list declares merchant-only", () => {
    // Guards the next column added to MERCHANT_ONLY_PRODUCT_FIELDS: if the
    // list grows, the strip has to grow with it.
    const full = Object.fromEntries(
      MERCHANT_ONLY_PRODUCT_FIELDS.map((f) => [f, "secret"]),
    );
    expect(Object.keys(stripMerchantFields({ ...full, id: "p3" }))).toEqual([
      "id",
    ]);
  });
});
