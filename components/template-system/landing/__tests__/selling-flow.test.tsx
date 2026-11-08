import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * The homepage: Hero → Shop by placement → Sets → New in → one large piece →
 * more pieces. Every block reads existing data and disappears when that data
 * is not there; nothing is padded, invented or discounted.
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

describe("Homepage", () => {
  it("orders the page: hero → placement → sets → new in → one large piece", () => {
    const html = render();
    expect(html.indexOf("<h1")).toBeLessThan(html.indexOf('data-home-section="home-placement"'));
    expect(sections(html)).toEqual(["home-placement", "home-sets", "home-new-in", "home-object"]);
    const text = html.replace(/<[^>]+>/g, "");
    expect(text).toMatch(/Shop by placement[\s\S]*Sets[\s\S]*New in/);
  });

  it("is not an index: no numbered sections, no catalogue numbers on cards", () => {
    const html = plain(render());
    const text = html.replace(/<[^>]+>/g, "");
    expect(text).not.toMatch(/\b0\d · /);
    expect(html).not.toContain('data-index-line="section"');
    expect(html).not.toContain('data-index-line="short"');
  });

  it("drops the old shelves: no trust strip, sale rail, testimonials or floating button", () => {
    const html = render();
    expect(html).not.toContain("Sale Only Piece");
    expect(html).not.toMatch(/data-testid="trust-strip"|data-pick-your-set/);
    expect(html).not.toMatch(/testimonial/i);
    expect(html).not.toMatch(/Back to products|scroll-to-products/i);
  });

  it("placements are photo blocks: each one a link, sub-placements on the first, no counts", () => {
    const html = plain(render());
    const block = html.slice(html.indexOf('data-testid="placement-tiles"'), html.indexOf('data-home-section="home-sets"'));
    const text = block.replace(/<[^>]+>/g, " ");
    expect([...block.matchAll(/data-placement-tile="([^"]+)"/g)].map((m) => m[1])).toEqual(["ear-piercings", "nose-piercings"]);
    expect(block).toContain('href="/categories/ear-piercings"');
    expect(block).toContain('href="/categories/daith"');
    expect(block).toContain('href="/categories/rook"');
    // Empty, hidden and generic subcategories are not placements.
    for (const gone of ["Flat Back", "Conch", "Ear piercing"]) expect(text).not.toContain(gone);
    expect(text).not.toMatch(/\b(28|7|8)\b/);
  });

  it("a placement's photo: its own image, else a piece on the page from that placement, each used once", () => {
    const html = plain(render({ newArrivals: [...newIn, product("nose1", "Nose Hoop", { categoryName: "Nose Piercings" })] }));
    const tile = (slug: string) => {
      const start = html.indexOf(`data-placement-tile="${slug}"`);
      return html.slice(start, html.indexOf("</li>", start));
    };
    expect(tile("ear-piercings")).toContain('src="/uploads/n1.webp"');
    expect(tile("nose-piercings")).toContain('src="/uploads/nose1.webp"');
  });

  it("a placement with no photo at all is a solid ink block, never a grey hole", () => {
    const html = plain(render({ newArrivals: [], featuredProducts: [] }));
    const start = html.indexOf('data-placement-tile="nose-piercings"');
    const tile = html.slice(html.lastIndexOf("<li", start), html.indexOf("</li>", start));
    expect(tile).toContain("bg-ink");
    expect(tile).not.toContain("<img");
    expect(tile).toContain("Nose");
  });

  it("New in: whole rows of in-stock pieces, the photo then the name and one price", () => {
    const html = plain(render());
    const block = html.slice(html.indexOf('data-home-section="home-new-in"'), html.indexOf('data-home-section="home-object"'));
    expect(block.match(/<article/g)).toHaveLength(4);
    expect(block).not.toContain("Fifth New Piece");
    const text = block.replace(/<[^>]+>/g, " ");
    expect(text).toContain("Clicker 10mm");
    expect(text).toContain("EGP 210");
    expect(text).not.toContain("014");
    expect(block).not.toContain("EGP 240");
    expect(block).not.toMatch(/<s[ >]|line-through/);
  });

  it("New in runs to two full rows at most", () => {
    const many = Array.from({ length: 11 }, (_, i) => product(`m${i}`, `Piece ${i}`));
    const html = render({ newArrivals: many, featuredProducts: [] });
    const block = html.slice(html.indexOf('data-home-section="home-new-in"'), html.indexOf('data-home-section="home-object"'));
    expect(block.match(/<article/g)).toHaveLength(8);
  });

  it("hides New in rather than show less than a full row", () => {
    const soldOut = newIn.map((p, i) => (i < 2 ? { ...p, stock: 0, available: false } : p));
    expect(sections(render({ newArrivals: soldOut }))).not.toContain("home-new-in");
  });

  it("the large piece is the first featured one not in New in, stated with its price and one way to it", () => {
    const html = plain(render());
    const block = html.slice(html.indexOf('data-home-section="home-object"'));
    expect(block).toContain("data-featured-object");
    expect(block).toContain('href="/shop/f1"');
    const text = block.replace(/<[^>]+>/g, " ");
    expect(text).toContain("Crescent Conch Hoop 8mm");
    expect(text).toContain("EGP 100");
    expect(text).toContain("View piece");
  });

  it("no featured piece left → the next new piece takes the large block; nothing appears twice", () => {
    const html = render({ featuredProducts: [] });
    const block = html.slice(html.indexOf('data-home-section="home-object"'));
    expect(block).toContain("Fifth New Piece");
    // The large block's section is labelled with the piece, so stop before its tag.
    const newBlock = html.slice(html.indexOf('data-home-section="home-new-in"'), html.indexOf('aria-label="Fifth New Piece"'));
    expect(newBlock).not.toContain("Fifth New Piece");
  });

  it("nothing left to feature → no large block", () => {
    expect(sections(render({ featuredProducts: [], newArrivals: newIn.slice(0, 4) }))).not.toContain("home-object");
  });

  it("a second product grid needs a full row, and repeats nothing", () => {
    const featured = ["a", "b", "c", "d", "e"].map((id) => product(id, `Featured ${id}`));
    const html = render({ featuredProducts: featured });
    expect(sections(html)).toContain("home-more");
    const more = html.slice(html.indexOf('data-home-section="home-more"'));
    expect(more.match(/<article/g)).toHaveLength(4);
    expect(more).not.toContain("Featured a");
    expect(sections(render({ featuredProducts: featured.slice(0, 2) }))).not.toContain("home-more");
  });

  it("Sets: photo cards with the campaign's own offer and a clear way in; no sold-out set, no saving", () => {
    const html = plain(render());
    const block = html.slice(html.indexOf('data-testid="sets-merch"'), html.indexOf('data-home-section="home-new-in"'));
    expect([...block.matchAll(/data-bundle-card="([^"]+)"/g)].map((m) => m[1])).toEqual([
      "pick-your-3",
      "pick-your-set",
      "ready-set-ear",
    ]);
    const text = block.replace(/<[^>]+>/g, " ");
    expect(text).toContain("20% off");
    expect(text).toContain("EGP 270");
    expect(text).toContain("EGP 230");
    expect(text).toContain("Build your set");
    expect(text).toContain("Shop the set");
    expect(text).not.toMatch(/sav|separately|Sold out set/i);
    expect(block).not.toMatch(/<s[ >]|line-through/);
    expect(block).toContain('href="/bundles/pick-your-3"');
  });

  it("Sets: several sizes state their offer as /offers does; at most four cards", () => {
    const upTo = campaign("pick-your-set", "Pick your set", "build_your_stack", {
      tiers: [tier(3, 10), tier(6, 20)],
      freeShipping: true,
    });
    const from = campaign("build-it", "Build it", "build_your_stack", {
      pricingType: "fixed_total",
      fixedBundlePrice: 270,
      tiers: [tier(3, null, 270), tier(6, null, 480)],
    });
    const extra = ["x", "y", "z"].map((s) => campaign(s, `Set ${s}`, "build_your_stack"));
    const html = plain(render({ setCampaigns: [upTo, from, ...extra] }));
    const block = html.slice(html.indexOf('data-testid="sets-merch"'), html.indexOf('data-home-section="home-new-in"'));
    const text = block.replace(/<[^>]+>/g, " ");
    expect(text).toContain("Up to 20% off");
    expect(text).toContain("+ free shipping");
    expect(text).toContain("From EGP 270");
    expect(block.match(/data-bundle-card=/g)).toHaveLength(4);
  });

  it("a set with no image is a solid ink card", () => {
    const html = plain(render());
    const start = html.indexOf('data-bundle-card="pick-your-3"');
    const card = html.slice(html.lastIndexOf("<article", start), html.indexOf("</article>", start));
    expect(card).toContain("bg-ink");
    expect(card).not.toContain("<img");
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
