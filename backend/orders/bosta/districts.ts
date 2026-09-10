const BOSTA_API_BASE = "https://app.bosta.co/api/v2";
const DEFAULT_EGYPT_COUNTRY_ID = "60e4482c7cb7d4bc4849c4d5";

function getBostaApiKey(): string | null {
  return process.env.SYN_BOSTA_KEY ?? null;
}

export interface BostaDistrictEntry {
  cityId: string;
  cityCode: string;
  cityName: string;
  cityOtherName?: string;
  zoneId: string;
  zoneName: string;
  zoneOtherName?: string;
  districtId: string;
  districtName: string;
  districtOtherName?: string;
}

/** Full drop-off shape for Bosta create-delivery API. */
export interface BostaResolvedDropOffAddress {
  city: string;
  zoneId: string;
  districtId: string;
  firstLine: string;
  secondLine: string;
  buildingNumber: string;
  floor: string;
  apartment: string;
}

export interface BostaCheckoutDistrict {
  districtId: string;
  districtName: string;
}

export interface BostaCheckoutZone {
  zoneId: string;
  zoneName: string;
  districts: BostaCheckoutDistrict[];
}

export interface BostaCheckoutCity {
  cityId: string;
  cityName: string;
  zones: BostaCheckoutZone[];
}

let cachedDistricts: BostaDistrictEntry[] | null = null;
let cacheLoadedAt = 0;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Space-insensitive normalization — Bosta's own data is inconsistently
 * spaced (e.g. "ElMaadi" vs "Ein Shams"), so a plain single-space-collapsed
 * compare misses very common customer input like "el maadi". */
