import { describe, expect, it } from "vitest";
import {
  canonicalStatus,
  normalizeEgyptPhone,
  orderNumbersInReference,
  parseAbsDate,
  parseMoney,
  phoneLast4,
  toCairoIso,
} from "../normalize";
import { normalizeShipmentRow, parseListResponse, shipmentRowSchema } from "../parse";
import { CANONICAL_STATUSES } from "../types";
import { fixtureStatusVariants } from "./fixture-helpers";

describe("normalizeEgyptPhone", () => {
  it.each([
    ["+20 100 123 4567", "1001234567"],
    ["01001234567", "1001234567"],
    ["201001234567", "1001234567"],
    ["00201001234567", "1001234567"],
    ["+201001234567", "1001234567"],
    ["0100-123-4567", "1001234567"],
    [" 0100 123 4567 ", "1001234567"],
    ["1001234567", "1001234567"],
    ["٠١٠٠١٢٣٤٥٦٧", "1001234567"],
    [1001234567, "1001234567"],
  ])("%s → %s", (raw, want) => {
    expect(normalizeEgyptPhone(raw)).toBe(want);
  });

  it.each([["", null], ["abc", null], ["0223456789", null], ["010012345", null], ["010012345678", null], [null, null], [undefined, null], [{}, null]])(
    "rejects %s",
    (raw, want) => {
      expect(normalizeEgyptPhone(raw)).toBe(want);
    },
  );

  it("phoneLast4", () => {
    expect(phoneLast4("+20 100 123 4567")).toBe("4567");
    expect(phoneLast4("12")).toBeNull();
  });
});

describe("canonicalStatus", () => {
  it("every enum value maps to itself", () => {
    for (const s of CANONICAL_STATUSES) expect(canonicalStatus(s)).toBe(s);
  });

  const variants = fixtureStatusVariants();
  for (const [want, list] of Object.entries(variants)) {
    it.each(list)(`fixture 8: (%s, %s) → ${want}`, (status, code) => {
      expect(canonicalStatus(status, code)).toBe(want);
    });
  }

  it("a known status is not overridden by an ordinary event code", () => {
    expect(canonicalStatus("IN_TRANSIT", "SHP_HOLD")).toBe("IN_TRANSIT");
  });
});

describe("parseMoney / parseAbsDate / references", () => {
  it.each([
    [350, 350],
    ["350", 350],
    ["350.00", 350],
    ["1,250.5", 1250.5],
    ["EGP 350", 350],
    ["", null],
    ["abc", null],
    [null, null],
    [Number.NaN, null],
  ])("parseMoney(%s) = %s", (raw, want) => {
    expect(parseMoney(raw)).toBe(want);
  });

  it("dates with offsets are taken as given; naive ones as Cairo time", () => {
    expect(parseAbsDate("2026-11-05T13:00:00+02:00")?.toISOString()).toBe("2026-11-05T11:00:00.000Z");
    expect(parseAbsDate("2026-11-05T11:00:00Z")?.toISOString()).toBe("2026-11-05T11:00:00.000Z");
    expect(parseAbsDate("2026-11-05 13:00:00")?.toISOString()).toBe("2026-11-05T11:00:00.000Z");
    expect(parseAbsDate("2026-07-05T13:00:00")?.toISOString()).toBe("2026-07-05T10:00:00.000Z"); // summer DST +03:00
    expect(parseAbsDate("2026-11-05")?.toISOString()).toBe("2026-11-04T22:00:00.000Z");
    expect(parseAbsDate("not a date")).toBeNull();
    expect(parseAbsDate(null)).toBeNull();
  });

  it("toCairoIso keeps the instant and states the offset", () => {
    const iso = toCairoIso(new Date("2026-11-18T10:00:00.000Z"));
    expect(iso).toBe("2026-11-18T12:00:00.000+02:00");
    expect(new Date(iso).toISOString()).toBe("2026-11-18T10:00:00.000Z");
  });

  it("order numbers in a reference", () => {
    expect(orderNumbersInReference("#10175")).toEqual([10175]);
    expect(orderNumbersInReference("Order 10175 / 10176")).toEqual([10175, 10176]);
    expect(orderNumbersInReference("01001234567")).toEqual([]);
    expect(orderNumbersInReference("2 pcs")).toEqual([]);
    expect(orderNumbersInReference(null)).toEqual([]);
  });
});

describe("parse (zod)", () => {
  it("tolerates extra fields and string numbers", () => {
    const row = shipmentRowSchema.parse({ awb: 123456, cash: "350", extra: { nested: true }, consigneePhone: "+201001234567" });
    const n = normalizeShipmentRow(row);
    expect(n.awb).toBe("123456");
    expect(n.cash).toBe(350);
    expect(n.consigneePhoneNorm).toBe("1001234567");
    expect(n.consigneePhoneLast4).toBe("4567");
    expect(n.status).toBe("UNKNOWN");
  });

  it("uses displayStatus when status is unrecognised", () => {
    const n = normalizeShipmentRow(shipmentRowSchema.parse({ awb: "A1", status: "??", displayStatus: "Out for Delivery" }));
    expect(n.status).toBe("OUT_FOR_DELIVERY");
  });

  it("skips a drifted row and reports it, keeps the others", () => {
    const drift: string[] = [];
    const page = parseListResponse(
      { data: [{ awb: "A1", status: "DELIVERED" }, { awb: null }, { awb: "../x" }], hasMore: true, nextCursor: 7 },
      (_k, m) => drift.push(m),
    );
    expect(page.rows.map((r) => r.awb)).toEqual(["A1"]);
    expect(page.skipped).toBe(2);
    expect(drift.length).toBe(2);
    expect(page.nextCursor).toBe("7");
    expect(page.hasMore).toBe(true);
  });

  it("an invalid envelope throws", () => {
    expect(() => parseListResponse({ rows: [] })).toThrow(/did not match/);
  });
});
