import { readFileSync } from "node:fs";
import path from "node:path";
import type { CandidateOrder } from "../matcher";
import { expectedCodFor } from "../matcher";
import { parseMoney } from "../normalize";
import type { WebsiteOrderStatus } from "../types";

const dir = path.join(__dirname, "fixtures");
const read = <T>(file: string): T => JSON.parse(readFileSync(path.join(dir, file), "utf8")) as T;

export interface FixtureOrder {
  key: string;
  orderNumber: number;
  customerName: string;
  customerPhone: string;
  total: string;
  status: WebsiteOrderStatus;
  createdAt: string;
  paymentMethod: "cod" | "stripe" | "paymob";
  paymentStatus: "not_required" | "pending" | "processing" | "paid" | "failed" | "refunded";
}
export interface ExpectedCase {
  case: string;
  awb: string;
  status?: string;
  linkState: string;
  method?: string;
  role?: string;
  linkOrder?: string;
  linkReason?: string;
  candidates?: string[];
  decision: string;
  decisionReason: string;
}

export const fixtureOrders = () => read<{ orders: FixtureOrder[] }>("orders.json").orders;
export const fixtureListResponse = () => read<{ data: Array<Record<string, unknown>>; hasMore: boolean; nextCursor: string | null }>("shipments-list.json");
export const fixtureExpected = () => read<{ cases: ExpectedCase[] }>("expected.json").cases;
export const fixtureStatusVariants = () =>
  read<{ variants: Record<string, Array<[string | null, string | null]>> }>("status-variants.json").variants;

export interface RealContractExpected {
  awb: string;
  status: string;
  phoneLast4: string | null;
  linkState: string;
  method?: string;
  linkOrder?: string;
  linkReason?: string;
  decision: string;
  decisionReason: string;
}
/** The real /shipments/list contract (verified 18 Nov 2026), synthetic values: HTTP status, body, seed orders, expectations. */
export const fixtureRealContract = () =>
  read<{
    httpStatus: number;
    body: {
      success: boolean;
      message: string;
      data: { data: Array<Record<string, unknown>>; hasMore: boolean; nextCursor: string };
    };
    orders: FixtureOrder[];
    expected: RealContractExpected[];
  }>("shipments-list-real-contract.json");

/** Real-contract orders as in-memory candidates (ids = keys). */
export function realContractCandidates(): CandidateOrder[] {
  return fixtureRealContract().orders.map((o) => ({
    id: o.key,
    orderNumber: o.orderNumber,
    customerPhone: o.customerPhone,
    total: parseMoney(o.total) ?? 0,
    expectedCod: expectedCodFor(o),
    status: o.status,
    createdAt: new Date(o.createdAt),
    linkedAwb: null,
  }));
}

/** In-memory candidates (ids = keys) as the DB loader would return them. */
export function fixtureCandidates(linked: Map<string, string> = new Map()): CandidateOrder[] {
  return fixtureOrders().map((o) => ({
    id: o.key,
    orderNumber: o.orderNumber,
    customerPhone: o.customerPhone,
    total: parseMoney(o.total) ?? 0,
    expectedCod: expectedCodFor(o),
    status: o.status,
    createdAt: new Date(o.createdAt),
    linkedAwb: linked.get(o.key) ?? null,
  }));
}
