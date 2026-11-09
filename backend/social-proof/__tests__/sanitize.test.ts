import { describe, expect, it } from "vitest";
import {
  eventKeyForOrder,
  productImageUrl,
  sanitizeDisplayName,
  sanitizeLocation,
  toPublicEvents,
  type RawSocialProofRow,
} from "../sanitize";

const CONFIG = { showLocation: true, locationSource: "city" as const };

function makeRow(overrides: Partial<RawSocialProofRow> = {}): RawSocialProofRow {
  return {
    orderId: "11111111-1111-7111-8111-111111111111",
    customerName: "Ahmed Mohamed Hassan",
    shippingCity: "Cairo",
    shippingState: "Cairo Governorate",
    occurredAt: new Date("2026-09-01T10:00:00.000Z"),
    productId: "22222222-2222-7222-8222-222222222222",
    productSlug: "seamless-ring-8mm",
    productName: "Seamless Ring 8mm",
    productImageDiskname: "whey.jpg",
    ...overrides,
  };
}

describe("sanitizeDisplayName", () => {
  it("reduces a full name to first name plus one initial", () => {
    expect(sanitizeDisplayName("Ahmed Mohamed Hassan")).toBe("Ahmed M.");
  });

  it("returns the first name alone when there is only one usable token", () => {
    expect(sanitizeDisplayName("Ahmed")).toBe("Ahmed");
    expect(sanitizeDisplayName("  Ahmed  ")).toBe("Ahmed");
  });

  it("never returns the full customer name", () => {
    const full = "Ahmed Mohamed Hassan";
    expect(sanitizeDisplayName(full)).not.toBe(full);
    expect(sanitizeDisplayName(full)).not.toContain("Mohamed");
    expect(sanitizeDisplayName(full)).not.toContain("Hassan");
  });

  it("initialises only the second token, dropping the rest entirely", () => {
    // Three initials would identify a person far more narrowly than one.
    expect(sanitizeDisplayName("Mona Adel Badr Fouad")).toBe("Mona A.");
  });

  it("handles non-Latin names without splitting a character", () => {
    expect(sanitizeDisplayName("أحمد محمد")).toBe("أحمد م.");
  });

  it("returns an empty string for a name with no usable tokens", () => {
    expect(sanitizeDisplayName("")).toBe("");
    expect(sanitizeDisplayName("   ")).toBe("");
  });
});

describe("sanitizeLocation", () => {
  it("returns the shipping city when the source is city", () => {
    expect(sanitizeLocation(makeRow(), CONFIG)).toBe("Cairo");
  });

  it("returns the shipping state when the source is governorate", () => {
    expect(
      sanitizeLocation(makeRow(), {
        showLocation: true,
        locationSource: "governorate",
      }),
    ).toBe("Cairo Governorate");
  });

  it("returns null when location display is off", () => {
    expect(
      sanitizeLocation(makeRow(), { showLocation: false, locationSource: "city" }),
    ).toBeNull();
  });

  it("returns null rather than an empty string for a blank field", () => {
    expect(sanitizeLocation(makeRow({ shippingCity: "  " }), CONFIG)).toBeNull();
    expect(sanitizeLocation(makeRow({ shippingCity: null }), CONFIG)).toBeNull();
  });
});

describe("productImageUrl", () => {
  it("prefixes a bare diskname with the uploads path", () => {
    expect(productImageUrl("whey.jpg")).toBe("/uploads/whey.jpg");
  });

  it("passes an already-absolute url through", () => {
    expect(productImageUrl("/uploads/whey.jpg")).toBe("/uploads/whey.jpg");
    expect(productImageUrl("https://cdn.example/whey.jpg")).toBe(
      "https://cdn.example/whey.jpg",
    );
  });

  it("returns null when there is no image", () => {
    expect(productImageUrl(null)).toBeNull();
    expect(productImageUrl("  ")).toBeNull();
  });
});

describe("eventKeyForOrder", () => {
  it("is deterministic for the same order", () => {
    expect(eventKeyForOrder("order-a")).toBe(eventKeyForOrder("order-a"));
  });

  it("does not contain the order id", () => {
    const orderId = "11111111-1111-7111-8111-111111111111";
    expect(eventKeyForOrder(orderId)).not.toContain(orderId);
  });

  it("differs between orders", () => {
    expect(eventKeyForOrder("order-a")).not.toBe(eventKeyForOrder("order-b"));
  });
});

describe("toPublicEvents", () => {
  it("emits exactly the public fields and nothing else", () => {
    const [event] = toPublicEvents([makeRow()], CONFIG, 10);
    expect(Object.keys(event!).sort()).toEqual(
      [
        "displayName",
        "eventKey",
        "location",
        "occurredAt",
        "productId",
        "productImageUrl",
        "productName",
        "productSlug",
      ].sort(),
    );
  });

  it("leaks no customer name, email, phone, address or order id", () => {
    const row = makeRow({
      customerName: "Ahmed Mohamed Hassan",
      shippingCity: "Cairo",
    });
    const events = toPublicEvents([row], CONFIG, 10);
    const serialised = JSON.stringify(events);

    expect(serialised).not.toContain(row.orderId);
    expect(serialised).not.toContain("Ahmed Mohamed Hassan");
    expect(serialised).not.toContain("Mohamed");
    expect(serialised).not.toContain("Hassan");
    // Nothing resembling contact or address data can be present: the raw row
    // type carries none of it, and the event carries only these keys.
    expect(serialised).not.toMatch(/@/);
    expect(events[0]).not.toHaveProperty("orderId");
    expect(events[0]).not.toHaveProperty("customerEmail");
    expect(events[0]).not.toHaveProperty("customerPhone");
    expect(events[0]).not.toHaveProperty("shippingAddress");
  });

  it("emits one event per order even when the order has several items", () => {
    const rows = [
      makeRow({ productId: "p1", productName: "Whey" }),
      makeRow({ productId: "p2", productName: "Creatine" }),
      makeRow({ productId: "p3", productName: "Shaker" }),
    ];
    const events = toPublicEvents(rows, CONFIG, 10);
    expect(events).toHaveLength(1);
    // The first eligible item of the order wins.
    expect(events[0]!.productName).toBe("Whey");
  });

  it("keeps distinct orders separate", () => {
    const events = toPublicEvents(
      [makeRow({ orderId: "o1" }), makeRow({ orderId: "o2" })],
      CONFIG,
      10,
    );
    expect(events).toHaveLength(2);
  });

  it("drops rows whose name sanitises to nothing", () => {
    const events = toPublicEvents([makeRow({ customerName: "   " })], CONFIG, 10);
    expect(events).toEqual([]);
  });

  it("respects the event cap", () => {
    const rows = Array.from({ length: 9 }, (_, i) =>
      makeRow({ orderId: `order-${i}` }),
    );
    expect(toPublicEvents(rows, CONFIG, 4)).toHaveLength(4);
  });

  it("omits location entirely when the config disables it", () => {
    const [event] = toPublicEvents([makeRow()], {
      showLocation: false,
      locationSource: "city",
    }, 10);
    expect(event!.location).toBeNull();
    expect(JSON.stringify(event)).not.toContain("Cairo");
  });
});
