import { z } from "zod";
import { canonicalStatus, normalizeEgyptPhone, parseAbsDate, parseMoney, phoneLast4 } from "./normalize";
import type { CanonicalStatus, NormalizedShipment } from "./types";

/**
 * zod validation of every ABS response (docs.absegy.com Client API v1.0).
 * Tolerant: extra fields pass through, numbers may arrive as strings. A row
 * that does not validate is skipped and reported through `onDrift` (the
 * client logs each distinct drift once) instead of failing the run; an
 * envelope that does not validate throws, because nothing in it can be
 * trusted.
 */

const strOrNum = z.union([z.string(), z.number()]);
const nullableText = strOrNum.nullish().transform((v) => (v === null || v === undefined || String(v).trim() === "" ? null : String(v).trim()));

export const shipmentRowSchema = z
  .object({
    awb: strOrNum.transform((v) => String(v).trim()).pipe(z.string().regex(/^[A-Za-z0-9_-]{1,64}$/)),
    reference: nullableText,
    status: nullableText,
    displayStatus: nullableText,
    lastEvent: z.unknown().optional(),
    lastEventCode: nullableText,
    lastReason: nullableText,
    cash: strOrNum.nullish(),
    collectedCash: strOrNum.nullish(),
    absFees: strOrNum.nullish(),
    totalFees: strOrNum.nullish(),
    isPaid: z.union([z.boolean(), z.string(), z.number()]).nullish(),
    paymentDate: nullableText,
    deliveryDate: nullableText,
    createdAt: nullableText,
    consigneePhone: nullableText,
    consigneeName: nullableText,
    noOfPieces: strOrNum.nullish(),
    originAwb: nullableText,
    cmpService: nullableText,
  })
  .passthrough();
export type ShipmentRow = z.infer<typeof shipmentRowSchema>;

const listEnvelopeSchema = z
  .object({
    data: z.array(z.unknown()),
    hasMore: z.boolean().optional(),
    nextCursor: strOrNum.nullish(),
  })
  .passthrough();

function parseBool(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  if (v === 1 || v === "1") return true;
  if (v === 0 || v === "0") return false;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "true" || s === "yes") return true;
    if (s === "false" || s === "no") return false;
  }
  return null;
}

function parseInt0(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\s*\d+\s*$/.test(v) ? Number(v) : Number.NaN;
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}

export function normalizeShipmentRow(row: ShipmentRow): NormalizedShipment {
  let status: CanonicalStatus = canonicalStatus(row.status, row.lastEventCode);
  if (status === "UNKNOWN" && row.displayStatus) status = canonicalStatus(row.displayStatus, row.lastEventCode);
  return {
    awb: row.awb,
    reference: row.reference,
    cmpService: row.cmpService ? row.cmpService.toUpperCase() : null,
    statusRaw: row.status ?? row.displayStatus ?? null,
    status,
    lastEventCode: row.lastEventCode,
    lastReason: row.lastReason,
    cash: parseMoney(row.cash),
    collectedCash: parseMoney(row.collectedCash),
    absFees: parseMoney(row.absFees),
    totalFees: parseMoney(row.totalFees),
    isPaid: parseBool(row.isPaid),
    paymentDate: parseAbsDate(row.paymentDate),
    deliveryDate: parseAbsDate(row.deliveryDate),
    absCreatedAt: parseAbsDate(row.createdAt),
    consigneePhoneNorm: normalizeEgyptPhone(row.consigneePhone),
    consigneePhoneLast4: phoneLast4(row.consigneePhone),
    noOfPieces: parseInt0(row.noOfPieces),
    originAwb: row.originAwb,
    raw: row as Record<string, unknown>,
  };
}

export interface ParsedListPage {
  rows: NormalizedShipment[];
  skipped: number;
  hasMore: boolean;
  nextCursor: string | null;
}

export class AbsResponseShapeError extends Error {
  constructor(what: string, detail: string) {
    super(`ABS ${what} response did not match the expected shape: ${detail}`);
    this.name = "AbsResponseShapeError";
  }
}

