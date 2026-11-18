import { describe, expect, it, vi } from "vitest";
import { AbsApiError, ABS_ALLOWED_ENDPOINTS, assertAllowedAbsRequest, createAbsClient, parseRetryAfter, type AbsFetchLike } from "../client";
import { redact } from "../redact";

const KEY = "test-key-NOT-REAL-0123456789";
const BASE = "https://abs.example.test";

type Reply = { status: number; body?: unknown; headers?: Record<string, string> } | Error | "hang";
function fakeFetch(replies: Reply[]) {
  const calls: Array<{ url: string; method: string; headers: Record<string, string>; body: unknown }> = [];
  const impl = vi.fn(async (url: string, init: Parameters<AbsFetchLike>[1]) => {
    calls.push({ url, method: init.method, headers: init.headers, body: init.body ? JSON.parse(init.body) : undefined });
    const r = replies.length > 1 ? replies.shift() : replies[0];
    if (r === "hang") {
      return await new Promise<never>((_, reject) => {
        init.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
      });
    }
    if (r instanceof Error) throw r;
    const reply = r as Exclude<Reply, Error | "hang">;
    return {
      status: reply.status,
      ok: reply.status >= 200 && reply.status < 300,
      headers: { get: (n: string) => reply.headers?.[n.toLowerCase()] ?? null },
      text: async () => (typeof reply.body === "string" ? reply.body : JSON.stringify(reply.body ?? {})),
    };
  });
  return { impl: impl as unknown as AbsFetchLike, calls, spy: impl };
}

const sleeps: number[] = [];
const client = (impl: AbsFetchLike, extra: Partial<Parameters<typeof createAbsClient>[0]> = {}) =>
  createAbsClient({
    baseUrl: BASE,
    apiKey: KEY,
    fetchImpl: impl,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    random: () => 0.5,
    // The fake sleep does not advance Date.now; the gap itself is tested separately.
    minGapMs: 0,
    log: () => {},
    ...extra,
  });

const LIST_OK = { status: 200, body: { data: [{ awb: "A1", status: "DELIVERED", cash: 100 }], hasMore: false, nextCursor: null } };
const WINDOW = { from: new Date("2026-11-01T00:00:00Z"), to: new Date("2026-11-02T00:00:00Z") };

