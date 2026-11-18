import { describe, expect, it } from "vitest";
import { decide, decisionDedupeKey, type DecideInput } from "../rules";
import { CANONICAL_STATUSES, RETURNING_STATUSES, TRANSIT_STATUSES, type CanonicalStatus, type WebsiteOrderStatus } from "../types";

const ORDER_STATUSES: WebsiteOrderStatus[] = ["pending", "processing", "shipped", "delivered", "cancelled"];
const AUTO = { state: "auto" as const, role: "primary" as const };

const run = (status: CanonicalStatus, orderStatus: WebsiteOrderStatus | null, over: Partial<DecideInput> = {}) =>
  decide({
    orderStatus,
    shipment: { status, cash: 400, collectedCash: 400 },
    link: AUTO,
    orderTotal: 400,
    ...over,
  });

describe("rule engine — every row of the brief's table", () => {
  it("link not auto/confirmed primary → no_action, or alert unlinked_terminal for DELIVERED / RETURNED_TO_SHIPPER", () => {
    for (const link of [null, { state: "needs_review" as const, role: "primary" as const }, { state: "unmatched" as const, role: "primary" as const }, { state: "rejected" as const, role: "primary" as const }]) {
      expect(run("DELIVERED", null, { link })).toEqual({ decision: "alert", reasonCode: "unlinked_terminal" });
      expect(run("RETURNED_TO_SHIPPER", null, { link })).toEqual({ decision: "alert", reasonCode: "unlinked_terminal" });
      expect(run("IN_TRANSIT", null, { link }).decision).toBe("no_action");
    }
    // A linked order whose row vanished (orderStatus null) is treated as unlinked.
    expect(run("IN_TRANSIT", null).decision).toBe("no_action");
  });

  it("confirmed links act like auto links", () => {
    expect(run("IN_TRANSIT", "processing", { link: { state: "confirmed", role: "primary" } }).decision).toBe("would_mark_shipped");
  });

  it("NEW, AWAITING_PICKUP → no_action for any order status", () => {
    for (const s of ["NEW", "AWAITING_PICKUP"] as const) for (const o of ORDER_STATUSES) expect(run(s, o).decision).toBe("no_action");
  });

  it("transit states: pending/processing → would_mark_shipped; shipped/delivered/cancelled → no_action (never backwards)", () => {
    for (const s of TRANSIT_STATUSES) {
      expect(run(s, "pending").decision).toBe("would_mark_shipped");
      expect(run(s, "processing").decision).toBe("would_mark_shipped");
      for (const o of ["shipped", "delivered", "cancelled"] as const) expect(run(s, o).decision).toBe("no_action");
    }
  });

  it("DELIVERED with matching amount → would_mark_delivered for pending/processing/shipped", () => {
    for (const o of ["pending", "processing", "shipped"] as const) {
      expect(run("DELIVERED", o)).toEqual({ decision: "would_mark_delivered", reasonCode: "delivered_amount_ok" });
    }
  });

  it("DELIVERED uses collectedCash, falls back to cash, within the tolerance", () => {
    expect(run("DELIVERED", "shipped", { shipment: { status: "DELIVERED", cash: 400, collectedCash: 350 } }).reasonCode).toBe("cod_mismatch");
    expect(run("DELIVERED", "shipped", { shipment: { status: "DELIVERED", cash: 400, collectedCash: null } }).decision).toBe("would_mark_delivered");
    expect(run("DELIVERED", "shipped", { shipment: { status: "DELIVERED", cash: 401, collectedCash: null } }).decision).toBe("would_mark_delivered");
    expect(run("DELIVERED", "shipped", { shipment: { status: "DELIVERED", cash: 401.5, collectedCash: null } }).reasonCode).toBe("cod_mismatch");
    expect(run("DELIVERED", "shipped", { shipment: { status: "DELIVERED", cash: null, collectedCash: null } }).reasonCode).toBe("cod_mismatch");
  });

  it("DELIVERED, amount differs → alert cod_mismatch for any not-delivered, not-cancelled order", () => {
    for (const o of ["pending", "processing", "shipped"] as const) {
      expect(run("DELIVERED", o, { orderTotal: 320, shipment: { status: "DELIVERED", cash: 350, collectedCash: 350 } })).toEqual({ decision: "alert", reasonCode: "cod_mismatch" });
    }
  });

  it("DELIVERED + delivered → no_action; DELIVERED + cancelled → alert delivered_but_cancelled (even if amounts differ)", () => {
    expect(run("DELIVERED", "delivered")).toEqual({ decision: "no_action", reasonCode: "already_delivered" });
    expect(run("DELIVERED", "cancelled")).toEqual({ decision: "alert", reasonCode: "delivered_but_cancelled" });
    expect(run("DELIVERED", "cancelled", { orderTotal: 1 }).reasonCode).toBe("delivered_but_cancelled");
  });

  it("expected COD overrides the total (online order already paid → 0)", () => {
    expect(run("DELIVERED", "shipped", { orderTotal: 700, expectedCod: 0, shipment: { status: "DELIVERED", cash: 0, collectedCash: 0 } }).decision).toBe("would_mark_delivered");
  });

  it("PARTIALLY_DELIVERED, DELIVERY_REVERTED → alert for any order status", () => {
    for (const o of ORDER_STATUSES) {
      expect(run("PARTIALLY_DELIVERED", o)).toEqual({ decision: "alert", reasonCode: "partially_delivered" });
      expect(run("DELIVERY_REVERTED", o)).toEqual({ decision: "alert", reasonCode: "delivery_reverted" });
    }
  });

  it("UNDELIVERED, HOLD_DECISION, REOPERATE → alert delivery_problem", () => {
    for (const s of ["UNDELIVERED", "HOLD_DECISION", "REOPERATE"] as const) for (const o of ORDER_STATUSES) expect(run(s, o)).toEqual({ decision: "alert", reasonCode: "delivery_problem" });
  });

  it("RETURN_INITIATED … OUT_FOR_RETURN → no_action (coming back)", () => {
    for (const s of RETURNING_STATUSES) for (const o of ORDER_STATUSES) expect(run(s, o).decision).toBe("no_action");
  });

  it("RETURNED_TO_SHIPPER → needs_return_confirmation (never automatic); after delivered → alert", () => {
    for (const o of ["pending", "processing", "shipped"] as const) expect(run("RETURNED_TO_SHIPPER", o).decision).toBe("needs_return_confirmation");
    expect(run("RETURNED_TO_SHIPPER", "delivered")).toEqual({ decision: "alert", reasonCode: "returned_after_delivered" });
    expect(run("RETURNED_TO_SHIPPER", "cancelled").decision).toBe("no_action");
  });

  it("LOST, DAMAGED, INVESTIGATION, CANCELED, REROUTE_INITIATED, STOCK_IN, UNDER_REVISION, UNKNOWN → alert", () => {
    for (const s of ["LOST", "DAMAGED", "INVESTIGATION", "CANCELED", "REROUTE_INITIATED", "STOCK_IN", "UNDER_REVISION", "UNKNOWN"] as const) {
      for (const o of ORDER_STATUSES) expect(run(s, o).decision).toBe("alert");
    }
    expect(run("UNKNOWN", "shipped").reasonCode).toBe("unknown_status");
  });

  it("reverse / exchange / other links never produce a status decision on the order", () => {
    for (const role of ["reverse", "exchange", "other"] as const) {
      for (const s of CANONICAL_STATUSES) {
        for (const state of ["auto", "confirmed", "needs_review"] as const) {
          const d = run(s, "delivered", { link: { state, role } });
          expect(["alert", "no_action"]).toContain(d.decision);
        }
      }
    }
  });

  it("no status ever yields a backwards suggestion", () => {
    for (const s of CANONICAL_STATUSES) {
      expect(["no_action", "alert"]).toContain(run(s, "delivered").decision);
      expect(run(s, "cancelled").decision).not.toMatch(/^would_/);
      expect(run(s, "shipped").decision).not.toBe("would_mark_shipped");
    }
  });

  it("dedupe key", () => {
    expect(decisionDedupeKey("A1", "DELIVERED", "shipped", "would_mark_delivered")).toBe("A1|DELIVERED|shipped|would_mark_delivered");
    expect(decisionDedupeKey("A1", "DELIVERED", null, "alert")).toBe("A1|DELIVERED|none|alert");
  });
});
