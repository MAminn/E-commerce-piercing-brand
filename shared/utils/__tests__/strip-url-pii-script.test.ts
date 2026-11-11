import { describe, expect, it } from "vitest";
import { STRIP_URL_PII_SCRIPT } from "../strip-url-pii-script";

/** Run the exact inline script against a fake window. */
function runScript(href: string) {
  const url = new URL(href);
  const replaced: string[] = [];
  const store = new Map<string, string>();
  const fakeWindow = {
    location: { pathname: url.pathname, search: url.search, hash: url.hash },
    history: {
      state: { s: 1 },
      replaceState: (_state: unknown, _title: string, next: string) => {
        replaced.push(next);
      },
    },
    sessionStorage: {
      setItem: (k: string, v: string) => store.set(k, v),
      getItem: (k: string) => store.get(k) ?? null,
    },
  };
  new Function("window", STRIP_URL_PII_SCRIPT)(fakeWindow);
  return { replaced, store };
}

const ORDER = "0f1e2d3c-4b5a-4968-8778-6a5b4c3d2e1f";

describe("STRIP_URL_PII_SCRIPT (inline <head> script)", () => {
  it("removes ?email= from a legacy confirmation URL and keeps the email for the page", () => {
    const { replaced, store } = runScript(
      `https://shop.test/order-confirmation?id=${ORDER}&total=385.00&email=shopper%40example.test&payment=success`,
    );
    expect(replaced).toEqual([`/order-confirmation?id=${ORDER}&total=385.00&payment=success`]);
    expect(store.get(`order_email:${ORDER}`)).toBe("shopper@example.test");
  });

  it("strips PII on any path but stores an email only for /order-confirmation", () => {
    const { replaced, store } = runScript("https://shop.test/shop?email=a%40b.test&utm_source=meta#x");
    expect(replaced).toEqual(["/shop?utm_source=meta#x"]);
    expect(store.size).toBe(0);
  });

  it("does nothing when the URL carries no PII", () => {
    const { replaced } = runScript("https://shop.test/shop?page=2");
    expect(replaced).toEqual([]);
  });

  it("drops the query string entirely when only PII was in it", () => {
    const { replaced } = runScript("https://shop.test/x?phone=01000000000");
    expect(replaced).toEqual(["/x"]);
  });

  it("never throws, even without history or storage", () => {
    expect(() => new Function("window", STRIP_URL_PII_SCRIPT)({})).not.toThrow();
  });
});
