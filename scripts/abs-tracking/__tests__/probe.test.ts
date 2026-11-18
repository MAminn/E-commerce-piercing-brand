import { describe, expect, it, vi } from "vitest";

/**
 * ABS API probe (scripts/abs-tracking/probe.ts). Fetch is always mocked: no
 * network. The database layer is mocked to FAIL the test if anything in the
 * probe's module graph ever imports it.
 */
const dbTouched: string[] = [];
vi.mock("pg", () => {
  dbTouched.push("pg");
  return { default: {}, Pool: class {}, Client: class {} };
});
vi.mock("#root/shared/database/drizzle/db", () => {
  dbTouched.push("drizzle/db");
  return {};
});

const core = await import("../probe-core");
const { checkProbeEnv, columnsReport, detectPageContract, fieldPresence, formatProbeSummary, runAbsProbe, scrubReport, tallyStatuses } = core;

const KEY = "probe-key-NOT-REAL-9876543210";
const BASE = "https://abs.example.test";

/** Synthetic rows: fake names and phones only. */
const row = (awb: string, extra: Record<string, unknown> = {}) => ({
  awb,
  reference: null,
  status: "DELIVERED",
  lastEventCode: "SHP_DLVD",
  cash: 300,
  collectedCash: 300,
  consigneeName: "Fake Person Name",
  consigneePhone: "+201000009999",
  consigneeAddress: "12 Fake Street, Cairo",
  ...extra,
});

type Handler = (req: { method: string; path: string; body: Record<string, unknown> }) => { status: number; body?: unknown; headers?: Record<string, string> };
function mockAbs(handler: Handler) {
  const calls: Array<{ method: string; path: string; body: Record<string, unknown> }> = [];
  const impl = vi.fn(async (url: string, init: { method: string; body?: string }) => {
    const req = { method: init.method, path: new URL(url).pathname, body: init.body ? JSON.parse(init.body) : {} };
    calls.push(req);
    const r = handler(req);
    return {
      status: r.status,
      ok: r.status >= 200 && r.status < 300,
      headers: { get: (n: string) => r.headers?.[n.toLowerCase()] ?? null },
      text: async () => JSON.stringify(r.body ?? {}),
    };
  });
  return { impl, calls };
}

const run = (impl: unknown, extra: Partial<Parameters<typeof runAbsProbe>[0]> = {}) =>
  runAbsProbe({ baseUrl: BASE, apiKey: KEY, fetchImpl: impl as never, sleep: async () => {}, minGapMs: 0, now: () => new Date("2026-11-18T12:00:00Z"), ...extra });

/** A healthy ABS: cursor pagination, one status ABS invented, history for every AWB. */
const healthy: Handler = (req) => {
  if (req.path === "/api/v1/shipments/list") {
    const cols = (req.body.columns as string[]) ?? [];
    if (cols.includes("percProbeUnknownColumn")) return { status: 400, body: { message: "Unknown column percProbeUnknownColumn" } };
    const limit = Number(req.body.limit);
    if (limit === 5 && !req.body.cursor) {
      return {
        status: 200,
        body: {
          data: [row("AWB1000001", { lastChangeDate: "2026-11-17T10:00:00+02:00" }), row("AWB1000002"), row("AWB1000003", { status: "Teleported", lastEventCode: null })],
          hasMore: true,
          nextCursor: "c2",
        },
      };
    }
    if (req.body.cursor === "c2") return { status: 200, body: { data: [row("AWB1000004")], hasMore: false, nextCursor: null } };
    if (req.body.lastChangeDateFrom === req.body.lastChangeDateTo) return { status: 200, body: { data: [row("AWB1000001")], hasMore: false, nextCursor: null } };
    return {
      status: 200,
      body: {
        data: [row("AWB1000001", { reference: "10180" }), row("AWB1000002", { status: "Out for Delivery", lastEventCode: null, deliveryDate: null }), row("AWB1000003", { status: "Teleported", lastEventCode: null })],
        hasMore: false,
        nextCursor: null,
      },
    };
  }
  if (req.path.endsWith("/history")) {
    return { status: 200, body: { data: [{ status: "Picked Up", datetime: "2026-11-10T09:00:00+02:00" }, { status: "Delivered", datetime: "2026-11-12T13:00:00+02:00" }] } };
  }
  if (req.path === "/api/v1/tracking/bulk") return { status: 200, body: { data: { found: [], notFound: [] } } };
  return { status: 200, body: { data: { awb: "AWB1000001", status: "Delivered" } } };
};

