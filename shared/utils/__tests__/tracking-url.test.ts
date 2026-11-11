import { describe, expect, it } from "vitest";
import { sanitizeTrackingUrl } from "../tracking-url";

const FAKE = "shopper%40example.test";

describe("sanitizeTrackingUrl", () => {
  it("removes the customer email from an order-confirmation URL and keeps everything else", () => {
    expect(
      sanitizeTrackingUrl(
        `https://shop.test/order-confirmation?id=0f1e2d3c-4b5a-4968-8778-6a5b4c3d2e1f&total=385.00&email=${FAKE}&payment=pending`,
      ),
    ).toBe(
      "https://shop.test/order-confirmation?id=0f1e2d3c-4b5a-4968-8778-6a5b4c3d2e1f&total=385.00&payment=pending",
    );
  });

  it("removes every PII-style param, case-insensitively, and keeps attribution params", () => {
    const out = sanitizeTrackingUrl(
      "https://shop.test/x?utm_source=meta&Email=a%40b.test&phone=01000000000&fbclid=AbC&name=Test+User#top",
    );
    expect(out).toBe("https://shop.test/x?utm_source=meta&fbclid=AbC#top");
  });

  it("leaves URLs without PII untouched (byte for byte)", () => {
    const url = "https://shop.test/shop?page=2&sort=price-asc";
    expect(sanitizeTrackingUrl(url)).toBe(url);
    expect(sanitizeTrackingUrl("https://shop.test/")).toBe("https://shop.test/");
  });

  it("keeps relative URLs relative", () => {
    expect(sanitizeTrackingUrl(`/order-confirmation?id=1&email=${FAKE}`)).toBe(
      "/order-confirmation?id=1",
    );
  });

  it("passes empty / undefined through", () => {
    expect(sanitizeTrackingUrl(undefined)).toBeUndefined();
    expect(sanitizeTrackingUrl("")).toBe("");
  });
});
