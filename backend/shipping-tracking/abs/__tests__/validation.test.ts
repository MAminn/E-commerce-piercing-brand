import { describe, expect, it } from "vitest";
import { computeValidation, isOpenAlert, latestDecisionPerAwb, type FactAudit, type FactDecision, type FactHistory, type FactLink, type FactOrder, type ValidationFacts } from "../validation";

/**
 * Shadow validation report on hand-built facts. Order numbers are synthetic
 * except the two real shapes the brief names (#10053, #10100), reproduced
 * with fake data.
 *
 *   A 10101  would_mark_delivered → admin delivered 6 h later      (agreed)
 *   B 10102  would_mark_delivered → admin delivered 24 h later     (agreed); admin shipped before ABS moved (shipped miss)
 *   C 10103  would_mark_delivered, website still shipped            (pending); confirmed from review as top candidate
 *   D 10104  would_mark_delivered, ABS then DELIVERY_REVERTED       (false positive)
 *   E 10053  ABS RETURNED_TO_SHIPPER, our own courier delivered     (delivered miss: not delivered at ABS) + open alert
 *   F 10100  ABS COD 350 vs order 320 → cod_mismatch; corrected and delivered (delivered miss: cod_mismatch)
 *   G 10106  auto link → would_mark_delivered → admin REJECTED link (false positive + auto-link overruled)
 *   H 10107  would_mark_shipped → admin shipped 4 h later           (shipped agreed)
 *   U        unmatched AWB
 */
const t = (s: string) => new Date(`2026-11-${s}:00Z`);
let seq = 0;
const dec = (awb: string, orderId: string | null, decision: string, reasonCode: string, shipmentStatus: string, at: string, extra: Partial<FactDecision> = {}): FactDecision => ({
  id: `d${++seq}`,
  awb,
  orderId,
  decision,
  reasonCode,
  shipmentStatus,
  orderStatusSeen: null,
  createdAt: t(at),
  lastSeenAt: t(at),
  acknowledgedAt: null,
  ...extra,
});
const ord = (id: string, orderNumber: number, status: string, total = 300): [string, FactOrder] => [id, { id, orderNumber, status, total }];
const link = (awb: string, orderId: string | null, state: string, method: string | null): FactLink => ({ awb, orderId, state, role: "primary", method });
const hist = (awb: string, status: string, at: string): FactHistory => ({ awb, status, observedAt: t(at) });