function normalizeStripped(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

function fuzzyEquals(a: string, b: string): boolean {
  if (!a.trim() || !b.trim()) return false;
  const aNorm = normalize(a);
  const bNorm = normalize(b);
  if (aNorm === bNorm || aNorm.includes(bNorm) || bNorm.includes(aNorm)) {
    return true;
  }
  const aStripped = normalizeStripped(a);
  const bStripped = normalizeStripped(b);
  return (
    aStripped === bStripped ||
    aStripped.includes(bStripped) ||
    bStripped.includes(aStripped)
  );
}

function anyMatch(hint: string, ...candidates: Array<string | undefined>): boolean {
  return candidates.some((candidate) => !!candidate && fuzzyEquals(hint, candidate));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function pickString(obj: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const val = obj[key];
    if (typeof val === "string" && val.trim()) return val.trim();
  }
  return undefined;
}

function parseZoneHint(zone?: string | null): string {
  if (!zone?.trim()) return "";
  const trimmed = zone.trim();
  if (trimmed.includes(" - ")) {
    const [part1, part2] = trimmed.split(" - ").map((part) => part.trim());
    return part1 || part2 || trimmed;
  }
  return trimmed;
}

function flattenDistrictsPayload(payload: unknown): BostaDistrictEntry[] {
  const entries: BostaDistrictEntry[] = [];
  const root = asRecord(payload);
  const list = Array.isArray(payload)
    ? payload
    : Array.isArray(root?.data)
      ? root!.data
      : Array.isArray(root?.result)
        ? root!.result
        : [];

  for (const cityItem of list) {
    const cityRec = asRecord(cityItem);
    if (!cityRec) continue;

    const cityName = pickString(cityRec, "cityName", "name", "cityNameEn", "nameEn") ?? "Unknown";
    const cityOtherName = pickString(cityRec, "cityOtherName");
    const cityCode = pickString(cityRec, "cityCode", "code") ?? "";
    const cityId = pickString(cityRec, "cityId", "_id", "id") ?? "";

    const districts = Array.isArray(cityRec.districts)
      ? cityRec.districts
      : Array.isArray(cityRec.zones)
        ? cityRec.zones
        : [];

    for (const districtItem of districts) {
      const dRec = asRecord(districtItem);
      if (!dRec) continue;

      const districtId = pickString(dRec, "districtId");
      const districtName = pickString(dRec, "districtName", "name", "nameEn");
      const districtOtherName = pickString(dRec, "districtOtherName");
      const zoneName = pickString(dRec, "zoneName", "zone") ?? districtName;
      const zoneOtherName = pickString(dRec, "zoneOtherName");
      const zoneId = pickString(dRec, "zoneId") ?? "";

      if (!districtId || !districtName || !cityCode || !zoneId) continue;

      entries.push({
        cityId,
        cityCode,
        cityName,
        cityOtherName,
        zoneId,
        zoneName: zoneName ?? districtName,
        zoneOtherName,
        districtId,
        districtName,
        districtOtherName,
      });
    }
  }

  return entries;
}

async function loadDistricts(): Promise<BostaDistrictEntry[]> {
  const now = Date.now();
  if (cachedDistricts && now - cacheLoadedAt < CACHE_TTL_MS) {
    return cachedDistricts;
  }

  const apiKey = getBostaApiKey();
  if (!apiKey) return [];

  const countryId = process.env.BOSTA_EGYPT_COUNTRY_ID ?? DEFAULT_EGYPT_COUNTRY_ID;
  const res = await fetch(
    `${BOSTA_API_BASE}/cities/getAllDistricts?countryId=${encodeURIComponent(countryId)}`,
    {
      headers: { Authorization: apiKey },
    },
  );

  const payload = await res.json();
  if (!res.ok) {
    const msg =
      (asRecord(payload)?.message as string | undefined) ??
      `Bosta districts API error ${res.status}`;
    throw new Error(msg);
  }

  cachedDistricts = flattenDistrictsPayload(payload);
  cacheLoadedAt = now;
  return cachedDistricts;
}

// Exported for direct unit testing — pure matching logic, no I/O.
export function findDistrictMatch(
  districts: BostaDistrictEntry[],
  city: string,
  zoneHint: string,
  districtHint?: string,
): BostaDistrictEntry | undefined {
  const inCity = districts.filter((d) =>
    anyMatch(city, d.cityName, d.cityOtherName, d.cityCode),
  );

  const pool = inCity.length > 0 ? inCity : districts;

  // District is the most specific hint the customer gives us — try it first.
  if (districtHint) {
    const hit = pool.find((d) =>
      anyMatch(districtHint, d.districtName, d.districtOtherName),
    );
    if (hit) return hit;
  }

  if (zoneHint) {
    const hit = pool.find((d) =>
      anyMatch(
        zoneHint,
        d.zoneName,
        d.zoneOtherName,
        d.districtName,
        d.districtOtherName,
      ),
    );
    if (hit) return hit;
  }

  if (inCity.length > 0) return inCity[0];

  // No city match at all — last resort, search hints across every city.
  if (districtHint) {
    const hit = districts.find((d) =>
      anyMatch(districtHint, d.districtName, d.districtOtherName),
    );
    if (hit) return hit;
  }

  if (zoneHint) {
    return districts.find((d) =>
      anyMatch(
        zoneHint,
        d.zoneName,
        d.zoneOtherName,
        d.districtName,
        d.districtOtherName,
      ),
    );
  }

  return undefined;
}

/** Group flat district rows into city → zone → district tree for checkout UI. */
export async function getBostaCheckoutLocations(): Promise<BostaCheckoutCity[]> {
  const entries = await loadDistricts();
  const cityMap = new Map<string, BostaCheckoutCity>();

  for (const entry of entries) {
    let city = cityMap.get(entry.cityId);
    if (!city) {
      city = { cityId: entry.cityId, cityName: entry.cityName, zones: [] };
      cityMap.set(entry.cityId, city);
    }

    let zone = city.zones.find((z) => z.zoneId === entry.zoneId);
    if (!zone) {
      zone = {
        zoneId: entry.zoneId,
        zoneName: entry.zoneName,
        districts: [],
      };
      city.zones.push(zone);
    }

    if (!zone.districts.some((d) => d.districtId === entry.districtId)) {
      zone.districts.push({
        districtId: entry.districtId,
        districtName: entry.districtName,
      });
    }
  }

  return [...cityMap.values()]
    .map((city) => ({
      ...city,
      zones: city.zones
        .map((zone) => ({
          ...zone,
          districts: [...zone.districts].sort((a, b) =>
            a.districtName.localeCompare(b.districtName),
          ),
        }))
        .sort((a, b) => a.zoneName.localeCompare(b.zoneName)),
    }))
    .sort((a, b) => a.cityName.localeCompare(b.cityName));
}

function findDistrictById(
  districts: BostaDistrictEntry[],
  districtId: string,
): BostaDistrictEntry | undefined {
  return districts.find((d) => d.districtId === districtId);
}

/**
 * Build a Bosta-compatible dropOffAddress (city name + zone + districtId + firstLine).
 */
export async function resolveBostaDropOffAddress(input: {
  city: string;
  zone?: string | null;
  districtHint?: string | null;
  firstLine: string;
  districtId?: string | null;
  buildingNumber?: string | null;
  apartment?: string | null;
  floor?: string | null;
}): Promise<BostaResolvedDropOffAddress> {
  const firstLine = input.firstLine.trim();
  const zoneHint = parseZoneHint(input.zone);
  const districtHint = input.districtHint?.trim() ?? "";

  let match: BostaDistrictEntry | undefined;

  try {
    const districts = await loadDistricts();

    if (input.districtId?.trim()) {
      match = findDistrictById(districts, input.districtId.trim());
    }

    if (!match) {
      match = findDistrictMatch(districts, input.city.trim(), zoneHint, districtHint);
    }
  } catch (err) {
    console.warn("[Bosta] Could not load districts list:", err);
  }

  if (!match?.districtId || !match.zoneId) {
    throw new Error(
      `[Bosta] Could not resolve district for city "${input.city}"${zoneHint ? ` / zone "${zoneHint}"` : ""}${districtHint ? ` / district "${districtHint}"` : ""}. Enter a valid city and area.`,
    );
  }

  return {
    city: match.cityName,
    zoneId: match.zoneId,
    districtId: match.districtId,
    firstLine,
    secondLine: firstLine,
    buildingNumber: input.buildingNumber?.trim() || "1",
    floor: input.floor?.trim() || "1",
    apartment: input.apartment?.trim() || "1",
  };
}
