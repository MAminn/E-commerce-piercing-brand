import { afterEach, describe, expect, it, vi } from "vitest";
import {
  browserSendsGa4Purchase,
  effectiveGa4PurchaseOwner,
  readGa4PurchaseOwner,
  setEffectiveGa4PurchaseOwner,
} from "#root/shared/config/ga4-purchase-owner";
import { readClientTrackingFlags } from "#root/shared/config/tracking-flags";
import { initGa4PurchaseOwner } from "../readiness";
import { enqueueGa4PurchaseInTx, captureGa4PurchaseContextInTx } from "../enqueue";
import { runGa4PurchaseTick } from "../worker";
import { readGa4MpMode, shouldServerSendToGa4 } from "#root/backend/pixel-tracking/ga4-ownership";

afterEach(() => setEffectiveGa4PurchaseOwner("browser"));

const readyDb = (ready: boolean) => ({
  execute: vi.fn(async () => ({ rows: [{ outbox: ready, context: ready, unique_idx: ready }] })),
});

describe("GA4_PURCHASE_OWNER", () => {
  it("defaults to browser; only exact shadow/server values switch it", () => {
    expect(readGa4PurchaseOwner({})).toBe("browser");
    expect(readGa4PurchaseOwner({ GA4_PURCHASE_OWNER: "" })).toBe("browser");
    expect(readGa4PurchaseOwner({ GA4_PURCHASE_OWNER: "Server " })).toBe("server");
    expect(readGa4PurchaseOwner({ GA4_PURCHASE_OWNER: "shadow" })).toBe("shadow");
    expect(readGa4PurchaseOwner({ GA4_PURCHASE_OWNER: "legacy_all" })).toBe("browser");
    expect(readGa4PurchaseOwner({ GA4_PURCHASE_OWNER: "true" })).toBe("browser");
  });

  it("is browser until the boot readiness check confirms more", () => {
    expect(effectiveGa4PurchaseOwner()).toBe("browser");
    expect(readClientTrackingFlags({}).ga4BrowserPurchase).toBe(true);
  });

  it("the browser keeps sending purchase in browser and shadow mode, stops only in server mode", () => {
    expect(browserSendsGa4Purchase("browser")).toBe(true);
    expect(browserSendsGa4Purchase("shadow")).toBe(true);
    expect(browserSendsGa4Purchase("server")).toBe(false);
  });

  it("server mode with the migration in place: browser flag off", async () => {
    const r = await initGa4PurchaseOwner(readyDb(true) as never, { GA4_PURCHASE_OWNER: "server" });
    expect(r).toMatchObject({ requested: "server", effective: "server" });
    expect(readClientTrackingFlags({}).ga4BrowserPurchase).toBe(false);
  });

  it("server mode WITHOUT the migration falls back to browser — the purchase is never orphaned", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await initGa4PurchaseOwner(readyDb(false) as never, { GA4_PURCHASE_OWNER: "server" });
    expect(r.effective).toBe("browser");
    expect(r.readiness?.missing).toContain("unique index ga4_purchase_outbox_order_id_idx");
    expect(readClientTrackingFlags({}).ga4BrowserPurchase).toBe(true);
    err.mockRestore();
  });

  it("browser mode touches no database at all", async () => {
    const db = readyDb(true);
    expect((await initGa4PurchaseOwner(db as never, {})).effective).toBe("browser");
    expect(db.execute).not.toHaveBeenCalled();
    const tx = { transaction: vi.fn() };
    expect(await enqueueGa4PurchaseInTx(tx as never, { orderId: "x", source: "order_create", eligibleAt: new Date() })).toBe("skipped_browser_mode");
    expect(await captureGa4PurchaseContextInTx(tx as never, { orderId: "x", cookies: {}, measurementId: null })).toBe("skipped_browser_mode");
    expect(tx.transaction).not.toHaveBeenCalled();
    const fetchImpl = vi.fn();
    expect(await runGa4PurchaseTick({ db: {} as never, fetchImpl, owner: () => "browser" })).toMatchObject({ skipped: "browser_mode" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("an enqueue failure is contained: the caller's transaction is not failed", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const tx = { transaction: vi.fn(async () => { throw new Error("relation does not exist"); }) };
    expect(await enqueueGa4PurchaseInTx(tx as never, { orderId: "o1", source: "order_create", eligibleAt: new Date() }, "server")).toBe("error");
    expect(await captureGa4PurchaseContextInTx(tx as never, { orderId: "o1", cookies: {}, measurementId: null }, "server")).toBe("error");
    // fixed message, no data
    expect(err.mock.calls.flat().join(" ")).not.toContain("relation does not exist");
    err.mockRestore();
  });

  it("the legacy every-event GA4 mirror stays off and is not reused", () => {
    expect(readGa4MpMode({})).toBe("off");
    expect(shouldServerSendToGa4("off")).toBe(false);
    expect(readGa4PurchaseOwner({ GA4_MP_MODE: "legacy_all" })).toBe("browser");
  });
});
