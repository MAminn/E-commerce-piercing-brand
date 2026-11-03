import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * The Object Index homepage: Hero → 01 · Placement → 02 · New in → one large
 * object → 03 · Sets. Every block reads existing data and disappears when
 * that data is not there; nothing is padded, invented or discounted.
 */
const categories = [
  { id: "ear", name: "Ear Piercings", slug: "ear-piercings", parentId: null, sortOrder: 1, hidden: false, showOnLanding: true, description: null, filename: null, productCount: 28 },
  { id: "daith", name: "Daith", slug: "daith", parentId: "ear", sortOrder: 1, hidden: false, showOnLanding: true, description: null, filename: null, productCount: 7 },
  { id: "rook", name: "Rook", slug: "rook", parentId: "ear", sortOrder: 2, hidden: false, showOnLanding: true, description: null, filename: null, productCount: 8 },
  // Empty, hidden and generic subcategories never become placements.
  { id: "flat", name: "Flat Back", slug: "flat-back", parentId: "ear", sortOrder: 3, hidden: false, showOnLanding: true, description: null, filename: null, productCount: 0 },
  { id: "conch", name: "Conch", slug: "conch", parentId: "ear", sortOrder: 4, hidden: true, showOnLanding: true, description: null, filename: null, productCount: 5 },
  { id: "ear-generic", name: "Ear piercing", slug: "ear-piercing", parentId: "ear", sortOrder: 5, hidden: false, showOnLanding: true, description: null, filename: null, productCount: 3 },
  { id: "nose", name: "Nose Piercings", slug: "nose-piercings", parentId: null, sortOrder: 2, hidden: false, showOnLanding: true, description: null, filename: null, productCount: 8 },
];

vi.mock("#root/lib/context/CartContext", () => ({ useCart: () => ({ addItem: () => true, items: [] }) }));
vi.mock("#root/frontend/contexts/TrackingContext", () => ({ useTracking: () => ({ trackEvent: () => {} }) }));
vi.mock("vike-react/usePageContext", () => ({
  usePageContext: () => ({ urlPathname: "/", storefrontCategories: categories }),
}));
vi.mock("#root/shared/trpc/client", () => ({ trpc: {} }));

import { LandingTemplateMinimal } from "../LandingTemplateMinimal";
import { DEFAULT_HOMEPAGE_CONTENT } from "#root/shared/types/homepage-content";
import { MinimalI18nProvider } from "#root/lib/i18n/MinimalI18nContext";

const tier = (quantity: number, discountPercent: number | null, price: number | null = null) => ({
  id: `t${quantity}`,
  quantity,
  price,
  discountPercent,
  availability: "available" as const,
  valueRange: null,
});
const campaign = (slug: string, title: string, type: "build_your_stack" | "curated_stack", extra: Record<string, unknown> = {}) => ({
  id: `id-${slug}`,
  slug,
  title,
  subtitle: null,
  badgeText: null,
  heroImageUrl: null,
  type,
  pricingType: "percentage_discount" as const,
  freeShipping: false,
  availability: "available" as const,
  requiredQuantity: 3,
  unitCount: 3,
  tiers: [tier(3, 20)],
  fixedBundlePrice: null,
  regularValue: null,
  savings: 60,
  valueRange: null,
  eligibleProductCount: 40,
  ...extra,
});

const pick3 = campaign("pick-your-3", "Pick Your 3", "build_your_stack");
const pickFixed = campaign("pick-your-set", "Pick your set", "build_your_stack", {
  pricingType: "fixed_total",
  fixedBundlePrice: 270,
});
const readySet = campaign("ready-set-ear", "Ready set — ear", "curated_stack", {
  pricingType: "fixed_total",
  tiers: [tier(2, null, 230)],
  unitCount: 2,
  fixedBundlePrice: 230,
});
const soldOutSet = campaign("sold-out-set", "Sold out set", "curated_stack", { availability: "sold_out" });

const product = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  slug: id,
  name,
  price: 100,
  discountPrice: null,
  stock: 3,
  imageUrl: `/uploads/${id}.webp`,
  categoryName: "Ear Piercings",
  available: true,
  ...extra,
});

const newIn = [
  product("n1", "Clicker 10mm", { catalogueNo: 14, price: 240, discountPrice: 210 }),
  product("n2", "Mini Flower Stud"),
  product("n3", "Opal Daith Ring"),
  product("n4", "Pearl Flat Back"),
  product("n5", "Fifth New Piece"),
];

const content = {
  ...DEFAULT_HOMEPAGE_CONTENT,
  categories: { ...DEFAULT_HOMEPAGE_CONTENT.categories, enabled: true },
  featuredProducts: { ...DEFAULT_HOMEPAGE_CONTENT.featuredProducts, enabled: true },
  newArrivals: { ...(DEFAULT_HOMEPAGE_CONTENT.newArrivals ?? {}), enabled: true },
  bundles: { ...(DEFAULT_HOMEPAGE_CONTENT.bundles ?? {}), enabled: true },
};