function facts(): ValidationFacts {
  const audit: FactAudit[] = [
    { action: "link_confirm", awb: "C1", at: t("16T09:00"), before: { state: "needs_review", orderId: null, candidates: [{ orderId: "C" }, { orderId: "X" }] }, after: { state: "confirmed", orderId: "C" } },
    { action: "link_confirm", awb: "E1", at: t("13T09:00"), before: { state: "needs_review", orderId: null, candidates: [{ orderId: "X" }, { orderId: "E" }] }, after: { state: "confirmed", orderId: "E" } },
    { action: "link_manual", awb: "F1", at: t("12T09:00"), before: { state: "needs_review", orderId: null, method: "phone_amount" }, after: { state: "confirmed", orderId: "F", method: "manual" } },
    { action: "link_reject", awb: "G1", at: t("15T12:00"), before: { state: "auto", orderId: "G", method: "phone_amount" }, after: { state: "rejected", orderId: null } },
  ];
  return {
    shadowStartedAt: t("10T00:00"),
    decisions: [
      dec("A1", "A", "would_mark_delivered", "delivered_amount_ok", "DELIVERED", "12T10:00"),
      dec("B1", "B", "no_action", "order_already_ahead", "IN_TRANSIT", "12T08:00"),
      dec("B1", "B", "would_mark_delivered", "delivered_amount_ok", "DELIVERED", "13T08:00"),
      dec("C1", "C", "would_mark_delivered", "delivered_amount_ok", "DELIVERED", "17T09:00"),
      dec("D1", "D", "would_mark_delivered", "delivered_amount_ok", "DELIVERED", "14T10:00"),
      dec("D1", "D", "alert", "delivery_reverted", "DELIVERY_REVERTED", "15T10:00"),
      dec("E1", "E", "needs_return_confirmation", "returned_to_shipper", "RETURNED_TO_SHIPPER", "14T10:00"),
      dec("E1", "E", "alert", "returned_after_delivered", "RETURNED_TO_SHIPPER", "15T12:00"),
      dec("F1", "F", "alert", "cod_mismatch", "DELIVERED", "13T10:00"),
      dec("F1", "F", "no_action", "already_delivered", "DELIVERED", "14T06:00"),
      dec("G1", "G", "would_mark_delivered", "delivered_amount_ok", "DELIVERED", "15T10:00"),
      dec("G1", null, "alert", "unlinked_terminal", "DELIVERED", "15T13:00"),
      dec("H1", "H", "would_mark_shipped", "in_transit", "PICKED_UP", "11T10:00"),
      dec("U1", null, "no_action", "unlinked", "IN_TRANSIT", "16T10:00"),
    ],
    links: [
      link("A1", "A", "auto", "phone_amount"),
      link("B1", "B", "auto", "reference"),
      link("C1", "C", "confirmed", "phone_amount"),
      link("D1", "D", "auto", "phone_amount"),
      link("E1", "E", "confirmed", "phone_amount"),
      link("F1", "F", "confirmed", "manual"),
      link("G1", null, "rejected", "phone_amount"),
      link("H1", "H", "auto", "phone_amount"),
      link("U1", null, "unmatched", null),
    ],
    orders: new Map([ord("A", 10101, "delivered"), ord("B", 10102, "delivered"), ord("C", 10103, "shipped"), ord("D", 10104, "shipped"), ord("E", 10053, "delivered"), ord("F", 10100, "delivered", 350), ord("G", 10106, "shipped"), ord("H", 10107, "shipped")]),
    statusChanges: [
      { orderId: "A", newStatus: "delivered", at: t("12T16:00") },
      { orderId: "B", newStatus: "shipped", at: t("12T07:00") },
      { orderId: "B", newStatus: "delivered", at: t("14T08:00") },
      { orderId: "E", newStatus: "delivered", at: t("15T11:00") },
      { orderId: "F", newStatus: "delivered", at: t("14T05:00") },
      { orderId: "H", newStatus: "shipped", at: t("11T14:00") },
    ],
    history: [
      hist("A1", "DELIVERED", "12T10:00"),
      hist("B1", "IN_TRANSIT", "12T08:00"),
      hist("B1", "DELIVERED", "13T08:00"),
      hist("C1", "DELIVERED", "17T09:00"),
      hist("D1", "DELIVERED", "14T10:00"),
      hist("D1", "DELIVERY_REVERTED", "15T10:00"),
      hist("E1", "RETURNED_TO_SHIPPER", "14T10:00"),
      hist("F1", "DELIVERED", "13T10:00"),
      hist("G1", "DELIVERED", "15T10:00"),
      hist("H1", "PICKED_UP", "11T10:00"),
    ],
    shipmentStatus: new Map([
      ["A1", "DELIVERED"],
      ["B1", "DELIVERED"],
      ["C1", "DELIVERED"],
      ["D1", "DELIVERY_REVERTED"],
      ["E1", "RETURNED_TO_SHIPPER"],
      ["F1", "DELIVERED"],
      ["G1", "DELIVERED"],
      ["H1", "PICKED_UP"],
      ["U1", "IN_TRANSIT"],
    ]),
    unknownStatuses: [],
    audit,
  };
}

const RANGE = { from: t("10T00:00"), to: t("18T12:00") };

