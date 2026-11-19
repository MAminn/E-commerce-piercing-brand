import { describe, expect, it } from "vitest";
import {
  ATTENTION_REASONS,
  cairoDay,
  cairoHour,
  evaluateLive,
  historyCheck,
  isAbsSystemNote,
  isBlockingAlert,
  liveNote,
  preCheck,
  undoNote,
  type HistoryResult,
  type LiveFacts,
  type LiveRulesConfig,
} from "../live-rules";
import type { HistoryEvent } from "../parse";

/**
 * Eligibility matrix of the ONE automatic transition (§2 of the live brief):
 * every rule as pass and fail, plus the shapes seen in real production data
 * (#10053 returned after delivered, #10100 COD mismatch then corrected, fuzzy
 * phone, reverse shipment, cancelled order, prepaid, missing collectedCash,
 * an event after DELIVERED, a delivery older than 14 days, the settle window).
 */

const NOW = new Date("2026-11-19T15:00:00.000Z");
const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;
const CFG: LiveRulesConfig = { settleMinutes: 30, maxAgeDays: 14, codToleranceEgp: 1 };
const at = (msAgo: number) => new Date(NOW.getTime() - msAgo);

type Patch = {
  decision?: Partial<NonNullable<LiveFacts["decision"]>> | null;
  link?: Partial<NonNullable<LiveFacts["link"]>> | null;
  shipment?: Partial<NonNullable<LiveFacts["shipment"]>> | null;
  order?: Partial<NonNullable<LiveFacts["order"]>> | null;
} & Partial<Omit<LiveFacts, "decision" | "link" | "shipment" | "order">>;

/** A normal COD delivery that must be applied. */
function facts(p: Patch = {}): LiveFacts {
  const base: LiveFacts = {
    now: NOW,
    decision: {
      id: "d-1",
      awb: "ABS0001234",
      orderId: "o-1",
      decision: "would_mark_delivered",
      createdAt: at(2 * HOUR),
      lastSeenAt: at(5 * MIN),
      acknowledgedAt: null,
      applied: false,
      orderStatusAtDecision: "shipped",
      orderTotalAtDecision: 450,
      isLatest: true,
    },
    link: { state: "auto", role: "primary", method: "phone_amount", orderId: "o-1", updatedAt: at(3 * HOUR), recomputeRequestedAt: null },
    shipment: {
      status: "DELIVERED",
      lastEventCode: "SHP_DLVD",
      cmpService: "DELIVERY",
      collectedCash: 450,
      deliveryDate: at(3 * HOUR),
      isUnderRevision: false,
      firstSeenDeliveredAt: at(2 * HOUR),
    },
    order: { id: "o-1", status: "shipped", total: 450, paymentMethod: "cod", paymentStatus: "not_required", stockRestored: false },
    humanStatusChangesSinceDecision: 0,
    everDelivered: false,
    openAlerts: [],
    otherAwbs: 0,
    humanUnlinked: false,
    alreadyApplied: false,
  };
  const merge = <T extends object>(b: T | null, x: Partial<T> | null | undefined): T | null => (x === null ? null : x === undefined ? b : ({ ...(b as T), ...x } as T));
  const { decision, link, shipment, order, ...rest } = p;
  return {
    ...base,
    ...rest,
    decision: merge(base.decision, decision),
    link: merge(base.link, link),
    shipment: merge(base.shipment, shipment),
    order: merge(base.order, order),
  };
}

const ev = (status: HistoryEvent["status"], msAgo: number | null): HistoryEvent => ({ status, statusRaw: status, occurredAt: msAgo === null ? null : at(msAgo) });
const HISTORY_OK: HistoryResult = { ok: true, events: [ev("PICKED_UP", 30 * HOUR), ev("OUT_FOR_DELIVERY", 5 * HOUR), ev("DELIVERED", 3 * HOUR)] };

const reasonOf = (f: LiveFacts, h: HistoryResult | null = HISTORY_OK, opts = {}) => {
  const v = evaluateLive(f, h, CFG, opts);
  return v.ok ? "ok" : v.reason;
};

