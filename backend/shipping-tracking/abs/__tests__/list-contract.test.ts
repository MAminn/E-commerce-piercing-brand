import { describe, expect, it, vi } from "vitest";
import { ABS_LIST_COLUMNS, createAbsClient, type AbsFetchLike } from "../client";
import { matchShipment, type MatchOptions } from "../matcher";
import { AbsResponseShapeError, normalizeConsigneePhones, normalizeShipmentRow, parseListResponse, shipmentRowSchema, unwrapListEnvelope } from "../parse";
import { decide } from "../rules";
import { fixtureRealContract, realContractCandidates } from "./fixture-helpers";

/**
 * The REAL /shipments/list contract (verified against production on 18 Nov
 * 2026, structure only): HTTP 201, a nested envelope, consigneePhone as an
 * array, and `cmpService` returned but not requestable. All values synthetic.
 */

const OPTS: MatchOptions = { windowDays: 10, reverseWindowDays: 45, codToleranceEgp: 1, observedAt: new Date("2026-11-18T12:00:00+02:00") };
const row = (over: Record<string, unknown> = {}) => ({ awb: "RCT9", status: "DELIVERED", cash: "100.00", consigneePhone: ["201000003001"], ...over });

describe("/shipments/list envelope", () => {
  it("accepts the real nested envelope and reads hasMore / nextCursor from the nested level", () => {
    const page = parseListResponse({ success: true, message: "ok", data: { data: [row()], hasMore: true, nextCursor: "c2" } });
    expect(page).toMatchObject({ hasMore: true, nextCursor: "c2", skipped: 0 });
    expect(page.rows.map((r) => r.awb)).toEqual(["RCT9"]);
    // Paging fields on the OUTER level of a nested body are not the page's.
    const outer = parseListResponse({ success: true, hasMore: true, nextCursor: "outer", data: { data: [], hasMore: false, nextCursor: "" } });
    expect(outer).toMatchObject({ hasMore: false, nextCursor: null });
    expect(unwrapListEnvelope({ success: true, message: "ok", data: { data: [], hasMore: false, nextCursor: "x" } })).toMatchObject({
      shape: "nested",
      outerKeys: ["data", "message", "success"],
      pageKeys: ["data", "hasMore", "nextCursor"],
    });
  });

  it("still accepts the documented flat shape", () => {
    const page = parseListResponse({ data: [row()], hasMore: true, nextCursor: 7 });
    expect(page).toMatchObject({ hasMore: true, nextCursor: "7" });
    expect(page.rows).toHaveLength(1);
    expect(unwrapListEnvelope({ data: [], hasMore: false }).shape).toBe("flat");
    // The envelope without success/message is fine too.
    expect(parseListResponse({ data: { data: [row()] } }).rows).toHaveLength(1);
  });

  it("rejects malformed bodies of either shape with AbsResponseShapeError", () => {
    const bad: unknown[] = [
      null,
      [],
      "text",
      {},
      { rows: [] },
      { data: "x" },
      { data: null },
      { success: true, data: { rows: [] } },
      { success: true, data: { data: "x", hasMore: false } },
      { success: true, data: { data: [], hasMore: "no" } },
      { success: true, data: { data: { data: [] } } },
      { data: [], hasMore: "yes" },
      // An explicit failure must never look like an empty page (it would advance the watermark).
      { success: false, message: "nope", data: { data: [], hasMore: false, nextCursor: "" } },
      { success: false, data: [] },
    ];
    for (const b of bad) {
      expect(() => parseListResponse(b), JSON.stringify(b)).toThrow(AbsResponseShapeError);
    }
    // The pre-fix production error is now only for a body that is really wrong.
    expect(() => parseListResponse({ success: true, data: { data: "x" } })).toThrow(/data\.data: invalid_type/);
  });
});

