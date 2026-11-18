/**
 * ABS API probe — the logic behind scripts/abs-tracking/probe.ts.
 *
 * Answers the open questions about the ABS Client API (permissions of the
 * key, pagination contract, inclusive date bounds, columns, status
 * vocabulary, field presence, history depth, rate behaviour) by calling the
 * READ-ONLY Phase 1 client only. Nothing here imports the database layer:
 * the probe never opens a pool or a connection.
 *
 * Output is redacted by construction: only counts, percentages, column
 * NAMES, ABS status vocabulary, dates and AWB last 4 digits are kept. No
 * customer name, phone, address, reference text or full AWB is copied into
 * the report; every string still passes through `scrubReport` before it is
 * written or printed.
 */
import { ABS_LIST_COLUMNS, AbsApiError, createAbsClient, type AbsFetchLike, type FetchResponseLike } from "#root/backend/shipping-tracking/abs/client";
import { canonicalStatus, orderNumbersInReference, parseAbsDate } from "#root/backend/shipping-tracking/abs/normalize";
import { type ListEnvelope, unwrapListEnvelope } from "#root/backend/shipping-tracking/abs/parse";
import { redact } from "#root/backend/shipping-tracking/abs/redact";
import { parseAbsBaseUrl } from "#root/shared/config/abs-tracking";

export const PROBE_MAX_REQUESTS = 40;
const DAY_MS = 86_400_000;
const UNKNOWN_PROBE_COLUMN = "percProbeUnknownColumn";
/** Field names ABS might use for the "last change" time of a row (step 4). */
export const LAST_CHANGE_KEYS = ["lastChangeDate", "lastChangedAt", "lastChange", "lastUpdateDate", "updatedAt", "lastEventDate"] as const;

export type StepResult = "PASS" | "FAIL" | "INFO" | "SKIP";

export interface ProbeStep {
  step: number;
  name: string;
  result: StepResult;
  httpStatus: number[];
  summary: string;
  details: Record<string, unknown>;
}

export interface ProbeReport {
  tool: "abs-tracking-probe";
  version: 1;
  generatedAt: string;
  /** Host only (no path, no key). */
  baseUrlHost: string;
  requestsMade: number;
  requestBudget: number;
  aborted: string | null;
  steps: ProbeStep[];
}

export interface ProbeOptions {
  baseUrl: string;
  apiKey: string;
  fetchImpl: AbsFetchLike;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  /** Window for the sampling steps (3–7). Default 30 days. */
  days?: number;
  maxRequests?: number;
  /** Minimum gap between requests (default 300 ms, as the poller). */
  minGapMs?: number;
}

export type ProbeEnvCheck = { ok: true; baseUrl: string; apiKey: string } | { ok: false; error: string };

/**
 * The probe needs ABS_API_BASE_URL + ABS_API_KEY from the shell. DATABASE_URL
 * is never used: if it is the only thing set, the probe refuses.
 */
export function checkProbeEnv(env: Record<string, string | undefined>): ProbeEnvCheck {
  const rawBase = (env.ABS_API_BASE_URL ?? "").trim();
  const key = (env.ABS_API_KEY ?? "").trim();
  const missing = [!rawBase ? "ABS_API_BASE_URL" : null, !key ? "ABS_API_KEY" : null].filter(Boolean);
  if (missing.length) {
    const db = (env.DATABASE_URL ?? "").trim() ? " (DATABASE_URL is set but the probe never uses a database)" : "";
    return { ok: false, error: `Refusing to run: ${missing.join(" and ")} not set in this shell${db}.` };
  }
  const baseUrl = parseAbsBaseUrl(rawBase);
  if (!baseUrl) return { ok: false, error: "Refusing to run: ABS_API_BASE_URL must be an https:// URL without credentials, query or fragment." };
  return { ok: true, baseUrl, apiKey: key };
}

// ─── Pure analysers (unit-tested) ───────────────────────────────────────────

type Row = Record<string, unknown>;
/**
 * A /shipments/list body read through the SAME envelope parser as the poller
 * (real nested `{success, message, data:{data, hasMore, nextCursor}}` or the
 * documented flat shape). `page` is the object that carries rows + paging.
 */