describe("live eligibility — the normal case", () => {
  it("a linked, settled, fully paid COD delivery is eligible", () => {
    expect(reasonOf(facts())).toBe("ok");
  });
  it("from pending / processing / shipped alike", () => {
    for (const s of ["pending", "processing", "shipped"]) {
      expect(reasonOf(facts({ order: { status: s }, decision: { orderStatusAtDecision: s } }))).toBe("ok");
    }
  });
  it("a reference link and a human-confirmed link are both allowed", () => {
    expect(reasonOf(facts({ link: { method: "reference" } }))).toBe("ok");
    expect(reasonOf(facts({ link: { state: "confirmed", method: "phone_amount_fuzzy" } }))).toBe("ok");
    expect(reasonOf(facts({ link: { state: "confirmed", method: "manual" } }))).toBe("ok");
  });
  it("COD within the 1 EGP tolerance passes; 1.01 off does not", () => {
    expect(reasonOf(facts({ shipment: { collectedCash: 449 } }))).toBe("ok");
    expect(reasonOf(facts({ shipment: { collectedCash: 451 } }))).toBe("ok");
    expect(reasonOf(facts({ shipment: { collectedCash: 448.99 } }))).toBe("cod_mismatch");
  });
  it("prepaid (paid online, nothing collected) passes", () => {
    expect(reasonOf(facts({ order: { paymentMethod: "paymob", paymentStatus: "paid" }, shipment: { collectedCash: 0 } }))).toBe("ok");
    expect(reasonOf(facts({ order: { paymentMethod: "stripe", paymentStatus: "paid" }, shipment: { collectedCash: null } }))).toBe("ok");
  });
});

describe("§2.1 the decision", () => {
  it("missing / superseded / not would_mark_delivered / suppressed / applied", () => {
    expect(reasonOf(facts({ decision: null }))).toBe("decision_missing");
    expect(reasonOf(facts({ decision: { isLatest: false } }))).toBe("decision_superseded");
    expect(reasonOf(facts({ decision: { decision: "alert" } }))).toBe("not_proposed");
    expect(reasonOf(facts({ decision: { acknowledgedAt: at(HOUR) } }))).toBe("suppressed_by_human");
    expect(reasonOf(facts({ decision: { applied: true } }))).toBe("already_applied");
    expect(reasonOf(facts({ alreadyApplied: true }))).toBe("already_applied");
  });
});

describe("§2.2 the link", () => {
  it("fuzzy phone auto link is never applied (real data)", () => {
    expect(reasonOf(facts({ link: { method: "phone_amount_fuzzy" } }))).toBe("link_method_not_allowed");
  });
  it("needs_review / unmatched / rejected / missing", () => {
    expect(reasonOf(facts({ link: { state: "needs_review" } }))).toBe("link_not_usable");
    expect(reasonOf(facts({ link: { state: "unmatched" } }))).toBe("link_not_usable");
    expect(reasonOf(facts({ link: { state: "rejected" } }))).toBe("link_not_usable");
    expect(reasonOf(facts({ link: null }))).toBe("link_missing");
  });
  it("reverse / exchange / other roles never apply (real data: reverse shipments)", () => {
    for (const role of ["reverse", "exchange", "other"]) expect(reasonOf(facts({ link: { role } }))).toBe("link_not_primary");
  });
  it("a link changed since the decision (other order, newer update, pending recompute)", () => {
    expect(reasonOf(facts({ link: { orderId: "o-2" } }))).toBe("link_changed");
    expect(reasonOf(facts({ link: { updatedAt: at(MIN) } }))).toBe("link_changed");
    expect(reasonOf(facts({ link: { recomputeRequestedAt: at(MIN) } }))).toBe("link_changed");
  });
  it("a human unlinked after the last confirmation", () => {
    expect(reasonOf(facts({ humanUnlinked: true }))).toBe("human_unlinked");
  });
});

describe("§2.3 the shipment", () => {
  it("not DELIVERED at ABS", () => {
    expect(reasonOf(facts({ shipment: { status: "OUT_FOR_DELIVERY" } }))).toBe("shipment_not_delivered");
    expect(reasonOf(facts({ shipment: null }))).toBe("shipment_not_delivered");
  });
  it("partial-delivery and delivery-reverted event codes", () => {
    expect(reasonOf(facts({ shipment: { lastEventCode: "SHP_PRTL_DLVD" } }))).toBe("partial_or_reverted_event");
    expect(reasonOf(facts({ shipment: { lastEventCode: "shp_dlvd_rvrt" } }))).toBe("partial_or_reverted_event");
  });
  it("isUnderRevision true, or not sent by ABS", () => {
    expect(reasonOf(facts({ shipment: { isUnderRevision: true } }))).toBe("under_revision");
    expect(reasonOf(facts({ shipment: { isUnderRevision: null } }))).toBe("under_revision_unknown");
  });
  it("a REVERSE / EXCHANGE service row", () => {
    expect(reasonOf(facts({ shipment: { cmpService: "REVERSE" } }))).toBe("reverse_service");
    expect(reasonOf(facts({ shipment: { cmpService: "EXCHANGE" } }))).toBe("reverse_service");
    expect(reasonOf(facts({ shipment: { cmpService: null } }))).toBe("ok");
  });
});

