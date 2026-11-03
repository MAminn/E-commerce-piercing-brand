// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";

const categories = [
  { id: "ear", name: "Ear Piercings", slug: "ear-piercings", parentId: null, sortOrder: 1, hidden: false, showOnLanding: true, description: null, filename: null, productCount: 15 },
  { id: "daith", name: "Daith", slug: "daith", parentId: "ear", sortOrder: 1, hidden: false, showOnLanding: true, description: null, filename: null, productCount: 7 },
  { id: "rook", name: "Rook", slug: "rook", parentId: "ear", sortOrder: 2, hidden: false, showOnLanding: true, description: null, filename: null, productCount: 8 },
  { id: "nose", name: "Nose Piercings", slug: "nose-piercings", parentId: null, sortOrder: 2, hidden: false, showOnLanding: true, description: null, filename: null, productCount: 8 },
];

vi.mock("vike-react/usePageContext", () => ({
  usePageContext: () => ({ urlPathname: "/categories/daith", urlParsed: { search: {} }, storefrontCategories: categories }),
}));
vi.mock("vike/client/router", () => ({ navigate: () => {} }));
vi.mock("#root/lib/context/CartContext", () => ({ useCart: () => ({ totalItems: 0 }) }));
vi.mock("#root/shared/trpc/client", () => ({
  trpc: { bundle: { listLive: { query: async () => ({ success: true, result: [] }) } } },
}));

import { IndexLine } from "../IndexLine";
import { FeaturedObject } from "../FeaturedObject";
import { MinimalNavbar } from "#root/components/template-system/minimal/MinimalNavbar";
import { LayoutSettingsContext } from "#root/frontend/contexts/LayoutSettingsContext";
import { DEFAULT_LAYOUT_SETTINGS } from "#root/shared/types/layout-settings";

afterEach(cleanup);

/** Text with money's no-break space as a plain space. */
const text = (html: string) => html.replace(/<[^>]+>/g, "").replace(/ /g, " ");

describe("IndexLine", () => {
  it("section: 01 · Placement, number muted and tabular, name ink", () => {
    const html = renderToStaticMarkup(createElement(IndexLine, { variant: "section", index: 1, label: "Placement" }));
    expect(text(html)).toBe("01 · Placement");
    expect(html).toMatch(/^<h2/);
    expect(html).toContain('class="tabular-nums text-ink-2">01');
    expect(html).toContain('class="text-ink">Placement');
  });

  it("short: 014 · Clicker / 10 mm · EGP 210", () => {
    const html = renderToStaticMarkup(
      createElement(IndexLine, { variant: "short", product: { name: "Clicker 10mm", catalogueNo: 14, price: 210 } }),
    );
    expect(text(html)).toBe("014 · Clicker10 mm · EGP 210");
    expect(html).toMatch(/<h3[^>]*>/);
  });

  it("short with no catalogue number or measure: just the name and the price — no stray separator", () => {
    const html = renderToStaticMarkup(
      createElement(IndexLine, { variant: "short", product: { name: "Nose stud L-bend", catalogueNo: null, price: 95 } }),
    );
    expect(text(html)).toBe("Nose stud L-bendEGP 95");
    expect(text(html)).not.toContain("·");
  });

  it("full: only verified fields, in order; nothing at all when there are none", () => {
    const full = renderToStaticMarkup(
      createElement(IndexLine, {
        variant: "full",
        product: { name: "Labret 16g 8mm", catalogueNo: 3, placement: ["Ear", "Daith", "Ear", ""] },
      }),
    );
    expect(text(full)).toBe("003 · 16G · 8 mm · Ear · Daith");
    const none = renderToStaticMarkup(
      createElement(IndexLine, { variant: "full", product: { name: "Nose stud L-bend", placement: [null] } }),
    );
    expect(none).toBe("");
  });
});

describe("FeaturedObject", () => {
  it("one large object: name, full index line with the price paid, View piece", () => {
    const html = renderToStaticMarkup(
      createElement(FeaturedObject, {
        product: {
          id: "p1",
          slug: "crescent-hoop-8mm",
          name: "Crescent hoop 8mm",
          price: 240,
          discountPrice: 210,
          catalogueNo: 7,
          imageUrl: "/uploads/hoop.webp",
          categoryName: "Ear Piercings",
        },
      }),
    );
    expect(text(html)).toBe("Crescent hoop007 · 8 mm · Ear · EGP 210View piece");
    expect(html).toContain('href="/shop/crescent-hoop-8mm"');
    expect(html).not.toMatch(/EGP 240|<s[ >]|line-through/);
  });
});

describe("navbar placements", () => {
  const renderNav = () =>
    render(
      createElement(LayoutSettingsContext.Provider, { value: DEFAULT_LAYOUT_SETTINGS }, createElement(MinimalNavbar)),
    );

  it("desktop: Ear and Nose come first, then the store's own links", () => {
    renderNav();
    const nav = screen.getByRole("navigation", { name: "Main" });
    const labels = within(nav).getAllByRole("link").map((a) => a.textContent?.trim());
    const ear = labels.indexOf("Ear");
    expect(ear).toBeGreaterThan(-1);
    expect(labels[ear + 1]).toBe("Nose");
    // A sub-placement page marks its placement as current.
    expect(within(nav).getByRole("link", { name: "Ear" }).getAttribute("aria-current")).toBe("page");
    expect(within(nav).getByRole("link", { name: "Ear" }).getAttribute("href")).toBe("/categories/ear-piercings");
  });

  it("mobile menu: 01 Ear with its sub-placements and counts, 02 Nose, then the links", () => {
    renderNav();
    fireEvent.click(screen.getByRole("button", { name: /menu/i }));
    const list = screen.getByTestId("menu-placements");
    expect(text(list.innerHTML)).toBe("01EarDaith7Rook802Nose");
    const daith = within(list).getByRole("link", { name: /Daith/ });
    expect(daith.getAttribute("href")).toBe("/categories/daith");
    expect(daith.getAttribute("aria-current")).toBe("page");
  });
});
