import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  buildOrderConfirmationUrl,
  orderEmailKey,
  readOrderEmail,
  saveOrderEmail,
} from "../order-email";

const ORDER = "0f1e2d3c-4b5a-4968-8778-6a5b4c3d2e1f";

function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  };
}

describe("order-confirmation URLs carry no customer data", () => {
  it.each([
    ["COD", { orderId: ORDER, total: "385.00" }, `/order-confirmation?id=${ORDER}&total=385.00`],
    [
      "payment=pending",
      { orderId: ORDER, total: "385.00", payment: "pending" as const },
      `/order-confirmation?id=${ORDER}&total=385.00&payment=pending`,
    ],
    [
      "successUrl",
      { origin: "https://shop.test", orderId: ORDER, total: "385.00", payment: "success" as const },
      `https://shop.test/order-confirmation?id=${ORDER}&total=385.00&payment=success`,
    ],
    [
      "cancelUrl",
      { origin: "https://shop.test", orderId: ORDER, total: "385.00", payment: "cancelled" as const },
      `https://shop.test/order-confirmation?id=${ORDER}&total=385.00&payment=cancelled`,
    ],
  ])("%s", (_label, input, expected) => {
    const url = buildOrderConfirmationUrl(input);
    expect(url).toBe(expected);
    expect(url).not.toMatch(/email|@/i);
  });

  it("checkout builds all four confirmation URLs through the builder and never writes email= into a URL", () => {
    const src = readFileSync(path.resolve(__dirname, "../../checkout/+Page.tsx"), "utf8");
    expect(src).not.toMatch(/email=\$\{/);
    expect(src).not.toMatch(/order-confirmation\?/);
    expect(src.match(/buildOrderConfirmationUrl\(/g)?.length).toBe(4);
    for (const payment of ['"success"', '"cancelled"', '"pending"']) {
      expect(src).toContain(`payment: ${payment}`);
    }
  });
});

describe("order email stash", () => {
  it("round-trips per order id and stays empty for other orders", () => {
    const s = memoryStorage();
    saveOrderEmail(s, ORDER, "shopper@example.test");
    expect(s.getItem(orderEmailKey(ORDER))).toBe("shopper@example.test");
    expect(readOrderEmail(s, ORDER)).toBe("shopper@example.test");
    expect(readOrderEmail(s, "another-order")).toBe("");
  });

  it("tolerates missing or throwing storage", () => {
    expect(readOrderEmail(null, ORDER)).toBe("");
    const throwing = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(() => saveOrderEmail(throwing, ORDER, "x@y.test")).not.toThrow();
    expect(readOrderEmail(throwing, ORDER)).toBe("");
  });
});
