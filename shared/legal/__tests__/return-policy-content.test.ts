import { describe, expect, it } from "vitest";
import {
  isLegacyReturnPolicyPlaceholder,
  resolveReturnPolicyContent,
} from "../return-policy-content";
import { RETURNS_POLICY_POINTS } from "../returns-policy";
import {
  DEFAULT_HOMEPAGE_CONTENT,
  type HomepageReturnPolicyContent,
} from "#root/shared/types/homepage-content";

/** The exact placeholder row that shipped before the policy was approved. */
const LEGACY_PLACEHOLDER: HomepageReturnPolicyContent = {
  enabled: false,
  title: "Returns & exchange",
  titleAr: "الاستبدال والإرجاع",
  intro:
    "Our return policy has not been published yet. Set it from Dashboard > Homepage > Return Policy before enabling this page.",
  introAr: "لم يتم نشر سياسة الإرجاع بعد. يرجى ضبطها من لوحة التحكم قبل تفعيل هذه الصفحة.",
  steps: [],
  detailSections: [],
  footerPrefix: "Need help?",
  supportEmail: "",
  footerMiddle: "or via our",
  contactLinkLabel: "Contact Us page",
  contactLinkUrl: "/contact",
};

describe("owner-approved returns policy", () => {
  it("is exactly the approved wording, in English and Arabic", () => {
    expect(RETURNS_POLICY_POINTS.map((p) => p.text)).toEqual([
      "Eligible orders can be returned within 14 days.",
      "If a jewellery piece changes colour, contact Percé for a return even outside the standard 14-day window.",
    ]);
    expect(RETURNS_POLICY_POINTS.map((p) => p.textAr)).toEqual([
      "يمكن إرجاع الطلبات المؤهلة خلال 14 يومًا.",
      "إذا تغيّر لون قطعة المجوهرات، تواصل مع Percé لطلب الإرجاع حتى بعد انتهاء فترة الـ14 يومًا المعتادة.",
    ]);
  });

  it("states a return remedy, never a product or material claim", () => {
    const all = RETURNS_POLICY_POINTS.flatMap((p) => [p.title, p.text]).join(" ").toLowerCase();
    for (const claim of ["tarnish", "never change", "waterproof", "lifetime", "guarantee", "warranty", "hypoallergenic"]) {
      expect(all).not.toContain(claim);
    }
  });

  it("is the published default /return-policy page, with no invented exclusions", () => {
    const page = DEFAULT_HOMEPAGE_CONTENT.returnPolicy as HomepageReturnPolicyContent;
    expect(page.enabled).toBe(true);
    expect(page.steps.map((s) => s.description)).toEqual(RETURNS_POLICY_POINTS.map((p) => p.text));
    expect(page.steps.map((s) => s.descriptionAr)).toEqual(RETURNS_POLICY_POINTS.map((p) => p.textAr));
    expect(page.detailSections).toEqual([]);
    expect(page.supportEmail).toBe("piercingperce@gmail.com");
  });
});

describe("resolveReturnPolicyContent", () => {
  it("upgrades the untouched pre-approval placeholder to the approved policy", () => {
    expect(isLegacyReturnPolicyPlaceholder(LEGACY_PLACEHOLDER)).toBe(true);
    expect(resolveReturnPolicyContent(LEGACY_PLACEHOLDER)).toBe(DEFAULT_HOMEPAGE_CONTENT.returnPolicy);
  });

  it("uses the approved policy when nothing is stored", () => {
    expect(resolveReturnPolicyContent(undefined)).toBe(DEFAULT_HOMEPAGE_CONTENT.returnPolicy);
  });

  it("never overrides anything an admin wrote", () => {
    const edited = { ...LEGACY_PLACEHOLDER, intro: "Our own words." };
    expect(resolveReturnPolicyContent(edited)).toBe(edited);
    const switchedOn = { ...LEGACY_PLACEHOLDER, enabled: true };
    expect(resolveReturnPolicyContent(switchedOn)).toBe(switchedOn);
  });
});
