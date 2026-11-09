import { describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { Effect } from "effect";
import * as schema from "#root/shared/database/drizzle/schema";
import type { SocialProofConfig } from "#root/shared/database/drizzle/schema";
import { provideDatabase } from "#root/shared/trpc/server";
import { DEFAULT_SOCIAL_PROOF_CONFIG } from "../defaults";
import { getPublicSocialProofFeed } from "../service";

/**
 * These run drizzle's real query builder against a stub pg client, so the
 * assertions below are about the SQL the service actually issues — not about
 * a hand-written mock's idea of it. That matters here more than usual: the
 * privacy guarantee is "the sensitive columns are never selected", and only
 * the generated SQL can prove that.
 *
 * node-postgres is driven in `rowMode: "array"`, so a stubbed row is an array
 * of values in the select's declared order.
 */

interface Capture {
  sql: string;
  params: unknown[];
}

/** One raw order-item row, in the column order `service.ts` selects. */
function orderRow(overrides: Partial<Record<string, unknown>> = {}) {
  const base = {
    orderId: "11111111-1111-7111-8111-111111111111",
    customerName: "Ahmed Mohamed Hassan",
    shippingCity: "Cairo",
    shippingState: "Cairo Governorate",
    occurredAt: new Date("2026-09-01T10:00:00.000Z"),
    productId: "22222222-2222-7222-8222-222222222222",
    productSlug: "seamless-ring-8mm",
    productName: "Seamless Ring 8mm",
    productImageDiskname: "whey.jpg",
    ...overrides,
  };
  return [
    base.orderId,
    base.customerName,
    base.shippingCity,
    base.shippingState,
    base.occurredAt,
    base.productId,
    base.productSlug,
    base.productName,
    base.productImageDiskname,
  ];
}

function makeDb(config: Partial<SocialProofConfig>, itemRows: unknown[][]) {
  const captures: Capture[] = [];
  const client = {
    query: async (query: { text: string }, params: unknown[]) => {
      const sql = query.text;
      captures.push({ sql, params });

      if (sql.includes('from "store_settings"')) {
        return { rows: [[{ ...DEFAULT_SOCIAL_PROOF_CONFIG, ...config }]] };
      }
      if (sql.includes('from "order_item"')) {
        return { rows: itemRows };
      }
      // product_image primary lookup — no gallery images in these fixtures.
      return { rows: [] };
    },
  };
  return { db: drizzle(client as never, { schema }), captures };
}

const run = (db: ReturnType<typeof drizzle>) =>
  Effect.runPromise(
    getPublicSocialProofFeed().pipe(provideDatabase({ db: db as never })),
  );

const orderQuery = (captures: Capture[]) =>
  captures.find((c) => c.sql.includes('from "order_item"'));

describe("getPublicSocialProofFeed — feature gating", () => {
  it("returns no events, and never touches orders, when the config is disabled", async () => {
    const { db, captures } = makeDb({ enabled: false }, [orderRow()]);

    const feed = await run(db);

    expect(feed.events).toEqual([]);
    expect(feed.config.enabled).toBe(false);
    expect(orderQuery(captures)).toBeUndefined();
  });

  it("returns no events when every eligible status has been unset", async () => {
    const { db, captures } = makeDb(
      { enabled: true, eligibleStatuses: [] },
      [orderRow()],
    );

    const feed = await run(db);

    expect(feed.events).toEqual([]);
    expect(orderQuery(captures)).toBeUndefined();
  });

  it("returns the events when enabled", async () => {
    const { db } = makeDb({ enabled: true }, [orderRow()]);

    const feed = await run(db);

    expect(feed.events).toHaveLength(1);
    expect(feed.events[0]!.displayName).toBe("Ahmed M.");
    expect(feed.events[0]!.location).toBe("Cairo");
    expect(feed.events[0]!.productName).toBe("Seamless Ring 8mm");
    expect(feed.events[0]!.productImageUrl).toBe("/uploads/whey.jpg");
  });
});

describe("getPublicSocialProofFeed — order eligibility", () => {
  it("filters to the configured statuses, excluding pending and cancelled by default", async () => {
    const { db, captures } = makeDb({ enabled: true }, [orderRow()]);
    await run(db);

    const q = orderQuery(captures)!;
    expect(q.sql).toContain('"order"."status" in');
    // The three defaults are bound as parameters; pending/cancelled are not.
    expect(q.params).toContain("processing");
    expect(q.params).toContain("shipped");
    expect(q.params).toContain("delivered");
    expect(q.params).not.toContain("pending");
    expect(q.params).not.toContain("cancelled");
  });

  it("honours a narrowed status list", async () => {
    const { db, captures } = makeDb(
      { enabled: true, eligibleStatuses: ["delivered"] },
      [orderRow()],
    );
    await run(db);

    const q = orderQuery(captures)!;
    expect(q.params).toContain("delivered");
    expect(q.params).not.toContain("processing");
    expect(q.params).not.toContain("shipped");
  });

  it("excludes soft-deleted and hidden products", async () => {
    const { db, captures } = makeDb({ enabled: true }, [orderRow()]);
    await run(db);

    const q = orderQuery(captures)!;
    expect(q.sql).toContain('"product"."deleted" =');
    expect(q.sql).toContain('"product"."hidden" =');
    // Both bound false — i.e. only live, visible products.
    expect(q.params.filter((p) => p === false)).toHaveLength(2);
  });

  it("excludes archived orders", async () => {
    const { db, captures } = makeDb({ enabled: true }, [orderRow()]);
    await run(db);

    expect(orderQuery(captures)!.sql).toContain('"order"."archived_at" is null');
  });

  it("excludes refunded and failed payments (Percé adaptation)", async () => {
    const { db, captures } = makeDb({ enabled: true }, [orderRow()]);
    await run(db);

    const q = orderQuery(captures)!;
    expect(q.sql).toContain('"order"."payment_status" not in');
    expect(q.params).toContain("refunded");
    expect(q.params).toContain("failed");
    // Paid, COD (not_required) and in-flight payments stay eligible.
    expect(q.params).not.toContain("paid");
    expect(q.params).not.toContain("not_required");
  });

  it("bounds the query to the configured lookback window", async () => {
    const before = Date.now();
    const { db, captures } = makeDb(
      { enabled: true, lookbackDays: 7 },
      [orderRow()],
    );
    await run(db);
    const after = Date.now();

    const q = orderQuery(captures)!;
    expect(q.sql).toContain('"order"."created_at" >=');
    // Drizzle hands the driver a timestamp string, not a Date.
    const timestamps = q.params
      .filter((p): p is string => typeof p === "string")
      .map((p) => Date.parse(p))
      .filter((t) => Number.isFinite(t));
    expect(timestamps).toHaveLength(1);
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    expect(timestamps[0]!).toBeGreaterThanOrEqual(before - sevenDays);
    expect(timestamps[0]!).toBeLessThanOrEqual(after - sevenDays);
  });

  it("caps how many rows it will read", async () => {
    const { db, captures } = makeDb({ enabled: true }, [orderRow()]);
    await run(db);

    const q = orderQuery(captures)!;
    expect(q.sql).toContain("limit");
    const limit = q.params.find((p) => typeof p === "number") as number;
    expect(limit).toBeLessThanOrEqual(100);
  });

  it("emits one event per order when an order contains several products", async () => {
    const { db } = makeDb({ enabled: true }, [
      orderRow({ productId: "p1", productName: "Whey" }),
      orderRow({ productId: "p2", productName: "Creatine" }),
    ]);

    const feed = await run(db);

    expect(feed.events).toHaveLength(1);
  });
});

describe("getPublicSocialProofFeed — product filter", () => {
  it("applies no product restriction when allowedProductIds is empty", async () => {
    const { db, captures } = makeDb(
      { enabled: true, allowedProductIds: [] },
      [orderRow()],
    );
    await run(db);

    expect(orderQuery(captures)!.sql).not.toContain('"product"."id" in');
  });

  it("restricts to the chosen products when allowedProductIds is set", async () => {
    const allowed = [
      "33333333-3333-7333-8333-333333333333",
      "44444444-4444-7444-8444-444444444444",
    ];
    const { db, captures } = makeDb(
      { enabled: true, allowedProductIds: allowed },
      [orderRow()],
    );
    await run(db);

    const q = orderQuery(captures)!;
    expect(q.sql).toContain('"product"."id" in');
    expect(q.params).toContain(allowed[0]);
    expect(q.params).toContain(allowed[1]);
  });
});

describe("getPublicSocialProofFeed — privacy", () => {
  it("never selects customer email, phone or address columns", async () => {
    const { db, captures } = makeDb({ enabled: true }, [orderRow()]);
    await run(db);

    const selectClause = orderQuery(captures)!.sql.split(" from ")[0]!;
    for (const column of [
      "customer_email",
      "customer_phone",
      "shipping_address",
      "shipping_postal_code",
      "payment_method",
      "payment_status",
      "payment_transaction_id",
      "payment_gateway_data",
      "total",
      "notes",
    ]) {
      expect(selectClause).not.toContain(column);
    }
  });

  it("returns no order identifier and no full customer name in the payload", async () => {
    const orderId = "99999999-9999-7999-8999-999999999999";
    const { db } = makeDb({ enabled: true }, [
      orderRow({ orderId, customerName: "Ahmed Mohamed Hassan" }),
    ]);

    const feed = await run(db);
    const serialised = JSON.stringify(feed);

    expect(serialised).not.toContain(orderId);
    expect(serialised).not.toContain("Ahmed Mohamed Hassan");
    expect(serialised).not.toContain("Hassan");
    expect(feed.events[0]).not.toHaveProperty("orderId");
  });

  it("does not publish query-shaping config to the storefront", async () => {
    const { db } = makeDb(
      { enabled: true, allowedProductIds: ["55555555-5555-7555-8555-555555555555"] },
      [orderRow()],
    );

    const feed = await run(db);

    expect(feed.config).not.toHaveProperty("allowedProductIds");
    expect(feed.config).not.toHaveProperty("eligibleStatuses");
    expect(feed.config).not.toHaveProperty("lookbackDays");
    expect(Object.keys(feed.config).sort()).toEqual(
      [
        "displayDurationSeconds",
        "enabled",
        "firstDelaySeconds",
        "intervalSeconds",
        "maxPerSession",
        "showRelativeTime",
      ].sort(),
    );
  });

  it("omits location from the payload when the admin turns it off", async () => {
    const { db } = makeDb({ enabled: true, showLocation: false }, [orderRow()]);

    const feed = await run(db);

    expect(feed.events[0]!.location).toBeNull();
    expect(JSON.stringify(feed.events)).not.toContain("Cairo");
  });
});
