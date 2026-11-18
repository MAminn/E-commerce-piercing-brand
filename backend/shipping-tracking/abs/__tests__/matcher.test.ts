import { describe, expect, it } from "vitest";
import { isFuzzyPhoneMatch, matchShipment, roleForService, type CandidateOrder, type MatchOptions } from "../matcher";
import { parseListResponse } from "../parse";
import { decide } from "../rules";
import type { NormalizedShipment } from "../types";
import { fixtureCandidates, fixtureExpected, fixtureListResponse, fixtureOrders } from "./fixture-helpers";

const OPTS: MatchOptions = { windowDays: 10, codToleranceEgp: 1, observedAt: new Date("2026-11-18T10:00:00Z") };

const shipment = (over: Partial<NormalizedShipment> = {}): NormalizedShipment => ({
  awb: "AWB1",
  reference: null,
  cmpService: "DELIVERY",
  statusRaw: "DELIVERED",
  status: "DELIVERED",
  lastEventCode: null,
  lastReason: null,
  cash: 450,
  collectedCash: 450,
  absFees: null,
  totalFees: null,
  isPaid: null,
  paymentDate: null,
  deliveryDate: null,
  absCreatedAt: new Date("2026-11-10T12:00:00Z"),
  consigneePhoneNorm: "1001234567",
  consigneePhoneLast4: "4567",
  noOfPieces: 1,
  originAwb: null,
  raw: {},
  ...over,
});

const order = (over: Partial<CandidateOrder> = {}): CandidateOrder => ({
  id: "ord-1",
  orderNumber: 10100,
  customerPhone: "01001234567",
  total: 450,
  expectedCod: 450,
  status: "shipped",
  createdAt: new Date("2026-11-09T12:00:00Z"),
  linkedAwb: null,
  ...over,
});

