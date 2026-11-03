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
 * A trailing measure in a product name: "10mm", "8 mm", "1.2mm", "16g",
 * "16 ga", "16 gauge". Only these two units, and only at the very end of the
 * name — "QA Piece 01 Titanium Stud" or "Nose stud L-bend" carry none.
 */
const TRAILING_MEASURE = /\s+(\d{1,2}(?:\.\d{1,2})?)\s?(mm|ga|gauge|g)$/i;

/**
 * Splits trailing measures off a product name, as stored by the owner:
 *   "Clicker 10mm"          → { title: "Clicker", measures: ["10 mm"] }
 *   "Labret 16g 8mm"        → { title: "Labret", measures: ["16G", "8 mm"] }
 *   "Nose stud L-bend"      → { title: "Nose stud L-bend", measures: [] }
 * Gauge is written "16G", millimetres "10 mm". The product has no separate
 * size/gauge fields, so the name is the only source; when it carries none,
 * nothing is shown. A name that is only a measure keeps its full text.
 */
export function splitMeasures(name: string): { title: string; measures: string[] } {
  let title = name.trim();
  const measures: string[] = [];
  for (let m = TRAILING_MEASURE.exec(title); m; m = TRAILING_MEASURE.exec(title)) {
    const [whole, value, unit] = m;
    const rest = title.slice(0, title.length - whole.length).trim();
    if (!rest) break;
    measures.unshift(/^mm$/i.test(unit ?? "") ? `${value} mm` : `${value}G`);
    title = rest;
  }
  return { title, measures };
}

/**
 * "Ear Piercings" → "Ear", "Nose piercing" → "Nose". A placement is named by
 * the body part; the category keeps its full name everywhere else. A name
 * that would be left empty is returned unchanged.
 */
export function placementLabel(categoryName: string): string {
  const stripped = categoryName.replace(/\s+piercings?$/i, "").trim();
  return stripped || categoryName.trim();
}
