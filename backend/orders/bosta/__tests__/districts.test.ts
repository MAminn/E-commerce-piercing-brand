import { describe, it, expect } from "vitest";
import { findDistrictMatch, type BostaDistrictEntry } from "../districts";

// A small slice of real Bosta production data (verified live against
// https://app.bosta.co/api/v2/cities/getAllDistricts) — chosen because it
// reproduces the exact inconsistent-spacing pattern that broke matching
// for common customer input like "el maadi".
const districts: BostaDistrictEntry[] = [
  {
    cityId: "cairo-id",
    cityCode: "EG-01",
    cityName: "Cairo",
    zoneId: "zone-maadi",
    zoneName: "ElMaadi",
    districtId: "district-maadi",
    districtName: "ElMaadi",
    districtOtherName: "المعادي",
  },
  {
    cityId: "cairo-id",
    cityCode: "EG-01",
    cityName: "Cairo",
    zoneId: "zone-nozha",
    zoneName: "ElNozha",
    districtId: "district-nozha",
    districtName: "ElNozha",
    districtOtherName: "النزهة",
  },
  {
    cityId: "cairo-id",
    cityCode: "EG-01",
    cityName: "Cairo",
    zoneId: "zone-einshams",
    zoneName: "Ein Shams",
    districtId: "district-einshams",
    districtName: "Ein Shams",
  },
  {
    cityId: "cairo-id",
    cityCode: "EG-01",
    cityName: "Cairo",
    zoneId: "zone-nasrcity",
    zoneName: "Nasr City",
    districtId: "district-nasrcity-1",
    districtName: "First Settlement",
    districtOtherName: "التجمع الأول",
  },
  {
    cityId: "cairo-id",
    cityCode: "EG-01",
    cityName: "Cairo",
    zoneId: "zone-nasrcity",
    zoneName: "Nasr City",
    districtId: "district-nasrcity-2",
    districtName: "ElManteqa El Oula",
    districtOtherName: "المنطقة الأولى",
  },
  {
    cityId: "giza-id",
    cityCode: "EG-02",
    cityName: "Giza",
    zoneId: "zone-october",
    zoneName: "6 October",
    districtId: "district-october",
    districtName: "6 October",
  },
];

describe("findDistrictMatch", () => {
  it("matches when city+zone are typed exactly", () => {
    const hit = findDistrictMatch(districts, "Cairo", "ElMaadi");
    expect(hit?.districtId).toBe("district-maadi");
  });

  // This is the exact real-world failure verified against live Bosta data:
  // "el maadi"/"el nozha" (the natural way most customers type it) never
  // matched "ElMaadi"/"ElNozha" because the single-space-collapsed compare
  // still leaves a space mismatch.
  it("matches 'el maadi' against 'ElMaadi' despite Bosta's inconsistent spacing", () => {
    const hit = findDistrictMatch(districts, "Cairo", "el maadi");
    expect(hit?.districtId).toBe("district-maadi");
  });

  it("matches 'el nozha' against 'ElNozha'", () => {
    const hit = findDistrictMatch(districts, "Cairo", "el nozha");
    expect(hit?.districtId).toBe("district-nozha");
  });

  it("still matches zones that are already spaced correctly (no regression)", () => {
    const hit = findDistrictMatch(districts, "Cairo", "ein shams");
    expect(hit?.districtId).toBe("district-einshams");
  });

  it("uses the district hint to disambiguate between districts sharing a zone", () => {
    const hit = findDistrictMatch(districts, "Cairo", "Nasr City", "ElManteqa El Oula");
    expect(hit?.districtId).toBe("district-nasrcity-2");
  });

  it("matches against the Arabic district name", () => {
    const hit = findDistrictMatch(districts, "Cairo", undefined as unknown as string, "المعادي");
    expect(hit?.districtId).toBe("district-maadi");
  });

  it("falls back to the first district in the city when no zone/district hint matches", () => {
    const hit = findDistrictMatch(districts, "Cairo", "some unknown area");
    expect(hit?.cityName).toBe("Cairo");
  });

  it("returns undefined when nothing matches at all", () => {
    const hit = findDistrictMatch([], "Nowhere", "Nowhere Zone");
    expect(hit).toBeUndefined();
  });
});
