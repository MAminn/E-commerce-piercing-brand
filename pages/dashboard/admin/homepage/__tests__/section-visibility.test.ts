import { describe, expect, it } from "vitest";
import { isHomepageSectionEditable } from "../section-visibility";

/**
 * The Homepage admin page gates its Hero, Brand Statement, Promo Banner and
 * Value Propositions cards on this rule. landing-minimal renders hero.* and
 * brandStatement.* on the storefront, so those cards must be offered for it —
 * otherwise persisted copy in those sections can never be edited or cleared.
 */
describe("isHomepageSectionEditable — landing-minimal (the active template)", () => {
  it("offers the Hero controls (PerceHero renders hero.*)", () => {
    expect(isHomepageSectionEditable("hero", "landing-minimal")).toBe(true);
  });

  it("offers the Brand Statement controls (PerceEditorialBlock renders brandStatement.*)", () => {
    expect(isHomepageSectionEditable("brandStatement", "landing-minimal")).toBe(true);
  });

  it("still hides the sections landing-minimal never renders", () => {
    expect(isHomepageSectionEditable("promoBanner", "landing-minimal")).toBe(false);
    expect(isHomepageSectionEditable("valueProps", "landing-minimal")).toBe(false);
  });
});

describe("isHomepageSectionEditable — other landing templates", () => {
  it.each(["landing-modern", "landing-classic", "landing-editorial", "landing-noir"])(
    "%s keeps every card, as before",
    (templateId) => {
      for (const section of ["hero", "brandStatement", "promoBanner", "valueProps"] as const) {
        expect(isHomepageSectionEditable(section, templateId)).toBe(true);
      }
    },
  );
});
