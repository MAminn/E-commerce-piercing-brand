/**
 * The data behind the Object Index line ("014 · Clicker / 10 mm · EGP 210").
 * Pure and shared by the server and the browser. Nothing here invents a
 * value: a field the product does not have is simply absent, and the line
 * renders without it.
 */

/** Catalogue numbers are shown as three digits, so 999 is the ceiling. */
export const CATALOGUE_NO_MAX = 999;

/** 14 → "014". Anything that is not a whole number 1–999 → null (omitted). */
export function formatCatalogueNo(no: number | null | undefined): string | null {
  if (typeof no !== "number" || !Number.isInteger(no) || no < 1 || no > CATALOGUE_NO_MAX) return null;
  return String(no).padStart(3, "0");
}

/**
 * A measure anywhere in a product name: "10mm", "8 mm", "1.2mm", "16g", "16 ga",
 * "16 gauge". Standing alone: not part of a longer word or number ("L-bend",
 * "3-10mm", "18k"), and not one side of a dimension ("10 x 8 mm").
 */
const MEASURE = /(?<![\w.\-])(\d{1,2}(?:\.\d{1,2})?)\s?(mm|gauge|ga|g)(?![\w\-])/gi;
const DIMENSION_BEFORE = /\d\s?[x×]\s?$/i;
const DIMENSION_AFTER = /^\s?[x×]\s?\d/i;
/** Body jewellery runs 10G (thickest here) to 24G; "3g" would be a weight. */
const isGauge = (value: number) => Number.isInteger(value) && value >= 10 && value <= 24;

/** A separator standing on its own between words: "Clicker – Gold". */
const SEPARATOR = /^[–—|/,·:-]$/;

/** Removes what taking a measure out leaves behind: "()", " – – ", a trailing "–" or ",". */
function tidyTitle(text: string): string {
  const tokens = text
    .replace(/[([]\s*[)\]]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const kept: string[] = [];
  for (const token of tokens) {
    if (SEPARATOR.test(token)) {
      const last = kept[kept.length - 1];
      if (last === undefined || SEPARATOR.test(last)) continue;
      if (last.endsWith(",")) kept[kept.length - 1] = last.slice(0, -1);
    }
    kept.push(token);
  }
  while (kept.length > 0 && SEPARATOR.test(kept[kept.length - 1] ?? "")) kept.pop();
  const last = kept[kept.length - 1];
  if (last?.endsWith(",")) kept[kept.length - 1] = last.slice(0, -1);
  return kept.join(" ");
}

/**
 * Splits measures off a product name, as stored by the owner, wherever they sit:
 *   "Clicker 10mm"            → { title: "Clicker", measures: ["10 mm"] }
 *   "Clicker 10mm – Gold"     → { title: "Clicker – Gold", measures: ["10 mm"] }
 *   "8mm Crystal Hoop – Gold" → { title: "Crystal Hoop – Gold", measures: ["8 mm"] }
 *   "Labret (16g, 8mm)"       → { title: "Labret", measures: ["16G", "8 mm"] }
 *   "Set – Gold (3 Pieces)"   → unchanged, no measures
 * Gauge is written "16G", millimetres "10 mm". The product has no separate
 * size/gauge fields, so the name is the only source; when it carries none,
 * nothing is shown and nothing is guessed. A name that would be left with no
 * words keeps its full text.
 */
export function splitMeasures(name: string): { title: string; measures: string[] } {
  const original = name.trim();
  const measures: string[] = [];
  const stripped = original.replace(MEASURE, (whole, value: string, unit: string, at: number, all: string) => {
    const number = Number(value);
    const isMm = /^mm$/i.test(unit);
    if (number <= 0 || (!isMm && !isGauge(number))) return whole;
    if (DIMENSION_BEFORE.test(all.slice(0, at)) || DIMENSION_AFTER.test(all.slice(at + whole.length))) return whole;
    const measure = isMm ? `${value} mm` : `${value}G`;
    if (!measures.includes(measure)) measures.push(measure);
    return " ";
  });
  if (measures.length === 0) return { title: original, measures };
  const title = tidyTitle(stripped.replace(/\(\s*,\s*/g, "(").replace(/,\s*\)/g, ")").replace(/\(\s*,?\s*\)/g, " "));
  if (!/[\p{L}]/u.test(title)) return { title: original, measures: [] };
  return { title, measures };
}

/**
 * "Ear Piercings" → "Ear", "Nose piercing" → "Nose". A placement is named by
 * the body part; the category keeps its full name everywhere else. A name
 * that would be left empty, or a word that is not a body part ("Fake
 * Piercings"), is returned unchanged.
 */
export function placementLabel(categoryName: string): string {
  const stripped = categoryName.replace(/\s+piercings?$/i, "").trim();
  // "Fake" names a kind of piece, not a place on the body: it keeps its word.
  if (/^(fake|faux|clip[\s-]?on)$/i.test(stripped)) return categoryName.trim();
  return stripped || categoryName.trim();
}