describe("allow-list (read-only)", () => {
  it("exactly the four documented read endpoints are allowed", () => {
    expect(ABS_ALLOWED_ENDPOINTS.map((e) => `${e.method} ${e.path}`)).toEqual([
      "POST /api/v1/shipments/list",
      "GET /api/v1/tracking/:awb",
      "GET /api/v1/tracking/:awb/history",
      "POST /api/v1/tracking/bulk",
    ]);
    expect(() => assertAllowedAbsRequest("POST", "/api/v1/shipments/list")).not.toThrow();
    expect(() => assertAllowedAbsRequest("GET", "/api/v1/tracking/ABC123")).not.toThrow();
    expect(() => assertAllowedAbsRequest("GET", "/api/v1/tracking/ABC123/history")).not.toThrow();
    expect(() => assertAllowedAbsRequest("POST", "/api/v1/tracking/bulk")).not.toThrow();
  });

  it.each([
    ["POST", "/api/v1/shipments"],
    ["POST", "/api/v1/shipments/create"],
    ["PUT", "/api/v1/shipments/list"],
    ["PATCH", "/api/v1/shipments/ABC"],
    ["DELETE", "/api/v1/shipments/ABC"],
    ["GET", "/api/v1/shipments/list"],
    ["POST", "/api/v1/shipments/ABC/cancel"],
    ["POST", "/api/v1/shipments/ABC/reopen"],
    ["POST", "/api/v1/pickups"],
    ["POST", "/api/v1/webhooks"],
    ["POST", "/api/v1/contacts"],
    ["POST", "/api/v1/sub-accounts"],
    ["GET", "/api/v1/wallet"],
    ["POST", "/api/v1/tracking/ABC123"],
    ["GET", "/api/v1/tracking/bulk"],
    ["GET", "/api/v1/tracking/../shipments/list"],
    ["GET", "/api/v1/tracking/A%2F..%2Fx"],
    ["GET", "/api/v1/tracking/ABC/history/extra"],
    ["GET", "/api/v1/tracking/"],
    ["OPTIONS", "/api/v1/tracking/ABC"],
  ])("refuses %s %s", (method, path) => {
    expect(() => assertAllowedAbsRequest(method, path)).toThrow(AbsApiError);
  });

  it("forbidden AWB shapes never reach fetch", async () => {
    const f = fakeFetch([LIST_OK]);
    const c = client(f.impl);
    for (const awb of ["../shipments/create", "A/B", "A?x=1", "", "bulk", "history", "x".repeat(65)]) {
      await expect(c.getShipment(awb)).rejects.toThrow(AbsApiError);
      await expect(c.getHistory(awb)).rejects.toThrow(AbsApiError);
    }
    await expect(c.bulkTrack(["OK1", "../x"])).rejects.toThrow(AbsApiError);
    expect(f.spy).not.toHaveBeenCalled();
  });

  it("the client exposes only the four read methods (no generic request)", () => {
    const c = client(fakeFetch([LIST_OK]).impl);
    expect(Object.keys(c).sort()).toEqual(["bulkTrack", "columns", "getHistory", "getShipment", "listChangedShipments"]);
  });

  it("refuses a non-https base URL and a missing key", () => {
    expect(() => createAbsClient({ baseUrl: "http://abs.example.test", apiKey: KEY })).toThrow(/https/);
    expect(() => createAbsClient({ baseUrl: BASE, apiKey: "" })).toThrow(/key/);
  });
});

