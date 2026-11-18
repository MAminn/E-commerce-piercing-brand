// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * ABS tracking review screen with fixture data: Off state, empty Shadow
 * state, and a full Shadow state whose actions must call the right
 * mutations (and nothing that could change a website order exists).
 */
const q = (name: string) => vi.fn(async () => (fixtures as Record<string, unknown>)[name]);
const api = {
  overview: { query: q("overview") },
  actionGroups: { query: q("actionGroups") },
  reviewQueue: { query: q("reviewQueue") },
  missingAwb: { query: q("missingAwb") },
  validation: { query: q("validation") },
  runs: { query: q("runs") },
  audit: { query: q("audit") },
  shipments: { query: q("shipments") },
  confirmLink: { mutate: vi.fn(async () => ({ changed: true })) },
  rejectLink: { mutate: vi.fn(async () => ({ changed: true })) },
  manualLink: { mutate: vi.fn(async () => ({ changed: true })) },
  unlink: { mutate: vi.fn(async () => ({ changed: true })) },
  acknowledgeDecision: { mutate: vi.fn(async () => ({ changed: true })) },
  pollNow: { mutate: vi.fn(async () => ({ outcome: "ok", shipmentsSeen: 3, decisionsNew: 1 })) },
};
vi.mock("#root/shared/trpc/client", () => ({ trpc: { absTracking: api } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { default: AbsTrackingPage } = await import("../AbsTrackingPage");

/** Text check without jest-dom. */
const has = (el: Element | null, t: string | RegExp) => {
  const s = el?.textContent ?? "";
  return typeof t === "string" ? s.includes(t) : t.test(s);
};

const NOW = new Date();
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);
const ORDER_A = "11111111-1111-4111-8111-111111111111";
const ORDER_B = "22222222-2222-4222-8222-222222222222";

const decision = (id: string, extra: Record<string, unknown>) => ({
  id,
  awb: "ABS0000777",
  decision: "alert",
  reasonCode: "delivery_problem",
  absStatus: "HOLD_DECISION",
  orderStatusSeen: "shipped",
  orderNumber: 10107,
  websiteStatus: "shipped",
  orderTotal: 199,
  cash: 199,
  collectedCash: 0,
  phoneLast4: "0707",
  seenCount: 3,
  firstSeenAt: minutesAgo(300),
  lastSeenAt: minutesAgo(5),
  acknowledgedAt: null,
  acknowledgedBy: null,
  ackNote: null,
  isLatest: true,
  open: true,
  ...extra,
});

const emptyGroups = { wouldDeliver: [], wouldShip: [], returnedToUs: [], amountDiffers: [], absProblems: [], notLinked: [] };
const shadowOverview = (counts: Partial<Record<string, number>> = {}) => ({
  mode: "shadow",
  requestedMode: "shadow",
  on: true,
  boot: { requestedMode: "shadow", effective: "shadow", reason: null, ready: true, missing: [], checkedAt: NOW.toISOString() },
  now: NOW,
  lastRun: { startedAt: minutesAgo(4), finishedAt: minutesAgo(4), trigger: "schedule", outcome: "ok", pages: 1, shipmentsSeen: 12, error: null },
  lastOkAt: minutesAgo(4),
  watermark: minutesAgo(4),
  resume: null,
  backoffUntil: null,
  counts: { linksByState: {}, reviewQueue: 0, needsReview: 0, unmatched: 0, openAlertsByReason: {}, openAlerts: 0, wouldMarkDelivered: 0, wouldMarkShipped: 0, missingAwb: 0, unknownStatuses: 0, ...counts },
  unknownStatusLabels: [],
  pollNow: { allowed: true, nextAllowedAt: null },
  settings: { absOnlySince: new Date("2026-11-18T00:00:00+02:00"), missingAwbAlertDays: 2, matchWindowDays: 10, reverseWindowDays: 45 },
});
const validation = {
  from: "2026-11-18T00:00:00.000Z",
  to: NOW.toISOString(),
  shadowStartedAt: "2026-11-18T00:00:00.000Z",
  shadowDays: 3,
  delivered: {
    proposed: 2,
    agreed: 1,
    pending: 0,
    falsePositives: 1,
    misses: 1,
    precision: 0.5,
    recall: 0.5,
    medianLeadHours: 6,
    proposals: [{ orderId: ORDER_B, orderNumber: 10104, awb: "ABS0000104", firstSeenAt: NOW.toISOString(), outcome: "false_positive", reason: "abs_status_moved_to_delivery_reverted", websiteStatus: "shipped", websiteChangedAt: null, leadHours: null }],
    missList: [{ orderId: ORDER_A, orderNumber: 10053, awb: "ABS0010053", websiteChangedAt: NOW.toISOString(), reason: "not_delivered_at_abs" }],
  },
  shipped: { proposed: 0, agreed: 0, pending: 0, falsePositives: 0, misses: 0, precision: null, recall: null, medianLeadHours: null, proposals: [], missList: [] },
  matching: { byMethod: {}, autoLinks: 4, autoOverruled: 0, autoPrecision: 1, reviewConfirmed: 1, reviewConfirmedTopCandidate: 1, manualLinks: 0, links: 6, unmatched: 1, unmatchedRate: 0.1667 },
  openAlertsByReason: { delivery_problem: 1 },
  absDeliveredOrders: 2,
  unknownStatuses: [],
  targets: [
    { name: "At least 7 days of Shadow and 40 ABS-delivered orders", met: false, value: "3 day(s), 2 order(s)" },
    { name: "Delivered precision 100%", met: false, value: "50% (1 false positive(s))" },
  ],
};

let fixtures: Record<string, unknown> = {};

function setFull() {
  fixtures = {
    overview: shadowOverview({ reviewQueue: 1, needsReview: 1, wouldMarkDelivered: 1, openAlerts: 2, missingAwb: 1 }),
    actionGroups: {
      ...emptyGroups,
      wouldDeliver: [
        { ...decision("d-wmd-1", { decision: "would_mark_delivered", reasonCode: "delivered_amount_ok", absStatus: "DELIVERED", orderNumber: 10101, websiteStatus: "delivered", awb: "ABS0000101" }), absStatusNow: "DELIVERED", stillProposed: false, latestDecision: "no_action", latestReason: "already_delivered" },
        { ...decision("d-wmd-2", { decision: "would_mark_delivered", reasonCode: "delivered_amount_ok", absStatus: "DELIVERED", orderNumber: 10102, websiteStatus: "shipped", awb: "ABS0000102" }), absStatusNow: "DELIVERED", stillProposed: true, latestDecision: "would_mark_delivered", latestReason: "delivered_amount_ok" },
      ],
      absProblems: [decision("d-hold", {})],
      returnedToUs: [decision("d-ret", { decision: "needs_return_confirmation", reasonCode: "returned_to_shipper", absStatus: "RETURNED_TO_SHIPPER", orderNumber: 10106, awb: "ABS0000106" })],
      notLinked: [decision("d-nl", { reasonCode: "unlinked_terminal", absStatus: "DELIVERED", orderNumber: null, websiteStatus: null, awb: "ABS0000999" })],
    },
    reviewQueue: [
      {
        awb: "ABS0000004",
        state: "needs_review",
        role: "primary",
        method: "phone_amount",
        reasonCode: "multiple_candidates",
        confidence: 50,
        humanTouched: false,
        absStatus: "OUT_FOR_DELIVERY",
        absStatusRaw: "Out for Delivery",
        cash: 250,
        collectedCash: null,
        reference: null,
        service: "DELIVERY",
        phoneLast4: "0404",
        absCreatedAt: minutesAgo(600),
        candidates: [
          { orderId: ORDER_A, orderNumber: 10180, createdAt: minutesAgo(2000), total: 250, websiteStatus: "pending", phoneLast4: "0404", score: 50, reasons: ["phone_exact", "amount_ok"], linkedToAwb: null },
          { orderId: ORDER_B, orderNumber: 10181, createdAt: minutesAgo(1000), total: 250, websiteStatus: "processing", phoneLast4: "0404", score: 50, reasons: ["phone_exact", "amount_ok"], linkedToAwb: null },
        ],
      },
    ],
    missingAwb: [{ orderId: ORDER_B, orderNumber: 10190, createdAt: minutesAgo(4 * 1440), status: "processing", total: 300, phoneLast4: "1234", ageDays: 4, possibleAwbs: [] }],
    validation,
    runs: [{ id: "r1", startedAt: minutesAgo(4), finishedAt: minutesAgo(4), trigger: "schedule", outcome: "ok", pages: 1, shipmentsSeen: 12, shipmentsChanged: 2, linksAuto: 1, linksReview: 1, decisionsNew: 2, error: null, windowFrom: null, windowTo: null, backoffUntil: null }],
    audit: [{ id: "a1", at: minutesAgo(30), actor: "owner@shop.test", action: "link_confirm", awb: "ABS0000003", orderId: ORDER_A, before: null, after: null, note: null }],
    shipments: {
      items: [
        { awb: "ABS0000101", absStatus: "DELIVERED", absStatusRaw: "Delivered", lastChangeAt: minutesAgo(60), absCreatedAt: minutesAgo(3000), service: "DELIVERY", cash: 450, collectedCash: 450, absFees: 55, totalFees: 55, phoneLast4: "0101", linkState: "auto", linkMethod: "phone_amount", linkRole: "primary", linkReason: "phone_and_amount", confidence: 90, orderId: ORDER_A, orderNumber: 10101, websiteStatus: "shipped", orderTotal: 450, decisionId: "d-wmd-1", decision: "would_mark_delivered", decisionReason: "delivered_amount_ok", acknowledgedAt: null },
      ],
      nextCursor: null,
    },
  };
}

beforeEach(() => {
  for (const group of Object.values(api)) for (const fn of Object.values(group)) (fn as ReturnType<typeof vi.fn>).mockClear();
});

describe("ABS tracking page", () => {
  it("Off: says so, the check button is disabled, nothing else is loaded", async () => {
    fixtures = { overview: { mode: "off", requestedMode: "off", on: false, now: NOW, boot: { requestedMode: "off", effective: "off", reason: "ABS_TRACKING_MODE is off or unset", ready: null, missing: [], checkedAt: NOW.toISOString() } } };
    render(<AbsTrackingPage />);
    expect(has(await screen.findByTestId("abs-off"), "ABS tracking is off")).toBe(true);
    expect(has(screen.getByTestId("abs-mode"), "Off")).toBe(true);
    expect((screen.getByTestId("abs-poll-now") as HTMLButtonElement).disabled).toBe(true);
    expect(has(screen.getByTestId("abs-shadow-note"), "Shadow mode: nothing on the website changes.")).toBe(true);
    expect(api.actionGroups.query).not.toHaveBeenCalled();
    expect(api.reviewQueue.query).not.toHaveBeenCalled();
    expect(api.shipments.query).not.toHaveBeenCalled();
  });

  it("Shadow, empty: every section renders its empty state", async () => {
    fixtures = { overview: shadowOverview(), actionGroups: emptyGroups, reviewQueue: [], missingAwb: [], validation: { ...validation, delivered: { ...validation.delivered, proposals: [], missList: [] } }, runs: [], audit: [], shipments: { items: [], nextCursor: null } };
    render(<AbsTrackingPage />);
    expect(has(await screen.findByTestId("abs-review"), "Nothing is waiting for you.")).toBe(true);
    expect(has(screen.getByTestId("abs-mode"), "Shadow")).toBe(true);
    expect(has(screen.getByTestId("abs-would-deliver"), "Nothing in the last 14 days.")).toBe(true);
    expect(has(screen.getByTestId("abs-problems"), "No problems reported by ABS.")).toBe(true);
    expect(has(screen.getByTestId("abs-returned"), "No returns waiting.")).toBe(true);
    expect(has(screen.getByTestId("abs-missing-awb"), "Every recent order has an ABS shipment.")).toBe(true);
    expect(await within(screen.getByTestId("abs-shipments")).findByText("No shipments for this filter.")).toBeTruthy();
    expect(has(screen.getByTestId("abs-history"), "No checks yet.")).toBe(true);
    expect((screen.getByTestId("abs-poll-now") as HTMLButtonElement).disabled).toBe(false);
  });

  it("Shadow with fixtures: agreement, mismatches, accuracy and history are shown; no button changes a website order", async () => {
    setFull();
    render(<AbsTrackingPage />);
    const wd = await screen.findByTestId("abs-would-deliver");
    expect(has(wd, "already Delivered on website ✓")).toBe(true);
    expect(has(wd, "still Shipped on website")).toBe(true);
    expect(has(screen.getByTestId("abs-problems"), "ABS: On hold · Website: Shipped")).toBe(true);
    expect(has(screen.getByTestId("abs-returned"), "ABS returned the parcel to us")).toBe(true);
    expect(has(screen.getByTestId("abs-missing-awb"), "#10190")).toBe(true);
    const acc = screen.getByTestId("abs-accuracy");
    expect(has(acc, "50%")).toBe(true);
    expect(has(acc, "#10053")).toBe(true);
    expect(has(acc, "ABS later changed it to: Delivery cancelled by ABS")).toBe(true);
    expect(has(screen.getByTestId("abs-history"), "Confirmed a match")).toBe(true);
    expect(await within(screen.getByTestId("abs-shipments")).findByText("AWB ABS0000101")).toBeTruthy();
    const labels = screen.getAllByRole("button").map((b) => b.textContent ?? "");
    for (const l of labels) expect(l).not.toMatch(/mark (as )?delivered|mark shipped|cancel order|restock/i);
  });

  it("review card: Confirm calls confirmLink with the AWB and that order", async () => {
    setFull();
    render(<AbsTrackingPage />);
    await userEvent.click(await screen.findByTestId("abs-confirm-ABS0000004-10181"));
    await waitFor(() => expect(api.confirmLink.mutate).toHaveBeenCalledWith({ awb: "ABS0000004", orderId: ORDER_B }));
    expect(api.rejectLink.mutate).not.toHaveBeenCalled();
  });

  it("review card: “Not this one” needs a note, then calls rejectLink", async () => {
    setFull();
    render(<AbsTrackingPage />);
    await userEvent.click(await screen.findByTestId("abs-reject-ABS0000004-open"));
    const submit = screen.getByTestId("abs-reject-ABS0000004-submit");
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    await userEvent.type(screen.getByTestId("abs-reject-ABS0000004-note"), "different customer");
    expect((submit as HTMLButtonElement).disabled).toBe(false);
    await userEvent.click(submit);
    await waitFor(() => expect(api.rejectLink.mutate).toHaveBeenCalledWith({ awb: "ABS0000004", note: "different customer" }));
  });

  it("review card: “Link to another order” needs an order number and a note, then calls manualLink", async () => {
    setFull();
    render(<AbsTrackingPage />);
    await userEvent.click(await screen.findByTestId("abs-manual-ABS0000004-open"));
    const submit = screen.getByTestId("abs-manual-ABS0000004-submit");
    await userEvent.type(screen.getByTestId("abs-manual-ABS0000004-order"), "#10200");
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    await userEvent.type(screen.getByTestId("abs-manual-ABS0000004-note"), "customer used another phone");
    await userEvent.click(submit);
    await waitFor(() => expect(api.manualLink.mutate).toHaveBeenCalledWith({ awb: "ABS0000004", orderNumber: 10200, role: "primary", note: "customer used another phone" }));
  });

  it("problems: Acknowledge with a note calls acknowledgeDecision", async () => {
    setFull();
    render(<AbsTrackingPage />);
    await userEvent.click(await screen.findByTestId("abs-ack-d-hold-open"));
    await userEvent.type(screen.getByTestId("abs-ack-d-hold-note"), "customer will be home tomorrow");
    await userEvent.click(screen.getByTestId("abs-ack-d-hold-submit"));
    await waitFor(() => expect(api.acknowledgeDecision.mutate).toHaveBeenCalledWith({ decisionId: "d-hold", note: "customer will be home tomorrow" }));
  });

  it("all shipments: Unlink with a note calls unlink; Check ABS now calls pollNow", async () => {
    setFull();
    render(<AbsTrackingPage />);
    await userEvent.click(await screen.findByTestId("abs-unlink-ABS0000101-open"));
    await userEvent.type(screen.getByTestId("abs-unlink-ABS0000101-note"), "wrong order");
    await userEvent.click(screen.getByTestId("abs-unlink-ABS0000101-submit"));
    await waitFor(() => expect(api.unlink.mutate).toHaveBeenCalledWith({ awb: "ABS0000101", note: "wrong order" }));
    await userEvent.click(screen.getByTestId("abs-poll-now"));
    await waitFor(() => expect(api.pollNow.mutate).toHaveBeenCalledTimes(1));
  });

  it("cooldown: the check button is disabled with a message", async () => {
    setFull();
    fixtures.overview = { ...shadowOverview(), pollNow: { allowed: false, nextAllowedAt: new Date(Date.now() + 90_000) } };
    render(<AbsTrackingPage />);
    await screen.findByTestId("abs-review");
    expect((screen.getByTestId("abs-poll-now") as HTMLButtonElement).disabled).toBe(true);
    expect(has(screen.getByTestId("abs-status-bar"), /You can check again in \d+ s/)).toBe(true);
  });
});