describe("matcher — fixture cases (in memory, processed in feed order like the worker)", () => {
  const page = parseListResponse(fixtureListResponse());
  const orders = new Map(fixtureOrders().map((o) => [o.key, o]));
  const linked = new Map<string, string>(); // order key → awb (primary auto)
  const results = new Map<string, ReturnType<typeof matchShipment>>();
  for (const s of page.rows) {
    const r = matchShipment(s, fixtureCandidates(linked), OPTS);
    results.set(s.awb, r);
    if (r.state === "auto" && r.role === "primary" && r.orderId) linked.set(r.orderId, s.awb);
  }

  for (const c of fixtureExpected()) {
    it(`${c.case} (${c.awb})`, () => {
      const r = results.get(c.awb);
      expect(r, "shipment parsed").toBeDefined();
      if (!r) return;
      expect(r.state).toBe(c.linkState);
      if (c.method) expect(r.method).toBe(c.method);
      if (c.role) expect(r.role).toBe(c.role);
      if (c.linkReason) expect(r.reasonCode).toBe(c.linkReason);
      expect(r.orderId).toBe(c.linkOrder ?? null);
      if (c.candidates) expect(r.candidates.map((x) => x.orderId).sort()).toEqual([...c.candidates].sort());
      if (c.status) expect(page.rows.find((s) => s.awb === c.awb)?.status).toBe(c.status);

      // …and the rule engine on top, with the order's status as stored.
      const o = r.orderId ? orders.get(r.orderId) : undefined;
      const s = page.rows.find((x) => x.awb === c.awb) as NormalizedShipment;
      const cand = o ? fixtureCandidates().find((x) => x.id === o.key) : undefined;
      const verdict = decide({
        orderStatus: o?.status ?? null,
        shipment: s,
        link: { state: r.state, role: r.role, reasonCode: r.reasonCode },
        orderTotal: cand?.total ?? null,
        expectedCod: cand?.expectedCod ?? null,
      });
      expect(verdict.decision).toBe(c.decision);
      expect(verdict.reasonCode).toBe(c.decisionReason);
    });
  }

  it("no candidate list carries a phone number", () => {
    for (const r of results.values()) {
      for (const c of r.candidates) {
        expect(JSON.stringify(c)).not.toMatch(/\d{10,}/);
        expect(JSON.stringify(c)).not.toMatch(/phone":/i);
      }
    }
  });
});

describe("matcher — rules and edge cases", () => {
  it("rule 1: Reference '#10175' + matching phone → auto via reference (amount not required)", () => {
    const r = matchShipment(shipment({ reference: "#10175", cash: 999 }), [order({ id: "a", orderNumber: 10175 }), order({ id: "b", orderNumber: 10176 })], OPTS);
    expect(r).toMatchObject({ state: "auto", method: "reference", orderId: "a", confidence: 100 });
  });

  it("rule 1: Reference names an order with a different phone → review, never auto", () => {
    const r = matchShipment(shipment({ reference: "10175" }), [order({ id: "a", orderNumber: 10175, customerPhone: "01111111111" }), order({ id: "b" })], OPTS);
    expect(r).toMatchObject({ state: "needs_review", reasonCode: "reference_phone_mismatch", orderId: null });
    expect(r.candidates.map((c) => c.orderId).sort()).toEqual(["a", "b"]);
  });

  it("rule 1: referenced order already primary-linked to another AWB → review", () => {
    const r = matchShipment(shipment({ reference: "#10175" }), [order({ id: "a", orderNumber: 10175, linkedAwb: "OTHER" })], OPTS);
    expect(r).toMatchObject({ state: "needs_review", reasonCode: "order_already_linked" });
  });

  it("rule 2: REVERSE / EXCHANGE / CASH_COLLECTION never auto, even with a perfect reference", () => {
    for (const svc of ["REVERSE", "EXCHANGE", "CASH_COLLECTION"]) {
      const r = matchShipment(shipment({ cmpService: svc, reference: "#10175" }), [order({ id: "a", orderNumber: 10175 })], OPTS);
      expect(r.state).toBe("needs_review");
      expect(r.role).toBe(roleForService(svc));
      expect(r.orderId).toBeNull();
    }
    expect(roleForService(null)).toBe("primary");
  });

  it("rule 3: exactly one → auto; the amount tolerance is inclusive", () => {
    expect(matchShipment(shipment({ cash: 451 }), [order()], OPTS)).toMatchObject({ state: "auto", method: "phone_amount", orderId: "ord-1" });
    expect(matchShipment(shipment({ cash: 451.01 }), [order()], OPTS)).toMatchObject({ state: "needs_review", reasonCode: "cod_mismatch" });
  });

  it("rule 3: a cancelled order or one linked elsewhere is not auto", () => {
    expect(matchShipment(shipment(), [order({ status: "cancelled" })], OPTS)).toMatchObject({ state: "needs_review", reasonCode: "cancelled_order_match" });
    expect(matchShipment(shipment(), [order({ linkedAwb: "OTHER" })], OPTS)).toMatchObject({ state: "needs_review", reasonCode: "order_already_linked" });
    // …but a link to THIS awb is fine (re-match).
    expect(matchShipment(shipment(), [order({ linkedAwb: "AWB1" })], OPTS).state).toBe("auto");
  });

  it("rule 3: one open + one cancelled with the same phone and amount → the open one", () => {
    const r = matchShipment(shipment(), [order({ id: "open" }), order({ id: "gone", status: "cancelled" })], OPTS);
    expect(r).toMatchObject({ state: "auto", orderId: "open" });
  });

  it("rule 4: a tie is never broken", () => {
    const r = matchShipment(shipment(), [order({ id: "a" }), order({ id: "b", orderNumber: 10101 })], OPTS);
    expect(r).toMatchObject({ state: "needs_review", reasonCode: "multiple_candidates", orderId: null });
    expect(r.candidates).toHaveLength(2);
  });

  it("rule 5: fuzzy phone (2 digits / adjacent transposition) → review only; 3 digits → nothing", () => {
    expect(isFuzzyPhoneMatch("1001234567", "1001234576")).toBe(true); // transposition
    expect(isFuzzyPhoneMatch("1001234567", "1001234500")).toBe(true); // two digits
    expect(isFuzzyPhoneMatch("1001234567", "1001234000")).toBe(false);
    expect(isFuzzyPhoneMatch("1001234567", "1001234567")).toBe(false);
    expect(isFuzzyPhoneMatch("1001234567", null)).toBe(false);
    const r = matchShipment(shipment({ consigneePhoneNorm: "1001234576" }), [order()], OPTS);
    expect(r).toMatchObject({ state: "needs_review", method: "phone_amount_fuzzy", orderId: null });
    expect(matchShipment(shipment({ consigneePhoneNorm: "1001234000" }), [order()], OPTS).state).toBe("unmatched");
  });

  it("rule 5: fuzzy needs the amount too, and two fuzzy hits are both listed", () => {
    expect(matchShipment(shipment({ consigneePhoneNorm: "1001234576", cash: 100 }), [order()], OPTS).state).toBe("unmatched");
    const r = matchShipment(shipment({ consigneePhoneNorm: "1001234576" }), [order({ id: "a" }), order({ id: "b", customerPhone: "01001234566" })], OPTS);
    expect(r).toMatchObject({ state: "needs_review", reasonCode: "fuzzy_multiple" });
  });

  it("rule 6: phone matches, amount differs (order 320, ABS COD 350) → review cod_mismatch", () => {
    const r = matchShipment(shipment({ cash: 350 }), [order({ total: 320, expectedCod: 320 })], OPTS);
    expect(r).toMatchObject({ state: "needs_review", method: "phone_amount", reasonCode: "cod_mismatch" });
    expect(r.candidates[0]?.reasons).toContain("cod_mismatch:320vs350");
  });

  it("missing COD amount never auto-links", () => {
    expect(matchShipment(shipment({ cash: null }), [order()], OPTS)).toMatchObject({ state: "needs_review", reasonCode: "no_cod_amount" });
  });

  it("window: created_at in [shipment − N days, shipment + 1 day]", () => {
    const at = new Date("2026-11-10T12:00:00Z").getTime();
    const day = 86_400_000;
    expect(matchShipment(shipment(), [order({ createdAt: new Date(at - 10 * day) })], OPTS).state).toBe("auto");
    expect(matchShipment(shipment(), [order({ createdAt: new Date(at - 10 * day - 1) })], OPTS).state).toBe("unmatched");
    expect(matchShipment(shipment(), [order({ createdAt: new Date(at + day) })], OPTS).state).toBe("auto");
    expect(matchShipment(shipment(), [order({ createdAt: new Date(at + day + 1) })], OPTS).state).toBe("unmatched");
  });

  it("no ABS createdAt → window anchored on the observation time", () => {
    const r = matchShipment(shipment({ absCreatedAt: null }), [order({ createdAt: new Date("2026-11-17T10:00:00Z") })], OPTS);
    expect(r.state).toBe("auto");
  });

  it("no phone → unmatched (no_phone)", () => {
    expect(matchShipment(shipment({ consigneePhoneNorm: null }), [order()], OPTS)).toMatchObject({ state: "unmatched", reasonCode: "no_phone" });
  });
});