describe("§2.4 the fresh ABS history and the settle window", () => {
  it("the history call failed → skip this tick", () => {
    expect(reasonOf(facts(), { ok: false, error: "http 503" })).toBe("history_unavailable");
    expect(reasonOf(facts(), null)).toBe("history_unavailable");
  });
  it("no DELIVERED in the history", () => {
    expect(reasonOf(facts(), { ok: true, events: [ev("OUT_FOR_DELIVERY", 4 * HOUR)] })).toBe("history_no_delivered");
  });
  it("an event after the last DELIVERED (real data: #10053 returned after delivered)", () => {
    expect(reasonOf(facts(), { ok: true, events: [ev("DELIVERED", 5 * HOUR), ev("RETURN_INITIATED", 2 * HOUR)] })).toBe("history_event_after_delivered");
    expect(reasonOf(facts(), { ok: true, events: [ev("DELIVERED", 5 * HOUR), ev("DELIVERY_REVERTED", 5 * HOUR)] })).toBe("history_event_after_delivered");
  });
  it("a second DELIVERED is fine as long as nothing follows the last one", () => {
    expect(reasonOf(facts(), { ok: true, events: [ev("DELIVERED", 9 * HOUR), ev("OUT_FOR_DELIVERY", 6 * HOUR), ev("DELIVERED", 3 * HOUR)] })).toBe("ok");
  });
  it("an undated event → cannot order the history → skip", () => {
    expect(reasonOf(facts(), { ok: true, events: [ev("DELIVERED", 3 * HOUR), ev("IN_TRANSIT", null)] })).toBe("history_undated");
  });
  it("within the settle window, by ABS's time or by our first sighting", () => {
    expect(reasonOf(facts(), { ok: true, events: [ev("DELIVERED", 10 * MIN)] })).toBe("settling");
    expect(reasonOf(facts({ shipment: { firstSeenDeliveredAt: at(29 * MIN) } }))).toBe("settling");
    expect(reasonOf(facts({ shipment: { firstSeenDeliveredAt: at(31 * MIN) } }))).toBe("ok");
    const v = historyCheck({ ok: true, events: [ev("DELIVERED", 10 * MIN)] }, facts(), CFG);
    expect(v).toEqual({ ok: false, reason: "settling", detail: { minutesLeft: 20 } });
  });
});

describe("§2.5 COD and prepaid", () => {
  it("COD: collectedCash missing — `cash` alone is not enough (real data)", () => {
    expect(reasonOf(facts({ shipment: { collectedCash: null } }))).toBe("cod_missing_collected");
  });
  it("COD: amount differs", () => {
    expect(reasonOf(facts({ shipment: { collectedCash: 300 } }))).toBe("cod_mismatch");
  });
  it("prepaid: not paid, or ABS collected cash", () => {
    expect(reasonOf(facts({ order: { paymentMethod: "paymob", paymentStatus: "pending" }, shipment: { collectedCash: 0 } }))).toBe("prepaid_not_paid");
    expect(reasonOf(facts({ order: { paymentMethod: "paymob", paymentStatus: "paid" }, shipment: { collectedCash: 450 } }))).toBe("prepaid_cash_collected");
  });
  it("#10100 shape: an old cod_mismatch alert still open blocks even after ABS corrected the amount", () => {
    const f = facts({ openAlerts: [{ id: "a-1", reasonCode: "cod_mismatch" }] });
    expect(reasonOf(f)).toBe("open_alert");
    const v = preCheck(f, CFG);
    expect(v.ok ? null : v.detail).toEqual({ alerts: [{ id: "a-1", reasonCode: "cod_mismatch" }] });
    // Once a person acknowledges that alert, the corrected delivery is applied.
    expect(reasonOf(facts({ openAlerts: [] }))).toBe("ok");
  });
});

describe("§2.6 order compare-and-set", () => {
  it("status or total changed since the decision", () => {
    expect(reasonOf(facts({ order: { status: "processing" } }))).toBe("order_status_changed");
    expect(reasonOf(facts({ order: { total: 500 } }))).toBe("order_total_changed");
    expect(reasonOf(facts({ decision: { orderTotalAtDecision: null } }))).toBe("order_total_changed");
  });
  it("cancelled (real data: cancelled_order_match), already delivered, stock restored, missing", () => {
    expect(reasonOf(facts({ order: { status: "cancelled" } }))).toBe("order_cancelled");
    expect(reasonOf(facts({ order: { status: "delivered" } }))).toBe("already_delivered");
    expect(reasonOf(facts({ order: { stockRestored: true } }))).toBe("stock_restored");
    expect(reasonOf(facts({ order: null }))).toBe("order_missing");
  });
});

