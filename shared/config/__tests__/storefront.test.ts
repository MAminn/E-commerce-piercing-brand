import { describe, it, expect } from "vitest";
import {
  DEFAULT_NAVBAR_STYLE,
  DEFAULT_LANDING_TEMPLATE_ID,
  DEFAULT_PRODUCT_TEMPLATE_ID,
  PERCE_TEMPLATE_PRESET,
  resolveLandingTemplateId,
  resolveTemplateId,
  type StorefrontTemplateCategory,
} from "../storefront";
import { DEFAULT_LAYOUT_SETTINGS } from "#root/shared/types/layout-settings";
import { templateConfig } from "#root/components/template-system/templateConfig";

describe("storefront shell defaults", () => {
  it("keeps the layout-settings fallback in sync with DEFAULT_NAVBAR_STYLE", () => {
    // shared/types/layout-settings.ts hardcodes the literal to stay
    // dependency-free; this is the guard that the two never drift.
    expect(DEFAULT_LAYOUT_SETTINGS.header.navbarStyle).toBe(
      DEFAULT_NAVBAR_STYLE,
    );
  });

  it("points at a landing template that actually exists", () => {
    const ids = templateConfig.landing.map((t) => t.id);
    expect(ids).toContain(DEFAULT_LANDING_TEMPLATE_ID);
  });

  it("falls back only when no template is selected", () => {
    expect(resolveLandingTemplateId(undefined)).toBe(
      DEFAULT_LANDING_TEMPLATE_ID,
    );
    expect(resolveLandingTemplateId({})).toBe(DEFAULT_LANDING_TEMPLATE_ID);
    expect(resolveLandingTemplateId({ landing: "" })).toBe(
      DEFAULT_LANDING_TEMPLATE_ID,
    );
    expect(resolveLandingTemplateId({ landing: "landing-noir" })).toBe(
      "landing-noir",
    );
  });
});

describe("Percé production template preset", () => {
  const categories = Object.keys(
    PERCE_TEMPLATE_PRESET,
  ) as StorefrontTemplateCategory[];

  it("covers every category the template registry exposes", () => {
    // A category present in the registry but missing from the preset would
    // silently fall back to `templateConfig[category][0]` again, which is the
    // hidden default this preset exists to replace.
    expect(categories.sort()).toEqual(Object.keys(templateConfig).sort());
  });

  it.each(categories)(
    "resolves %s to a template id that exists in the registry",
    (category) => {
      const ids = templateConfig[category].map((t) => t.id);
      expect(ids).toContain(PERCE_TEMPLATE_PRESET[category]);
    },
  );

  it("agrees with the individual landing and product constants", () => {
    expect(PERCE_TEMPLATE_PRESET.landing).toBe(DEFAULT_LANDING_TEMPLATE_ID);
    expect(PERCE_TEMPLATE_PRESET.productPage).toBe(DEFAULT_PRODUCT_TEMPLATE_ID);
  });

  it("never falls back to a template that renders its own chrome", () => {
    // Every *-editorial template wraps itself in EditorialChrome, which
    // renders a second footer and hides the global one from a client-only
    // effect — so SSR emits both and one vanishes on hydration.
    for (const category of categories) {
      expect(PERCE_TEMPLATE_PRESET[category]).not.toMatch(/-editorial$/);
    }
  });
});

describe("resolveTemplateId", () => {
  it("prefers the configured value over the preset", () => {
    expect(resolveTemplateId("cartPage", "cart-editorial")).toBe(
      "cart-editorial",
    );
    expect(resolveTemplateId("searchResults", "search-results-grid")).toBe(
      "search-results-grid",
    );
  });

  it("falls back to the preset for every empty-ish selection", () => {
    for (const empty of [null, undefined, "", "   "]) {
      expect(resolveTemplateId("checkoutPage", empty)).toBe(
        PERCE_TEMPLATE_PRESET.checkoutPage,
      );
    }
  });
});
