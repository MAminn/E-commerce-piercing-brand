import { describe, expect, it } from "vitest";
import { readAbsTrackingConfig } from "#root/shared/config/abs-tracking";
import { matchShipment, matchWindow, type CandidateOrder } from "../matcher";
import { isMissingAwb, missingAwbCutoffs } from "../queries";
import { checkNote, planAcknowledge, planConfirm, planManual, planReject, planUnlink, pollNowCooldown, POLL_NOW_COOLDOWN_MS } from "../review";
import type { NormalizedShipment } from "../types";

const cand = (orderId: string) => ({ orderId, orderNumber: 1 });

describe("review state rules", () => {
  it("confirm: listed candidate, or the current auto link; repeat is a no-op", () => {
    expect(planConfirm({ state: "needs_review", orderId: null, candidates: [cand("a"), cand("b")] }, "b")).toEqual({ ok: true, noop: false });
    expect(planConfirm({ state: "needs_review", orderId: null, candidates: [cand("a")] }, "z")).toMatchObject({ ok: false, code: "BAD_REQUEST" });
    expect(planConfirm({ state: "unmatched", orderId: null, candidates: [] }, "z")).toMatchObject({ ok: false, code: "BAD_REQUEST" });
    expect(planConfirm({ state: "auto", orderId: "a", candidates: [] }, "a")).toEqual({ ok: true, noop: false });
    expect(planConfirm({ state: "auto", orderId: "a", candidates: [] }, "b")).toMatchObject({ ok: false, code: "BAD_REQUEST" });
    expect(planConfirm({ state: "confirmed", orderId: "a", candidates: [] }, "a")).toEqual({ ok: true, noop: true });
    expect(planConfirm({ state: "confirmed", orderId: "a", candidates: [] }, "b")).toMatchObject({ ok: false, code: "CONFLICT" });
    expect(planConfirm({ state: "rejected", orderId: null, candidates: [cand("a")] }, "a")).toMatchObject({ ok: false, code: "PRECONDITION_FAILED" });
  });

  it("reject / manual / unlink", () => {
    expect(planReject({ state: "auto" })).toEqual({ ok: true, noop: false });
    expect(planReject({ state: "rejected" })).toEqual({ ok: true, noop: true });
    expect(planManual({ state: "unmatched", orderId: null, role: "primary" }, "a", "primary")).toEqual({ ok: true, noop: false });
    expect(planManual({ state: "auto", orderId: "x", role: "primary" }, "a", "primary")).toEqual({ ok: true, noop: false });
    expect(planManual({ state: "confirmed", orderId: "a", role: "primary" }, "a", "primary")).toEqual({ ok: true, noop: true });
    expect(planManual({ state: "confirmed", orderId: "a", role: "primary" }, "b", "primary")).toMatchObject({ ok: false, code: "CONFLICT" });
    expect(planUnlink({ state: "confirmed" })).toEqual({ ok: true, noop: false });
    expect(planUnlink({ state: "rejected" })).toEqual({ ok: true, noop: false });
    expect(planUnlink({ state: "needs_review" })).toMatchObject({ ok: false, code: "PRECONDITION_FAILED" });
  });

  it("acknowledgement: alerts and return confirmations only; re-acknowledging is a no-op", () => {
    expect(planAcknowledge({ decision: "alert", acknowledgedAt: null })).toEqual({ ok: true, noop: false });
    expect(planAcknowledge({ decision: "needs_return_confirmation", acknowledgedAt: null })).toEqual({ ok: true, noop: false });
    expect(planAcknowledge({ decision: "alert", acknowledgedAt: new Date() })).toEqual({ ok: true, noop: true });
    for (const d of ["would_mark_delivered", "would_mark_shipped", "no_action"]) {
      expect(planAcknowledge({ decision: d, acknowledgedAt: null })).toMatchObject({ ok: false, code: "BAD_REQUEST" });
    }
  });

  it("notes: required where asked, trimmed, 3–500 characters", () => {
    expect(() => checkNote("", true)).toThrow(/required/);
    expect(() => checkNote("  ", true)).toThrow(/required/);
    expect(checkNote("", false)).toBeNull();
    expect(() => checkNote("ok", true)).toThrow(/at least 3/);
    expect(() => checkNote("x".repeat(501), true)).toThrow(/at most 500/);
    expect(checkNote("  customer called  ", true)).toBe("customer called");
  });

  it("pollNow cooldown: at most once per 2 minutes", () => {
    const t0 = new Date("2026-11-18T10:00:00Z");
    expect(pollNowCooldown(null, t0)).toEqual({ allowed: true, retryAfterMs: 0, nextAllowedAt: null });
    expect(pollNowCooldown(t0, new Date(t0.getTime() + 30_000))).toMatchObject({ allowed: false, retryAfterMs: 90_000 });
    expect(pollNowCooldown(t0, new Date(t0.getTime() + POLL_NOW_COOLDOWN_MS - 1))).toMatchObject({ allowed: false, retryAfterMs: 1 });
    expect(pollNowCooldown(t0, new Date(t0.getTime() + POLL_NOW_COOLDOWN_MS))).toMatchObject({ allowed: true });
  });
});