describe("§2.7 never overwrite a human", () => {
  it("an admin changed the status after the decision", () => {
    expect(reasonOf(facts({ humanStatusChangesSinceDecision: 1 }))).toBe("human_changed");
  });
  it("the order was delivered before and moved away", () => {
    expect(reasonOf(facts({ everDelivered: true }))).toBe("previously_delivered");
  });
  it("an open alert on the order or AWB, or several AWBs for the order", () => {
    expect(reasonOf(facts({ openAlerts: [{ id: "a", reasonCode: "returned_after_delivered" }] }))).toBe("open_alert");
    expect(reasonOf(facts({ openAlerts: [{ id: "a", reasonCode: "delivered_but_cancelled" }] }))).toBe("open_alert");
    expect(reasonOf(facts({ otherAwbs: 1 }))).toBe("multiple_awbs");
  });
  it("which alerts block", () => {
    for (const r of ["cod_mismatch", "returned_after_delivered", "delivered_but_cancelled", "partially_delivered", "delivery_reverted", "unknown_status", "status_lost", "reverse_shipment_delivered", "exchange_shipment_undelivered"]) {
      expect(isBlockingAlert(r)).toBe(true);
    }
    // A hold / failed attempt BEFORE the delivery is normal; unlinked noise predates the link.
    for (const r of ["delivery_problem", "unlinked_terminal", "unlinked_unknown_status", null]) expect(isBlockingAlert(r)).toBe(false);
  });
});

describe("§2.8 delivery age", () => {
  it("older than 14 days → attention (approve); approving waives only the age", () => {
    const old = facts({ shipment: { deliveryDate: at(15 * DAY) } });
    expect(reasonOf(old)).toBe("too_old");
    expect(reasonOf(old, HISTORY_OK, { ignoreAge: true })).toBe("ok");
    // ignoreAge waives nothing else.
    expect(reasonOf(facts({ shipment: { deliveryDate: at(15 * DAY), collectedCash: 1 } }), HISTORY_OK, { ignoreAge: true })).toBe("cod_mismatch");
    expect(reasonOf(facts({ shipment: { deliveryDate: at(13 * DAY) } }))).toBe("ok");
  });
  it("no delivery date at all", () => {
    expect(reasonOf(facts({ shipment: { deliveryDate: null } }))).toBe("no_delivery_date");
  });
});

describe("attention classification and helpers", () => {
  it("exceptions go to the owner, transient states do not", () => {
    for (const r of ["too_old", "open_alert", "human_changed", "cod_mismatch", "history_event_after_delivered", "daily_cap"] as const) expect(ATTENTION_REASONS.has(r)).toBe(true);
    for (const r of ["settling", "history_unavailable", "order_status_changed", "link_changed", "already_delivered", "awaiting_approval", "paused"] as const) expect(ATTENTION_REASONS.has(r)).toBe(false);
  });
  it("order_log notes: [ABS auto] prefix, AWB last 4 and the decision id only", () => {
    const n = liveNote("ABS0009876543", "0192c1f0-1111-7000-8000-000000000001", "auto");
    expect(n).toBe("[ABS auto] Delivered at ABS (AWB …6543, decision 0192c1f0-1111-7000-8000-000000000001).");
    expect(n).not.toContain("ABS0009876543");
    expect(isAbsSystemNote(n)).toBe(true);
    expect(liveNote("X1234", "d", "approval")).toMatch(/^\[ABS auto\].*Approved on the ABS screen\.$/);
    const u = undoNote("ABS0009876543", "app-1", "shipped");
    expect(u.startsWith("[ABS auto-undo]")).toBe(true);
    // An undo is a person's change, not ABS's.
    expect(isAbsSystemNote(u)).toBe(false);
    expect(isAbsSystemNote("Status changed from shipped to delivered by admin")).toBe(false);
  });
  it("Cairo day and hour (UTC+2 in November)", () => {
    expect(cairoDay(new Date("2026-11-19T21:59:00Z"))).toBe("2026-11-19");
    expect(cairoDay(new Date("2026-11-19T22:01:00Z"))).toBe("2026-11-20");
    expect(cairoHour(new Date("2026-11-19T07:00:00Z"))).toBe(9);
    expect(cairoHour(new Date("2026-11-19T06:59:00Z"))).toBe(8);
  });
});