function issueSummary(error: z.ZodError): string {
  return error.issues
    .slice(0, 3)
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.code}`)
    .join("; ");
}

export function parseListResponse(json: unknown, onDrift: (key: string, message: string) => void = () => {}): ParsedListPage {
  const env = listEnvelopeSchema.safeParse(json);
  if (!env.success) throw new AbsResponseShapeError("/shipments/list", issueSummary(env.error));
  const rows: NormalizedShipment[] = [];
  let skipped = 0;
  for (const item of env.data.data) {
    const parsed = shipmentRowSchema.safeParse(item);
    if (!parsed.success) {
      skipped++;
      const summary = issueSummary(parsed.error);
      onDrift(`list:${summary}`, `skipped a /shipments/list row (${summary})`);
      continue;
    }
    rows.push(normalizeShipmentRow(parsed.data));
  }
  const cursor = env.data.nextCursor;
  return {
    rows,
    skipped,
    hasMore: env.data.hasMore === true,
    nextCursor: cursor === null || cursor === undefined || String(cursor) === "" ? null : String(cursor),
  };
}

const historyEntrySchema = z.object({ status: nullableText, date: nullableText.optional(), datetime: nullableText.optional() }).passthrough();

const trackingSchema = z
  .object({
    success: z.boolean().optional(),
    data: z
      .object({
        awb: strOrNum.transform((v) => String(v).trim()),
        ref: nullableText.optional(),
        noOfPcs: strOrNum.nullish(),
        status: nullableText.optional(),
        customerName: nullableText.optional(),
        customerPhone: nullableText.optional(),
        shipmentHistory: z.array(historyEntrySchema).nullish(),
      })
      .passthrough(),
  })
  .passthrough();

export interface HistoryEvent {
  status: CanonicalStatus;
  statusRaw: string | null;
  occurredAt: Date | null;
}

function toEvents(entries: Array<z.infer<typeof historyEntrySchema>>): HistoryEvent[] {
  return entries.map((e) => ({
    status: canonicalStatus(e.status),
    statusRaw: e.status ?? null,
    occurredAt: parseAbsDate(e.datetime ?? e.date ?? null),
  }));
}

export interface ParsedTracking {
  awb: string;
  reference: string | null;
  status: CanonicalStatus;
  statusRaw: string | null;
  consigneePhoneNorm: string | null;
  history: HistoryEvent[];
}

export function parseTrackingResponse(json: unknown): ParsedTracking {
  const parsed = trackingSchema.safeParse(json);
  if (!parsed.success) throw new AbsResponseShapeError("/tracking/:awb", issueSummary(parsed.error));
  const d = parsed.data.data;
  return {
    awb: d.awb,
    reference: d.ref ?? null,
    status: canonicalStatus(d.status),
    statusRaw: d.status ?? null,
    consigneePhoneNorm: normalizeEgyptPhone(d.customerPhone),
    history: toEvents(d.shipmentHistory ?? []),
  };
}

const historySchema = z.object({ success: z.boolean().optional(), data: z.array(historyEntrySchema) }).passthrough();

export function parseHistoryResponse(json: unknown): HistoryEvent[] {
  const parsed = historySchema.safeParse(json);
  if (!parsed.success) throw new AbsResponseShapeError("/tracking/:awb/history", issueSummary(parsed.error));
  return toEvents(parsed.data.data);
}

const bulkSchema = z
  .object({
    data: z.object({ found: z.array(z.unknown()), notFound: z.array(z.unknown()) }).passthrough(),
  })
  .passthrough();

export interface ParsedBulk {
  found: ParsedTracking[];
  notFound: string[];
  skipped: number;
}

export function parseBulkResponse(json: unknown, onDrift: (key: string, message: string) => void = () => {}): ParsedBulk {
  const parsed = bulkSchema.safeParse(json);
  if (!parsed.success) throw new AbsResponseShapeError("/tracking/bulk", issueSummary(parsed.error));
  const found: ParsedTracking[] = [];
  let skipped = 0;
  for (const item of parsed.data.data.found) {
    try {
      // Each found entry is shaped like the single-tracking `data` object.
      found.push(parseTrackingResponse({ data: item }));
    } catch (err) {
      skipped++;
      onDrift(`bulk:${(err as Error).message.slice(0, 80)}`, "skipped a /tracking/bulk row (shape drift)");
    }
  }
  const notFound = parsed.data.data.notFound.map((v) =>
    typeof v === "string" || typeof v === "number" ? String(v) : String((v as { awb?: unknown })?.awb ?? ""),
  );
  return { found, notFound: notFound.filter(Boolean), skipped };
}