const listOf = (json: unknown): { env: ListEnvelope | null; page: Row } => {
  try {
    const env = unwrapListEnvelope(json);
    const body = json as Row;
    return { env, page: (env.shape === "nested" ? body.data : body) as Row };
  } catch {
    return { env: null, page: {} };
  }
};
const rowsOf = (json: unknown): Row[] => (listOf(json).env?.rows ?? []).filter((r): r is Row => !!r && typeof r === "object");
const awbOf = (r: Row): string | null => (typeof r.awb === "string" || typeof r.awb === "number" ? String(r.awb).trim() || null : null);
export const last4 = (awb: string | null | undefined): string => (awb ? `…${String(awb).slice(-4)}` : "…????");

export interface PageContract {
  contract: "cursor" | "page" | "single_page" | "unknown";
  /** "nested" = the real ABS body, "flat" = the documented one, "invalid" = neither (the poller would refuse it). */
  envelopeShape: "nested" | "flat" | "invalid";
  /** Keys of the outer body (names only). */
  envelopeKeys: string[];
  /** Keys of the page object inside a nested body (empty for the flat shape). */
  pageKeys: string[];
  hasMoreField: boolean;
  nextCursorPresent: boolean;
  pageSizeHonoured: boolean | null;
  page1Rows: number;
  page2Rows: number | null;
  overlapBetweenPages: number | null;
}

/** How ABS paginates, from page 1 (and page 2 when it was fetched). */
export function detectPageContract(page1: unknown, page2: unknown | null, limit: number, page2Via: "cursor" | "page" | null): PageContract {
  const parsed = listOf(page1);
  const env = parsed.page;
  const r1 = rowsOf(page1);
  const r2 = page2 === null ? null : rowsOf(page2);
  const cursor = env.nextCursor;
  const nextCursorPresent = cursor !== null && cursor !== undefined && String(cursor) !== "";
  const hasMoreField = typeof env.hasMore === "boolean";
  let contract: PageContract["contract"] = "unknown";
  // hasMore:false ends the window even when ABS still sends a cursor string (as the poller reads it).
  if (hasMoreField && env.hasMore === false) contract = "single_page";
  else if (nextCursorPresent) contract = "cursor";
  else if (hasMoreField && env.hasMore === true) contract = "page";
  if (page2Via) contract = page2Via;
  let overlap: number | null = null;
  if (r2) {
    const a = new Set(r1.map(awbOf).filter(Boolean));
    overlap = r2.map(awbOf).filter((x) => x && a.has(x)).length;
  }
  return {
    contract,
    envelopeShape: parsed.env?.shape ?? "invalid",
    envelopeKeys: parsed.env ? parsed.env.outerKeys : page1 && typeof page1 === "object" ? Object.keys(page1).sort() : [],
    pageKeys: parsed.env?.pageKeys ?? [],
    hasMoreField,
    nextCursorPresent,
    pageSizeHonoured: r1.length === 0 ? null : r1.length <= limit && (r2 === null || r2.length <= limit),
    page1Rows: r1.length,
    page2Rows: r2 ? r2.length : null,
    overlapBetweenPages: overlap,
  };
}

export interface StatusTally {
  status: string | null;
  displayStatus: string | null;
  lastEventCode: string | null;
  canonical: string;
  count: number;
}

/** Status vocabulary seen, mapped through the Phase 1 normaliser. */
export function tallyStatuses(rows: Row[]): { tallies: StatusTally[]; unknown: StatusTally[] } {
  const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 60) : null);
  const map = new Map<string, StatusTally>();
  for (const r of rows) {
    const status = text(r.status);
    const displayStatus = text(r.displayStatus);
    const lastEventCode = text(r.lastEventCode);
    let canonical: string = canonicalStatus(status, lastEventCode);
    if (canonical === "UNKNOWN" && displayStatus) canonical = canonicalStatus(displayStatus, lastEventCode);
    const key = `${status}|${displayStatus}|${lastEventCode}`;
    const t = map.get(key) ?? { status, displayStatus, lastEventCode, canonical, count: 0 };
    t.count++;
    map.set(key, t);
  }
  const tallies = [...map.values()].sort((a, b) => b.count - a.count || String(a.status).localeCompare(String(b.status)));
  return { tallies, unknown: tallies.filter((t) => t.canonical === "UNKNOWN") };
}

