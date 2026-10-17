// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  canReturnWithBack,
  rememberListingOrigin,
  resolveListingOrigin,
  sanitizeListingOrigin,
} from "../listing-origin";

let previousUrl: string | null = null;
vi.mock("vike-react/usePageContext", () => ({
  usePageContext: () => ({
    urlPathname: window.location.pathname,
    previousPageContext: previousUrl ? { urlOriginal: previousUrl } : null,
  }),
}));
import { useListingOrigin } from "#root/hooks/useListingOrigin";

beforeEach(() => {
  sessionStorage.clear();
  previousUrl = null;
  window.history.replaceState(null, "", "/shop/crystal-hoop");
});
afterEach(() => cleanup());

describe("sanitizeListingOrigin", () => {
  it("keeps same-site listing URLs", () => {
    expect(sanitizeListingOrigin({ url: "/shop?page=3&inStock=1" })).toEqual({ url: "/shop?page=3&inStock=1" });
    expect(sanitizeListingOrigin({ url: "/categories/ear-piercings?sort=newest", categoryName: " Ear " })).toEqual({
      url: "/categories/ear-piercings?sort=newest",
      categoryName: "Ear",
    });
  });

  it.each([
    "//evil.example/shop",
    "https://evil.example/shop",
    "javascript:alert(1)",
    "/\\evil.example",
    "/shop/crystal-hoop",
    "/checkout",
    "/categories/a/b",
    `/shop?q=${"x".repeat(3000)}`,
  ])("rejects %s", (url) => {
    expect(sanitizeListingOrigin({ url })).toBeNull();
  });

  it("rejects junk", () => {
    expect(sanitizeListingOrigin(null)).toBeNull();
    expect(sanitizeListingOrigin("x")).toBeNull();
    expect(sanitizeListingOrigin({ url: 3 })).toBeNull();
  });
});

describe("resolveListingOrigin", () => {
  it("adopts the stored listing when the product was opened straight from it", () => {
    rememberListingOrigin({ url: "/shop?category=nose-piercings&page=3" });
    // Vike's previous URL is the one it rendered; the listing changed its
    // query itself afterwards, so only the path is compared.
    const origin = resolveListingOrigin("/shop");
    expect(origin).toEqual({ url: "/shop?category=nose-piercings&page=3" });
    expect(origin && canReturnWithBack(origin, "/shop")).toBe(true);
  });

  it("is pinned to the product's history entry, so a reload keeps it", () => {
    rememberListingOrigin({ url: "/shop?page=3" });
    resolveListingOrigin("/shop");
    rememberListingOrigin({ url: "/shop?page=9" }); // another tab-session listing later
    // Reload: no previous page, but the entry remembers where it came from.
    expect(resolveListingOrigin(null)).toEqual({ url: "/shop?page=3" });
    // …and after a reload Back is not provably the listing: use the link.
    expect(canReturnWithBack({ url: "/shop?page=3" }, null)).toBe(false);
  });

  it.each([
    ["the homepage", "/"],
    ["search", "/search?q=hoop"],
    ["another product", "/shop/other-piece"],
    ["a first render", null],
  ])("is null when the product was reached from %s", (_label, prev) => {
    rememberListingOrigin({ url: "/shop?page=3" });
    expect(resolveListingOrigin(prev)).toBeNull();
  });

  it("ignores a stored listing that is not the one just left", () => {
    rememberListingOrigin({ url: "/categories/ear-piercings?page=2" });
    expect(resolveListingOrigin("/shop")).toBeNull();
  });

  it("survives blocked storage", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(resolveListingOrigin("/shop")).toBeNull();
    spy.mockRestore();
  });
});

function Crumb() {
  const { origin, linkProps } = useListingOrigin();
  return (
    <a {...linkProps(origin?.url ?? "/shop")}>
      {origin?.categoryName ?? "Shop"}
    </a>
  );
}

describe("useListingOrigin (the product breadcrumb)", () => {
  it("links to the originating category listing and goes Back on a plain click", async () => {
    rememberListingOrigin({ url: "/categories/ear-piercings?sort=price-asc&page=2", categoryName: "Ear Piercings" });
    previousUrl = "/categories/ear-piercings";
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    render(<Crumb />);
    const link = await screen.findByRole("link", { name: "Ear Piercings" });
    expect(link.getAttribute("href")).toBe("/categories/ear-piercings?sort=price-asc&page=2");
    expect(link.getAttribute("data-vike")).toBe("false");
    fireEvent.click(link);
    expect(back).toHaveBeenCalledTimes(1);
    // A new-tab click keeps the real href.
    fireEvent.click(link, { ctrlKey: true });
    expect(back).toHaveBeenCalledTimes(1);
    back.mockRestore();
  });

  it("without a listing origin, is a plain /shop link handled by the router", async () => {
    rememberListingOrigin({ url: "/shop?page=3" });
    previousUrl = "/";
    render(<Crumb />);
    const link = await screen.findByRole("link", { name: "Shop" });
    expect(link.getAttribute("href")).toBe("/shop");
    expect(link.hasAttribute("data-vike")).toBe(false);
  });
});