const render = (overrides: Record<string, unknown> = {}, c: unknown = content) =>
  renderToStaticMarkup(
    <MinimalI18nProvider ssrLocale='en'>
      <LandingTemplateMinimal
        content={c as never}
        setCampaigns={[pick3, pickFixed] as never}
        bundleCampaigns={[pick3, readySet, soldOutSet] as never}
        featuredProducts={[product("n1", "Clicker 10mm"), product("f1", "Crescent Conch Hoop 8mm", { catalogueNo: 7 })] as never}
        newArrivals={newIn as never}
        discountedProducts={[product("d1", "Sale Only Piece")] as never}
        {...overrides}
      />
    </MinimalI18nProvider>,
  );

const plain = (html: string) => html.replace(/ /g, " ");
const sections = (html: string) => [...html.matchAll(/data-home-section="([^"]+)"/g)].map((m) => m[1]);

describe("Object Index homepage", () => {
  it("orders the page: hero → 01 · Placement → 02 · New in → one object → 03 · Sets", () => {
    const html = render();
    expect(html.indexOf("<h1")).toBeLessThan(html.indexOf('data-home-section="home-placement"'));
    expect(sections(html)).toEqual(["home-placement", "home-new-in", "home-object", "home-sets"]);
    const text = html.replace(/<[^>]+>/g, "");
    expect(text).toMatch(/01 · Placement[\s\S]*02 · New in[\s\S]*03 · Sets/);
  });

  it("drops the old shelves: no trust strip, sale rail, editorial, testimonials or floating button", () => {
    const html = render();
    expect(html).not.toContain("Sale Only Piece");
    expect(html).not.toMatch(/data-testid="trust-strip"|data-pick-your-set|data-bundle-card/);
    expect(html).not.toMatch(/testimonial/i);
    expect(html).not.toMatch(/Back to products|scroll-to-products/i);
  });

  it("placement index: Ear's sub-placements numbered with real counts, Nose with its own count", () => {
    const html = plain(render());
    const index = html.slice(html.indexOf('data-testid="placement-index"'), html.indexOf('data-home-section="home-new-in"'));
    const text = index.replace(/<[^>]+>/g, "");
    expect(index).toContain('href="/categories/ear-piercings"');
    expect(text).toMatch(/Ear\s*01Daith · 7\s*02Rook · 8/);
    expect(text).toMatch(/Nose8/);
    // Empty, hidden and generic subcategories are not placements.
    for (const gone of ["Flat Back", "Conch", "Ear piercing"]) expect(text).not.toContain(gone);
    // A placement with sub-placements states no count of its own.
    expect(text).not.toContain("Ear28");
  });

  it("02 · New in: exactly four in-stock pieces, as short index lines, one price each", () => {
    const html = plain(render());
    const block = html.slice(html.indexOf('data-home-section="home-new-in"'), html.indexOf('data-home-section="home-object"'));
    expect(block.match(/data-index-line="short"/g)).toHaveLength(4);
    expect(block).not.toContain("Fifth New Piece");
    expect(block.replace(/<[^>]+>/g, "")).toContain("014 · Clicker10 mm · EGP 210");
    expect(block).not.toContain("EGP 240");
    expect(block).not.toMatch(/<s[ >]|line-through/);
  });

  it("hides New in rather than show fewer than four in-stock pieces, and renumbers", () => {
    const soldOut = newIn.map((p, i) => (i < 2 ? { ...p, stock: 0, available: false } : p));
    const html = render({ newArrivals: soldOut });
    expect(sections(html)).toEqual(["home-placement", "home-object", "home-sets"]);
    expect(html.replace(/<[^>]+>/g, "")).toContain("02 · Sets");
  });

  it("the large object is the first featured piece not already in New in, with its full index line", () => {
    const html = plain(render());
    const block = html.slice(html.indexOf('data-home-section="home-object"'), html.indexOf('data-home-section="home-sets"'));
    expect(block).toContain("data-featured-object");
    expect(block).toContain('href="/shop/f1"');
    expect(block.replace(/<[^>]+>/g, "")).toMatch(/Crescent Conch Hoop007 · 8 mm · Ear · EGP 100View piece/);
  });

  it("no featured piece → no large object", () => {
    expect(sections(render({ featuredProducts: [] }))).not.toContain("home-object");
  });

  it("03 · Sets: index rows with pieces and a fixed price only; no sold-out set, no saving", () => {
    const html = plain(render());
    const block = html.slice(html.indexOf('data-testid="sets-index"'));
    const rows = [...block.matchAll(/data-set-row="([^"]+)"/g)].map((m) => m[1]);
    expect(rows).toEqual(["pick-your-3", "pick-your-set", "ready-set-ear"]);
    const text = block.replace(/<[^>]+>/g, "");
    expect(text).toContain("Pick Your 3 · 3 pieces");
    // The price sits at the row's end, on its own.
    expect(text).toContain("Pick your set · 3 piecesEGP 270");
    expect(text).toContain("Ready set — ear · 2 piecesEGP 230");
    expect(text).not.toMatch(/sav|%|Sold out set/i);
  });

  it("CMS switches still apply", () => {
    const off = {
      ...content,
      categories: { ...content.categories, enabled: false },
      newArrivals: { ...content.newArrivals, enabled: false },
      featuredProducts: { ...content.featuredProducts, enabled: false },
      bundles: { ...content.bundles, enabled: false },
    };
    expect(sections(render({}, off))).toEqual([]);
  });
});
