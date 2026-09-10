import { query } from "#root/shared/database/drizzle/db";
import { customTrackingEvent } from "#root/shared/database/drizzle/schema";
import { eq } from "drizzle-orm";
import { Effect } from "effect";
import { z } from "zod";
import { v7 } from "uuid";
import { ServerError } from "#root/shared/error/server";

// ─── Schemas ────────────────────────────────────────────────────────────────

const triggerTypeEnum = z.enum([
  "manual",
  "css_selector",
  "url_match",
  "time_on_page",
]);

export const createCustomEventSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(100)
    .regex(
      /^[a-z][a-z0-9_]*$/,
      "Must be lowercase snake_case starting with a letter",
    ),
  displayName: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
  triggerType: triggerTypeEnum,
  triggerConfig: z.record(z.unknown()).default({}),
  eventData: z.record(z.unknown()).default({}),
  platformMapping: z.record(z.string()).default({}),
  isActive: z.boolean().optional().default(true),
});

export const updateCustomEventSchema = z.object({
  id: z.string().uuid(),
  name: z
    .string()
    .min(1)
    .max(100)
    .regex(
      /^[a-z][a-z0-9_]*$/,
      "Must be lowercase snake_case starting with a letter",
    )
    .optional(),
  displayName: z.string().min(1).max(200).optional(),
  description: z.string().max(500).nullable().optional(),
  triggerType: triggerTypeEnum.optional(),
  triggerConfig: z.record(z.unknown()).optional(),
  eventData: z.record(z.unknown()).optional(),
  platformMapping: z.record(z.string()).optional(),
  isActive: z.boolean().optional(),
});

// ─── Service Functions ──────────────────────────────────────────────────────

export const listCustomEvents = () =>
  Effect.gen(function* () {
    return yield* query(async (db) => {
      return await db.select().from(customTrackingEvent).execute();
    });
  });

/**
 * Public: list only active custom events for the client trigger system.
 */
export const listActiveCustomEvents = () =>
  Effect.gen(function* () {
    return yield* query(async (db) => {
      return await db
        .select()
        .from(customTrackingEvent)
        .where(eq(customTrackingEvent.isActive, true))
        .execute();
    });
  });

export const getCustomEvent = (id: string) =>
  Effect.gen(function* () {
    const result = yield* query(async (db) => {
      return await db
        .select()
        .from(customTrackingEvent)
        .where(eq(customTrackingEvent.id, id))
        .execute();
    });

    const event = result[0];
    if (!event) {
      return yield* Effect.fail(
        new ServerError({
          tag: "NotFound",
          message: `Custom event ${id} not found`,
          statusCode: 404,
          clientMessage: "Custom event not found",
        }),
      );
    }

    return event;
  });

export const createCustomEvent = (
  input: z.infer<typeof createCustomEventSchema>,
) =>
  Effect.gen(function* () {
    // Validate trigger config based on trigger type
    validateTriggerConfig(input.triggerType, input.triggerConfig);

    const result = yield* query(async (db) => {
      return await db
        .insert(customTrackingEvent)
        .values({
          id: v7(),
          name: input.name,
          displayName: input.displayName,
          description: input.description ?? null,
          triggerType: input.triggerType,
          triggerConfig: input.triggerConfig,
          eventData: input.eventData,
          platformMapping: input.platformMapping,
          isActive: input.isActive,
        })
        .returning();
    });

    const inserted = result[0];
    if (!inserted) {
      return yield* Effect.fail(
        new ServerError({
          tag: "InsertFailed",
          message: "Failed to create custom event",
          statusCode: 500,
          clientMessage: "Failed to create custom event",
        }),
      );
    }

    return inserted;
  });

export const updateCustomEvent = (
  input: z.infer<typeof updateCustomEventSchema>,
) =>
  Effect.gen(function* () {
    const { id, ...updates } = input;

    // Validate trigger config if both triggerType and triggerConfig are given
    if (updates.triggerType && updates.triggerConfig) {
      validateTriggerConfig(updates.triggerType, updates.triggerConfig);
    }

    const updateData: Partial<typeof customTrackingEvent.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.displayName !== undefined)
      updateData.displayName = updates.displayName;
    if (updates.description !== undefined)
      updateData.description = updates.description;
    if (updates.triggerType !== undefined)
      updateData.triggerType = updates.triggerType;
    if (updates.triggerConfig !== undefined)
      updateData.triggerConfig = updates.triggerConfig;
    if (updates.eventData !== undefined) updateData.eventData = updates.eventData;
    if (updates.platformMapping !== undefined)
      updateData.platformMapping = updates.platformMapping;
    if (updates.isActive !== undefined) updateData.isActive = updates.isActive;

    const result = yield* query(async (db) => {
      return await db
        .update(customTrackingEvent)
        .set(updateData)
        .where(eq(customTrackingEvent.id, id))
        .returning();
    });

    const updated = result[0];
    if (!updated) {
      return yield* Effect.fail(
        new ServerError({
          tag: "NotFound",
          message: `Custom event ${id} not found`,
          statusCode: 404,
          clientMessage: "Custom event not found",
        }),
      );
    }

    return updated;
  });

export const deleteCustomEvent = (id: string) =>
  Effect.gen(function* () {
    const result = yield* query(async (db) => {
      return await db
        .delete(customTrackingEvent)
        .where(eq(customTrackingEvent.id, id))
        .returning({ id: customTrackingEvent.id });
    });

    const deleted = result[0];
    if (!deleted) {
      return yield* Effect.fail(
        new ServerError({
          tag: "NotFound",
          message: `Custom event ${id} not found`,
          statusCode: 404,
          clientMessage: "Custom event not found",
        }),
      );
    }

    return deleted;
  });

// ─── Helpers ────────────────────────────────────────────────────────────────

function validateTriggerConfig(
  triggerType: string,
  config: Record<string, unknown>,
): void {
  switch (triggerType) {
    case "css_selector":
      if (!config.selector || typeof config.selector !== "string") {
        throw new Error(
          "css_selector trigger requires a 'selector' string in triggerConfig",
        );
      }
      break;
    case "url_match":
      if (!config.pattern || typeof config.pattern !== "string") {
        throw new Error(
          "url_match trigger requires a 'pattern' string in triggerConfig",
        );
      }
      // Validate regex
      try {
        new RegExp(config.pattern);
      } catch {
        throw new Error(
          `Invalid regex pattern in triggerConfig: ${config.pattern}`,
        );
      }
      break;
    case "time_on_page":
      if (
        config.seconds === undefined ||
        typeof config.seconds !== "number" ||
        config.seconds <= 0
      ) {
        throw new Error(
          "time_on_page trigger requires a positive 'seconds' number in triggerConfig",
        );
      }
      break;
    case "manual":
      // No config needed
      break;
  }
}