describe("missing ABS shipment (ABS-only policy)", () => {
  const cfg = readAbsTrackingConfig({});
  const now = new Date("2026-11-25T12:00:00Z");
  const c = missingAwbCutoffs(now, cfg);

  it("defaults: ABS only since 2026-11-18 (Cairo midnight), alert after 2 days", () => {
    expect(cfg.absOnlySince.toISOString()).toBe("2026-11-17T22:00:00.000Z");
    expect(cfg.missingAwbAlertDays).toBe(2);
    expect(c.placedBefore.toISOString()).toBe("2026-11-23T12:00:00.000Z");
    expect(readAbsTrackingConfig({ ABS_ONLY_SINCE: "2026-12-01", ABS_MISSING_AWB_ALERT_DAYS: "5" })).toMatchObject({ missingAwbAlertDays: 5 });
    expect(readAbsTrackingConfig({ ABS_ONLY_SINCE: "2026-12-01" }).absOnlySince.toISOString()).toBe("2026-11-30T22:00:00.000Z");
  });

  it("date cut-off, legacy exemption, days threshold, status, link", () => {
    const o = (status: string, iso: string) => ({ status, createdAt: new Date(iso) });
    expect(isMissingAwb(o("processing", "2026-11-21T10:00:00+02:00"), false, c)).toBe(true);
    expect(isMissingAwb(o("shipped", "2026-11-18T00:00:00+02:00"), false, c)).toBe(true); // exactly the cut-off
    expect(isMissingAwb(o("shipped", "2026-11-17T23:59:59+02:00"), false, c)).toBe(false); // legacy private-courier order
    expect(isMissingAwb(o("processing", "2026-11-24T10:00:00+02:00"), false, c)).toBe(false); // younger than 2 days
    expect(isMissingAwb(o("pending", "2026-11-21T10:00:00+02:00"), false, c)).toBe(false);
    expect(isMissingAwb(o("delivered", "2026-11-21T10:00:00+02:00"), false, c)).toBe(false);
    expect(isMissingAwb(o("processing", "2026-11-21T10:00:00+02:00"), true, c)).toBe(false); // has a primary link
  });
});

describe("matcher: 45-day window for REVERSE / EXCHANGE (suggestions only)", () => {
  const shipment = (cmpService: string): NormalizedShipment => ({
    awb: "R1",
    reference: null,
    cmpService,
    statusRaw: "PICKED_UP",
    status: "PICKED_UP",
    lastEventCode: null,
    lastReason: null,
    cash: 0,
    collectedCash: 0,
    absFees: null,
    totalFees: null,
    isPaid: null,
    paymentDate: null,
    deliveryDate: null,
    absCreatedAt: new Date("2026-12-10T10:00:00+02:00"),
    consigneePhoneNorm: "1000000505",
    consigneePhoneLast4: "0505",
    noOfPieces: 1,
    originAwb: null,
    raw: {},
  });
  const order = (id: string, createdAt: string, phone = "01000000505", total = 0): CandidateOrder => ({
    id,
    orderNumber: Number(id.replace(/\D/g, "")) || 1,
    customerPhone: phone,
    total,
    expectedCod: total,
    status: "delivered",
    createdAt: new Date(createdAt),
    linkedAwb: null,
  });
  const opts = { windowDays: 10, reverseWindowDays: 45, codToleranceEgp: 1, observedAt: new Date("2026-12-10T10:00:00+02:00") };

  it("a return 41 days after the order is suggested; never auto; exact phone only", () => {
    const candidates = [order("o41", "2026-10-30T10:00:00+02:00"), order("o50", "2026-10-21T10:00:00+02:00"), order("ofz", "2026-11-20T10:00:00+02:00", "01000000550")];
    for (const svc of ["REVERSE", "EXCHANGE"]) {
      const m = matchShipment(shipment(svc), candidates, opts);
      expect(m.state).toBe("needs_review");
      expect(m.orderId).toBeNull();
      expect(m.candidates.map((c) => c.orderId)).toEqual(["o41"]); // o50 outside 45 days; fuzzy phone never listed
    }
    // Without the reverse window (Phase 1 behaviour) the 41-day-old order is not listed.
    expect(matchShipment(shipment("REVERSE"), candidates, { ...opts, reverseWindowDays: undefined }).candidates).toEqual([]);
  });

  it("the primary window stays 10 days", () => {
    expect(matchWindow({ absCreatedAt: opts.observedAt, cmpService: "DELIVERY" }, opts).from.toISOString()).toBe("2026-11-30T08:00:00.000Z");
    expect(matchWindow({ absCreatedAt: opts.observedAt, cmpService: "REVERSE" }, opts).from.toISOString()).toBe("2026-10-26T08:00:00.000Z");
    expect(readAbsTrackingConfig({}).reverseWindowDays).toBe(45);
    expect(readAbsTrackingConfig({ ABS_REVERSE_WINDOW_DAYS: "60" }).reverseWindowDays).toBe(60);
  });
});