describe("requests", () => {
  it("listChangedShipments sends the documented body with the key in x-api-key only", async () => {
    const f = fakeFetch([LIST_OK]);
    const page = await client(f.impl).listChangedShipments({ ...WINDOW, cursor: "c2" });
    expect(page.rows[0]?.awb).toBe("A1");
    const call = f.calls[0];
    expect(call?.url).toBe(`${BASE}/api/v1/shipments/list`);
    expect(call?.method).toBe("POST");
    expect(call?.headers["x-api-key"]).toBe(KEY);
    expect(call?.body).toMatchObject({
      lastChangeDateFrom: "2026-11-01T02:00:00.000+02:00",
      lastChangeDateTo: "2026-11-02T02:00:00.000+02:00",
      timezone: "Africa/Cairo",
      limit: 100,
      cursor: "c2",
      isExport: false,
    });
    expect((call?.body as { columns: string[] }).columns).toContain("collectedCash");
    expect(JSON.stringify(call?.body)).not.toContain(KEY);
  });

  it("page is sent when there is no cursor; limit is capped at 100", async () => {
    const f = fakeFetch([LIST_OK]);
    await client(f.impl).listChangedShipments({ ...WINDOW, page: 3, limit: 500 });
    expect(f.calls[0]?.body).toMatchObject({ page: 3, limit: 100 });
    expect(f.calls[0]?.body).not.toHaveProperty("cursor");
  });

  it("a base URL path prefix is kept", async () => {
    const f = fakeFetch([{ status: 200, body: { success: true, data: [] } }]);
    await client(f.impl, { baseUrl: "https://abs.example.test/client/" }).getHistory("A1");
    expect(f.calls[0]?.url).toBe("https://abs.example.test/client/api/v1/tracking/A1/history");
  });

  it("tracking, history and bulk parse; bulk chunks to 100", async () => {
    const f = fakeFetch([
      { status: 200, body: { success: true, data: { awb: "A1", ref: "#10175", status: "Delivered", customerPhone: "01001234567", shipmentHistory: [{ status: "Picked Up", date: "2026-11-02T10:00:00+02:00" }] } } },
      { status: 200, body: { success: true, data: [{ status: "Delivered", datetime: "2026-11-03T10:00:00+02:00" }] } },
      { status: 200, body: { data: { found: [{ awb: "B1", status: "IN_TRANSIT" }], notFound: ["B2"] } } },
    ]);
    const c = client(f.impl);
    const t = await c.getShipment("A1");
    expect(t).toMatchObject({ awb: "A1", reference: "#10175", status: "DELIVERED", consigneePhoneNorm: "1001234567" });
    expect(t.history[0]?.status).toBe("PICKED_UP");
    const h = await c.getHistory("A1");
    expect(h[0]).toMatchObject({ status: "DELIVERED" });
    const awbs = Array.from({ length: 150 }, (_, i) => `B${i}`);
    const b = await c.bulkTrack(awbs);
    expect(f.calls.filter((x) => x.url.endsWith("/tracking/bulk")).map((x) => (x.body as { awbs: string[] }).awbs.length)).toEqual([100, 50]);
    expect(b.found.length).toBeGreaterThan(0);
  });

  it("requests are sequential and at least minGapMs apart", async () => {
    let clock = 1_000_000;
    const gaps: number[] = [];
    const f = fakeFetch([LIST_OK]);
    const c = client(f.impl, {
      now: () => clock,
      minGapMs: 300,
      sleep: async (ms) => {
        gaps.push(ms);
        clock += ms;
      },
    });
    await Promise.all([c.listChangedShipments(WINDOW), c.listChangedShipments(WINDOW), c.listChangedShipments(WINDOW)]);
    expect(f.spy).toHaveBeenCalledTimes(3);
    expect(gaps).toEqual([300, 300]);
  });

  it("an ABS-rejected column is dropped once and the request repeated", async () => {
    const logs: string[] = [];
    const f = fakeFetch([{ status: 400, body: { message: "Unknown column: originAwb" } }, LIST_OK, LIST_OK]);
    const c = client(f.impl, { log: (m) => logs.push(m) });
    await c.listChangedShipments(WINDOW);
    await c.listChangedShipments(WINDOW);
    expect((f.calls[1]?.body as { columns: string[] }).columns).not.toContain("originAwb");
    expect((f.calls[2]?.body as { columns: string[] }).columns).not.toContain("originAwb");
    expect(logs.filter((l) => l.includes("originAwb"))).toHaveLength(1);
  });

  it("an ambiguous 400 is not treated as a column problem", async () => {
    const f = fakeFetch([{ status: 400, body: { message: "column cash or status invalid" } }]);
    await expect(client(f.impl).listChangedShipments(WINDOW)).rejects.toMatchObject({ kind: "http", status: 400 });
    expect(f.spy).toHaveBeenCalledTimes(1);
  });
});