describe("consigneePhone (string | string[] | null)", () => {
  it("a single-element array in the 12-digit country-code form", () => {
    const s = normalizeShipmentRow(shipmentRowSchema.parse(row({ consigneePhone: ["201000003001"] })));
    expect(s).toMatchObject({ consigneePhoneNorm: "1000003001", consigneePhoneLast4: "3001", consigneePhonesNorm: ["1000003001"] });
  });

  it("a two-element array keeps both; the first valid one is the primary", () => {
    expect(normalizeConsigneePhones(["201000003999", "01000003022"])).toEqual({ norm: "1000003999", last4: "3999", all: ["1000003999", "1000003022"] });
    // Duplicates collapse; an invalid first element is skipped and last 4 comes from the element used.
    expect(normalizeConsigneePhones(["12345", "+20 100 000 3022", "201000003022"])).toEqual({ norm: "1000003022", last4: "3022", all: ["1000003022"] });
  });

  it("an empty array, null and blanks → no phone", () => {
    for (const v of [[], null, undefined, "", [""], [null]]) {
      expect(normalizeConsigneePhones(v)).toEqual({ norm: null, last4: null, all: [] });
    }
    const s = normalizeShipmentRow(shipmentRowSchema.parse(row({ consigneePhone: [] })));
    expect(s).toMatchObject({ consigneePhoneNorm: null, consigneePhoneLast4: null, consigneePhonesNorm: [] });
  });

  it("a plain string is still supported (docs shape), including the 20… form", () => {
    expect(normalizeConsigneePhones("+201000003001")).toEqual({ norm: "1000003001", last4: "3001", all: ["1000003001"] });
    expect(normalizeConsigneePhones("201000003001")).toEqual({ norm: "1000003001", last4: "3001", all: ["1000003001"] });
    expect(normalizeConsigneePhones("01000003001")).toEqual({ norm: "1000003001", last4: "3001", all: ["1000003001"] });
    // Not a valid mobile: last 4 still shown, never matched.
    expect(normalizeConsigneePhones("0225551234")).toEqual({ norm: null, last4: "1234", all: [] });
  });

  it("the raw row keeps the original array (no new column)", () => {
    const s = normalizeShipmentRow(shipmentRowSchema.parse(row({ consigneePhone: ["201000003999", "201000003022"] })));
    expect(s.raw.consigneePhone).toEqual(["201000003999", "201000003022"]);
  });

  it("matcher: an exact match on the SECOND phone counts as an exact phone match", () => {
    const s = normalizeShipmentRow(shipmentRowSchema.parse(row({ cash: "450.00", createdAt: "2026-11-16T11:10:00.000+02:00", consigneePhone: ["201000003999", "201000003022"] })));
    const r = matchShipment(s, realContractCandidates(), OPTS);
    expect(r).toMatchObject({ state: "auto", method: "phone_amount", orderId: "rc2" });
    expect(r.candidates[0]?.reasons).toContain("phone_exact");
    // Same phones, one element only → no match at all (3+ digits differ from every order).
    const only = normalizeShipmentRow(shipmentRowSchema.parse(row({ cash: "450.00", createdAt: "2026-11-16T11:10:00.000+02:00", consigneePhone: ["201000003999"] })));
    expect(matchShipment(only, realContractCandidates(), OPTS).state).toBe("unmatched");
  });

  it("matcher: fuzzy stays on the first phone only, and is never automatic", () => {
    // First phone one digit off order rc1 (3001 → 3011), amount matches → fuzzy review, as today.
    const s = normalizeShipmentRow(shipmentRowSchema.parse(row({ cash: "999.99", createdAt: "2026-11-16T11:05:00.000+02:00", consigneePhone: ["201000003011"] })));
    expect(matchShipment(s, realContractCandidates(), OPTS)).toMatchObject({ state: "needs_review", method: "phone_amount_fuzzy", reasonCode: "fuzzy_phone" });
    // A second phone that is only fuzzy-close does not create a fuzzy candidate.
    const second = normalizeShipmentRow(
      shipmentRowSchema.parse(row({ cash: "999.99", createdAt: "2026-11-16T11:05:00.000+02:00", consigneePhone: ["201000009999", "201000003011"] })),
    );
    expect(matchShipment(second, realContractCandidates(), OPTS).state).toBe("unmatched");
  });
});

