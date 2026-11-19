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
  liveReady: { query: q("liveReady") },
  liveAttention: { query: q("liveAttention") },
  liveDone: { query: q("liveDone") },
  liveSetPaused: { mutate: vi.fn(async () => ({ changed: true })) },
  liveApproveReady: { mutate: vi.fn(async () => ({ applied: 2, results: [{ outcome: "applied" }, { outcome: "applied" }] })) },
  liveApproveOld: { mutate: vi.fn(async () => ({ outcome: "applied", orderNumber: 10150 })) },
  liveUndo: { mutate: vi.fn(async () => ({ changed: true, status: "shipped" })) },
  liveSuppress: { mutate: vi.fn(async () => ({ changed: true })) },
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
  health: { consecutiveFailures: 0, lastOkAt: minutesAgo(4) },
  live: null,
  liveTablesReady: false,
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

  it("Shadow: no live query is made and no button that could change an order exists", async () => {
    setFull();
    render(<AbsTrackingPage />);
    await screen.findByTestId("abs-review");
    expect(api.liveReady.query).not.toHaveBeenCalled();
    expect(api.liveAttention.query).not.toHaveBeenCalled();
    expect(api.liveDone.query).not.toHaveBeenCalled();
    for (const id of ["abs-pause", "abs-resume", "abs-approve-ready", "abs-live-ready", "abs-live-done", "abs-live-too-old"]) expect(screen.queryByTestId(id)).toBeNull();
    expect(has(screen.getByTestId("abs-shadow-note"), "Shadow mode: nothing on the website changes.")).toBe(true);
  });

  it("cooldown: the check button is disabled with a message", async () => {
    setFull();
    fixtures.overview = { ...shadowOverview(), pollNow: { allowed: false, nextAllowedAt: new Date(Date.now() + 90_000) } };
    render(<AbsTrackingPage />);
    await screen.findByTestId("abs-review");
    expect((screen.getByTestId("abs-poll-now") as HTMLButtonElement).disabled).toBe(true);
    expect(has(screen.getByTestId("abs-status-bar"), /You can check again in \d+ s/)).toBe(true);
  });

  // ── Live mode ────────────────────────────────────────────────────────────
  const liveBlock = (extra: Record<string, unknown> = {}) => ({ paused: false, pausedAt: null, pausedBy: null, pauseNote: null, appliedToday: 3, dailyCap: 40, maxPerTick: 10, requireApproval: true, settleMinutes: 30, maxAgeDays: 14, ...extra });
  const liveOverview = (extra: Record<string, unknown> = {}) => ({ ...shadowOverview(), mode: "live", requestedMode: "live", liveTablesReady: true, live: liveBlock(extra) });
  const READY = [
    { decisionId: "dec-r1", awb: "ABS0000201", orderNumber: 10201, orderStatus: "shipped", total: 450, collected: 450, deliveryDate: minutesAgo(200), checkedAt: minutesAgo(5) },
    { decisionId: "dec-r2", awb: "ABS0000202", orderNumber: 10202, orderStatus: "processing", total: 300, collected: 300, deliveryDate: minutesAgo(300), checkedAt: minutesAgo(5) },
  ];
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const DONE = [{ id: "app-1", awbLast4: "0301", orderId: ORDER_A, orderNumber: 10301, orderStatus: "delivered", fromStatus: "shipped", trigger: "auto", actor: "system:abs", appliedAt: minutesAgo(30), cairoDay: today, undoneAt: null, undoneBy: null }];
  const ATTENTION = [
    { id: "la-1", awb: "ABS0000401", decisionId: "dec-old", outcome: "skipped", reason: "too_old", lastSeenAt: minutesAgo(10), orderId: ORDER_A, orderNumber: 10401, orderStatus: "shipped", alerts: [], deliveredDaysAgo: 20 },
    { id: "la-2", awb: "ABS0000402", decisionId: "dec-alert", outcome: "skipped", reason: "open_alert", lastSeenAt: minutesAgo(10), orderId: ORDER_B, orderNumber: 10402, orderStatus: "shipped", alerts: [{ id: "alert-cod", reasonCode: "cod_mismatch" }], deliveredDaysAgo: null },
    { id: "la-3", awb: "ABS0000403", decisionId: "dec-human", outcome: "skipped", reason: "human_changed", lastSeenAt: minutesAgo(10), orderId: ORDER_B, orderNumber: 10403, orderStatus: "processing", alerts: [], deliveredDaysAgo: null },
  ];
  const setLive = (extra: Record<string, unknown> = {}) => {
    setFull();
    fixtures.overview = liveOverview(extra);
    fixtures.liveReady = READY;
    fixtures.liveAttention = ATTENTION;
    fixtures.liveDone = DONE;
  };

  it("Live – approval: badge and note; Ready lists the set; the button applies exactly that set after a confirm", async () => {
    setLive();
    render(<AbsTrackingPage />);
    const ready = await screen.findByTestId("abs-live-ready");
    expect(has(screen.getByTestId("abs-mode"), "Live – approval")).toBe(true);
    expect(has(screen.getByTestId("abs-shadow-note"), "only when you press the button")).toBe(true);
    expect(has(screen.getByTestId("abs-live-today"), "3")).toBe(true);
    expect(has(ready, "#10201")).toBe(true);
    expect(has(ready, "#10202")).toBe(true);
    await userEvent.click(screen.getByTestId("abs-approve-ready"));
    expect(api.liveApproveReady.mutate).not.toHaveBeenCalled();
    await userEvent.click(screen.getByTestId("abs-approve-ready-confirm"));
    await waitFor(() => expect(api.liveApproveReady.mutate).toHaveBeenCalledWith({ decisionIds: ["dec-r1", "dec-r2"] }));
  });

  it("Live (automatic): no Ready section; Done automatically lists today's change; Undo needs a note", async () => {
    setLive({ requireApproval: false });
    render(<AbsTrackingPage />);
    const done = await screen.findByTestId("abs-live-done");
    expect(has(screen.getByTestId("abs-mode"), "Live")).toBe(true);
    expect(has(screen.getByTestId("abs-mode"), "approval")).toBe(false);
    expect(screen.queryByTestId("abs-live-ready")).toBeNull();
    expect(has(done, "#10301")).toBe(true);
    expect(has(done, "…0301")).toBe(true);
    await userEvent.click(screen.getByTestId("abs-undo-app-1-open"));
    const submit = screen.getByTestId("abs-undo-app-1-submit") as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    await userEvent.type(screen.getByTestId("abs-undo-app-1-note"), "customer refused");
    await userEvent.click(submit);
    await waitFor(() => expect(api.liveUndo.mutate).toHaveBeenCalledWith({ applicationId: "app-1", note: "customer refused" }));
  });

  it("Paused: badge, Resume button, and no approve button", async () => {
    setLive({ paused: true, pausedBy: "owner@shop.test", pausedAt: minutesAgo(3) });
    render(<AbsTrackingPage />);
    await screen.findByTestId("abs-live-ready");
    expect(has(screen.getByTestId("abs-mode"), "Paused")).toBe(true);
    expect(screen.queryByTestId("abs-approve-ready")).toBeNull();
    expect(screen.queryByTestId("abs-pause")).toBeNull();
    await userEvent.click(screen.getByTestId("abs-resume"));
    await waitFor(() => expect(api.liveSetPaused.mutate).toHaveBeenCalledWith({ paused: false }));
  });

  it("Pause is one click", async () => {
    setLive();
    render(<AbsTrackingPage />);
    await userEvent.click(await screen.findByTestId("abs-pause"));
    await waitFor(() => expect(api.liveSetPaused.mutate).toHaveBeenCalledWith({ paused: true }));
  });

  it("Needs your attention: old delivery approve, acknowledge the old alert, don't mark automatically", async () => {
    setLive();
    render(<AbsTrackingPage />);
    const old = await screen.findByTestId("abs-live-too-old");
    expect(has(old, "#10401")).toBe(true);
    expect(has(old, "delivered 20 days ago")).toBe(true);
    await userEvent.click(screen.getByTestId("abs-approve-old-dec-old"));
    await waitFor(() => expect(api.liveApproveOld.mutate).toHaveBeenCalledWith({ decisionId: "dec-old" }));

    expect(has(screen.getByTestId("abs-problems"), "There is an open problem on this order or shipment")).toBe(true);
    await userEvent.click(screen.getByTestId("abs-live-ack-alert-cod-open"));
    await userEvent.type(screen.getByTestId("abs-live-ack-alert-cod-note"), "ABS corrected the amount");
    await userEvent.click(screen.getByTestId("abs-live-ack-alert-cod-submit"));
    await waitFor(() => expect(api.acknowledgeDecision.mutate).toHaveBeenCalledWith({ decisionId: "alert-cod", note: "ABS corrected the amount" }));

    const blocked = screen.getByTestId("abs-live-blocked");
    expect(has(blocked, "Someone changed this order's status after ABS delivered it")).toBe(true);
    await userEvent.click(screen.getByTestId("abs-suppress-dec-human-open"));
    await userEvent.type(screen.getByTestId("abs-suppress-dec-human-note"), "I will handle it");
    await userEvent.click(screen.getByTestId("abs-suppress-dec-human-submit"));
    await waitFor(() => expect(api.liveSuppress.mutate).toHaveBeenCalledWith({ decisionId: "dec-human", note: "I will handle it" }));
    // Attention count = review 1 + not linked 1 + ABS problem 1 + returned 1 + missing AWB 1 + live 3 = 8.
    expect(has(screen.getByTestId("abs-attention"), "Needs your attention8")).toBe(true);
  });

  it("sync failing shows in Needs your attention and in the status bar", async () => {
    setLive();
    fixtures.overview = { ...liveOverview(), health: { consecutiveFailures: 4, lastOkAt: minutesAgo(90) } };
    render(<AbsTrackingPage />);
    const g = await screen.findByTestId("abs-sync-failing");
    expect(has(g, "The last 4 ABS checks failed")).toBe(true);
    expect(has(screen.getByTestId("abs-health"), "The last 4 ABS checks failed")).toBe(true);
  });
});
