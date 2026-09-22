import { describe, expect, it } from "vitest";
import { createOrderSchema } from "../service";

/**
 * Regression coverage for the create-order address contract.
 *
 * `order.shipping_state`, `shipping_postal_code` and `shipping_country` are
 * NOT NULL with no database default, but the input schema used to accept all
 * three as `.optional().nullable()`. A request that omitted them passed
 * validation, entered the order transaction and died on a Postgres not-null
 * violation — a 500 for what is really a malformed request.
 *
 * These tests pin both halves of the fix:
 *
 *   • the keys must be PRESENT, so a bad request is rejected by the schema
 *     (i.e. by tRPC's input parsing, before the resolver and any INSERT);
 *   • state and postal code may still be EMPTY, because this store's checkout
 *     legitimately submits "" for both — the Governorate field is optional and
 *     Egyptian addresses have no postal code. Requiring `.min(1)` there would
 *     reject every real order.
 */

const PRODUCT_ID = "00000000-0000-4000-8000-000000000001";

/** Exactly the shape `pages/checkout/+Page.tsx` builds. */
const checkoutPayload = (overrides: Record<string, unknown> = {}) => ({
  customerName: "Amina Hassan",
  customerEmail: "shopper@example.test",
  customerPhone: "+201000000000",
  shippingAddress: "12 Road 9, Maadi",
  shippingCity: "Cairo",
  shippingState: "Cairo",
  shippingPostalCode: "11511",
  shippingCountry: "Egypt",
  items: [{ productId: PRODUCT_ID, quantity: 1 }],
  bundles: [],
  paymentMethod: "cod" as const,
  ...overrides,
});

/** The issue paths a rejected parse reports. */
const errorPaths = (input: unknown): string[] => {
  const result = createOrderSchema.safeParse(input);
  if (result.success) throw new Error("expected the payload to be rejected");
  return result.error.issues.map((i) => i.path.join("."));
};

describe("createOrderSchema — address fields backed by NOT NULL columns", () => {
  it("accepts a fully populated address", () => {
    expect(createOrderSchema.safeParse(checkoutPayload()).success).toBe(true);
  });

  describe("shippingState", () => {
    it("rejects an omitted value", () => {
      const { shippingState: _omitted, ...withoutState } = checkoutPayload();
      expect(errorPaths(withoutState)).toContain("shippingState");
    });

    it("rejects an explicit null", () => {
      expect(errorPaths(checkoutPayload({ shippingState: null }))).toContain("shippingState");
    });

    it("rejects a non-string", () => {
      expect(errorPaths(checkoutPayload({ shippingState: 11511 }))).toContain("shippingState");
    });

    it("accepts an empty string — the Governorate field is optional in checkout", () => {
      const parsed = createOrderSchema.safeParse(checkoutPayload({ shippingState: "" }));
      expect(parsed.success).toBe(true);
      if (!parsed.success) return;
      expect(parsed.data.shippingState).toBe("");
    });

    it("normalises a whitespace-only value to empty rather than storing spaces", () => {
      const parsed = createOrderSchema.safeParse(checkoutPayload({ shippingState: "   " }));
      expect(parsed.success).toBe(true);
      if (!parsed.success) return;
      expect(parsed.data.shippingState).toBe("");
    });

    it("trims a padded value", () => {
      const parsed = createOrderSchema.safeParse(checkoutPayload({ shippingState: "  Giza  " }));
      expect(parsed.success).toBe(true);
      if (!parsed.success) return;
      expect(parsed.data.shippingState).toBe("Giza");
    });
  });

  describe("shippingPostalCode", () => {
    it("rejects an omitted value", () => {
      const { shippingPostalCode: _omitted, ...withoutPostal } = checkoutPayload();
      expect(errorPaths(withoutPostal)).toContain("shippingPostalCode");
    });

    it("rejects an explicit null", () => {
      expect(errorPaths(checkoutPayload({ shippingPostalCode: null }))).toContain(
        "shippingPostalCode",
      );
    });

    it("accepts an empty string — Egyptian addresses carry no postal code", () => {
      const parsed = createOrderSchema.safeParse(checkoutPayload({ shippingPostalCode: "" }));
      expect(parsed.success).toBe(true);
      if (!parsed.success) return;
      expect(parsed.data.shippingPostalCode).toBe("");
    });

    it("stays a string, so leading zeroes and letters survive", () => {
      const parsed = createOrderSchema.safeParse(checkoutPayload({ shippingPostalCode: "0AB 1CD" }));
      expect(parsed.success).toBe(true);
      if (!parsed.success) return;
      expect(parsed.data.shippingPostalCode).toBe("0AB 1CD");
    });

    it("rejects a numeric postal code rather than coercing it", () => {
      expect(errorPaths(checkoutPayload({ shippingPostalCode: 11511 }))).toContain(
        "shippingPostalCode",
      );
    });

    it("imposes no country-specific format", () => {
      for (const code of ["1", "SW1A 1AA", "100-0001", "İ34000"]) {
        expect(createOrderSchema.safeParse(checkoutPayload({ shippingPostalCode: code })).success).toBe(
          true,
        );
      }
    });
  });

  describe("shippingCountry", () => {
    it("rejects an omitted value", () => {
      const { shippingCountry: _omitted, ...withoutCountry } = checkoutPayload();
      expect(errorPaths(withoutCountry)).toContain("shippingCountry");
    });

    it("rejects an explicit null", () => {
      expect(errorPaths(checkoutPayload({ shippingCountry: null }))).toContain("shippingCountry");
    });

    it("rejects blank and whitespace-only values — a blank country is meaningless", () => {
      expect(errorPaths(checkoutPayload({ shippingCountry: "" }))).toContain("shippingCountry");
      expect(errorPaths(checkoutPayload({ shippingCountry: "   " }))).toContain("shippingCountry");
    });
  });

  describe("the real checkout payload still validates", () => {
    it("accepts what the templates submit when Governorate is left blank", () => {
      // CheckoutPage*Template seeds postalCode "" and country "Egypt", and
      // `+Page.tsx` sends `formValues.state ?? ""`.
      const parsed = createOrderSchema.safeParse(
        checkoutPayload({ shippingState: "", shippingPostalCode: "", shippingCountry: "Egypt" }),
      );
      expect(parsed.success).toBe(true);
    });

    it("leaves shippingDistrict optional — its column has a database default", () => {
      // Absent is fine...
      expect(createOrderSchema.safeParse(checkoutPayload()).success).toBe(true);
      // ...and so is a supplied value or an explicit null.
      expect(createOrderSchema.safeParse(checkoutPayload({ shippingDistrict: "Maadi" })).success).toBe(true);
      expect(createOrderSchema.safeParse(checkoutPayload({ shippingDistrict: null })).success).toBe(true);
    });
  });

  describe("unrelated validation is unchanged", () => {
    it("still requires at least one item or bundle", () => {
      expect(errorPaths(checkoutPayload({ items: [], bundles: [] }))).toContain("items");
    });

    it("still requires a valid email", () => {
      expect(errorPaths(checkoutPayload({ customerEmail: "not-an-email" }))).toContain(
        "customerEmail",
      );
    });

    it("reports every missing address field at once", () => {
      const { shippingState: _s, shippingPostalCode: _p, shippingCountry: _c, ...bare } =
        checkoutPayload();
      const paths = errorPaths(bare);
      expect(paths).toEqual(
        expect.arrayContaining(["shippingState", "shippingPostalCode", "shippingCountry"]),
      );
    });
  });
});