describe("real-contract fixture", () => {
  const fx = fixtureRealContract();

  it("parses every row: string money, enum statuses, extra fields kept in raw, cmpService read", () => {
    const page = parseListResponse(fx.body);
    expect(page.skipped).toBe(0);
    expect(page.hasMore).toBe(false);
    expect(page.rows).toHaveLength(fx.expected.length);
    for (const e of fx.expected) {
      const s = page.rows.find((r) => r.awb === e.awb);
      expect(s?.status, e.awb).toBe(e.status);
      expect(s?.consigneePhoneLast4, e.awb).toBe(e.phoneLast4);
      expect(s?.cmpService).toBe("DELIVERY");
      expect(s?.raw).toHaveProperty("subAccountId");
      expect(s?.raw).toHaveProperty("isUnderRevision");
      expect(s?.raw).toHaveProperty("currentBranchId");
      expect(s?.paymentDate).toBeNull();
      expect(s?.originAwb).toBeNull();
    }
    const first = page.rows[0];
    expect(first).toMatchObject({ cash: 999.99, collectedCash: 999.99, absFees: 55, totalFees: 55, isPaid: false, noOfPieces: 1 });
    expect(first?.deliveryDate?.toISOString()).toBe("2026-11-17T13:20:00.000Z");
    expect(first?.absCreatedAt?.toISOString()).toBe("2026-11-16T09:05:00.000Z");
  });

  it("none of the observed lastEventCodes overrides the status column", () => {
    const codes = ["SHP_DLVD", "SHP_DLVD_FAIL", "SHP_POD_DEPT", "SHP_ASGN_COR", "SHP_POD_CLTD", "SHP_HOLD", "SHP_ARV_WH", "SHP_DEPT_DIST", "SHP_POD_WH", "SHP_RTN_SHPR", "SHP_AT_RTN"];
    const statuses = ["DELIVERED", "OUT_FOR_DELIVERY", "RETURNED_TO_SHIPPER", "HOLD_DECISION", "IN_TRANSIT", "UNDELIVERED", "AT_RETURN_BRANCH"];
    for (const status of statuses) {
      for (const lastEventCode of codes) {
        expect(normalizeShipmentRow(shipmentRowSchema.parse(row({ status, lastEventCode }))).status, `${status}/${lastEventCode}`).toBe(status);
      }
    }
  });

  it("matcher + rules on the fixture give the expected link and decision", () => {
    const candidates = realContractCandidates();
    const byKey = new Map(fx.orders.map((o) => [o.key, o]));
    for (const s of parseListResponse(fx.body).rows) {
      const e = fx.expected.find((x) => x.awb === s.awb);
      const m = matchShipment(s, candidates, OPTS);
      expect(m.state, s.awb).toBe(e?.linkState);
      if (e?.linkOrder) expect(m.orderId, s.awb).toBe(e.linkOrder);
      if (e?.method) expect(m.method, s.awb).toBe(e.method);
      if (e?.linkReason) expect(m.reasonCode, s.awb).toBe(e.linkReason);
      const o = m.orderId ? byKey.get(m.orderId) : undefined;
      const verdict = decide({
        shipment: s,
        link: m.state === "unmatched" ? null : { state: m.state, role: m.role },
        orderStatus: o?.status ?? null,
        orderTotal: o ? Number(o.total) : null,
        expectedCod: o ? Number(o.total) : null,
        codToleranceEgp: 1,
      } as Parameters<typeof decide>[0]);
      expect(verdict, s.awb).toEqual({ decision: e?.decision, reasonCode: e?.decisionReason });
    }
  });
});

describe("client against the real contract", () => {
  function fakeFetch(replies: Array<{ status: number; body: unknown }>) {
    const calls: Array<{ body: Record<string, unknown> }> = [];
    const impl = vi.fn(async (_url: string, init: Parameters<AbsFetchLike>[1]) => {
      calls.push({ body: init.body ? JSON.parse(init.body) : {} });
      const r = (replies.length > 1 ? replies.shift() : replies[0]) as { status: number; body: unknown };
      return { status: r.status, ok: r.status < 300, headers: { get: () => null }, text: async () => JSON.stringify(r.body) };
    });
    return { impl: impl as unknown as AbsFetchLike, calls };
  }
  const client = (impl: AbsFetchLike) =>
    createAbsClient({ baseUrl: "https://abs.example.test", apiKey: "test-key-NOT-REAL", fetchImpl: impl, sleep: async () => {}, minGapMs: 0, log: () => {} });

  it("cmpService is never requested, but is still read from the rows", async () => {
    expect(ABS_LIST_COLUMNS as readonly string[]).not.toContain("cmpService");
    const fx = fixtureRealContract();
    const f = fakeFetch([{ status: fx.httpStatus, body: fx.body }]);
    const page = await client(f.impl).listChangedShipments({ from: new Date("2026-11-01T00:00:00Z"), to: new Date("2026-11-18T00:00:00Z") });
    expect(fx.httpStatus).toBe(201);
    expect(page.rows).toHaveLength(8);
    expect(page.rows.every((r) => r.cmpService === "DELIVERY")).toBe(true);
    expect(f.calls[0]?.body.columns).not.toContain("cmpService");
    expect(f.calls[0]?.body.columns).toContain("consigneePhone");
  });

  it("drop-and-retry still works for other columns", async () => {
    const fx = fixtureRealContract();
    const f = fakeFetch([
      { status: 400, body: { success: false, message: "'originAwb' is not a valid shipment column" } },
      { status: fx.httpStatus, body: fx.body },
    ]);
    const c = client(f.impl);
    const page = await c.listChangedShipments({ from: new Date("2026-11-01T00:00:00Z"), to: new Date("2026-11-18T00:00:00Z") });
    expect(page.rows).toHaveLength(8);
    expect(f.calls[1]?.body.columns).not.toContain("originAwb");
    expect(c.columns()).not.toContain("originAwb");
  });
});
