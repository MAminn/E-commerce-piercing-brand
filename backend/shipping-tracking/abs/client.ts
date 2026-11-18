import { toCairoIso } from "./normalize";
import {
  parseBulkResponse,
  parseHistoryResponse,
  parseListResponse,
  parseTrackingResponse,
  type HistoryEvent,
  type ParsedBulk,
  type ParsedListPage,
  type ParsedTracking,
} from "./parse";
import { redact } from "./redact";

/**
 * READ-ONLY ABS Client API v1.0 client.
 *
 * Exactly four method + path pairs may ever be requested (ABS_ALLOWED_ENDPOINTS).
 * `assertAllowedAbsRequest` runs before any network activity, so a typo or a
 * future edit that adds a write endpoint throws instead of reaching ABS. There
 * is deliberately no generic `request()` export.
 *
 * Requests are strictly sequential and at least `minGapMs` apart (ABS rate
 * limits are undocumented). Network errors, timeouts, 5xx and 429 are retried
 * (≤ maxAttempts in total) with exponential backoff + jitter, honouring
 * Retry-After. Other 4xx are not retried. The API key is only ever placed in
 * the `x-api-key` header and is redacted from every error message.
 */

export const ABS_ALLOWED_ENDPOINTS = [
  { method: "POST", path: "/api/v1/shipments/list" },
  { method: "GET", path: "/api/v1/tracking/:awb" },
  { method: "GET", path: "/api/v1/tracking/:awb/history" },
  { method: "POST", path: "/api/v1/tracking/bulk" },
] as const;

const AWB_SEGMENT = /^[A-Za-z0-9_-]{1,64}$/;
const RESERVED_SEGMENTS = new Set(["bulk", "history", "list"]);

/** Columns requested from /shipments/list (an ABS-rejected column is dropped once). */
export const ABS_LIST_COLUMNS = [
  "awb",
  "reference",
  "status",
  "displayStatus",
  "lastEvent",
  "lastEventCode",
  "lastReason",
  "cash",
  "collectedCash",
  "absFees",
  "totalFees",
  "isPaid",
  "paymentDate",
  "deliveryDate",
  "createdAt",
  "consigneePhone",
  "consigneeName",
  "noOfPieces",
  "originAwb",
  "cmpService",
] as const;

export type AbsErrorKind = "forbidden_endpoint" | "http" | "network" | "timeout" | "invalid_response";

export class AbsApiError extends Error {
  readonly kind: AbsErrorKind;
  readonly status: number | null;
  readonly retryable: boolean;
  /** Redacted, ≤ 300 chars of the response body (http errors only). */
  readonly bodySnippet: string | null;
  constructor(kind: AbsErrorKind, message: string, opts: { status?: number | null; retryable?: boolean; bodySnippet?: string | null } = {}) {
    super(message);
    this.name = "AbsApiError";
    this.kind = kind;
    this.status = opts.status ?? null;
    this.retryable = opts.retryable ?? false;
    this.bodySnippet = opts.bodySnippet ?? null;
  }
}

/**
 * Throws unless (method, path) is one of the four allowed read endpoints.
 * `path` is the path AFTER the base URL, without query string.
 */
export function assertAllowedAbsRequest(method: string, path: string): void {
  const m = method.toUpperCase();
  const ok = ABS_ALLOWED_ENDPOINTS.some((ep) => {
    if (ep.method !== m) return false;
    const want = ep.path.split("/");
    const got = path.split("/");
    if (want.length !== got.length) return false;
    return want.every((seg, i) => {
      const g = got[i] ?? "";
      if (seg === ":awb") return AWB_SEGMENT.test(g) && !RESERVED_SEGMENTS.has(g.toLowerCase());
      return seg === g;
    });
  });
  if (!ok) {
    throw new AbsApiError("forbidden_endpoint", `ABS client refused ${m} ${path.slice(0, 80)}: not on the read-only allow-list`);
  }
}

export interface FetchResponseLike {
  status: number;
  ok: boolean;
  headers?: { get(name: string): string | null } | null;
  text(): Promise<string>;
}
export type AbsFetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal },
) => Promise<FetchResponseLike>;

export interface AbsClientOptions {
  baseUrl: string;
  apiKey: string;
  fetchImpl?: AbsFetchLike;
  timeoutMs?: number;
  minGapMs?: number;
  maxAttempts?: number;
  /** Injected for tests. */
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  now?: () => number;
  /** Receives already-redacted one-line messages. */
  log?: (message: string) => void;
}

