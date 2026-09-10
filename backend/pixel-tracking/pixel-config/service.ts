import { query } from "#root/shared/database/drizzle/db";
import { pixelConfig } from "#root/shared/database/drizzle/schema";
import { eq, and } from "drizzle-orm";
import { Effect } from "effect";
import { z } from "zod";
import { v7 } from "uuid";
import { ServerError } from "#root/shared/error/server";

const platformEnum = z.enum([
  "meta",
  "google_ga4",
  "tiktok",
  "snapchat",
  "pinterest",
  "custom",
  "clarity",
]);

export const createPixelConfigSchema = z.object({
  platform: platformEnum,
  pixelId: z.string().min(1),
  accessToken: z.string().optional(),
  enabled: z.boolean().optional().default(true),
  enableClientSide: z.boolean().optional().default(true),
  enableServerSide: z.boolean().optional().default(false),
  consentRequired: z.boolean().optional().default(false),
  consentCategory: z.enum(["analytics", "marketing", "custom"]).optional(),
  settings: z.record(z.unknown()).optional(),
});

export const updatePixelConfigSchema = z.object({
  id: z.string().uuid(),
  platform: platformEnum.optional(),
  pixelId: z.string().min(1).optional(),
  accessToken: z.string().nullable().optional(),
  enabled: z.boolean().optional(),
  enableClientSide: z.boolean().optional(),
  enableServerSide: z.boolean().optional(),
  consentRequired: z.boolean().optional(),
  consentCategory: z
    .enum(["analytics", "marketing", "custom"])
    .nullable()
    .optional(),
  settings: z.record(z.unknown()).nullable().optional(),
});

export const listPixelConfigs = () =>
  Effect.gen(function* () {
    return yield* query(async (db) => {
      return await db.select().from(pixelConfig).execute();
    });
  });

/**
 * Public: list only enabled client-side configs.
 * Omits `accessToken` so secrets are never sent to the browser.
 */
export const listActiveClientConfigs = () =>
  Effect.gen(function* () {
    return yield* query(async (db) => {
      return await db
        .select({
          id: pixelConfig.id,
          platform: pixelConfig.platform,
          pixelId: pixelConfig.pixelId,
          enabled: pixelConfig.enabled,
          enableClientSide: pixelConfig.enableClientSide,
          enableServerSide: pixelConfig.enableServerSide,
          consentRequired: pixelConfig.consentRequired,
          consentCategory: pixelConfig.consentCategory,
          settings: pixelConfig.settings,
          createdAt: pixelConfig.createdAt,
          updatedAt: pixelConfig.updatedAt,
        })
        .from(pixelConfig)
        .where(
          and(
            eq(pixelConfig.enabled, true),
            eq(pixelConfig.enableClientSide, true),
          ),
        )
        .execute();
    });
  });

export const getPixelConfig = (id: string) =>
  Effect.gen(function* () {
    const result = yield* query(async (db) => {
      return await db
        .select()
        .from(pixelConfig)
        .where(eq(pixelConfig.id, id))
        .execute();
    });

    const config = result[0];
    if (!config) {
      return yield* Effect.fail(
        new ServerError({
          tag: "NotFound",
          message: `Pixel config ${id} not found`,
          statusCode: 404,
          clientMessage: "Pixel configuration not found",
        }),
      );
    }

    return config;
  });

export const createPixelConfig = (
  input: z.infer<typeof createPixelConfigSchema>,
) =>
  Effect.gen(function* () {
    const result = yield* query(async (db) => {
      return await db
        .insert(pixelConfig)
        .values({
          id: v7(),
          platform: input.platform,
          pixelId: input.pixelId,
          accessToken: input.accessToken ?? null,
          enabled: input.enabled,
          enableClientSide: input.enableClientSide,
          enableServerSide: input.enableServerSide,
          consentRequired: input.consentRequired,
          consentCategory: input.consentCategory ?? null,
          settings: input.settings ?? null,
        })
        .returning();
    });

    const inserted = result[0];
    if (!inserted) {
      return yield* Effect.fail(
        new ServerError({
          tag: "InsertFailed",
          message: "Failed to create pixel config",
          statusCode: 500,
          clientMessage: "Failed to create pixel configuration",
        }),
      );
    }

    return inserted;
  });

export const updatePixelConfig = (
  input: z.infer<typeof updatePixelConfigSchema>,
) =>
  Effect.gen(function* () {
    const { id, ...updates } = input;

    // Build update payload — only include fields that were provided
    const updateData: Partial<typeof pixelConfig.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (updates.platform !== undefined) updateData.platform = updates.platform;
    if (updates.pixelId !== undefined) updateData.pixelId = updates.pixelId;
    if (updates.accessToken !== undefined)
      updateData.accessToken = updates.accessToken;
    if (updates.enabled !== undefined) updateData.enabled = updates.enabled;
    if (updates.enableClientSide !== undefined)
      updateData.enableClientSide = updates.enableClientSide;
    if (updates.enableServerSide !== undefined)
      updateData.enableServerSide = updates.enableServerSide;
    if (updates.consentRequired !== undefined)
      updateData.consentRequired = updates.consentRequired;
    if (updates.consentCategory !== undefined)
      updateData.consentCategory = updates.consentCategory;
    if (updates.settings !== undefined) updateData.settings = updates.settings;

    const result = yield* query(async (db) => {
      return await db
        .update(pixelConfig)
        .set(updateData)
        .where(eq(pixelConfig.id, id))
        .returning();
    });

    const updated = result[0];
    if (!updated) {
      return yield* Effect.fail(
        new ServerError({
          tag: "NotFound",
          message: `Pixel config ${id} not found`,
          statusCode: 404,
          clientMessage: "Pixel configuration not found",
        }),
      );
    }

    return updated;
  });

export const deletePixelConfig = (id: string) =>
  Effect.gen(function* () {
    const result = yield* query(async (db) => {
      return await db
        .delete(pixelConfig)
        .where(eq(pixelConfig.id, id))
        .returning({ id: pixelConfig.id });
    });

    const deleted = result[0];
    if (!deleted) {
      return yield* Effect.fail(
        new ServerError({
          tag: "NotFound",
          message: `Pixel config ${id} not found`,
          statusCode: 404,
          clientMessage: "Pixel configuration not found",
        }),
      );
    }

    return deleted;
  });