describe("Shadow validation report", () => {
  const r = computeValidation(facts(), RANGE);

  it("delivered agreement, false positives, misses and every summary number", () => {
    expect(r.delivered).toMatchObject({ proposed: 5, agreed: 2, pending: 1, falsePositives: 2, misses: 2, precision: 0.5, recall: 0.5, medianLeadHours: 15 });
    const byNo = Object.fromEntries(r.delivered.proposals.map((p) => [p.orderNumber, p]));
    expect(byNo[10101]).toMatchObject({ outcome: "agreed", leadHours: 6, websiteStatus: "delivered" });
    expect(byNo[10102]).toMatchObject({ outcome: "agreed", leadHours: 24 });
    expect(byNo[10103]).toMatchObject({ outcome: "pending", reason: null, websiteStatus: "shipped", leadHours: null });
    expect(byNo[10104]).toMatchObject({ outcome: "false_positive", reason: "abs_status_moved_to_delivery_reverted" });
    expect(byNo[10106]).toMatchObject({ outcome: "false_positive", reason: "link_rejected_by_admin" });
  });

  it("#10053 (returned at ABS, delivered by our courier) and #10100 (COD 350 vs 320) are explained misses", () => {
    const misses = Object.fromEntries(r.delivered.missList.map((m) => [m.orderNumber, m.reason]));
    expect(misses).toEqual({ 10053: "not_delivered_at_abs", 10100: "cod_mismatch" });
  });

  it("shipped agreement (secondary): agreed, explained miss", () => {
    expect(r.shipped).toMatchObject({ proposed: 1, agreed: 1, pending: 0, falsePositives: 0, misses: 1, precision: 1, recall: 0.5, medianLeadHours: 4 });
    expect(r.shipped.missList).toEqual([expect.objectContaining({ orderNumber: 10102, reason: "website_shipped_first" })]);
  });

  it("matching quality by method: the rejected auto link lowers phone_amount precision", () => {
    expect(r.matching).toEqual({
      byMethod: { phone_amount: { autoLinks: 4, overruled: 1, precision: 0.75 }, reference: { autoLinks: 1, overruled: 0, precision: 1 } },
      autoLinks: 5,
      autoOverruled: 1,
      autoPrecision: 0.8,
      reviewConfirmed: 2,
      reviewConfirmedTopCandidate: 1,
      manualLinks: 1,
      links: 9,
      unmatched: 1,
      unmatchedRate: 0.1111,
    });
  });

  it("open alerts = latest decision per AWB, unacknowledged; superseded alerts close themselves", () => {
    // F1's cod_mismatch was superseded by already_delivered → not open.
    expect(r.openAlertsByReason).toEqual({ delivery_reverted: 1, returned_after_delivered: 1, unlinked_terminal: 1 });
    const f = facts();
    const e = f.decisions.find((d) => d.reasonCode === "returned_after_delivered") as FactDecision;
    e.acknowledgedAt = t("16T10:00");
    expect(computeValidation(f, RANGE).openAlertsByReason).toEqual({ delivery_reverted: 1, unlinked_terminal: 1 });
  });

  it("targets: days / volume, precision, explained misses, auto precision, unknown statuses", () => {
    expect(r.shadowDays).toBe(8);
    expect(r.absDeliveredOrders).toBe(5);
    expect(r.targets.map((x) => [x.name, x.met])).toEqual([
      ["At least 7 days of Shadow and 40 ABS-delivered orders", false],
      ["Delivered precision 100%", false],
      ["Every miss explained by a rule", true],
      ["Auto-link precision 100%", false],
      ["Zero UNKNOWN statuses", true],
    ]);
    const withUnknown = computeValidation({ ...facts(), unknownStatuses: ["Teleported"] }, RANGE);
    expect(withUnknown.targets[4]).toMatchObject({ met: false, value: "Teleported" });
  });

  it("an order cancelled after the proposal is a false positive; a proposal outside the range is ignored", () => {
    const f = facts();
    f.statusChanges.push({ orderId: "C", newStatus: "cancelled", at: t("18T09:00") });
    const c = computeValidation(f, RANGE).delivered.proposals.find((p) => p.orderNumber === 10103);
    expect(c).toMatchObject({ outcome: "false_positive", reason: "order_cancelled_later" });
    const narrow = computeValidation(facts(), { from: t("14T00:00"), to: t("18T12:00") });
    expect(narrow.delivered.proposals.map((p) => p.orderNumber).sort()).toEqual([10103, 10104, 10106]);
  });

  it("an unexplained miss fails the 'every miss explained' target", () => {
    const f = facts();
    f.orders.set("Z", { id: "Z", orderNumber: 10199, status: "delivered", total: 100 });
    f.links.push(link("Z1", "Z", "auto", "phone_amount"));
    f.history.push(hist("Z1", "DELIVERED", "16T10:00"));
    f.shipmentStatus.set("Z1", "DELIVERED");
    f.statusChanges.push({ orderId: "Z", newStatus: "delivered", at: t("16T12:00") });
    const z = computeValidation(f, RANGE);
    expect(z.delivered.missList.find((m) => m.orderNumber === 10199)?.reason).toBe("unexplained");
    expect(z.targets[2]?.met).toBe(false);
  });

  it("helpers: latest decision per AWB and open-alert rule", () => {
    const rows = [dec("X", null, "alert", "a", "LOST", "10T10:00"), dec("X", null, "no_action", "b", "DELIVERED", "11T10:00")];
    expect(latestDecisionPerAwb(rows).get("X")?.reasonCode).toBe("b");
    expect(isOpenAlert({ decision: "alert", acknowledgedAt: null })).toBe(true);
    expect(isOpenAlert({ decision: "needs_return_confirmation", acknowledgedAt: null })).toBe(true);
    expect(isOpenAlert({ decision: "alert", acknowledgedAt: new Date() })).toBe(false);
    expect(isOpenAlert({ decision: "would_mark_delivered", acknowledgedAt: null })).toBe(false);
  });
});