const present = (v: unknown) => v !== null && v !== undefined && !(typeof v === "string" && v.trim() === "");
const pct = (n: number, d: number) => (d === 0 ? null : Math.round((n / d) * 1000) / 10);

/** % of rows carrying each field (values are never copied). */
export function fieldPresence(rows: Row[]) {
  const fields = ["reference", "collectedCash", "absFees", "deliveryDate", "isPaid"] as const;
  const out: Record<string, number | null> = {};
  for (const f of fields) out[f] = pct(rows.filter((r) => present(r[f])).length, rows.length);
  const delivered = rows.filter((r) => canonicalStatus(r.status as string, r.lastEventCode as string) === "DELIVERED");
  return {
    rows: rows.length,
    percent: out,
    deliveryDateOnDeliveredPercent: pct(delivered.filter((r) => present(r.deliveryDate)).length, delivered.length),
    deliveredRows: delivered.length,
    /** Reference holding a 5–8 digit number (the "type the order number" convention). */
    referenceLooksLikeOrderNumberPercent: pct(rows.filter((r) => orderNumbersInReference(r.reference as string).length > 0).length, rows.length),
  };
}

export function columnsReport(rows: Row[], requested: readonly string[]) {
  const returned = new Set<string>();
  for (const r of rows) for (const k of Object.keys(r)) returned.add(k);
  return {
    requested: [...requested],
    returned: [...returned].sort(),
    missing: requested.filter((c) => !returned.has(c)),
    extra: [...returned].filter((k) => !requested.includes(k)).sort(),
  };
}

export function findLastChange(rows: Row[]): { key: string; awb: string; at: Date } | null {
  for (const r of rows) {
    const awb = awbOf(r);
    if (!awb) continue;
    for (const k of LAST_CHANGE_KEYS) {
      const at = parseAbsDate(r[k]);
      if (at) return { key: k, awb, at };
    }
  }
  return null;
}

/** Replace the API key, digit runs (phones) and every known AWB in every string. */
export function scrubReport<T>(value: T, apiKey: string, awbs: Iterable<string>): T {
  const known = [...new Set([...awbs].filter((a) => a && a.length >= 5))].sort((a, b) => b.length - a.length);
  const scrub = (s: string) => {
    let out = s;
    for (const a of known) out = out.split(a).join(last4(a));
    return redact(out, [apiKey], 2000);
  };
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") return scrub(v);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object" && !(v instanceof Date)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(value) as T;
}

// ─── Runner ─────────────────────────────────────────────────────────────────

class ProbeStop extends Error {}

interface Exchange {
  method: string;
  path: string;
  status: number;
  retryAfter: string | null;
  json: unknown;
}

