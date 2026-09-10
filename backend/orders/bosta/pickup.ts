const BOSTA_API_BASE = "https://app.bosta.co/api/v2";

function getBostaApiKey(): string | null {
  return process.env.SYN_BOSTA_KEY ?? null;
}

/** Address shape required by Bosta POST /deliveries */
export interface BostaPickupAddress {
  city: string;
  zoneId: string;
  districtId: string;
  firstLine: string;
  secondLine: string;
  buildingNumber: string;
  floor: string;
  apartment: string;
}

let cachedPickup: BostaPickupAddress | null = null;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function pickString(obj: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const val = obj[key];
    if (typeof val === "string" && val.trim()) return val.trim();
    const nested = asRecord(val);
    if (nested) {
      const nestedVal = pickString(
        nested,
        "name",
        "nameEn",
        "cityName",
        "zoneName",
        "zoneId",
        "_id",
        "id",
        "districtId",
      );
      if (nestedVal) return nestedVal;
    }
  }
  return undefined;
}

function isPlaceholderEnvValue(value: string): boolean {
  const v = value.trim().toLowerCase();
  return (
    !v ||
    v.startsWith("your-") ||
    v.includes("your-") ||
    v === "placeholder" ||
    v === "example" ||
    v === "xxx"
  );
}

function parsePickupLocation(record: Record<string, unknown>): BostaPickupAddress | null {
  const address = asRecord(record.address) ?? record;
  const city =
    pickString(address, "city", "cityName") ?? pickString(record, "city", "cityName");
  const zoneId =
    pickString(address, "zoneId") ??
    pickString(asRecord(address.zone) ?? {}, "zoneId", "_id", "id") ??
    pickString(record, "zoneId");
  const districtId =
    pickString(address, "districtId") ??
    pickString(asRecord(address.district) ?? {}, "districtId", "_id", "id") ??
    pickString(record, "districtId");
  const firstLine =
    pickString(address, "firstLine", "address", "street") ??
    pickString(record, "firstLine", "address", "street");
  const secondLine =
    pickString(address, "secondLine", "landmark") ??
    pickString(record, "secondLine", "landmark") ??
    firstLine;

  if (!city || !zoneId || !districtId || !firstLine) return null;

  return {
    city,
    zoneId,
    districtId,
    firstLine,
    secondLine: secondLine ?? firstLine,
    buildingNumber:
      pickString(address, "buildingNumber") ??
      pickString(record, "buildingNumber") ??
      "1",
    floor: pickString(address, "floor") ?? pickString(record, "floor") ?? "1",
    apartment:
      pickString(address, "apartment") ?? pickString(record, "apartment") ?? "1",
  };
}

function pickupFromEnv(): BostaPickupAddress | null {
  const city = process.env.BOSTA_PICKUP_CITY?.trim();
  const zoneId = process.env.BOSTA_PICKUP_ZONE_ID?.trim();
  const districtId = process.env.BOSTA_PICKUP_DISTRICT_ID?.trim();
  const firstLine = process.env.BOSTA_PICKUP_FIRST_LINE?.trim();

  if (!city || !zoneId || !districtId || !firstLine) return null;
  if (
    isPlaceholderEnvValue(districtId) ||
    isPlaceholderEnvValue(city) ||
    isPlaceholderEnvValue(zoneId)
  ) {
    return null;
  }

  return {
    city,
    zoneId,
    districtId,
    firstLine,
    secondLine: process.env.BOSTA_PICKUP_SECOND_LINE?.trim() || firstLine,
    buildingNumber: process.env.BOSTA_PICKUP_BUILDING_NUMBER?.trim() || "1",
    floor: process.env.BOSTA_PICKUP_FLOOR?.trim() || "1",
    apartment: process.env.BOSTA_PICKUP_APARTMENT?.trim() || "1",
  };
}

async function fetchPickupFromApi(): Promise<BostaPickupAddress | null> {
  const apiKey = getBostaApiKey();
  if (!apiKey) return null;

  const res = await fetch(`${BOSTA_API_BASE}/pickup-locations`, {
    headers: { Authorization: apiKey },
  });
  const payload = await res.json();
  const root = asRecord(payload);
  const data = asRecord(root?.data) ?? root;
  const locations = Array.isArray(data?.pickupLocations)
    ? data!.pickupLocations
    : Array.isArray(data?.list)
      ? data!.list
      : Array.isArray(payload)
        ? payload
        : [];

  const preferredId = process.env.BOSTA_PICKUP_LOCATION_ID?.trim();
  const entries = locations
    .map((item) => asRecord(item))
    .filter((item): item is Record<string, unknown> => !!item);

  const validPreferredId =
    preferredId && !isPlaceholderEnvValue(preferredId) ? preferredId : undefined;

  const selected =
    (validPreferredId
      ? entries.find((item) => pickString(item, "_id", "id") === validPreferredId)
      : undefined) ?? entries[0];

  return selected ? parsePickupLocation(selected) : null;
}

/**
 * Resolve merchant pickup address required by Bosta create-delivery API.
 * Loaded automatically from your Bosta business account — no manual setup needed
 * if you already have a warehouse/pickup location in the Bosta dashboard.
 */
export async function resolveBostaPickupAddress(): Promise<BostaPickupAddress> {
  if (cachedPickup) return cachedPickup;

  const fromApi = await fetchPickupFromApi();
  if (fromApi) {
    cachedPickup = fromApi;
    return fromApi;
  }

  const fromEnv = pickupFromEnv();
  if (fromEnv) {
    cachedPickup = fromEnv;
    return fromEnv;
  }

  throw new Error(
    "[Bosta] Could not load pickup address from your Bosta account. Log in to business.bosta.co and ensure you have a warehouse/pickup location configured.",
  );
}
