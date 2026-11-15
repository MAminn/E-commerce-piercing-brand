import { afterEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import {
  effectiveGa4PurchaseOwnerSince,
  setEffectiveGa4PurchaseOwner,
} from "#root/shared/config/ga4-purchase-owner";
import { initGa4PurchaseOwner } from "../readiness";
import { getGa4PurchaseDiagnostics } from "../diagnostics";

/**
 * effectiveGa4PurchaseOwnerSince — when this process started the current
 * non-browser mode — and its default use as the diagnostics gap baseline.
 */
afterEach(() => setEffectiveGa4PurchaseOwner("browser"));

const T1 = new Date("2026-11-15T08:00:00.000Z");
const T2 = new Date("2026-11-15T09:00:00.000Z");
const T3 = new Date("2026-11-15T10:00:00.000Z");

describe("effectiveGa4PurchaseOwnerSince", () => {
  it("null in browser mode", () => {
    setEffectiveGa4PurchaseOwner("browser", T1);
    expect(effectiveGa4PurchaseOwnerSince()).toBeNull();
  });

  it("set on browser → shadow; kept when shadow is set again; changed on shadow → server", () => {
    setEffectiveGa4PurchaseOwner("shadow", T1);
    expect(effectiveGa4PurchaseOwnerSince()).toEqual(T1);
    setEffectiveGa4PurchaseOwner("shadow", T2);
    expect(effectiveGa4PurchaseOwnerSince()).toEqual(T1);
    setEffectiveGa4PurchaseOwner("server", T3);
    expect(effectiveGa4PurchaseOwnerSince()).toEqual(T3);
  });

  it("cleared on → browser, and set afresh on the next activation", () => {
    setEffectiveGa4PurchaseOwner("shadow", T1);
    setEffectiveGa4PurchaseOwner("browser", T2);
    expect(effectiveGa4PurchaseOwnerSince()).toBeNull();
    setEffectiveGa4PurchaseOwner("shadow", T3);
    expect(effectiveGa4PurchaseOwnerSince()).toEqual(T3);
  });

  it("the boot readiness check sets it when shadow is confirmed (≈ boot time)", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const before = Date.now();
    const db = { execute: vi.fn(async () => ({ rows: [{ outbox: true, context: true, unique_idx: true }] })) };
    await initGa4PurchaseOwner(db as never, { GA4_PURCHASE_OWNER: "shadow" });
    const since = effectiveGa4PurchaseOwnerSince();
    expect(since).not.toBeNull();
    expect(since!.getTime()).toBeGreaterThanOrEqual(before);
    expect(since!.getTime()).toBeLessThanOrEqual(Date.now());
    info.mockRestore();
  });

  it("readiness failure (stays browser) leaves it null", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const db = { execute: vi.fn(async () => ({ rows: [{ outbox: false, context: false, unique_idx: false }] })) };
    await initGa4PurchaseOwner(db as never, { GA4_PURCHASE_OWNER: "shadow" });
    expect(effectiveGa4PurchaseOwnerSince()).toBeNull();
    err.mockRestore();
  });
});

describe("getGa4PurchaseDiagnostics — default gap baseline wiring", () => {
  const dialect = new PgDialect();
  const capture = () => {
    const queries: Array<{ sql: string; params: unknown[] }> = [];
    const db = {
      execute: vi.fn(async (q: SQL) => {
        queries.push(dialect.sqlToQuery(q));
        return { rows: [] };
      }),
    };
    const gapQuery = () => queries.find((q) => q.sql.includes('FROM "order" o'))!;
    return { db, gapQuery };
  };

  it("without opts, the gap query uses effectiveGa4PurchaseOwnerSince()", async () => {
    setEffectiveGa4PurchaseOwner("shadow", T2);
    const { db, gapQuery } = capture();
    await getGa4PurchaseDiagnostics(db as never, 7);
    expect(gapQuery().sql).toMatch(/least\(\(SELECT min\(created_at\) FROM ga4_purchase_outbox\), \$\d+::timestamptz\)/);
    expect(gapQuery().params).toContain(T2.toISOString());
  });

  it("an explicit modeSince overrides it", async () => {
    setEffectiveGa4PurchaseOwner("shadow", T2);
    const { db, gapQuery } = capture();
    await getGa4PurchaseDiagnostics(db as never, 7, { modeSince: T1 });
    expect(gapQuery().params).toContain(T1.toISOString());
    expect(gapQuery().params).not.toContain(T2.toISOString());
  });
});
