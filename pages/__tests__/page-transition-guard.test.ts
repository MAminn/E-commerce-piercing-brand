// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isSamePageNavigation } from "../page-transition-guard";
import { onPageTransitionEnd } from "../+onPageTransitionEnd";

const ctx = (to: string, from?: string) =>
  ({ urlOriginal: to, previousPageContext: from ? { urlOriginal: from } : null }) as never;

describe("same-page navigation guard", () => {
  it("treats a query-only change as the same page", () => {
    expect(isSamePageNavigation(ctx("/shop?page=2", "/shop?page=3"))).toBe(true);
    expect(isSamePageNavigation(ctx("/shop", "/shop?category=nose-piercings"))).toBe(true);
  });

  it("treats a different pathname, or a first render, as a real page change", () => {
    expect(isSamePageNavigation(ctx("/shop/crystal-hoop", "/shop?page=3"))).toBe(false);
    expect(isSamePageNavigation(ctx("/shop?page=3", "/shop/crystal-hoop"))).toBe(false);
    expect(isSamePageNavigation(ctx("/shop"))).toBe(false);
  });
});

describe("no page-transition overlay", () => {
  const root = resolve(__dirname, "../..");

  it("has no transition-start hook and no overlay markup or styles", () => {
    expect(existsSync(resolve(root, "pages/+onPageTransitionStart.ts"))).toBe(false);
    expect(readFileSync(resolve(root, "layouts/LayoutDefault.tsx"), "utf8")).not.toContain("page-transition-overlay");
    expect(readFileSync(resolve(root, "layouts/style.css"), "utf8")).not.toContain("page-transition-overlay");
  });

  it("the end hook never marks the document as transitioning", async () => {
    await onPageTransitionEnd({
      urlOriginal: "/shop/crystal-hoop",
      urlPathname: "/shop/crystal-hoop",
      previousPageContext: { urlOriginal: "/shop" },
    } as never);
    expect(document.documentElement.dataset.pageTransition).toBeUndefined();
  });
});
