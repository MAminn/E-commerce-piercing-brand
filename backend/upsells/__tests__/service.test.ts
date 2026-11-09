import { describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { Effect } from "effect";
import * as schema from "#root/shared/database/drizzle/schema";
import { provideDatabase } from "#root/shared/trpc/server";
import type { UpsellSettings } from "#root/shared/upsell/config";
import { getProductUpsells } from "../service";

/**
 * The server resolver, run through drizzle's real query builder against a
 * stub pg client (rowMode "array": a row is its values in select order). The
 * assertions are on what the resolver returns and on the SQL it issues — the
 * eligibility filters must be in the query, not only in post-processing.
 */

const WHEY = "11111111-1111-7111-8111-111111111111";
const STRAPS = "22222222-2222-7222-8222-222222222222";
const RICE = "33333333-3333-7333-8333-333333333333";
const CARB = "44444444-4444-7444-8444-444444444444";
const CAT = "99999999-9999-7999-8999-999999999999";

interface Capture {
  sql: string;
  params: unknown[];
}

/** Candidate row in the order service.ts selects it. */
function candidate(id: string, name: string, stock = 10) {
  return [id, name.toLowerCase(), name, "400.00", "350.00", stock, false, false, CAT, "supplements", `${name}.webp`];
}

function makeDb({
  config,
  subject,
  candidates,
  variantProductIds = [],
}: {
  config: Partial<UpsellSettings> | null;
  subject: { mode: string; manualIds: string[] } | null;
  candidates: unknown[][];
  variantProductIds?: string[];
}) {
  const captures: Capture[] = [];
  const client = {
    query: async (query: { text: string }, params: unknown[]) => {
      const sql = query.text;
      captures.push({ sql, params });
      if (sql.includes('from "store_settings"')) {
        return { rows: config ? [[config]] : [] };
      }
      if (sql.includes('"upsell_mode"')) {
        return {
          rows: subject ? [[WHEY, CAT, subject.mode, subject.manualIds]] : [],
        };
      }
      if (sql.includes('from "product_category"')) return { rows: [] };
      if (sql.includes('from "product_variant"')) {
        return { rows: variantProductIds.map((id) => [id]) };
      }
      if (sql.includes('from "product"')) return { rows: candidates };
      return { rows: [] };
    },
  };
  return { db: drizzle(client as never, { schema }), captures };
}

const run = (
  db: ReturnType<typeof drizzle>,
  input: Partial<Parameters<typeof getProductUpsells>[0]> = {},
) =>
  Effect.runPromise(
    getProductUpsells({ productId: WHEY, seed: "s", ...input }).pipe(
      provideDatabase({ db: db as never }),
    ),
  );

const candidateQuery = (captures: Capture[]) =>
  captures.find(
    (c) => c.sql.includes('from "product"') && c.sql.includes('inner join "category"'),
  );

const ALL = [candidate(STRAPS, "Straps"), candidate(RICE, "Rice"), candidate(CARB, "Carb")];

/** The owner has switched upsells on and left everything else at default. */
const ON: Partial<UpsellSettings> = { enabled: true };

describe("getProductUpsells — shipped default (off)", () => {
  for (const [label, config] of [
    ["no saved upsell_config", null],
    ["a fresh empty config", {}],
    ["a config that never set the switch", { maxItems: 4, productPageEnabled: true, postAddEnabled: true }],
  ] as const) {
    it(`is off with ${label}: no recommendations, no placements, no product read`, async () => {
      const { db, captures } = makeDb({
        config: config as Partial<UpsellSettings> | null,
        subject: { mode: "manual", manualIds: [STRAPS] },
        candidates: ALL,
      });
      const r = await run(db);
      expect(r.enabled).toBe(false);
      expect(r.productPage).toBe(false);
      expect(r.postAdd).toBe(false);
      expect(r.items).toEqual([]);
      expect(captures.filter((c) => c.sql.includes('from "product"'))).toHaveLength(0);
    });
  }
});

describe("getProductUpsells", () => {
  it("once enabled, returns random recommendations with the remaining defaults", async () => {
    const { db } = makeDb({ config: ON, subject: { mode: "global", manualIds: [] }, candidates: ALL });
    const r = await run(db);
    expect(r.enabled).toBe(true);
    expect(r.productPage).toBe(true);
    expect(r.postAdd).toBe(true);
    expect(r.limit).toBe(3);
    expect(r.source).toBe("random");
    expect(r.items.map((i) => i.id).sort()).toEqual([STRAPS, RICE, CARB].sort());
    expect(r.items[0]).toMatchObject({ price: 400, discountPrice: 350, available: true, variantCount: 0 });
    expect(r.items[0]!.imageUrl).toMatch(/^\/uploads\/.+\.webp$/);
  });

  it("filters deleted, hidden, out-of-stock and dead-category products in SQL", async () => {
    const { db, captures } = makeDb({ config: ON, subject: { mode: "global", manualIds: [] }, candidates: ALL });
    await run(db);
    const q = candidateQuery(captures)!;
    expect(q.sql).toContain('"product"."deleted" = $');
    expect(q.sql).toContain('"product"."hidden" = $');
    expect(q.sql).toContain('"category"."deleted" = $');
    expect(q.sql).toContain('"product"."stock" > $');
  });

  it("never returns the current product even if the catalogue row comes back", async () => {
    const { db } = makeDb({
      config: ON,
      subject: { mode: "global", manualIds: [] },
      candidates: [candidate(WHEY, "Whey"), ...ALL],
    });
    const r = await run(db);
    expect(r.items.map((i) => i.id)).not.toContain(WHEY);
  });

  it("excludes products the shopper already has", async () => {
    const { db } = makeDb({ config: ON, subject: { mode: "global", manualIds: [] }, candidates: ALL });
    const r = await run(db, { excludeProductIds: [RICE] });
    expect(r.items.map((i) => i.id)).not.toContain(RICE);
  });

  it("manual mode returns the picked products in the admin's order, querying only them", async () => {
    const { db, captures } = makeDb({
      config: ON,
      subject: { mode: "manual", manualIds: [CARB, STRAPS] },
      candidates: ALL,
    });
    const r = await run(db);
    expect(r.source).toBe("manual");
    expect(r.items.map((i) => i.id)).toEqual([CARB, STRAPS]);
    const q = candidateQuery(captures)!;
    expect(q.sql).toContain('"product"."id" in');
    expect(q.params).toEqual(expect.arrayContaining([CARB, STRAPS]));
  });

  it("disabled product: nothing, and the catalogue is never read", async () => {
    const { db, captures } = makeDb({ config: ON, subject: { mode: "disabled", manualIds: [] }, candidates: ALL });
    const r = await run(db);
    expect(r.items).toEqual([]);
    expect(r.source).toBe("none");
    expect(candidateQuery(captures)).toBeUndefined();
  });

  it("disabled store-wide: nothing, and no product is read at all", async () => {
    const { db, captures } = makeDb({
      config: { enabled: false },
      subject: { mode: "global", manualIds: [] },
      candidates: ALL,
    });
    const r = await run(db);
    expect(r.enabled).toBe(false);
    expect(r.items).toEqual([]);
    expect(captures.filter((c) => c.sql.includes('from "product"'))).toHaveLength(0);
  });

  it("passes the placement switches through", async () => {
    const { db } = makeDb({
      config: { enabled: true, productPageEnabled: false, postAddEnabled: true, maxItems: 2 },
      subject: { mode: "global", manualIds: [] },
      candidates: ALL,
    });
    const r = await run(db);
    expect(r.productPage).toBe(false);
    expect(r.postAdd).toBe(true);
    expect(r.limit).toBe(2);
  });

  it("reports option groups so the storefront never guesses a variant", async () => {
    const { db } = makeDb({
      config: ON,
      subject: { mode: "manual", manualIds: [STRAPS, RICE] },
      candidates: ALL,
      variantProductIds: [RICE, RICE],
    });
    const r = await run(db);
    expect(r.items.find((i) => i.id === RICE)!.variantCount).toBe(2);
    expect(r.items.find((i) => i.id === STRAPS)!.variantCount).toBe(0);
    // Percé's FeaturedProduct name for the same fact.
    expect(r.items.find((i) => i.id === RICE)!.requiresOptions).toBe(true);
    expect(r.items.find((i) => i.id === STRAPS)!.requiresOptions).toBe(false);
  });

  it("an unknown or hidden product yields nothing", async () => {
    const { db } = makeDb({ config: ON, subject: null, candidates: ALL });
    const r = await run(db);
    expect(r.items).toEqual([]);
  });

  it("is stable for the same seed", async () => {
    const a = await run(makeDb({ config: ON, subject: { mode: "global", manualIds: [] }, candidates: ALL }).db, { seed: "abc" });
    const b = await run(makeDb({ config: ON, subject: { mode: "global", manualIds: [] }, candidates: [...ALL].reverse() }).db, { seed: "abc" });
    expect(a.items.map((i) => i.id)).toEqual(b.items.map((i) => i.id));
  });
});
