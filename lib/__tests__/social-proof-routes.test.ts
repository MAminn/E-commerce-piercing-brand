import { describe, expect, it } from "vitest";
import {
  isProductDetailRoute,
  isSocialProofExcludedRoute,
} from "#root/lib/social-proof-routes";

describe("isSocialProofExcludedRoute", () => {
  it.each([
    "/dashboard",
    "/dashboard/orders",
    "/dashboard/admin/social-proof",
    "/checkout",
    "/cart",
    "/order-confirmation",
    "/order-confirmation/abc123",
    "/login",
    "/register",
    "/forgot-password",
    "/account",
    "/account/orders",
    "/links",
    "/orders",
    "/reset-password",
    "/verify-email",
    "/unsubscribe",
    "/template-preview",
  ])("excludes %s", (pathname) => {
    expect(isSocialProofExcludedRoute(pathname)).toBe(true);
  });

  it.each([
    "/",
    "/shop",
    "/shop/seamless-ring-8mm",
    "/categories/ear",
    "/bundles/pick-your-3",
    "/search",
    "/offers",
    "/about-us",
    "/contact",
  ])("allows %s", (pathname) => {
    expect(isSocialProofExcludedRoute(pathname)).toBe(false);
  });

  it("matches whole segments, so a product slugged like an excluded route still shows", () => {
    expect(isSocialProofExcludedRoute("/shop/cart-stack")).toBe(false);
    expect(isSocialProofExcludedRoute("/shop/account-bundle")).toBe(false);
    // A path that merely starts with the same letters is not the route.
    expect(isSocialProofExcludedRoute("/cartography")).toBe(false);
    expect(isSocialProofExcludedRoute("/accounts-payable")).toBe(false);
  });
});

describe("isProductDetailRoute", () => {
  it("matches a single segment under /shop", () => {
    expect(isProductDetailRoute("/shop/seamless-ring-8mm")).toBe(true);
    expect(isProductDetailRoute("/shop/seamless-ring-8mm/")).toBe(true);
  });

  it("does not match the shop index or deeper paths", () => {
    expect(isProductDetailRoute("/shop")).toBe(false);
    expect(isProductDetailRoute("/shop/")).toBe(false);
    expect(isProductDetailRoute("/shop/a/b")).toBe(false);
  });

  it("does not match other sections", () => {
    expect(isProductDetailRoute("/")).toBe(false);
    expect(isProductDetailRoute("/categories/protein")).toBe(false);
  });
});
