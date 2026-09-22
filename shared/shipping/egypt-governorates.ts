/**
 * The store's canonical destination vocabulary: the 27 governorates of Egypt.
 *
 * This is the ONE list every shipping surface reads — the checkout selector,
 * the admin rate table, the zone provider and the order snapshot all key off
 * `code`. Codes are stable identifiers and must never be renamed once an
 * order has been stored with one; display names are free to change.
 *
 * `bostaCityAliases` are spelling variants Bosta's city list has been seen to
 * use for the same governorate. They are NOT consulted by anything yet: the
 * current Bosta dispatch path still fuzzy-matches the free-text address (see
 * backend/orders/bosta/districts.ts). They exist so the future
 * governorate-code → Bosta-city mapping has a home and doesn't need a second
 * list. Verify them against the live Bosta list before relying on them.
 *
 * Deliberately NOT included: sub-governorate or marketing destinations such
 * as "North Coast", "New Cairo" or "6th of October". Those are city/district
 * exceptions inside a governorate and are out of scope for governorate-level
 * rates.
 */
export interface EgyptGovernorate {
  /** Stable internal code. Stored on orders; never rename. */
  code: string;
  nameEn: string;
  nameAr: string;
  /** Spellings Bosta's `/cities` list is known to use for this governorate. Unverified hints for the future mapping pass. */
  bostaCityAliases: readonly string[];
}

export const EGYPT_GOVERNORATES = [
  { code: "CAI", nameEn: "Cairo", nameAr: "القاهرة", bostaCityAliases: ["Cairo"] },
  { code: "GIZ", nameEn: "Giza", nameAr: "الجيزة", bostaCityAliases: ["Giza"] },
  { code: "ALX", nameEn: "Alexandria", nameAr: "الإسكندرية", bostaCityAliases: ["Alexandria"] },
  { code: "QLB", nameEn: "Qalyubia", nameAr: "القليوبية", bostaCityAliases: ["Qalyubia", "Qalubia", "Kalyoubia"] },
  { code: "SHR", nameEn: "Sharqia", nameAr: "الشرقية", bostaCityAliases: ["Sharqia", "Sharkia", "El Sharkia"] },
  { code: "DKH", nameEn: "Dakahlia", nameAr: "الدقهلية", bostaCityAliases: ["Dakahlia", "Dakahleya", "El Dakahlia"] },
  { code: "GHR", nameEn: "Gharbia", nameAr: "الغربية", bostaCityAliases: ["Gharbia", "Gharbeya", "El Gharbia"] },
  { code: "MNF", nameEn: "Monufia", nameAr: "المنوفية", bostaCityAliases: ["Monufia", "Menofia", "Menoufia", "El Menofia"] },
  { code: "KFS", nameEn: "Kafr El Sheikh", nameAr: "كفر الشيخ", bostaCityAliases: ["Kafr El Sheikh", "Kafr Alsheikh", "Kafr El-Sheikh"] },
  { code: "BHR", nameEn: "Beheira", nameAr: "البحيرة", bostaCityAliases: ["Beheira", "Behira", "El Beheira"] },
  { code: "DMT", nameEn: "Damietta", nameAr: "دمياط", bostaCityAliases: ["Damietta", "Dumyat"] },
  { code: "PTS", nameEn: "Port Said", nameAr: "بورسعيد", bostaCityAliases: ["Port Said", "Port-Said", "Portsaid"] },
  { code: "ISM", nameEn: "Ismailia", nameAr: "الإسماعيلية", bostaCityAliases: ["Ismailia", "Ismailiya"] },
  { code: "SUZ", nameEn: "Suez", nameAr: "السويس", bostaCityAliases: ["Suez"] },
  { code: "NSI", nameEn: "North Sinai", nameAr: "شمال سيناء", bostaCityAliases: ["North Sinai"] },
  { code: "SSI", nameEn: "South Sinai", nameAr: "جنوب سيناء", bostaCityAliases: ["South Sinai"] },
  { code: "MTR", nameEn: "Matrouh", nameAr: "مطروح", bostaCityAliases: ["Matrouh", "Marsa Matrouh", "Matruh"] },
  { code: "FYM", nameEn: "Faiyum", nameAr: "الفيوم", bostaCityAliases: ["Faiyum", "Fayoum", "El Fayoum"] },
  { code: "BNS", nameEn: "Beni Suef", nameAr: "بني سويف", bostaCityAliases: ["Beni Suef", "Bani Suef", "Beni-Suef"] },
  { code: "MNY", nameEn: "Minya", nameAr: "المنيا", bostaCityAliases: ["Minya", "Menia", "El Minya"] },
  { code: "AST", nameEn: "Asyut", nameAr: "أسيوط", bostaCityAliases: ["Asyut", "Assiut", "Assuit"] },
  { code: "SHG", nameEn: "Sohag", nameAr: "سوهاج", bostaCityAliases: ["Sohag", "Suhag"] },
  { code: "QNA", nameEn: "Qena", nameAr: "قنا", bostaCityAliases: ["Qena", "Kena"] },
  { code: "LXR", nameEn: "Luxor", nameAr: "الأقصر", bostaCityAliases: ["Luxor"] },
  { code: "ASW", nameEn: "Aswan", nameAr: "أسوان", bostaCityAliases: ["Aswan"] },
  { code: "RSA", nameEn: "Red Sea", nameAr: "البحر الأحمر", bostaCityAliases: ["Red Sea", "Hurghada"] },
  { code: "NVL", nameEn: "New Valley", nameAr: "الوادي الجديد", bostaCityAliases: ["New Valley", "El Wadi El Gedid"] },
] as const satisfies readonly EgyptGovernorate[];

export type GovernorateCode = (typeof EGYPT_GOVERNORATES)[number]["code"];

export const GOVERNORATE_CODES = EGYPT_GOVERNORATES.map((g) => g.code) as [
  GovernorateCode,
  ...GovernorateCode[],
];

const byCode = new Map<string, EgyptGovernorate>(
  EGYPT_GOVERNORATES.map((g) => [g.code, g]),
);

export function isGovernorateCode(value: unknown): value is GovernorateCode {
  return typeof value === "string" && byCode.has(value);
}

export function getGovernorate(code: string): EgyptGovernorate | undefined {
  return byCode.get(code);
}

/** Display name in the storefront's active language. */
export function governorateLabel(
  g: Pick<EgyptGovernorate, "nameEn" | "nameAr">,
  language: "en" | "ar",
): string {
  return language === "ar" ? g.nameAr : g.nameEn;
}
