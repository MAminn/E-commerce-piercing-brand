import type {
  CustomFontFileRow,
  TypographyRoleKey,
  TypographySettings,
} from "#root/shared/database/drizzle/schema";

/**
 * The site's built-in typeface. Percé uses ONE tight modern grotesque for
 * every role (Inter Tight, self-hosted via @fontsource in layouts/style.css);
 * a role falls back to it when unassigned, so a store that never touches
 * Typography settings renders in the brand face throughout. Keep this in
 * step with `--perce-font-sans` in layouts/style.css.
 */
const PERCE_FONT_STACK = `"Inter Tight Variable", "Inter Tight", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;

const ROLE_FALLBACK_STACK: Record<TypographyRoleKey, string> = {
  heading: PERCE_FONT_STACK,
  body: PERCE_FONT_STACK,
  buttons: PERCE_FONT_STACK,
  nav: PERCE_FONT_STACK,
  productTitle: PERCE_FONT_STACK,
  price: PERCE_FONT_STACK,
  formInput: PERCE_FONT_STACK,
};

const ROLE_CSS_VAR: Record<TypographyRoleKey, string> = {
  heading: "--font-heading",
  body: "--font-body",
  buttons: "--font-buttons",
  nav: "--font-nav",
  productTitle: "--font-product-title",
  price: "--font-price",
  formInput: "--font-form-input",
};

function escapeCssString(value: string): string {
  return value.replace(/["\\]/g, "\\$&");
}

// CustomFontFileRow.format stores the short extension token ("ttf") used for
// matching/display, but @font-face src's format() requires the real CSS
// keyword — "ttf" is not a valid format() value and browsers silently skip
// the source when it's wrong, so the font never loads.
const CSS_FORMAT_KEYWORD: Record<CustomFontFileRow["format"], string> = {
  woff2: "woff2",
  woff: "woff",
  ttf: "truetype",
};

/**
 * Builds the `<style>` contents for admin-assigned typography: real
 * @font-face rules for every uploaded weight/style actually referenced by a
 * role, plus a :root block of CSS custom properties every template reads
 * from (layouts/style.css, components/ui/button.tsx, etc). Unassigned roles
 * resolve to the site's existing hardcoded fonts, so this is purely additive
 * — safe to call even when nothing has been configured yet.
 */
export function buildTypographyHeadCss(
  settings: TypographySettings | undefined,
  fonts: CustomFontFileRow[] | undefined,
): string {
  const roles = settings?.roles;
  const fontFiles = fonts ?? [];

  const assignedPairs = new Set<string>();
  if (roles) {
    for (const assignment of Object.values(roles)) {
      if (assignment) {
        assignedPairs.add(`${assignment.familyName}::${assignment.weight}`);
      }
    }
  }

  const relevantFiles = fontFiles.filter((f) =>
    assignedPairs.has(`${f.familyName}::${f.weight}`),
  );

  const fontFaceRules = relevantFiles
    .map(
      (f) => `@font-face {
  font-family: "${escapeCssString(f.familyName)}";
  src: url("${f.fileUrl}") format("${CSS_FORMAT_KEYWORD[f.format]}");
  font-weight: ${f.weight};
  font-style: ${f.style};
  font-display: swap;
}`,
    )
    .join("\n");

  const varLines = (Object.keys(ROLE_CSS_VAR) as TypographyRoleKey[]).map((role) => {
    const assignment = roles?.[role];
    const fallback = ROLE_FALLBACK_STACK[role];
    const value = assignment
      ? `"${escapeCssString(assignment.familyName)}", ${fallback}`
      : fallback;
    return `  ${ROLE_CSS_VAR[role]}: ${value};`;
  });

  return `${fontFaceRules}\n:root {\n${varLines.join("\n")}\n}`;
}
