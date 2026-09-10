import { query } from "#root/shared/database/drizzle/db";
import {
  trackingEvent,
} from "#root/shared/database/drizzle/schema";
import { Effect } from "effect";
import { z } from "zod";
import { v7 } from "uuid";

export const trackEventSchema = z.object({
  eventId: z.string(),
  eventName: z.string(),
  timestamp: z.number(),
  pageUrl: z.string(),
  referrer: z.string().optional(),
  sessionId: z.string(),
  userId: z.string().uuid().optional(),
  utmSource: z.string().optional(),
  utmMedium: z.string().optional(),
  utmCampaign: z.string().optional(),
  utmTerm: z.string().optional(),
  utmContent: z.string().optional(),
  ecommerce: z
    .object({
      currency: z.string().optional(),
      value: z.number().optional(),
      items: z
        .array(
          z.object({
            itemId: z.string(),
            itemName: z.string(),
            price: z.number().optional(),
            quantity: z.number().optional(),
            category: z.string().optional(),
            brand: z.string().optional(),
            variant: z.string().optional(),
          }),
        )
        .optional(),
      transactionId: z.string().optional(),
      tax: z.number().optional(),
      shipping: z.number().optional(),
      coupon: z.string().optional(),
      searchQuery: z.string().optional(),
    })
    .optional(),
  customProperties: z.record(z.unknown()).optional(),
});

export const trackEvents = (
  input: z.infer<typeof trackEventSchema>,
  serverContext?: { userAgent?: string; ipHash?: string; deviceType?: string },
) =>
  Effect.gen(function* () {
    const result = yield* query(async (db) => {
      return await db
        .insert(trackingEvent)
        .values({
          id: v7(),
          sessionId: input.sessionId,
          userId: input.userId ?? null,
          eventName: input.eventName,
          eventId: input.eventId,
          eventData: input,
          pageUrl: input.pageUrl,
          referrer: input.referrer ?? null,
          utmSource: input.utmSource ?? null,
          utmMedium: input.utmMedium ?? null,
          utmCampaign: input.utmCampaign ?? null,
          userAgent: serverContext?.userAgent ?? null,
          ipHash: serverContext?.ipHash ?? null,
          deviceType: serverContext?.deviceType ?? null,
        })
        .returning({ id: trackingEvent.id });
    });

    const inserted = result[0];
    return { id: inserted?.id ?? null };
  });
