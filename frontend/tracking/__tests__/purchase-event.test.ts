import { beforeEach, describe, expect, it, vi } from "vitest";
import { TrackingEventName } from "#root/shared/types/pixel-tracking";
import {
  buildPurchaseEcommerce,
  hasTrackedPurchase,
  purchaseEventId,
  purchaseItemsFromOrderLines,
  savePurchaseItems,
  trackPurchaseOnce,
  type PersistedOrderLine,
} from "../purchase-event";

/** A Storage with nothing but a Map behind it — a browser's local/session storage. */
const memoryStorage = () => {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    keys: () => [...map.keys()],
  };
};

const ORDER = "0f1e2d3c-4b5a-4968-8778-6a5b4c3d2e1f";
const line = (productId: string, quantity: number, price: string, name = `name-${productId}`): PersistedOrderLine => ({
  productId,
  quantity,
  price,
  name,
});

describe("purchaseItemsFromOrderLines", () => {
  it("one content id per product; a product bought loose and inside a set sums its quantity", () => {
    const items = purchaseItemsFromOrderLines([
      line("p1", 2, "100.00"),
      line("p2", 1, "80.00"),
      // the same product again, as a bundle child
      line("p1", 1, "85.00"),
    ]);
    expect(items).toEqual([
      { itemId: "p1", itemName: "name-p1", quantity: 3, price: 100 },
      { itemId: "p2", itemName: "name-p2", quantity: 1, price: 80 },
    ]);
  });

  it("drops malformed lines instead of reporting them", () => {
    expect(purchaseItemsFromOrderLines([line("", 1, "1"), line("p", 0, "1")])).toEqual([]);
  });
});

describe("buildPurchaseEcommerce", () => {
  it("reports the persisted total in the store currency with the order id", () => {
    expect(buildPurchaseEcommerce({ orderId: ORDER, total: "983.75" })).toEqual({
      currency: "EGP",
      value: 983.75,
      transactionId: ORDER,
    });
  });

  it("refuses a missing or non-numeric total rather than reporting 0 revenue", () => {
    expect(buildPurchaseEcommerce({ orderId: ORDER, total: "" })).toBeNull();
    expect(buildPurchaseEcommerce({ orderId: ORDER, total: "abc" })).toBeNull();
    expect(buildPurchaseEcommerce({ orderId: ORDER, total: -1 })).toBeNull();
  });
});

describe("trackPurchaseOnce", () => {
  let local: ReturnType<typeof memoryStorage>;
  let session: ReturnType<typeof memoryStorage>;
  let trackEvent: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    local = memoryStorage();
    session = memoryStorage();
    trackEvent = vi.fn();
  });

  const fire = (total: string | number = "983.75", overrides: { local?: unknown; session?: unknown } = {}) =>
    trackPurchaseOnce({
      orderId: ORDER,
      total,
      trackEvent,
      local: (overrides.local ?? local) as never,
      session: (overrides.session ?? session) as never,
    });

  it("emits checkout_completed (Meta Purchase) with the order's value, currency, id and lines", () => {
    savePurchaseItems(session, ORDER, [line("p1", 2, "150.00"), line("p2", 1, "175.00")]);
    expect(fire()).toBe(true);
    expect(trackEvent).toHaveBeenCalledTimes(1);
    expect(trackEvent).toHaveBeenCalledWith(TrackingEventName.CHECKOUT_COMPLETED, {
      eventId: purchaseEventId(ORDER),
      ecommerce: {
        currency: "EGP",
        value: 983.75,
        transactionId: ORDER,
        items: [
          { itemId: "p1", itemName: "name-p1", quantity: 2, price: 150 },
          { itemId: "p2", itemName: "name-p2", quantity: 1, price: 175 },
        ],
      },
    });
    // The stash is consumed.
    expect(session.keys()).not.toContain(`checkout_items:${ORDER}`);
  });

  it("a refresh / re-render / reopened link never emits a second Purchase for the same order", () => {
    expect(fire()).toBe(true);
    expect(fire()).toBe(false);
    // A new tab: fresh sessionStorage, same browser.
    expect(fire("983.75", { session: memoryStorage() })).toBe(false);
    expect(trackEvent).toHaveBeenCalledTimes(1);
    expect(hasTrackedPurchase(ORDER, { local })).toBe(true);
  });

  it("still dedupes when localStorage is unavailable (private mode)", () => {
    const throwing = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
      removeItem: () => {
        throw new Error("denied");
      },
    };
    expect(fire("10", { local: throwing })).toBe(true);
    expect(fire("10", { local: throwing })).toBe(false);
    expect(trackEvent).toHaveBeenCalledTimes(1);
  });

  it("honours the marker the page wrote before this module, so deployed orders are not re-sent", () => {
    session.setItem(`tracked_checkout_completed:${ORDER}`, "1");
    expect(fire()).toBe(false);
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it("without a usable total nothing is emitted and the order is not marked", () => {
    expect(fire("")).toBe(false);
    expect(trackEvent).not.toHaveBeenCalled();
    expect(hasTrackedPurchase(ORDER, { local, session })).toBe(false);
    // …so the verified total, when it arrives, still fires exactly once.
    expect(fire("50.00")).toBe(true);
    expect(trackEvent).toHaveBeenCalledTimes(1);
  });

  it("without stashed lines (another device) it still reports value and order id", () => {
    fire("120.00");
    const [, data] = trackEvent.mock.calls[0]!;
    expect(data.ecommerce).toEqual({ currency: "EGP", value: 120, transactionId: ORDER });
  });
});