describe("retries", () => {
  it("5xx → retried up to 3 attempts, then a typed error", async () => {
    sleeps.length = 0;
    const f = fakeFetch([{ status: 502, body: "bad gateway" }]);
    await expect(client(f.impl).listChangedShipments(WINDOW)).rejects.toMatchObject({ kind: "http", status: 502, retryable: true });
    expect(f.spy).toHaveBeenCalledTimes(3);
    expect(sleeps.length).toBe(2);
    expect(sleeps[1]).toBeGreaterThan(sleeps[0] as number); // exponential
  });

  it("5xx then success → resolves", async () => {
    const f = fakeFetch([{ status: 500 }, LIST_OK]);
    const page = await client(f.impl).listChangedShipments(WINDOW);
    expect(page.rows).toHaveLength(1);
    expect(f.spy).toHaveBeenCalledTimes(2);
  });

  it("429 honours Retry-After (seconds)", async () => {
    sleeps.length = 0;
    const f = fakeFetch([{ status: 429, headers: { "retry-after": "7" } }, LIST_OK]);
    await client(f.impl).listChangedShipments(WINDOW);
    expect(sleeps[0]).toBe(7000);
  });

  it("Retry-After as an HTTP date, capped at 60 s", () => {
    const now = Date.parse("2026-11-18T10:00:00Z");
    expect(parseRetryAfter("Wed, 18 Nov 2026 10:00:05 GMT", now)).toBe(5000);
    expect(parseRetryAfter("3600", now)).toBe(60_000);
    expect(parseRetryAfter("soon", now)).toBeNull();
  });

  it("4xx (not 429) → no retry", async () => {
    for (const status of [400, 401, 403, 404, 422]) {
      const f = fakeFetch([{ status, body: { message: "nope" } }]);
      await expect(client(f.impl).getShipment("A1")).rejects.toMatchObject({ kind: "http", status, retryable: false });
      expect(f.spy).toHaveBeenCalledTimes(1);
    }
  });

  it("network error → retried", async () => {
    const f = fakeFetch([new Error("ECONNRESET"), LIST_OK]);
    await expect(client(f.impl).listChangedShipments(WINDOW)).resolves.toBeTruthy();
    expect(f.spy).toHaveBeenCalledTimes(2);
  });

  it("timeout → aborted, retried, then a typed timeout error", async () => {
    const f = fakeFetch(["hang"]);
    await expect(client(f.impl, { timeoutMs: 20 }).getShipment("A1")).rejects.toMatchObject({ kind: "timeout" });
    expect(f.spy).toHaveBeenCalledTimes(3);
  });

  it("non-JSON 2xx → invalid_response, no retry", async () => {
    const f = fakeFetch([{ status: 200, body: "<html>" }]);
    await expect(client(f.impl).getShipment("A1")).rejects.toMatchObject({ kind: "invalid_response" });
    expect(f.spy).toHaveBeenCalledTimes(1);
  });
});

describe("redaction", () => {
  it("the key never appears in a thrown error, even when ABS echoes it", async () => {
    const f = fakeFetch([{ status: 401, body: { message: `invalid x-api-key: ${KEY}`, header: `x-api-key=${KEY}` } }]);
    const err = (await client(f.impl).getShipment("A1").catch((e) => e)) as AbsApiError;
    expect(err).toBeInstanceOf(AbsApiError);
    expect(err.message).not.toContain(KEY);
    expect(err.message).toContain("***");
    expect(String(err.bodySnippet)).not.toContain(KEY);
  });

  it("network error messages are scrubbed of the key", async () => {
    const f = fakeFetch([new Error(`connect failed with headers {"x-api-key":"${KEY}"}`)]);
    const err = (await client(f.impl).getShipment("A1").catch((e) => e)) as AbsApiError;
    expect(err.message).not.toContain(KEY);
  });

  it("logs never carry the key or a full phone", async () => {
    const logs: string[] = [];
    const f = fakeFetch([{ status: 200, body: { data: [{ awb: null, consigneePhone: "+201001234567" }], hasMore: false } }]);
    await client(f.impl, { log: (m) => logs.push(m) }).listChangedShipments(WINDOW);
    expect(logs.length).toBe(1);
    for (const l of logs) {
      expect(l).not.toContain(KEY);
      expect(l).not.toMatch(/1001234567/);
    }
  });

  it("redact(): key by value and by header shape, phones to last 4", () => {
    expect(redact("x-api-key: abc123secret")).toBe("x-api-key: ***");
    expect(redact(`{"x-api-key":"zzz"}`)).toBe(`{"x-api-key":"***"}`);
    expect(redact(`key ${KEY} here`, [KEY])).toBe("key *** here");
    expect(redact("call +20 100 123 4567 now")).toBe("call ***4567 now");
    expect(redact("phone 01001234567")).toBe("phone ***4567");
    expect(redact("2026-11-18T10:00:00Z ok")).toBe("2026-11-18T10:00:00Z ok");
    expect(redact("x".repeat(600)).length).toBe(500);
    expect(redact('Failed query: insert into "abs_shipment" values ($1)\nparams: TST1,Fake Name,{"consigneeName":"Fake Name"}')).toBe(
      'Failed query: insert into "abs_shipment" values ($1)\nparams: [redacted]',
    );
  });
});