describe("ABS probe — environment and isolation", () => {
  it("refuses without ABS_API_BASE_URL / ABS_API_KEY, even when DATABASE_URL is set; requires https", () => {
    const onlyDb = checkProbeEnv({ DATABASE_URL: "postgresql://x@localhost/db" });
    expect(onlyDb.ok).toBe(false);
    expect((onlyDb as { error: string }).error).toMatch(/ABS_API_BASE_URL and ABS_API_KEY not set.*never uses a database/);
    expect(checkProbeEnv({ ABS_API_BASE_URL: BASE }).ok).toBe(false);
    expect(checkProbeEnv({ ABS_API_BASE_URL: "http://abs.example.test", ABS_API_KEY: KEY }).ok).toBe(false);
    expect(checkProbeEnv({ ABS_API_BASE_URL: BASE, ABS_API_KEY: KEY })).toEqual({ ok: true, baseUrl: BASE, apiKey: KEY });
  });

  it("a full run imports no database module and only calls allow-listed ABS endpoints", async () => {
    const abs = mockAbs(healthy);
    await run(abs.impl);
    expect(dbTouched).toEqual([]);
    const allowed = /^(POST \/api\/v1\/shipments\/list|GET \/api\/v1\/tracking\/[A-Za-z0-9_-]+(\/history)?|POST \/api\/v1\/tracking\/bulk)$/;
    for (const c of abs.calls) expect(`${c.method} ${c.path}`).toMatch(allowed);
  });
});

