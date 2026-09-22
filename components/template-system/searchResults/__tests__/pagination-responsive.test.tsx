import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("#root/shared/trpc/client", () => ({ trpc: {} }));
vi.mock("vike-react/usePageContext", () => ({
  usePageContext: () => ({ urlPathname: "/search" }),
}));
// The product tile is not under test here and needs the cart, wishlist and
// tracking providers; the pagination row does not.
vi.mock("#root/components/template-system/minimal/MinimalProductCard", () => ({
  MinimalProductCard: () => null,
}));

import {
  SearchResultsMinimal,
  type SearchResultProduct,
} from "../SearchResultsMinimal";

/**
 * /search pagination at phone widths.
 *
 * The bug: the Previous/Next row was one non-wrapping flex line holding
 * "Previous", up to five 44px page buttons, two ellipses and "Next" with
 * gap-4 between them — around 550px of intrinsic width. At 375–430px that
 * overflowed `.perce-container` and put a horizontal scrollbar on the whole
 * document, dragging the header, the product grid and the footer sideways.
 *
 * jsdom performs no layout, so these tests pin the two structural properties
 * that make the overflow impossible rather than measuring rendered pixels:
 *
 *   1. the row wraps, so it can never be wider than its container; and
 *   2. every individual control that CANNOT wrap still fits inside the
 *      narrowest supported viewport.
 *
 * (2) is what wrapping alone does not guarantee: a single child wider than
 * the container still overflows it. The width model below is deliberately
 * conservative — real widths are smaller than these numbers.
 */

// Narrowest supported viewport, minus `--perce-gutter` (1rem) on each side.
const MOBILE_VIEWPORT = 375;
const CONTAINER_WIDTH = MOBILE_VIEWPORT - 2 * 16;

// Conservative per-control widths for the mobile breakpoint, in px.
const TAP_TARGET = 44; // min-w-11 / h-11
const CHAR_WIDTH = 9; // generous upper bound for the label font
const H_PADDING = 16; // px-2 on each side

const products: SearchResultProduct[] = [
  { id: "p1", slug: "crystal-stud", name: "Crystal stud", price: 150, stock: 4, available: true },
];

function render(currentPage: number, totalPages: number) {
  return renderToStaticMarkup(
    createElement(SearchResultsMinimal, {
      searchQuery: "crystal",
      products,
      totalResults: totalPages * 12,
      currentPage,
      totalPages,
      onPageChange: () => {},
    }),
  );
}

/** The <nav aria-label="Pagination"> subtree. */
function paginationNav(html: string): string {
  const start = html.indexOf('<nav aria-label="Pagination"');
  expect(start).toBeGreaterThan(-1);
  const end = html.indexOf("</nav>", start);
  return html.slice(start, end);
}

function buttons(nav: string): string[] {
  return [...nav.matchAll(/<button[\s\S]*?<\/button>/g)].map((m) => m[0]);
}

/** Is the button carrying `label` rendered disabled? (Attribute order varies.) */
function isDisabled(nav: string, label: string): boolean {
  const tag = [...nav.matchAll(/<button[^>]*>/g)]
    .map((m) => m[0])
    .find((t) => t.includes(`aria-label="${label}"`));
  expect(tag).toBeDefined();
  return /\sdisabled=""/.test(tag as string);
}

/**
 * Text a button actually shows at mobile width. Spans marked
 * `hidden sm:inline` are display:none below the `sm` breakpoint, so they
 * contribute no width there.
 */
function mobileVisibleText(button: string): string {
  const withoutHiddenSpans = button.replace(
    /<span[^>]*class="[^"]*\bhidden\b[^"]*"[^>]*>[\s\S]*?<\/span>/g,
    "",
  );
  return withoutHiddenSpans.replace(/<[^>]+>/g, "").trim();
}

function mobileWidth(button: string): number {
  const text = mobileVisibleText(button);
  const hasIcon = /<svg/.test(button);
  const content = text.length * CHAR_WIDTH + (hasIcon ? 16 : 0);
  return Math.max(TAP_TARGET, content + H_PADDING);
}

describe("/search pagination — 375–430px", () => {
  it("lets the Previous/Next row wrap instead of overflowing the document", () => {
    const nav = paginationNav(render(5, 10));
    const rowClass = /<div class="([^"]*flex[^"]*)"/.exec(nav)?.[1] ?? "";
    expect(rowClass).toContain("flex-wrap");
    // A nowrap/fixed-width escape hatch would defeat the wrap.
    expect(rowClass).not.toContain("flex-nowrap");
    expect(rowClass).not.toContain("whitespace-nowrap");
    expect(nav).not.toContain("overflow-x-auto");
    expect(nav).not.toContain("overflow-x-scroll");
  });

  it("keeps every control narrower than a 375px viewport", () => {
    // Page 5 of 10 is the widest arrangement: both arrows enabled, both
    // ellipses present, five page numbers.
    const nav = paginationNav(render(5, 10));
    const controls = buttons(nav);
    expect(controls.length).toBeGreaterThan(0);
    for (const control of controls) {
      expect(mobileWidth(control)).toBeLessThanOrEqual(CONTAINER_WIDTH);
    }
  });

  it("hides the Previous/Next words at mobile without removing the controls", () => {
    const nav = paginationNav(render(5, 10));
    // The words are present in the markup…
    expect(nav).toContain("Previous");
    expect(nav).toContain("Next");
    // …but only inside a span that is display:none below `sm`.
    expect(nav).toMatch(/<span class="hidden sm:inline">Previous<\/span>/);
    expect(nav).toMatch(/<span class="hidden sm:inline">Next<\/span>/);
    // So at mobile width the buttons render as icons only.
    const prev = buttons(nav)[0] ?? "";
    expect(mobileVisibleText(prev)).toBe("");
  });

  it("still names both arrows for assistive tech and pointer users", () => {
    const nav = paginationNav(render(5, 10));
    expect(nav).toContain('aria-label="Previous page"');
    expect(nav).toContain('aria-label="Next page"');
  });

  it("keeps the control count bounded however many pages there are", () => {
    // 5 page numbers (first, last, current ±1) + the two arrows. Without
    // this cap the row would grow without limit and wrap into a wall of
    // buttons on a phone.
    for (const totalPages of [10, 50, 200]) {
      const nav = paginationNav(render(Math.ceil(totalPages / 2), totalPages));
      expect(buttons(nav).length).toBeLessThanOrEqual(7);
    }
  });

  it("keeps Previous and Next reachable on the first and last page", () => {
    const first = paginationNav(render(1, 10));
    const last = paginationNav(render(10, 10));
    // Disabled, but still rendered and still labelled — not removed.
    expect(first).toContain('aria-label="Previous page"');
    expect(first).toContain('aria-label="Next page"');
    expect(last).toContain('aria-label="Previous page"');
    expect(last).toContain('aria-label="Next page"');
    expect(isDisabled(first, "Previous page")).toBe(true);
    expect(isDisabled(first, "Next page")).toBe(false);
    expect(isDisabled(last, "Previous page")).toBe(false);
    expect(isDisabled(last, "Next page")).toBe(true);
  });
});
