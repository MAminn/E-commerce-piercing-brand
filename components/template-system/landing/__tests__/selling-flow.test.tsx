import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("#root/lib/context/CartContext", () => ({ useCart: () => ({ addItem: () => true, items: [] }) }));
vi.mock("#root/frontend/contexts/TrackingContext", () => ({ useTracking: () => ({ trackEvent: () => {} }) }));
vi.mock("vike-react/usePageContext", () => ({ usePageContext: () => ({ urlPathname: "/" }) }));
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
  savings: null,
  valueRange: null,
  eligibleProductCount: 40,
  ...extra,
});

const pick3 = campaign("pick-your-3", "Pick Your 3", "build_your_stack");
const pick6 = campaign("pick-your-6", "Pick Your 6", "build_your_stack", {
  tiers: [tier(6, 15)],
  requiredQuantity: 6,
  freeShipping: true,
});
const readySet = campaign("ready-set-ear", "Ready Set — Ear", "curated_stack", {
  pricingType: "fixed_total",
  tiers: [tier(2, null, 300)],
  fixedBundlePrice: 300,
});

const product = (id: string, name: string) => ({
  id,
  slug: id,
  name,
  price: 100,
  discountPrice: null,
  stock: 3,
  imageUrl: `/uploads/${id}.webp`,
  categoryName: "Ear",
  available: true,
});

const content = {
  ...DEFAULT_HOMEPAGE_CONTENT,
  categories: { ...DEFAULT_HOMEPAGE_CONTENT.categories, enabled: true, title: "Shop by placement" },
  featuredProducts: { ...DEFAULT_HOMEPAGE_CONTENT.featuredProducts, enabled: true, title: "Trending now" },
  newArrivals: { ...(DEFAULT_HOMEPAGE_CONTENT.newArrivals ?? {}), enabled: true, title: "New in" },
  bundles: { ...(DEFAULT_HOMEPAGE_CONTENT.bundles ?? {}), enabled: true, title: "Ready sets" },
} as never;

const render = (overrides: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    <MinimalI18nProvider ssrLocale='en'>
      <LandingTemplateMinimal
        content={content}
        setCampaigns={[pick3, pick6] as never}
        bundleCampaigns={[pick3, readySet] as never}
        categories={[{ id: "c1", name: "Ear Piercings", slug: "ear", imageUrl: null }]}
        featuredProducts={[product("p1", "Crystal L-Shape Stud"), product("p2", "Mini Flower Stud")] as never}
        newArrivals={[product("p2", "Mini Flower Stud"), product("p3", "Opal Daith Ring")] as never}
        discountedProducts={[product("p1", "Crystal L-Shape Stud"), product("p4", "Pearl Flat Back")] as never}
        {...overrides}
      />
    </MinimalI18nProvider>,
  );

describe("homepage selling flow", () => {
  it("orders the page: hero → Pick Your Set → placement → trending → trust strip → more merchandising", () => {
    const html = render();
    const at = (needle: string) => {
      const i = html.indexOf(needle);
      expect(i, needle).toBeGreaterThan(-1);
      return i;
    };
    const order = [
      at("<h1"),
      at("data-pick-your-set"),
      at("Shop by placement"),
      at("Trending now"),
      at("data-trust-strip"),
      at("Ready sets"),
      at("New in"),
    ];
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("Pick Your Set is a primary block with each set's real terms and a direct CTA", () => {
    const html = render();
    expect(html).toContain("More pieces. A better price.");
    expect(html).toContain("20% off");
    expect(html).toContain("15% off");
    expect(html).toContain("+ free shipping");
    expect(html).toMatch(/href="\/bundles\/pick-your-3"[^>]*>Shop 3 pieces/);
    expect(html).toMatch(/href="\/bundles\/pick-your-6"[^>]*>Shop 6 pieces/);
    expect(html).not.toMatch(/sign in/i);
  });

  it("the bundle rail below carries Ready Sets only — no Pick Your Set repeated", () => {
    const html = render();
    expect(html).toContain("Ready Set — Ear");
    expect(html.split('data-bundle-card="pick-your-3"').length - 1).toBe(0);
  });

  it("no product appears in two rails", () => {
    const html = render();
    for (const name of ["Crystal L-Shape Stud", "Mini Flower Stud"]) {
      // Each card renders its name once in the title and once as the image alt.
      expect(html.split(`>${name}</h3>`).length - 1, name).toBe(1);
    }
    expect(html).toContain("Opal Daith Ring");
    expect(html).toContain("Pearl Flat Back");
  });

  it("trust strip shows store facts only", () => {
    const html = render();
    expect(html).toContain("Delivery across Egypt");
    expect(html).toContain("Cash on delivery");
    expect(html).not.toMatch(/hypoallergenic|lifetime|premium materials/i);
  });

  it("no live set → no empty Pick Your Set block", () => {
    expect(render({ setCampaigns: [] })).not.toContain("data-pick-your-set");
  });

  it("switching the CMS Bundles section off hides the set block too", () => {
    const html = render({
      content: { ...(content as object), bundles: { ...(DEFAULT_HOMEPAGE_CONTENT.bundles ?? {}), enabled: false } },
    });
    expect(html).not.toContain("data-pick-your-set");
  });
});