describe("ABS probe — full run against a mocked ABS", () => {
  it("answers all nine steps within the request budget and reports UNKNOWN statuses", async () => {
    const abs = mockAbs(healthy);
    const report = await run(abs.impl);
    expect(report.aborted).toBeNull();
    expect(report.requestsMade).toBe(abs.calls.length);
    expect(report.requestsMade).toBeLessThanOrEqual(40);
    expect(report.steps.map((s) => s.step)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const step = (n: number) => report.steps.find((s) => s.step === n) as (typeof report.steps)[number];
    expect(step(1).result).toBe("PASS");
    expect(step(2)).toMatchObject({ result: "PASS" });
    expect(step(3).details).toMatchObject({ contract: "cursor", pageSizeHonoured: true, overlapBetweenPages: 0 });
    expect(step(4).summary).toMatch(/both bounds inclusive/);
    expect(step(5).summary).toMatch(/unknown column: rejected \(http 400\)/);
    expect(step(6).result).toBe("FAIL");
    expect((step(6).details.unknownStatuses as Array<{ status: string }>).map((u) => u.status)).toEqual(["Teleported"]);
    expect(step(7).details).toMatchObject({ rows: 3 });
    expect(step(8).details.awbs).toHaveLength(3);
    expect(step(9).details).toMatchObject({ requests: 10, http429: 0 });
    // Requests are paced by the client (minGap is injected as 0 here; ≥ 300 ms by default).
    expect(formatProbeSummary(report)).toMatch(/9\. PASS Rate behaviour/);
  });

  it("the report holds no names, phones, addresses, reference text, full AWBs or the key", async () => {
    const report = await run(mockAbs(healthy).impl);
    const text = JSON.stringify(report) + formatProbeSummary(report);
    expect(text).not.toContain(KEY);
    expect(text).not.toMatch(/Fake Person|Fake Street|Cairo"/);
    expect(text).not.toMatch(/1000009999|01000009999/);
    expect(text).not.toMatch(/AWB100000\d/);
    expect(text).not.toContain("10180");
    expect(text).toContain("…0001");
  });

  it("stops at the first 401: nothing is requested after it", async () => {
    const abs = mockAbs(() => ({ status: 401, body: { message: "invalid key" } }));
    const report = await run(abs.impl);
    expect(abs.calls).toHaveLength(1);
    expect(report.aborted).toMatch(/401/);
    expect(report.steps.find((s) => s.step === 1)).toMatchObject({ result: "FAIL", httpStatus: [401] });
    expect(report.steps.filter((s) => s.step > 1).every((s) => s.result === "SKIP")).toBe(true);
  });

  it("a 401 mid-run (e.g. history not permitted with 401) also stops the run", async () => {
    const abs = mockAbs((req) => (req.path.startsWith("/api/v1/tracking") ? { status: 401 } : healthy(req)));
    const report = await run(abs.impl);
    const after401 = abs.calls.findIndex((c) => c.path.startsWith("/api/v1/tracking"));
    expect(abs.calls).toHaveLength(after401 + 1);
    expect(report.aborted).toMatch(/401/);
  });

  it("403 on an endpoint is reported as a permission failure without aborting", async () => {
    const abs = mockAbs((req) => (req.path === "/api/v1/tracking/bulk" ? { status: 403 } : healthy(req)));
    const report = await run(abs.impl);
    expect(report.aborted).toBeNull();
    expect(report.steps.find((s) => s.step === 2)).toMatchObject({ result: "FAIL" });
    expect(report.steps.find((s) => s.step === 2)?.summary).toMatch(/tracking\/bulk \(403\)/);
  });

  it("page 2 repeating page-1 rows (page parameter ignored) fails the pagination step", async () => {
    const abs = mockAbs((req) => {
      if (req.path === "/api/v1/shipments/list" && Number(req.body.limit) === 5) return { status: 200, body: { data: [row("AWB1000001")], hasMore: true, nextCursor: null } };
      return healthy(req);
    });
    const report = await run(abs.impl);
    expect(report.steps.find((s) => s.step === 3)).toMatchObject({ result: "FAIL", details: { contract: "page", overlapBetweenPages: 1 } });
  });

  it("never exceeds the request budget", async () => {
    const abs = mockAbs(healthy);
    const report = await run(abs.impl, { maxRequests: 6 });
    expect(abs.calls.length).toBeLessThanOrEqual(6);
    expect(report.requestsMade).toBeLessThanOrEqual(6);
  });

  it("429 and Retry-After are reported by the rate step", async () => {
    let n = 0;
    const abs = mockAbs((req) => {
      if (req.path === "/api/v1/shipments/list" && Number(req.body.limit) === 1 && !(req.body.columns as string[]).includes("percProbeUnknownColumn")) {
        n++;
        if (n === 4) return { status: 429, headers: { "retry-after": "2" } };
      }
      return healthy(req);
    });
    const report = await run(abs.impl);
    expect(report.steps.find((s) => s.step === 9)?.details).toMatchObject({ http429: 1, retryAfter: ["2"] });
  });
});

describe("ABS probe — pure analysers", () => {
  it("page-contract detection: cursor, page + hasMore, single page, unknown, page size", () => {
    expect(detectPageContract({ data: [{ awb: "A" }], nextCursor: "x", hasMore: true }, { data: [{ awb: "B" }] }, 5, "cursor")).toMatchObject({ contract: "cursor", overlapBetweenPages: 0, nextCursorPresent: true });
    expect(detectPageContract({ data: [{ awb: "A" }], nextCursor: null, hasMore: true }, { data: [{ awb: "A" }] }, 5, "page")).toMatchObject({ contract: "page", overlapBetweenPages: 1 });
    expect(detectPageContract({ data: [{ awb: "A" }], hasMore: false }, null, 5, null)).toMatchObject({ contract: "single_page", page2Rows: null });
    expect(detectPageContract({ data: [{ awb: "A" }] }, null, 5, null)).toMatchObject({ contract: "unknown", hasMoreField: false });
    const big = { data: Array.from({ length: 7 }, (_, i) => ({ awb: `A${i}` })), hasMore: false };
    expect(detectPageContract(big, null, 5, null).pageSizeHonoured).toBe(false);
    expect(detectPageContract({ data: [] }, null, 5, null).pageSizeHonoured).toBeNull();
  });

  it("status tally lists every status the normaliser maps to UNKNOWN", () => {
    const { tallies, unknown } = tallyStatuses([
      { status: "Delivered" },
      { status: "DELIVERED" },
      { status: "Delivered" },
      { status: "Teleported" },
      { status: null, displayStatus: "Out for Delivery" },
      { status: "Weird", lastEventCode: "SHP_DLVD" },
      { status: "Mystery", lastEventCode: "SHP_NEW_CODE" },
    ]);
    expect(tallies[0]).toMatchObject({ status: "Delivered", canonical: "DELIVERED", count: 2 });
    expect(tallies.find((t) => t.displayStatus === "Out for Delivery")?.canonical).toBe("OUT_FOR_DELIVERY");
    expect(tallies.find((t) => t.status === "Weird")?.canonical).toBe("DELIVERED");
    expect(unknown.map((u) => u.status).sort()).toEqual(["Mystery", "Teleported"]);
  });

  it("field presence and columns report keep names and percentages only", () => {
    const rows = [
      { awb: "A", reference: "10180", collectedCash: 10, absFees: 5, deliveryDate: "2026-11-01", isPaid: false, status: "DELIVERED" },
      { awb: "B", reference: "", collectedCash: null, status: "IN_TRANSIT" },
    ];
    const fp = fieldPresence(rows);
    expect(fp.percent).toEqual({ reference: 50, collectedCash: 50, absFees: 50, deliveryDate: 50, isPaid: 50 });
    expect(fp.deliveryDateOnDeliveredPercent).toBe(100);
    expect(fp.referenceLooksLikeOrderNumberPercent).toBe(50);
    expect(JSON.stringify(fp)).not.toContain("10180");
    expect(columnsReport(rows, ["awb", "reference", "cmpService"])).toMatchObject({ missing: ["cmpService"], extra: ["absFees", "collectedCash", "deliveryDate", "isPaid", "status"] });
  });

  it("scrubReport redacts key, digit runs and known AWBs in nested strings", () => {
    const out = scrubReport({ a: `x-api-key: ${KEY}`, b: ["call 01001234567 now"], c: { d: "AWB AB12345678 failed" } }, KEY, ["AB12345678"]);
    expect(JSON.stringify(out)).not.toContain(KEY);
    expect(out.b[0]).toBe("call ***4567 now");
    expect(out.c.d).toBe("AWB …5678 failed");
  });
});
