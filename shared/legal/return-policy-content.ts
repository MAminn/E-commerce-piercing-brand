import {
  DEFAULT_HOMEPAGE_CONTENT,
  type HomepageReturnPolicyContent,
} from "#root/shared/types/homepage-content";
import { RETURNS_POLICY_POINTS } from "./returns-policy";

/**
 * The intro of the unpublished placeholder that shipped before the policy was
 * approved. A stored row still carrying it (and still switched off) is that
 * untouched placeholder — no admin ever wrote a policy into it — so it is
 * upgraded to the approved policy at read time instead of hiding the page.
 * Anything an admin actually edited is returned exactly as stored.
 */
const LEGACY_PLACEHOLDER_INTRO =
  "Our return policy has not been published yet. Set it from Dashboard > Homepage > Return Policy before enabling this page.";

export function isLegacyReturnPolicyPlaceholder(
  stored: HomepageReturnPolicyContent | undefined | null,
): boolean {
  return (
    !!stored &&
    stored.enabled === false &&
    stored.intro?.trim() === LEGACY_PLACEHOLDER_INTRO
  );
}

/** Stored CMS value → what the storefront, the admin editor and emails use. */
export function resolveReturnPolicyContent(
  stored: HomepageReturnPolicyContent | undefined | null,
): HomepageReturnPolicyContent | undefined {
  if (!stored || isLegacyReturnPolicyPlaceholder(stored)) {
    return DEFAULT_HOMEPAGE_CONTENT.returnPolicy;
  }
  return stored;
}

/** One bilingual line of the email's returns section. */
export interface ReturnsPolicyLine {
  en: string;
  ar: string;
}

/**
 * The returns lines for the order-confirmation email: the PUBLISHED CMS
 * policy's steps when the page is on, otherwise the approved points. Arabic
 * falls back to the English text when an admin left it blank — the same rule
 * the /return-policy page uses. `published` says whether /return-policy is
 * live, i.e. whether the email may link to it.
 */
export function returnsPolicyEmailLines(
  stored: HomepageReturnPolicyContent | undefined | null,
): { lines: ReturnsPolicyLine[]; published: boolean } {
  const resolved = resolveReturnPolicyContent(stored);
  const fromCms = resolved?.enabled
    ? resolved.steps
        .map((step) => ({
          en: step.description.trim(),
          ar: (step.descriptionAr || step.description).trim(),
        }))
        .filter((line) => line.en !== "")
    : [];
  if (fromCms.length > 0) return { lines: fromCms, published: true };
  return {
    lines: RETURNS_POLICY_POINTS.map((p) => ({ en: p.text, ar: p.textAr })),
    published: false,
  };
}
