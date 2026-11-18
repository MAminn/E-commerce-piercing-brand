import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { DatabaseClient } from "#root/shared/database/drizzle/db";
import { absOrderLink, order } from "#root/shared/database/drizzle/schema";
import { normalizeEgyptPhone, orderNumbersInReference, parseMoney } from "./normalize";
import type { LinkMethod, LinkRole, LinkState, NormalizedShipment, WebsiteOrderStatus } from "./types";

/**
 * AWB → website order matching. ABS staff key our shipments by hand and the
 * Reference field is usually empty, so the normal path is phone + COD amount
 * + date window. Only two outcomes are automatic: a Reference naming an order
 * whose phone matches, or exactly ONE exact-phone, amount-matching, open,
 * not-yet-linked order. Everything else is `needs_review` (listed, never
 * picked) or `unmatched`. Fuzzy phones are never automatic.
 */

export interface CandidateOrder {
  id: string;
  orderNumber: number;
  /** Raw website value (free text). */
  customerPhone: string;
  total: number;
  /** What ABS should collect: 0 for an online order already paid, else the total. */
  expectedCod: number;
  status: WebsiteOrderStatus;
  createdAt: Date;
  /** AWB of an existing primary auto|confirmed link to this order, if any. */
  linkedAwb: string | null;
}

export interface RankedCandidate {
  orderId: string;
  orderNumber: number;
  score: number;
  reasons: string[];
}

export interface MatchResult {
  state: Extract<LinkState, "auto" | "needs_review" | "unmatched">;
  role: LinkRole;
  method: LinkMethod | null;
  reasonCode: string;
  confidence: number;
  orderId: string | null;
  candidates: RankedCandidate[];
}

export interface MatchOptions {
  windowDays: number;
  codToleranceEgp: number;
  /** Fallback anchor when ABS sent no createdAt (the time we first saw the AWB). */
  observedAt: Date;
}

const DAY_MS = 86_400_000;

export function roleForService(cmpService: string | null | undefined): LinkRole {
  const s = (cmpService ?? "").toUpperCase();
  if (s === "" || s === "DELIVERY") return "primary";
  if (s === "REVERSE") return "reverse";
  if (s === "EXCHANGE") return "exchange";
  return "other";
}

/** Same length, ≤ 2 differing digits (covers one adjacent transposition). Exact equality is NOT fuzzy. */
export function isFuzzyPhoneMatch(a: string | null, b: string | null): boolean {
  if (!a || !b || a === b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i] && ++diff > 2) return false;
  }
  return true;
}

export function matchWindow(shipment: Pick<NormalizedShipment, "absCreatedAt">, opts: Pick<MatchOptions, "windowDays" | "observedAt">) {
  const anchor = shipment.absCreatedAt ?? opts.observedAt;
  return { from: new Date(anchor.getTime() - opts.windowDays * DAY_MS), to: new Date(anchor.getTime() + DAY_MS) };
}

function rank(list: Array<RankedCandidate>): RankedCandidate[] {
  return [...list].sort((a, b) => b.score - a.score || a.orderNumber - b.orderNumber);
}

/**
 * Pure. `candidates` = orders created inside the window (any phone) plus any
 * order named in the Reference (any date).
 */