export async function runAbsProbe(opts: ProbeOptions): Promise<ProbeReport> {
  const now = opts.now ?? (() => new Date());
  const days = Math.max(1, Math.min(opts.days ?? 30, 90));
  const budget = Math.min(opts.maxRequests ?? PROBE_MAX_REQUESTS, PROBE_MAX_REQUESTS);
  const exchanges: Exchange[] = [];
  const seenAwbs = new Set<string>();
  let made = 0;
  let aborted: string | null = null;

  const basePath = new URL(opts.baseUrl).pathname.replace(/\/+$/, "");
  const recording: AbsFetchLike = async (url, init) => {
    if (aborted) throw new ProbeStop(aborted);
    if (made >= budget) throw new ProbeStop(`request budget (${budget}) reached`);
    made++;
    const res = await opts.fetchImpl(url, init);
    let text = "";
    try {
      text = await res.text();
    } catch {
      text = "";
    }
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    for (const r of rowsOf(json)) {
      const a = awbOf(r);
      if (a) seenAwbs.add(a);
    }
    const path = new URL(url).pathname.slice(basePath.length);
    exchanges.push({ method: init.method, path, status: res.status, retryAfter: res.headers?.get?.("retry-after") ?? null, json });
    if (res.status === 401) aborted = "HTTP 401 from ABS: the key was not accepted; stopped before any further request";
    const replay: FetchResponseLike = { status: res.status, ok: res.ok, headers: res.headers, text: async () => text };
    return replay;
  };

  const client = createAbsClient({
    baseUrl: opts.baseUrl,
    apiKey: opts.apiKey,
    fetchImpl: recording,
    maxAttempts: 1, // every request is visible: no silent retries
    minGapMs: opts.minGapMs ?? 300,
    sleep: opts.sleep,
    log: () => {},
  });

  /** Runs one call; returns its JSON or the HTTP status it failed with. */
  const attempt = async <T>(fn: () => Promise<T>): Promise<{ ok: true; value: T; status: number; json: unknown } | { ok: false; status: number | null; kind: string }> => {
    const before = exchanges.length;
    try {
      const value = await fn();
      const ex = exchanges[exchanges.length - 1];
      return { ok: true, value, status: ex?.status ?? 200, json: ex?.json ?? null };
    } catch (err) {
      const ex = exchanges.length > before ? exchanges[exchanges.length - 1] : undefined;
      if (err instanceof AbsApiError) return { ok: false, status: err.status ?? ex?.status ?? null, kind: err.kind };
      return { ok: false, status: ex?.status ?? null, kind: err instanceof ProbeStop ? "stopped" : "error" };
    }
  };

  const steps: ProbeStep[] = [];
  const add = (s: ProbeStep) => steps.push(s);
  const stopIfAborted = (step: number, name: string): boolean => {
    if (!aborted && made < budget) return false;
    add({ step, name, result: "SKIP", httpStatus: [], summary: aborted ?? `request budget (${budget}) reached`, details: {} });
    return true;
  };
  const t = now();
  const window = (d: number) => ({ from: new Date(t.getTime() - d * DAY_MS), to: t });

  // 1. Auth
  const s1 = await attempt(() => client.listChangedShipments({ ...window(3), page: 1, limit: 5 }));
  add({
    step: 1,
    name: "Auth: POST /shipments/list (page size 5, last 3 days)",
    result: s1.ok ? "PASS" : "FAIL",
    httpStatus: s1.status === null ? [] : [s1.status],
    summary: s1.ok ? `key accepted; ${rowsOf(s1.json).length} row(s) in the last 3 days` : `failed (${s1.status ?? s1.kind})`,
    details: s1.ok ? { rows: rowsOf(s1.json).length } : { error: s1.kind },
  });

  // 3 (run before 2 so step 2 has sample AWBs): pagination over the sampling window.
  let page1Json: unknown = null;
  const p1 = aborted ? null : await attempt(() => client.listChangedShipments({ ...window(days), page: 1, limit: 5 }));
  if (p1?.ok) page1Json = p1.json;
  const samples = [...new Set([...rowsOf(s1.ok ? s1.json : null), ...rowsOf(page1Json)].map(awbOf).filter((a): a is string => !!a))];

  // 2. Permissions per allow-listed endpoint
  if (!stopIfAborted(2, "Key permissions per allow-listed endpoint")) {
    const perms: Record<string, number | string> = { "POST /api/v1/shipments/list": s1.status ?? "error" };
    const statuses: number[] = s1.status === null ? [] : [s1.status];
    const awb = samples[0];
    if (awb) {
      const a = await attempt(() => client.getShipment(awb));
      perms["GET /api/v1/tracking/:awb"] = a.status ?? (a.ok ? 200 : (a as { kind: string }).kind);
      const h = await attempt(() => client.getHistory(awb));
      perms["GET /api/v1/tracking/:awb/history"] = h.status ?? (h.ok ? 200 : (h as { kind: string }).kind);
      const b = await attempt(() => client.bulkTrack(samples.slice(0, 3)));
      perms["POST /api/v1/tracking/bulk"] = b.status ?? (b.ok ? 200 : (b as { kind: string }).kind);
      for (const x of [a, h, b]) if (x.status !== null) statuses.push(x.status);
    } else {
      for (const ep of ["GET /api/v1/tracking/:awb", "GET /api/v1/tracking/:awb/history", "POST /api/v1/tracking/bulk"]) perms[ep] = "not tested (no AWB in the sample window)";
    }
    const denied = Object.entries(perms).filter(([, v]) => v === 401 || v === 403);
    const allOk = Object.values(perms).every((v) => v === 200 || v === 404);
    add({
      step: 2,
      name: "Key permissions per allow-listed endpoint",
      result: denied.length ? "FAIL" : allOk ? "PASS" : "INFO",
      httpStatus: statuses,
      summary: denied.length ? `denied: ${denied.map(([k, v]) => `${k} (${v})`).join(", ")}` : allOk ? "all four read endpoints answer (200, or 404 for an unknown AWB)" : "see details",
      details: { endpoints: perms, sampleAwb: awb ? last4(awb) : null },
    });
  }

  // 3. Pagination contract
  if (!stopIfAborted(3, `Pagination contract (page size 5, last ${days} days)`)) {
    let page2Json: unknown | null = null;
    let via: "cursor" | "page" | null = null;
    // Paging fields sit in the page object (one level down in the real nested body).
    const env1 = listOf(page1Json).page as { nextCursor?: unknown; hasMore?: unknown };
    const statuses = p1?.status ? [p1.status] : [];
    // Page 2 only when ABS says there is more — the poller's rule, whatever nextCursor holds.
    if (p1?.ok && env1.hasMore === true) {
      const cursor = env1.nextCursor !== null && env1.nextCursor !== undefined && env1.nextCursor !== "" ? String(env1.nextCursor) : null;
      via = cursor ? "cursor" : "page";
      const p2 = await attempt(() => client.listChangedShipments({ ...window(days), cursor, page: 2, limit: 5 }));
      if (p2.status !== null) statuses.push(p2.status);
      if (p2.ok) page2Json = p2.json;
    }
    const contract = detectPageContract(page1Json, page2Json, 5, via && page2Json !== null ? via : null);
    add({
      step: 3,
      name: `Pagination contract (page size 5, last ${days} days)`,
      // Page 2 repeating page-1 rows means ABS ignored the page/cursor: the poller would loop.
      result: !p1?.ok || contract.pageSizeHonoured === false || (contract.overlapBetweenPages ?? 0) > 0 ? "FAIL" : "PASS",
      httpStatus: statuses,
      summary: !p1?.ok
        ? `page 1 failed (${p1?.status ?? "error"})`
        : `envelope=${contract.envelopeShape}; contract=${contract.contract}; page size honoured=${contract.pageSizeHonoured ?? "n/a (no rows)"}; overlap between pages=${contract.overlapBetweenPages ?? "n/a"}`,
      details: { ...contract },
    });
  }

  // 4. lastChangeDateFrom/To inclusive?
  if (!stopIfAborted(4, "Are lastChangeDateFrom / lastChangeDateTo inclusive?")) {
    let found = findLastChange(rowsOf(page1Json));
    const statuses: number[] = [];
    if (!found) {
      const extra = await attempt(() =>
        client.listChangedShipments({ ...window(days), page: 1, limit: 5, columns: [...ABS_LIST_COLUMNS, "lastChangeDate"] }),
      );
      if (extra.status !== null) statuses.push(extra.status);
      if (extra.ok) found = findLastChange(rowsOf(extra.json));
    }
    if (!found) {
      add({ step: 4, name: "Are lastChangeDateFrom / lastChangeDateTo inclusive?", result: "INFO", httpStatus: statuses, summary: "inconclusive: no last-change time in the rows (the poller's 30-min overlap covers either answer)", details: { triedKeys: [...LAST_CHANGE_KEYS] } });
    } else {
      const { at, awb, key } = found;
      const contains = async (from: Date, to: Date) => {
        const r = await attempt(() => client.listChangedShipments({ from, to, page: 1, limit: 100 }));
        if (r.status !== null) statuses.push(r.status);
        return r.ok ? rowsOf(r.json).some((x) => awbOf(x) === awb) : null;
      };
      const both = await contains(at, at);
      const toIncl = both ? true : await contains(new Date(at.getTime() - 1000), at);
      const fromIncl = both ? true : await contains(at, new Date(at.getTime() + 1000));
      const verdict = both ? "both bounds inclusive" : toIncl && !fromIncl ? "to inclusive, from exclusive" : fromIncl && !toIncl ? "from inclusive, to exclusive" : "neither boundary returned the row (or a call failed)";
      add({
        step: 4,
        name: "Are lastChangeDateFrom / lastChangeDateTo inclusive?",
        result: both ? "PASS" : "INFO",
        httpStatus: statuses,
        summary: `${verdict} (field "${key}", AWB ${last4(awb)})`,
        details: { field: key, awb: last4(awb), boundary: at.toISOString(), fromEqualsTo: both, toInclusive: toIncl, fromInclusive: fromIncl },
      });
    }
  }

  // 5. columns[]
  if (!stopIfAborted(5, "columns[]: which come back; is an unknown column rejected?")) {
    const cols = columnsReport(rowsOf(page1Json), ABS_LIST_COLUMNS);
    const u = await attempt(() => client.listChangedShipments({ ...window(3), page: 1, limit: 1, columns: [...ABS_LIST_COLUMNS, UNKNOWN_PROBE_COLUMN] }));
    const unknownVerdict = u.ok ? "accepted (ignored)" : u.status === 400 || u.status === 422 ? `rejected (http ${u.status})` : `inconclusive (${u.status ?? "error"})`;
    const returnedUnknown = u.ok ? columnsReport(rowsOf(u.json), [UNKNOWN_PROBE_COLUMN]).missing.length === 0 : false;
    add({
      step: 5,
      name: "columns[]: which come back; is an unknown column rejected?",
      result: rowsOf(page1Json).length === 0 ? "INFO" : cols.missing.length ? "INFO" : "PASS",
      httpStatus: u.status === null ? [] : [u.status],
      summary: `${cols.returned.length} field(s) returned, ${cols.missing.length} requested column(s) never present${cols.missing.length ? ` (${cols.missing.join(", ")})` : ""}; unknown column: ${unknownVerdict}`,
      details: { ...cols, unknownColumn: { name: UNKNOWN_PROBE_COLUMN, verdict: unknownVerdict, echoedBack: returnedUnknown } },
    });
  }

  // 6 + 7. Status vocabulary and field presence over the sampling window.
  const sampleRows: Row[] = [];
  let parserSkipped = 0;
  const statuses6: number[] = [];
  if (!aborted) {
    const reserve = 3 + 10; // keep room for steps 8 and 9
    const maxPages = Math.max(0, Math.min(8, budget - made - reserve));
    let cursor: string | null = null;
    for (let page = 1; page <= maxPages; page++) {
      const r = await attempt(() => client.listChangedShipments({ ...window(days), cursor, page: cursor ? undefined : page, limit: 100 }));
      if (r.status !== null) statuses6.push(r.status);
      if (!r.ok) break;
      sampleRows.push(...rowsOf(r.json));
      parserSkipped += r.value.skipped;
      if (!r.value.hasMore) break;
      cursor = r.value.nextCursor;
    }
  }
  if (!stopIfAborted(6, "Status codes / labels seen (mapped through the Phase 1 normaliser)")) {
    const { tallies, unknown } = tallyStatuses(sampleRows);
    add({
      step: 6,
      name: "Status codes / labels seen (mapped through the Phase 1 normaliser)",
      result: sampleRows.length === 0 ? "INFO" : unknown.length ? "FAIL" : "PASS",
      httpStatus: statuses6,
      summary:
        sampleRows.length === 0
          ? "no rows in the sampling window"
          : `${sampleRows.length} row(s), ${tallies.length} distinct status combination(s); ${unknown.length ? `UNMAPPED → UNKNOWN: ${unknown.map((u) => `"${u.status ?? u.displayStatus}"${u.lastEventCode ? `/${u.lastEventCode}` : ""} ×${u.count}`).join(", ")}` : "every status maps to a known canonical status"}`,
      details: { rows: sampleRows.length, rowsTheParserWouldSkip: parserSkipped, statuses: tallies, unknownStatuses: unknown },
    });
  }
  if (!aborted) {
    const fp = fieldPresence(sampleRows);
    add({
      step: 7,
      name: "Field presence (% of rows)",
      result: sampleRows.length === 0 ? "INFO" : "PASS",
      httpStatus: [],
      summary:
        sampleRows.length === 0
          ? "no rows in the sampling window"
          : `${Object.entries(fp.percent)
              .map(([k, v]) => `${k} ${v ?? "-"}%`)
              .join(", ")}; reference holds an order number in ${fp.referenceLooksLikeOrderNumberPercent ?? "-"}%`,
      details: fp,
    });
  } else add({ step: 7, name: "Field presence (% of rows)", result: "SKIP", httpStatus: [], summary: aborted, details: {} });

  // 8. History for 3 AWBs (prefer delivered ones: their history is the longest).
  if (!stopIfAborted(8, "GET /tracking/:awb/history for 3 AWBs")) {
    const delivered = sampleRows.filter((r) => canonicalStatus(r.status as string, r.lastEventCode as string) === "DELIVERED").map(awbOf);
    const pick = [...new Set([...delivered, ...sampleRows.map(awbOf), ...samples].filter((a): a is string => !!a))].slice(0, 3);
    const out: Array<Record<string, unknown>> = [];
    const statuses: number[] = [];
    for (const awb of pick) {
      const h = await attempt(() => client.getHistory(awb));
      if (h.status !== null) statuses.push(h.status);
      if (!h.ok) {
        out.push({ awb: last4(awb), status: h.status, error: h.kind });
        continue;
      }
      const dates = h.value.map((e) => e.occurredAt?.getTime()).filter((x): x is number => typeof x === "number");
      out.push({
        awb: last4(awb),
        events: h.value.length,
        oldestEvent: dates.length ? new Date(Math.min(...dates)).toISOString() : null,
        newestEvent: dates.length ? new Date(Math.max(...dates)).toISOString() : null,
        unknownEventStatuses: [...new Set(h.value.filter((e) => e.status === "UNKNOWN").map((e) => (e.statusRaw ?? "").slice(0, 60)))],
      });
    }
    add({
      step: 8,
      name: "GET /tracking/:awb/history for 3 AWBs",
      result: pick.length === 0 ? "INFO" : out.every((o) => typeof o.events === "number") ? "PASS" : "FAIL",
      httpStatus: statuses,
      summary: pick.length === 0 ? "no AWB to test" : out.map((o) => `${o.awb}: ${o.events ?? `failed ${o.status ?? o.error}`} event(s)${o.oldestEvent ? ` since ${String(o.oldestEvent).slice(0, 10)}` : ""}`).join("; "),
      details: { awbs: out },
    });
  }

  // 9. Rate behaviour: 10 sequential requests ≥ 300 ms apart.
  if (!stopIfAborted(9, "Rate behaviour: 10 sequential requests ≥ 300 ms apart")) {
    const statuses: number[] = [];
    const retryAfter: string[] = [];
    const from = exchanges.length;
    for (let i = 0; i < 10 && !aborted && made < budget; i++) {
      const r = await attempt(() => client.listChangedShipments({ ...window(1), page: 1, limit: 1 }));
      if (r.status !== null) statuses.push(r.status);
    }
    for (const ex of exchanges.slice(from)) if (ex.retryAfter) retryAfter.push(ex.retryAfter.slice(0, 40));
    const n429 = statuses.filter((s) => s === 429).length;
    add({
      step: 9,
      name: "Rate behaviour: 10 sequential requests ≥ 300 ms apart",
      result: statuses.length === 0 ? "SKIP" : n429 ? "FAIL" : statuses.every((s) => s === 200) ? "PASS" : "INFO",
      httpStatus: statuses,
      summary: `${statuses.length} request(s): ${n429} × 429${retryAfter.length ? `; Retry-After seen: ${retryAfter.join(", ")}` : "; no Retry-After header"}`,
      details: { requests: statuses.length, http429: n429, retryAfter },
    });
  }

  steps.sort((a, b) => a.step - b.step);
  const report: ProbeReport = {
    tool: "abs-tracking-probe",
    version: 1,
    generatedAt: t.toISOString(),
    baseUrlHost: new URL(opts.baseUrl).host,
    requestsMade: made,
    requestBudget: budget,
    aborted,
    steps,
  };
  return scrubReport(report, opts.apiKey, seenAwbs);
}

export function formatProbeSummary(report: ProbeReport): string {
  const lines = [
    `ABS API probe — ${report.generatedAt} — host ${report.baseUrlHost} — ${report.requestsMade}/${report.requestBudget} requests`,
    ...(report.aborted ? [`ABORTED: ${report.aborted}`] : []),
    ...report.steps.map((s) => `${String(s.step).padStart(2)}. ${s.result.padEnd(4)} ${s.name}${s.httpStatus.length ? ` [http ${[...new Set(s.httpStatus)].join(",")}]` : ""}\n      ${s.summary}`),
  ];
  return lines.join("\n");
}