export interface ListChangedShipmentsInput {
  from: Date;
  to: Date;
  cursor?: string | null;
  page?: number;
  limit?: number;
}

export interface AbsClient {
  listChangedShipments(input: ListChangedShipmentsInput): Promise<ParsedListPage>;
  getShipment(awb: string): Promise<ParsedTracking>;
  getHistory(awb: string): Promise<HistoryEvent[]>;
  bulkTrack(awbs: string[]): Promise<ParsedBulk>;
  /** Columns still requested (after any ABS-rejected column was dropped). */
  columns(): readonly string[];
}

const MAX_RETRY_AFTER_MS = 60_000;
const MAX_BACKOFF_MS = 30_000;

export function parseRetryAfter(value: string | null | undefined, nowMs: number): number | null {
  if (!value) return null;
  const v = value.trim();
  if (/^\d+(\.\d+)?$/.test(v)) return Math.min(Math.round(Number(v) * 1000), MAX_RETRY_AFTER_MS);
  const at = Date.parse(v);
  if (Number.isNaN(at)) return null;
  return Math.min(Math.max(0, at - nowMs), MAX_RETRY_AFTER_MS);
}

export function createAbsClient(opts: AbsClientOptions): AbsClient {
  if (!/^https:\/\//i.test(opts.baseUrl)) {
    throw new AbsApiError("forbidden_endpoint", "ABS base URL must be https://");
  }
  if (!opts.apiKey) throw new AbsApiError("forbidden_endpoint", "ABS API key missing");
  const base = new URL(opts.baseUrl);
  const basePath = base.pathname.replace(/\/+$/, "");
  const apiKey = opts.apiKey;
  const fetchImpl: AbsFetchLike = opts.fetchImpl ?? (globalThis.fetch as unknown as AbsFetchLike);
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const minGapMs = opts.minGapMs ?? 300;
  const maxAttempts = Math.max(1, opts.maxAttempts ?? 3);
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const random = opts.random ?? Math.random;
  const now = opts.now ?? Date.now;
  const log = opts.log ?? ((m: string) => console.warn(m));
  const scrub = (v: unknown, max = 500) => redact(v, [apiKey], max);

  const logged = new Set<string>();
  const logOnce = (key: string, message: string) => {
    if (logged.has(key)) return;
    logged.add(key);
    log(`[ABS tracking] ${scrub(message, 300)}`);
  };

  let columns: string[] = [...ABS_LIST_COLUMNS];
  let lastRequestAt = Number.NEGATIVE_INFINITY;
  let queue: Promise<unknown> = Promise.resolve();

  const buildUrl = (path: string): string => {
    const url = new URL(base.origin);
    url.pathname = `${basePath}${path}`;
    // Defence in depth: the final URL must be exactly base + allowed path.
    if (url.pathname !== `${basePath}${path}` || url.search || url.hash || url.origin !== base.origin) {
      throw new AbsApiError("forbidden_endpoint", "ABS client refused a URL that does not match the allow-list");
    }
    return url.toString();
  };

  async function once(method: "GET" | "POST", path: string, body: unknown): Promise<unknown> {
    const url = buildUrl(path);
    const wait = lastRequestAt + minGapMs - now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: FetchResponseLike;
    try {
      res = await fetchImpl(url, {
        method,
        headers: {
          accept: "application/json",
          ...(body === undefined ? {} : { "content-type": "application/json" }),
          "x-api-key": apiKey,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      const aborted = controller.signal.aborted || (err as { name?: string })?.name === "AbortError";
      throw new AbsApiError(
        aborted ? "timeout" : "network",
        aborted ? `ABS ${method} ${path} timed out after ${timeoutMs} ms` : `ABS ${method} ${path} network error: ${scrub(err, 200)}`,
        { retryable: true },
      );
    } finally {
      clearTimeout(timer);
    }

    let text = "";
    try {
      text = await res.text();
    } catch {
      text = "";
    }
    if (res.status >= 200 && res.status < 300) {
      try {
        return text ? JSON.parse(text) : null;
      } catch {
        throw new AbsApiError("invalid_response", `ABS ${method} ${path} returned non-JSON (http ${res.status})`);
      }
    }
    const snippet = scrub(text, 300);
    const retryable = res.status === 429 || res.status >= 500;
    const err = new AbsApiError("http", `ABS ${method} ${path} failed: http ${res.status}${snippet ? ` ${snippet}` : ""}`, {
      status: res.status,
      retryable,
      bodySnippet: snippet || null,
    });
    (err as AbsApiError & { retryAfterMs?: number | null }).retryAfterMs = parseRetryAfter(res.headers?.get?.("retry-after") ?? null, now());
    throw err;
  }

  async function call(method: "GET" | "POST", path: string, body?: unknown): Promise<unknown> {
    // Allow-list first: nothing below runs for a forbidden request.
    assertAllowedAbsRequest(method, path);
    const run = async () => {
      let lastErr: unknown;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          return await once(method, path, body);
        } catch (err) {
          lastErr = err;
          if (!(err instanceof AbsApiError) || !err.retryable || attempt === maxAttempts) throw err;
          const retryAfter = (err as AbsApiError & { retryAfterMs?: number | null }).retryAfterMs ?? null;
          const backoff = Math.min(1000 * 2 ** (attempt - 1) * (0.5 + random()), MAX_BACKOFF_MS);
          await sleep(Math.max(retryAfter ?? 0, backoff, minGapMs));
        }
      }
      throw lastErr;
    };
    // Strictly sequential across all callers of this client.
    const result = queue.then(run, run);
    queue = result.catch(() => undefined);
    return result;
  }

  const awbPath = (awb: string, suffix = "") => {
    const a = String(awb ?? "").trim();
    if (!AWB_SEGMENT.test(a)) throw new AbsApiError("forbidden_endpoint", "ABS client refused an AWB with unexpected characters");
    return `/api/v1/tracking/${a}${suffix}`;
  };

  const driftLog = (key: string, message: string) => logOnce(`drift:${key}`, message);

  async function listChangedShipments(input: ListChangedShipmentsInput): Promise<ParsedListPage> {
    const limit = Math.min(Math.max(1, input.limit ?? 100), 100);
    for (let dropRound = 0; dropRound <= ABS_LIST_COLUMNS.length; dropRound++) {
      const body: Record<string, unknown> = {
        lastChangeDateFrom: toCairoIso(input.from),
        lastChangeDateTo: toCairoIso(input.to),
        timezone: "Africa/Cairo",
        limit,
        columns,
        // Never an export job: this is an interactive read.
        isExport: false,
      };
      if (input.cursor) body.cursor = input.cursor;
      else body.page = input.page ?? 1;
      if (body.isExport !== false) throw new AbsApiError("forbidden_endpoint", "isExport must be false");
      try {
        const json = await call("POST", "/api/v1/shipments/list", body);
        return parseListResponse(json, driftLog);
      } catch (err) {
        const rejected = rejectedColumn(err, columns);
        if (!rejected) throw err;
        columns = columns.filter((c) => c !== rejected);
        logOnce(`column:${rejected}`, `ABS rejected column "${rejected}"; requesting without it from now on`);
      }
    }
    throw new AbsApiError("invalid_response", "ABS kept rejecting requested columns");
  }

  async function bulkTrack(awbs: string[]): Promise<ParsedBulk> {
    const unique = [...new Set(awbs.map((a) => String(a).trim()).filter(Boolean))];
    for (const a of unique) {
      if (!AWB_SEGMENT.test(a)) throw new AbsApiError("forbidden_endpoint", "ABS client refused an AWB with unexpected characters");
    }
    const out: ParsedBulk = { found: [], notFound: [], skipped: 0 };
    for (let i = 0; i < unique.length; i += 100) {
      const chunk = unique.slice(i, i + 100);
      const json = await call("POST", "/api/v1/tracking/bulk", { awbs: chunk });
      const parsed = parseBulkResponse(json, driftLog);
      out.found.push(...parsed.found);
      out.notFound.push(...parsed.notFound);
      out.skipped += parsed.skipped;
    }
    return out;
  }

  return {
    listChangedShipments,
    getShipment: async (awb) => parseTrackingResponse(await call("GET", awbPath(awb))),
    getHistory: async (awb) => parseHistoryResponse(await call("GET", awbPath(awb, "/history"))),
    bulkTrack,
    columns: () => columns,
  };
}

/**
 * A 400/422 whose body names exactly ONE of the requested columns (never
 * `awb`) is read as "unknown column". Anything ambiguous is rethrown.
 */
function rejectedColumn(err: unknown, requested: readonly string[]): string | null {
  if (!(err instanceof AbsApiError) || err.kind !== "http" || (err.status !== 400 && err.status !== 422)) return null;
  const body = err.bodySnippet ?? "";
  if (!/column/i.test(body)) return null;
  const named = requested.filter((c) => c !== "awb" && new RegExp(`(^|[^A-Za-z0-9_])${c}([^A-Za-z0-9_]|$)`).test(body));
  return named.length === 1 ? (named[0] ?? null) : null;
}
