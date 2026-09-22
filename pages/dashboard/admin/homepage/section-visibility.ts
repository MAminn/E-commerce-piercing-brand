/**
 * Which Homepage admin cards are hidden for a given landing template.
 *
 * A card is hidden only when the selected template never reads that CMS
 * section, so the admin is not offered copy that cannot appear anywhere. It
 * must never hide a section the template renders — landing-minimal draws
 * `hero.*` (PerceHero) and `brandStatement.*` (PerceEditorialBlock), yet both
 * cards used to be gated `!isMinimal`, so persisted ZELI-era values in those
 * sections overrode the Percé defaults with no Dashboard way to clear them.
 *
 * Minimal-only cards (Categories, Bundles, Contact Banner, …) are the
 * opposite case and stay on their own `isMinimal` checks in the page.
 */
export type TemplateGatedSection =
  | "hero"
  | "brandStatement"
  | "promoBanner"
  | "valueProps";

/** Sections landing-minimal does not render (see LandingTemplateMinimal). */
const HIDDEN_ON_MINIMAL: ReadonlySet<TemplateGatedSection> = new Set([
  "promoBanner",
  "valueProps",
]);

export function isHomepageSectionEditable(
  section: TemplateGatedSection,
  templateId: string,
): boolean {
  if (templateId === "landing-minimal") return !HIDDEN_ON_MINIMAL.has(section);
  return true;
}
