// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { isSamePageNavigation } from "../page-transition-guard";
import { onPageTransitionStart } from "../+onPageTransitionStart";

const ctx = (to: string, from?: string) =>
  ({ urlOriginal: to, previousPageContext: from ? { urlOriginal: from } : null }) as never;

afterEach(() => {
  delete document.documentElement.dataset.pageTransition;
});

describe("page-transition overlay", () => {
  it("treats a query-only change as the same page", () => {
    expect(isSamePageNavigation(ctx("/shop?page=2", "/shop?page=3"))).toBe(true);
    expect(isSamePageNavigation(ctx("/shop", "/shop?category=nose-piercings"))).toBe(true);
  });

  it("treats a different pathname, or a first render, as a real page change", () => {
    expect(isSamePageNavigation(ctx("/shop/crystal-hoop", "/shop?page=3"))).toBe(false);
    expect(isSamePageNavigation(ctx("/shop?page=3", "/shop/crystal-hoop"))).toBe(false);
    expect(isSamePageNavigation(ctx("/shop"))).toBe(false);
  });

  it("never covers the page for a same-page Back/Forward (Vike skips the end hook there)", async () => {
    await onPageTransitionStart(ctx("/shop?page=2", "/shop?page=3"));
    expect(document.documentElement.dataset.pageTransition).toBeUndefined();
  });

  it("still covers a real page change", async () => {
    window.matchMedia = ((q: string) => ({ matches: true, media: q })) as never; // reduced motion: no wait
    await onPageTransitionStart(ctx("/shop/crystal-hoop", "/shop?page=3"));
    expect(document.documentElement.dataset.pageTransition).toBe("out");
  });
});
