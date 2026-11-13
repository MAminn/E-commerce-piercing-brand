import {
  order,
  pixelConfig,
  trackingEvent,
  trackingEventDelivery,
} from "#root/shared/database/drizzle/schema";
import type { DatabaseClient } from "#root/shared/database/drizzle/db";

/**
 * Just enough of the drizzle client for processTrackingBeacon: the
 * tracking_event insert (ON CONFLICT event_id DO NOTHING … RETURNING), the
 * delivery-log insert, the pixel_config select and the read-only order
 * lookup a Purchase may trigger. Records everything that was stored.
 *
 * The order select returns `orders` as configured (tests configure the one
 * order they place); the real lookup by id is covered by
 * purchase-match.integration.test.ts against Postgres.
 */
export function makePipelineFakeDb(opts: {
  configs: Array<Record<string, unknown>>;
  existingEventIds?: string[];
  orders?: Array<Record<string, unknown>>;
}) {
  const seen = new Set(opts.existingEventIds ?? []);
  const persisted: Array<Record<string, unknown>> = [];
  const deliveries: Array<Record<string, unknown>> = [];
  let orderLookups = 0;

  const db = {
    insert(table: unknown) {
      return {
        values(rows: Record<string, unknown> | Array<Record<string, unknown>>) {
          const list = Array.isArray(rows) ? rows : [rows];
          if (table === trackingEvent) {
            const fresh = list.filter((r) => !seen.has(String(r.eventId)));
            for (const r of fresh) {
              seen.add(String(r.eventId));
              persisted.push(r);
            }
            return {
              onConflictDoNothing: () => ({
                returning: async () => fresh.map((r) => ({ id: r.id, eventId: r.eventId })),
              }),
            };
          }
          if (table === trackingEventDelivery) {
            deliveries.push(...list);
            return Promise.resolve();
          }
          throw new Error("unexpected insert");
        },
      };
    },
    select() {
      return {
        from(table: unknown) {
          if (table === pixelConfig) {
            return { where: () => ({ execute: async () => opts.configs }) };
          }
          if (table === order) {
            return {
              where: () => ({
                limit: async () => {
                  orderLookups += 1;
                  return opts.orders ?? [];
                },
              }),
            };
          }
          throw new Error("unexpected select");
        },
      };
    },
  };

  return {
    db: db as unknown as DatabaseClient,
    persisted,
    deliveries,
    orderLookups: () => orderLookups,
  };
}

export const metaServerConfig = {
  id: "cfg-meta",
  platform: "meta",
  pixelId: "1234567890",
  accessToken: "fake-token-for-tests",
  enabled: true,
  enableClientSide: true,
  enableServerSide: true,
  consentRequired: false,
  createdAt: new Date(),
};

export const ga4ServerConfig = {
  id: "cfg-ga4",
  platform: "google_ga4",
  pixelId: "G-TZZRFSD70Q",
  accessToken: "fake-ga4-secret-for-tests",
  enabled: true,
  enableClientSide: true,
  enableServerSide: true,
  consentRequired: false,
  createdAt: new Date(),
};
