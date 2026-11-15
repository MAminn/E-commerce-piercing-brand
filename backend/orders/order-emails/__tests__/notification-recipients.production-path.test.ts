import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { user } from "#root/shared/database/drizzle/schema";
import { queueOrderPlacedEmails, type QueueOrderEmailsDeps } from "../service";

/**
 * The PRODUCTION path: queueOrderPlacedEmails is called exactly as createOrder
 * and the payment handlers call it — the recipient lookup is NOT injected, so
 * these tests go through the real default wiring, the real
 * process.env.ORDER_NOTIFICATION_EMAILS read and the real admin-user query.
 *
 * The database is mocked at its single entry point. While `dbProbe.mode` is
 * "forbidden", any db() call is recorded and throws; queueOrderPlacedEmails
 * swallows errors by design, so each test asserts the recorded call count
 * and that nothing was logged as an error.
 */

const dbProbe = vi.hoisted(() => ({
  calls: 0,
  tables: [] as unknown[],
  mode: "forbidden" as "forbidden" | "admins",
}));

vi.mock("#root/shared/database/drizzle/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("#root/shared/database/drizzle/db")>();
  return {
    ...actual,
    db: () => {
      dbProbe.calls += 1;
      if (dbProbe.mode === "forbidden") {
        throw new Error("the database must not be queried for notification recipients");
      }
      // The only db() query on this path is the admin-user lookup.
      return {
        select: () => ({
          from: (table: unknown) => {
            dbProbe.tables.push(table);
            return { where: async () => [{ email: "mhmd@amin.com" }] };
          },
        }),
      };
    },
  };
});

const ORDER_ID = "0192f000-0000-7000-8000-000000000042";
const GMAIL = "muhammeddamiinn@gmail.com";
const BAD_ADMIN = "mhmd@amin.com";

/** Everything except the recipient lookup, which stays the production default. */
function sideEffects() {
  return {
    enqueue: vi.fn<QueueOrderEmailsDeps["enqueue"]>(async () => true),
    logEvent: vi.fn<QueueOrderEmailsDeps["logEvent"]>(async () => {}),
    kickWorker: vi.fn<QueueOrderEmailsDeps["kickWorker"]>(),
  };
}

const placeOrder = (deps: ReturnType<typeof sideEffects>) =>
  queueOrderPlacedEmails({ orderId: ORDER_ID, customerEmail: "nour@example.com", orderNumber: 10042 }, deps);

const adminRecipients = (deps: ReturnType<typeof sideEffects>) =>
  deps.enqueue.mock.calls.map(([p]) => p).filter((p) => p.automationType === "order_admin_notification");

describe("queueOrderPlacedEmails — production recipient path (no injected lookup)", () => {
  let error: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    dbProbe.calls = 0;
    dbProbe.tables = [];
    dbProbe.mode = "forbidden";
    vi.stubEnv("ORDER_NOTIFICATION_EMAILS", undefined);
    error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it.each([
    ["plain", GMAIL],
    ["Coolify '=' + mixed case", "=MuhammedDamiinn@Gmail.com"],
    ["single-quoted", `'${GMAIL}'`],
    ["newline-separated with a duplicate", `${GMAIL}\nMUHAMMEDDAMIINN@GMAIL.COM`],
  ])("ORDER_NOTIFICATION_EMAILS set (%s) → only the configured inbox; the database is never queried", async (_, value) => {
    vi.stubEnv("ORDER_NOTIFICATION_EMAILS", value);
    const deps = sideEffects();

    await expect(placeOrder(deps)).resolves.toBeUndefined();

    expect(dbProbe.calls).toBe(0);
    expect(error).not.toHaveBeenCalled();
    expect(deps.enqueue.mock.calls.map(([p]) => p)).toEqual([
      expect.objectContaining({
        automationType: "order_confirmation",
        recipientEmail: "nour@example.com",
        dedupeKey: `order_confirmation:${ORDER_ID}`,
        payload: { orderId: ORDER_ID },
      }),
      expect.objectContaining({
        automationType: "order_admin_notification",
        recipientEmail: GMAIL,
        dedupeKey: `order_admin_notification:${ORDER_ID}:${GMAIL}`,
        payload: { orderId: ORDER_ID },
      }),
    ]);
    expect(deps.enqueue.mock.calls.map(([p]) => p.recipientEmail)).not.toContain(BAD_ADMIN);
    expect(deps.kickWorker).toHaveBeenCalledTimes(1);
  });

  it("unset → the previous behaviour: the admin-user query runs once and the admin is notified", async () => {
    dbProbe.mode = "admins";
    const deps = sideEffects();

    await placeOrder(deps);

    expect(dbProbe.calls).toBe(1);
    expect(dbProbe.tables).toEqual([user]);
    expect(adminRecipients(deps).map((p) => p.recipientEmail)).toEqual([BAD_ADMIN]);
    expect(adminRecipients(deps).map((p) => p.dedupeKey)).toEqual([`order_admin_notification:${ORDER_ID}:${BAD_ADMIN}`]);
  });

  it("set but no valid address → falls back to the admin-user query", async () => {
    vi.stubEnv("ORDER_NOTIFICATION_EMAILS", "muhammeddamiinn gmail.com");
    dbProbe.mode = "admins";
    const deps = sideEffects();

    await placeOrder(deps);

    expect(dbProbe.calls).toBe(1);
    expect(adminRecipients(deps).map((p) => p.recipientEmail)).toEqual([BAD_ADMIN]);
  });

  it("reads the env on every order, not once at start-up", async () => {
    dbProbe.mode = "admins";
    const first = sideEffects();
    await placeOrder(first);
    expect(adminRecipients(first).map((p) => p.recipientEmail)).toEqual([BAD_ADMIN]);

    vi.stubEnv("ORDER_NOTIFICATION_EMAILS", GMAIL);
    dbProbe.calls = 0;
    const second = sideEffects();
    await placeOrder(second);
    expect(adminRecipients(second).map((p) => p.recipientEmail)).toEqual([GMAIL]);
    expect(dbProbe.calls).toBe(0);
  });

  it("unset and the admin query fails → still never rejects, and the customer confirmation is queued", async () => {
    const deps = sideEffects(); // mode "forbidden": the admin query throws

    await expect(placeOrder(deps)).resolves.toBeUndefined();

    expect(dbProbe.calls).toBe(1);
    expect(adminRecipients(deps)).toEqual([]);
    expect(deps.enqueue).toHaveBeenCalledWith(expect.objectContaining({ automationType: "order_confirmation" }));
    expect(error).toHaveBeenCalled();
  });
});