describe("createOrderSchema — destination-based shipping fields", () => {
  it("accepts a canonical governorate code", () => {
    const parsed = createOrderSchema.safeParse(checkoutPayload({ shippingGovernorateCode: "CAI" }));
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.shippingGovernorateCode).toBe("CAI");
  });

  it("rejects an arbitrary governorate NAME — only codes reach pricing", () => {
    expect(errorPaths(checkoutPayload({ shippingGovernorateCode: "Cairo" }))).toContain(
      "shippingGovernorateCode",
    );
    expect(errorPaths(checkoutPayload({ shippingGovernorateCode: "cai" }))).toContain(
      "shippingGovernorateCode",
    );
    expect(errorPaths(checkoutPayload({ shippingGovernorateCode: "ZZZ" }))).toContain(
      "shippingGovernorateCode",
    );
  });

  it("keeps the code optional at the schema level (flat mode / pre-zones clients)", () => {
    expect(createOrderSchema.safeParse(checkoutPayload()).success).toBe(true);
    expect(createOrderSchema.safeParse(checkoutPayload({ shippingGovernorateCode: null })).success).toBe(true);
  });

  it("accepts expectedShippingFee as a non-negative drift assertion only", () => {
    expect(createOrderSchema.safeParse(checkoutPayload({ expectedShippingFee: 60 })).success).toBe(true);
    expect(createOrderSchema.safeParse(checkoutPayload({ expectedShippingFee: 0 })).success).toBe(true);
    expect(errorPaths(checkoutPayload({ expectedShippingFee: -1 }))).toContain("expectedShippingFee");
    expect(errorPaths(checkoutPayload({ expectedShippingFee: "60" }))).toContain("expectedShippingFee");
  });

  it("has no field through which a client could set the shipping amount or total", () => {
    const parsed = createOrderSchema.safeParse(
      checkoutPayload({ shipping: 0, total: 1, shippingFee: 0, grandTotal: 1 }),
    );
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      const data = parsed.data as Record<string, unknown>;
      expect(data).not.toHaveProperty("shipping");
      expect(data).not.toHaveProperty("total");
      expect(data).not.toHaveProperty("shippingFee");
      expect(data).not.toHaveProperty("grandTotal");
    }
  });
});