export function matchShipment(shipment: NormalizedShipment, candidates: CandidateOrder[], opts: MatchOptions): MatchResult {
  const role = roleForService(shipment.cmpService);
  const phone = shipment.consigneePhoneNorm;
  const cash = shipment.cash;
  const { from, to } = matchWindow(shipment, opts);
  const inWindow = (c: CandidateOrder) => c.createdAt.getTime() >= from.getTime() && c.createdAt.getTime() <= to.getTime();
  const amountOk = (c: CandidateOrder) => cash !== null && Math.abs(c.expectedCod - cash) <= opts.codToleranceEgp;
  const phoneOf = (c: CandidateOrder) => normalizeEgyptPhone(c.customerPhone);

  const describe = (c: CandidateOrder, extra: string[] = []): RankedCandidate => {
    const reasons = [...extra];
    const p = phoneOf(c);
    if (phone && p === phone) reasons.push("phone_exact");
    else if (isFuzzyPhoneMatch(phone, p)) reasons.push("phone_fuzzy");
    if (cash === null) reasons.push("no_cod_amount");
    else reasons.push(amountOk(c) ? "amount_ok" : `cod_mismatch:${c.expectedCod}vs${cash}`);
    if (!inWindow(c)) reasons.push("outside_window");
    if (c.status === "cancelled") reasons.push("order_cancelled");
    if (c.linkedAwb && c.linkedAwb !== shipment.awb) reasons.push("already_linked");
    let score = 0;
    if (reasons.includes("reference")) score += 50;
    if (reasons.includes("phone_exact")) score += 30;
    if (reasons.includes("phone_fuzzy")) score += 15;
    if (reasons.includes("amount_ok")) score += 15;
    if (!reasons.includes("outside_window")) score += 5;
    if (c.status === "cancelled") score -= 20;
    if (reasons.includes("already_linked")) score -= 10;
    return { orderId: c.id, orderNumber: c.orderNumber, score, reasons };
  };

  const result = (
    state: MatchResult["state"],
    method: LinkMethod | null,
    reasonCode: string,
    confidence: number,
    orderId: string | null,
    listed: RankedCandidate[],
  ): MatchResult => {
    // Non-primary shipments (returns, exchanges, cash collection) never link automatically.
    if (role !== "primary" && state === "auto") {
      return { state: "needs_review", role, method, reasonCode: `${role}_shipment`, confidence: Math.min(confidence, 60), orderId: null, candidates: listed };
    }
    return { state, role, method, reasonCode, confidence, orderId, candidates: listed };
  };

  const notLinkedElsewhere = (c: CandidateOrder) => !c.linkedAwb || c.linkedAwb === shipment.awb;

  // 1. Reference names an order whose phone matches.
  const refNumbers = new Set(orderNumbersInReference(shipment.reference));
  const referenced = candidates.filter((c) => refNumbers.has(c.orderNumber));
  if (referenced.length > 0) {
    const phoneMatched = referenced.filter((c) => phone && phoneOf(c) === phone);
    if (phoneMatched.length === 1) {
      const c = phoneMatched[0] as CandidateOrder;
      const listed = [describe(c, ["reference"])];
      if (!notLinkedElsewhere(c)) return result("needs_review", "reference", "order_already_linked", 70, null, listed);
      return result("auto", "reference", "reference_and_phone", 100, c.id, listed);
    }
    // Reference names an order but the phone disagrees (or is missing): a human decides.
    const listed = rank([
      ...referenced.map((c) => describe(c, ["reference"])),
      ...candidates.filter((c) => !refNumbers.has(c.orderNumber) && phone && phoneOf(c) === phone && inWindow(c)).map((c) => describe(c)),
    ]);
    return result("needs_review", "reference", "reference_phone_mismatch", 50, null, listed);
  }

  // 2. Reverse / exchange / other services: list exact-phone orders, never auto.
  // (Their COD is usually 0 or a fee, so there is no amount to make a fuzzy
  // phone safe — fuzzy candidates are not listed here.)
  if (role !== "primary") {
    const related = candidates.filter((c) => inWindow(c) && phone !== null && phoneOf(c) === phone);
    return result(related.length ? "needs_review" : "unmatched", null, `${role}_shipment`, related.length ? 30 : 0, null, rank(related.map((c) => describe(c))));
  }

  const exact = candidates.filter((c) => inWindow(c) && phone !== null && phoneOf(c) === phone);
  const eligible = exact.filter((c) => amountOk(c) && c.status !== "cancelled");

  // 3. Exactly one exact-phone, amount-matching, open order.
  if (eligible.length === 1) {
    const c = eligible[0] as CandidateOrder;
    const listed = rank(exact.map((x) => describe(x)));
    if (!notLinkedElsewhere(c)) return result("needs_review", "phone_amount", "order_already_linked", 60, null, listed);
    return result("auto", "phone_amount", "phone_and_amount", 90, c.id, listed);
  }
  // 4. Several → list them all, pick none.
  if (eligible.length > 1) {
    return result("needs_review", "phone_amount", "multiple_candidates", 50, null, rank(exact.map((c) => describe(c))));
  }
  // 6. Phone matches, amount does not (e.g. order 320, ABS COD 350) — or only cancelled orders fit.
  if (exact.length > 0) {
    const open = exact.filter((c) => c.status !== "cancelled");
    const reason = open.length > 0 ? (cash === null ? "no_cod_amount" : "cod_mismatch") : "cancelled_order_match";
    return result("needs_review", "phone_amount", reason, 30, null, rank(exact.map((c) => describe(c))));
  }
  // 5. Fuzzy phone + amount + window: review only.
  const fuzzy = candidates.filter((c) => inWindow(c) && amountOk(c) && c.status !== "cancelled" && isFuzzyPhoneMatch(phone, phoneOf(c)));
  if (fuzzy.length > 0) {
    return result("needs_review", "phone_amount_fuzzy", fuzzy.length > 1 ? "fuzzy_multiple" : "fuzzy_phone", 40, null, rank(fuzzy.map((c) => describe(c))));
  }
  // 7. Nothing.
  return result("unmatched", null, phone ? "no_candidate" : "no_phone", 0, null, []);
}

