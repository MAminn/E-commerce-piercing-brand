// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

/**
 * Arabic homepage (Object Index): the numbered section names, "Shop all" /
 * "View all" / "View piece" and the set rows render in Arabic, with the page
 * in RTL. English is unchanged.
 */
const categories = [
  { id: "ear", name: "Ear Piercings", slug: "ear-piercings", parentId: null, sortOrder: 1, hidden: false, showOnLanding: true, description: null, filename: null, productCount: 9 },
  { id: "daith", name: "Daith", slug: "daith", parentId: "ear", sortOrder: 1, hidden: false, showOnLanding: true, description: null, filename: null, productCount: 4 },
  { id: "nose", name: "Nose Piercings", slug: "nose-piercings", parentId: null, sortOrder: 2, hidden: false, showOnLanding: true, description: null, filename: null, productCount: 3 },
];
vi.mock("#root/lib/context/CartContext", () => ({ useCart: () => ({ addItem: () => true, items: [] }) }));
vi.mock("#root/frontend/contexts/TrackingContext", () => ({ useTracking: () => ({ trackEvent: () => {} }) }));
vi.mock("vike-react/usePageContext", () => ({
  usePageContext: () => ({ urlPathname: "/", storefrontCategories: categories }),
}));
vi.mock("#root/shared/trpc/client", () => ({ trpc: {} }));

import { LandingTemplateMinimal } from "../LandingTemplateMinimal";
import { DEFAULT_HOMEPAGE_CONTENT, type HomepageContent } from "#root/shared/types/homepage-content";
import { MinimalI18nProvider } from "#root/lib/i18n/MinimalI18nContext";
import { localizeCmsLabel } from "#root/lib/i18n/cms-copy";
import { translations } from "#root/lib/i18n/translations";

