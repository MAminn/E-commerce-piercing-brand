// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

/**
 * Arabic homepage: the section headings and CTAs the CMS stores in English
 * only ("Shop all", "Shop by placement", "Featured", "New in", "View all",
 * "Offers") and the Pick Your Set block render in Arabic, with the page in
 * RTL. A merchant's Arabic field wins; custom English copy without one is
 * preserved, never machine-translated; English is unchanged.
 */
vi.mock("#root/lib/context/CartContext", () => ({ useCart: () => ({ addItem: () => true, items: [] }) }));
vi.mock("#root/frontend/contexts/TrackingContext", () => ({ useTracking: () => ({ trackEvent: () => {} }) }));
vi.mock("vike-react/usePageContext", () => ({ usePageContext: () => ({ urlPathname: "/" }) }));
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
        newArrivals={[product("p2", "Mini Flower Stud")] as never}
        discountedProducts={[product("p3", "Opal Daith Ring")] as never}
      />
    </MinimalI18nProvider>,
  );

/** Visible text with catalogue content and the brand's hero copy removed. */
const interfaceText = () => {
  let all = document.body.textContent ?? "";
  for (const content of [
    "Crystal L-Shape Stud",
    "Mini Flower Stud",
    "Opal Daith Ring",
    "Ear Piercings",
    "Pick Your 3",
    "Pick Your 6",
    DEFAULT_HOMEPAGE_CONTENT.hero.title,
    DEFAULT_HOMEPAGE_CONTENT.hero.subtitle,
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
  it("section headings and CTAs are Arabic", () => {
    const { container } = renderHome("ar");
    const text = container.textContent ?? "";
    expect(text).toContain("تسوّقي الكل"); // hero CTA "Shop all"
    expect(text).toContain("تسوّقي حسب مكان الثقب"); // "Shop by placement"
    expect(text).toContain("مميز"); // "Featured"
    expect(text).toContain("جديد"); // "New in"
    expect(text).toContain("عرض الكل"); // "View all"
    expect(text).toContain("عروض"); // "Offers"
    for (const english of ["Shop all", "Shop by placement", "Featured", "New in", "View all", "Offers"]) {
      expect(text).not.toContain(english);
    }
  });

  it("the Pick Your Set block is Arabic: eyebrow, title, terms, free shipping and CTAs", () => {
    const { container } = renderHome("ar");
    const block = container.querySelector("[data-pick-your-set]")!;
    const text = block.textContent ?? "";
    expect(text).toContain("اختاري طقمك");
    expect(text).toContain("قطع أكثر. سعر أفضل.");
    expect(text).toContain("كل الأطقم");
    expect(text).toContain("+ شحن مجاني");
    expect(block.querySelector('a[href="/bundles/pick-your-3"]:last-of-type')).toBeTruthy();
    expect(text).toContain("تسوّقي 3 قطع");
    expect(text).toContain("تسوّقي 6 قطع");
  });

  it("no English interface text is left — only catalogue content and the brand's hero copy", () => {
    renderHome("ar");
    expect(interfaceText()).not.toMatch(/[A-Za-z]{2,}/);
  });

  it("RTL stays intact", () => {
    renderHome("ar");
    expect(document.documentElement.getAttribute("dir")).toBe("rtl");
    expect(document.documentElement.getAttribute("lang")).toBe("ar");
  });

  it("a merchant's Arabic field wins; custom English without one is preserved, not translated", () => {
    const content: HomepageContent = {
      ...DEFAULT_HOMEPAGE_CONTENT,
      categories: { ...DEFAULT_HOMEPAGE_CONTENT.categories, title: "Shop by placement", titleAr: "حسب المكان" },
      featuredProducts: { ...DEFAULT_HOMEPAGE_CONTENT.featuredProducts, title: "Trending now" },
    };
    const { container } = renderHome("ar", content);
    expect(container.textContent).toContain("حسب المكان");
    expect(container.textContent).toContain("Trending now");
  });

  it("English is unchanged", () => {
    const { container } = renderHome("en");
    const text = container.textContent ?? "";
    for (const english of ["Shop all", "Shop by placement", "Featured", "New in", "View all", "Offers"]) {
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