// ─── Thin read-only DB loader ───────────────────────────────────────────────

/** Expected COD for an order: 0 when an online payment is already captured. */
export function expectedCodFor(row: { total: string | number; paymentMethod: string; paymentStatus: string }): number {
  const total = parseMoney(row.total) ?? 0;
  if (row.paymentMethod !== "cod" && row.paymentStatus === "paid") return 0;
  return total;
}

/**
 * SELECT-only. Orders created in the match window (any phone — phones are
 * free text, so they are normalised in JS) plus orders named in the
 * Reference, and the AWB each one is already primary-linked to.
 */
export async function loadCandidateOrders(
  db: DatabaseClient,
  shipment: NormalizedShipment,
  opts: Pick<MatchOptions, "windowDays" | "observedAt">,
): Promise<CandidateOrder[]> {
  const { from, to } = matchWindow(shipment, opts);
  const cols = {
    id: order.id,
    orderNumber: order.orderNumber,
    customerPhone: order.customerPhone,
    total: order.total,
    status: order.status,
    createdAt: order.createdAt,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
  };
  const windowRows = await db
    .select(cols)
    .from(order)
    .where(and(gte(order.createdAt, from), lte(order.createdAt, to)));
  const refs = orderNumbersInReference(shipment.reference);
  const refRows = refs.length ? await db.select(cols).from(order).where(inArray(order.orderNumber, refs)) : [];

  const byId = new Map<string, (typeof windowRows)[number]>();
  for (const r of [...windowRows, ...refRows]) byId.set(r.id, r);
  const ids = [...byId.keys()];
  const links = ids.length
    ? await db
        .select({ orderId: absOrderLink.orderId, awb: absOrderLink.awb })
        .from(absOrderLink)
        .where(
          and(
            inArray(absOrderLink.orderId, ids),
            eq(absOrderLink.linkRole, "primary"),
            sql`${absOrderLink.state} in ('auto', 'confirmed')`,
          ),
        )
    : [];
  const linked = new Map(links.map((l) => [l.orderId, l.awb]));
  return [...byId.values()].map((r) => ({
    id: r.id,
    orderNumber: r.orderNumber,
    customerPhone: r.customerPhone,
    total: parseMoney(r.total) ?? 0,
    expectedCod: expectedCodFor(r),
    status: r.status as WebsiteOrderStatus,
    createdAt: r.createdAt,
    linkedAwb: linked.get(r.id) ?? null,
  }));
}