const tier = (quantity: number, discountPercent: number) => ({
  id: `t${quantity}`,
  quantity,
  price: null,
  discountPercent,
  availability: "available" as const,
  valueRange: null,
});
const pickSet = (quantity: number, percent: number, freeShipping: boolean) => ({
  id: `id-pick${quantity}`,
  slug: `pick-your-${quantity}`,
  title: `Pick Your ${quantity}`,
  subtitle: null,
  badgeText: null,
  heroImageUrl: null,
  type: "build_your_stack" as const,
  pricingType: "percentage_discount" as const,
  freeShipping,
  availability: "available" as const,
  requiredQuantity: quantity,
  unitCount: quantity,
  tiers: [tier(quantity, percent)],
  fixedBundlePrice: null,
  regularValue: null,
  savings: null,
  valueRange: null,
  eligibleProductCount: 40,
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

const renderHome = (locale: "en" | "ar", content: HomepageContent = DEFAULT_HOMEPAGE_CONTENT) =>
  render(
    <MinimalI18nProvider ssrLocale={locale}>
      <LandingTemplateMinimal
        content={content}
        setCampaigns={[pickSet(3, 20, false), pickSet(6, 15, true)] as never}
        bundleCampaigns={[]}
        categories={[{ id: "c1", name: "Ear Piercings", slug: "ear", imageUrl: null }] as never}
        featuredProducts={[product("p1", "Crystal L-Shape Stud")] as never}
        newArrivals={[
          product("p2", "Mini Flower Stud"),
          product("p4", "Pearl Flat Back"),
          product("p5", "Gold Helix Hoop"),
          product("p6", "Silver Nose Ring"),
        ] as never}
        discountedProducts={[product("p3", "Opal Daith Ring")] as never}
      />
    </MinimalI18nProvider>,
  );

/** Visible text with catalogue content removed. */
const interfaceText = () => {
  let all = document.body.textContent ?? "";
  for (const content of [
    "Crystal L-Shape Stud",
    "Mini Flower Stud",
    "Pearl Flat Back",
    "Gold Helix Hoop",
    "Silver Nose Ring",
    "Opal Daith Ring",
    "Daith",
    "Ear",
    "Nose",
    "Pick Your 3",
    "Pick Your 6",
  ]) {
    all = all.split(content).join(" ");
  }
  return all.replace(/EGP|ج\.م\.?/g, " ");
};

beforeEach(() => {
  localStorage.clear();
  // jsdom has no IntersectionObserver; the carousels only use it for reveal.
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Arabic homepage core UI", () => {
  it("section names and CTAs are Arabic", () => {
    const { container } = renderHome("ar");
    const text = container.textContent ?? "";
    expect(text).toContain("تسوّقي حسب مكان الثقب"); // "Shop by placement"
    expect(text).toContain("جديد"); // "New in"
    expect(text).toContain("الأطقم"); // "Sets"
    expect(text).toContain("كوّني طقمك"); // "Build your set"
    expect(text).toContain("تسوّقي الكل"); // "Shop all"
    expect(text).toContain("عرض الكل"); // "View all"
    expect(text).toContain("عرض القطعة"); // "View piece"
    for (const english of ["placement", "New in", "Sets", "Shop all", "View all", "View piece", "Build your set"]) {
      expect(text).not.toContain(english);
    }
  });

  it("set cards state their offer in Arabic", () => {
    const { container } = renderHome("ar");
    const text = container.querySelector('[data-testid="sets-merch"]')?.textContent ?? "";
    expect(text).toContain("Pick Your 3");
    expect(text).toContain("Pick Your 6");
    expect(text).toContain("خصم");
    expect(text).not.toMatch(/\boff\b/);
  });

  it("no English interface text is left — only catalogue content", () => {
    renderHome("ar");
    expect(interfaceText()).not.toMatch(/[A-Za-z]{2,}/);
  });

  it("the brand's standard hero copy is Arabic", () => {
    const { container } = renderHome("ar");
    const h1 = container.querySelector("h1");
    expect(h1?.textContent).toBe("قطع صغيرة. صُمّمت لتتناسق معًا.");
    expect(container.textContent).toContain("مجوهرات بيرسينج، توصيل لجميع أنحاء مصر.");
    expect(container.textContent).not.toContain(DEFAULT_HOMEPAGE_CONTENT.hero.title);
    expect(container.textContent).not.toContain(DEFAULT_HOMEPAGE_CONTENT.hero.subtitle);
  });

  it("the owner's own hero wording is not translated, and keeps its own direction so its punctuation stays put", () => {
    const custom = {
      ...DEFAULT_HOMEPAGE_CONTENT,
      hero: { ...DEFAULT_HOMEPAGE_CONTENT.hero, title: "Black Friday. Made to mix.", subtitle: "All week." },
    };
    const { container } = renderHome("ar", custom);
    const h1 = container.querySelector("h1");
    expect(h1?.textContent).toBe("Black Friday. Made to mix.");
    expect(h1?.getAttribute("dir")).toBe("auto");
    expect(container.querySelector("h1 + p")?.getAttribute("dir")).toBe("auto");
  });

  it("RTL stays intact", () => {
    renderHome("ar");
    expect(document.documentElement.getAttribute("dir")).toBe("rtl");
    expect(document.documentElement.getAttribute("lang")).toBe("ar");
  });

  it("English is unchanged", () => {
    const { container } = renderHome("en");
    const text = container.textContent ?? "";
    for (const english of ["Shop by placement", "New in", "Sets", "Shop all", "View all", "View piece", "Build your set", "20% off"]) {
      expect(text).toContain(english);
    }
  });
});

describe("localizeCmsLabel", () => {
  const t = (locale: "en" | "ar") => (key: string) => translations[locale][key] ?? key;

  it("maps the store's standard labels whatever their case/spacing", () => {
    expect(localizeCmsLabel("ar", t("ar"), { en: "  shop   ALL " })).toBe("تسوّقي الكل");
    expect(localizeCmsLabel("ar", t("ar"), { en: "View all sets" })).toBe("عرض كل الأطقم");
  });

  it("an empty CMS value falls back to the given key in both languages", () => {
    expect(localizeCmsLabel("ar", t("ar"), { en: "" }, "new_arrivals")).toBe("جديد");
    expect(localizeCmsLabel("en", t("en"), { en: "" }, "new_arrivals")).toBe("New in");
  });

  it("English returns the CMS value verbatim", () => {
    expect(localizeCmsLabel("en", t("en"), { en: "Shop all", ar: "تسوقي" })).toBe("Shop all");
  });
});
