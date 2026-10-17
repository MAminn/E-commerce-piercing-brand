import { describe, expect, it, vi } from "vitest";
import {
  adminNotificationDedupeKey,
  confirmationDedupeKey,
  queueOrderPlacedEmails,
  type QueueOrderEmailsDeps,
} from "../service";

/**
 * queueOrderPlacedEmails runs AFTER the order transaction has committed. Its
 * contract: queue exactly one customer confirmation (deduped per order), one
 * notification per admin, and NEVER reject — whatever fails.
 */

const ORDER_ID = "0192f000-0000-7000-8000-000000000042";

function deps(over: Partial<QueueOrderEmailsDeps> = {}) {
  const base = {
    enqueue: vi.fn<QueueOrderEmailsDeps["enqueue"]>(async () => true),
    listAdminEmails: vi.fn<QueueOrderEmailsDeps["listAdminEmails"]>(async () => [
      "owner@perce-eg.com",
      "Ops@Example.com",
    ]),
    logEvent: vi.fn<QueueOrderEmailsDeps["logEvent"]>(async () => {}),
    kickWorker: vi.fn<QueueOrderEmailsDeps["kickWorker"]>(),
  };
  return { ...base, ...over } as typeof base;
}

describe("queueOrderPlacedEmails", () => {
  it("queues exactly one customer confirmation keyed order_confirmation:<orderId>", async () => {
    const d = deps();
    await queueOrderPlacedEmails({ orderId: ORDER_ID, customerEmail: "nour@example.com", orderNumber: 10042 }, d);

    const customer = d.enqueue.mock.calls
      .map(([p]) => p)
      .filter((p) => p.automationType === "order_confirmation");
    expect(customer).toHaveLength(1);
    expect(customer[0]).toMatchObject({
      recipientEmail: "nour@example.com",
      payload: { orderId: ORDER_ID },
      dedupeKey: `order_confirmation:${ORDER_ID}`,
    });
    expect(confirmationDedupeKey(ORDER_ID)).toBe(`order_confirmation:${ORDER_ID}`);
    expect(d.kickWorker).toHaveBeenCalledTimes(1);
    expect(d.logEvent).not.toHaveBeenCalled();
  });

  it("queues one separate store notification per admin", async () => {
    const d = deps();
    await queueOrderPlacedEmails({ orderId: ORDER_ID, customerEmail: "nour@example.com" }, d);
    const admin = d.enqueue.mock.calls
      .map(([p]) => p)
      .filter((p) => p.automationType === "order_admin_notification");
    expect(admin.map((p) => p.recipientEmail)).toEqual(["owner@perce-eg.com", "Ops@Example.com"]);
    expect(admin.map((p) => p.dedupeKey)).toEqual([
      adminNotificationDedupeKey(ORDER_ID, "owner@perce-eg.com"),
      `order_admin_notification:${ORDER_ID}:ops@example.com`,
    ]);
  });

  it("asks for the same dedupe key on every call, so a repeat cannot double-send", async () => {
    const d = deps();
    await queueOrderPlacedEmails({ orderId: ORDER_ID, customerEmail: "nour@example.com" }, d);
    await queueOrderPlacedEmails({ orderId: ORDER_ID, customerEmail: "nour@example.com" }, d);
    const keys = d.enqueue.mock.calls
      .map(([p]) => p)
      .filter((p) => p.automationType === "order_confirmation")
      .map((p) => p.dedupeKey);
    expect(new Set(keys).size).toBe(1);
  });

  it("records confirmation_email_failed when the confirmation cannot be queued", async () => {
    const d = deps({ enqueue: vi.fn(async () => false) });
    await queueOrderPlacedEmails({ orderId: ORDER_ID, customerEmail: "nour@example.com", orderNumber: 10042 }, d);
    expect(d.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: ORDER_ID, action: "confirmation_email_failed" }),
    );
    expect(d.logEvent.mock.calls[0]![0].note).toContain("#10042");
  });

  it.each([
    ["the queue throws", { enqueue: vi.fn(async () => Promise.reject(new Error("db down"))) }],
    ["the admin lookup throws", { listAdminEmails: vi.fn(async () => Promise.reject(new Error("db down"))) }],
    ["the worker kick throws", { kickWorker: vi.fn(() => { throw new Error("boom"); }) }],
    ["the activity log throws", { enqueue: vi.fn(async () => false), logEvent: vi.fn(async () => Promise.reject(new Error("log down"))) }],
  ])("never rejects when %s", async (_, over) => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      queueOrderPlacedEmails({ orderId: ORDER_ID, customerEmail: "nour@example.com" }, deps(over as never)),
    ).resolves.toBeUndefined();
    error.mockRestore();
  });

  it("still queues the customer confirmation when the admin lookup fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const d = deps({ listAdminEmails: vi.fn(async () => Promise.reject(new Error("db down"))) });
    await queueOrderPlacedEmails({ orderId: ORDER_ID, customerEmail: "nour@example.com" }, d);
    expect(d.enqueue).toHaveBeenCalledWith(expect.objectContaining({ automationType: "order_confirmation" }));
    error.mockRestore();
  });
});
