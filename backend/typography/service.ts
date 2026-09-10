import { db as dbSingleton, query } from "#root/shared/database/drizzle/db";
import type { DatabaseClient } from "#root/shared/database/drizzle/db";
import { customFontFile, storeSettings } from "#root/shared/database/drizzle/schema";
import type {
  CustomFontFileRow,
  TypographySettings,
} from "#root/shared/database/drizzle/schema";
import { and, eq } from "drizzle-orm";
import { Effect } from "effect";
import { ServerError } from "#root/shared/error/server";
import { DEFAULT_TYPOGRAPHY_SETTINGS } from "./defaults";
import { deleteFontFileFromDisk } from "./font-upload";

// ─── Font files ─────────────────────────────────────────────────────────────

export const listCustomFonts = () =>
  query(async (db) =>
    db
      .select()
      .from(customFontFile)
      .orderBy(customFontFile.familyName, customFontFile.weight),
  );

/**
 * Plain-async variant for SSR (+Head.tsx font-face generation) — non-Effect
 * context. Accepts the request-scoped DatabaseClient (matches
 * getLayoutSettingsRaw's convention in server/server.ts and
 * server/vike-handler.ts); falls back to the singleton when called outside
 * a request (e.g. background contexts).
 */
export async function listCustomFontsRaw(
  db: DatabaseClient = dbSingleton(),
): Promise<CustomFontFileRow[]> {
  return db
    .select()
    .from(customFontFile)
    .orderBy(customFontFile.familyName, customFontFile.weight);
}

export const addCustomFontFile = (row: {
  familyName: string;
  weight: number;
  style: "normal" | "italic";
  fileUrl: string;
  format: "woff2" | "woff" | "ttf";
}) =>
  query(async (db) =>
    db
      .insert(customFontFile)
      .values(row)
      .onConflictDoUpdate({
        target: [customFontFile.familyName, customFontFile.weight, customFontFile.style],
        set: { fileUrl: row.fileUrl, format: row.format },
      })
      .returning(),
  );

export const deleteCustomFontFileById = (id: string) =>
  Effect.gen(function* ($) {
    const deleted = yield* $(
      query(async (db) =>
        db.delete(customFontFile).where(eq(customFontFile.id, id)).returning(),
      ),
    );
    const row = deleted[0];
    if (!row) {
      return yield* $(
        Effect.fail(
          new ServerError({
            tag: "FontFileNotFound",
            statusCode: 404,
            clientMessage: "Font file not found",
          }),
        ),
      );
    }

    yield* $(Effect.promise(() => deleteFontFileFromDisk(row.fileUrl)));

    // If no file remains for this exact family+weight (any style), any role
    // assigned to it no longer resolves to a real @font-face — clear it back
    // to "use default" rather than silently pointing at nothing.
    const remaining = yield* $(
      query(async (db) =>
        db
          .select({ id: customFontFile.id })
          .from(customFontFile)
          .where(
            and(
              eq(customFontFile.familyName, row.familyName),
              eq(customFontFile.weight, row.weight),
            ),
          )
          .limit(1),
      ),
    );
    if (remaining.length === 0) {
      const settings = yield* $(getTypographySettings());
      let changed = false;
      const nextRoles = { ...settings.roles };
      for (const key of Object.keys(nextRoles) as Array<keyof typeof nextRoles>) {
        const assignment = nextRoles[key];
        if (
          assignment &&
          assignment.familyName === row.familyName &&
          assignment.weight === row.weight
        ) {
          nextRoles[key] = null;
          changed = true;
        }
      }
      if (changed) {
        yield* $(updateTypographySettings({ roles: nextRoles }));
      }
    }

    return row;
  });

// ─── Role settings ──────────────────────────────────────────────────────────

export const getTypographySettings = () =>
  Effect.gen(function* ($) {
    const rows = yield* $(
      query(async (db) =>
        db
          .select({ typographySettings: storeSettings.typographySettings })
          .from(storeSettings)
          .where(eq(storeSettings.key, "default"))
          .limit(1),
      ),
    );
    const stored = rows[0]?.typographySettings;
    return {
      roles: { ...DEFAULT_TYPOGRAPHY_SETTINGS.roles, ...(stored?.roles ?? {}) },
    };
  });

export const updateTypographySettings = (settings: TypographySettings) =>
  Effect.gen(function* ($) {
    const updated = yield* $(
      query(async (db) =>
        db
          .update(storeSettings)
          .set({ typographySettings: settings, updatedAt: new Date() })
          .where(eq(storeSettings.key, "default"))
          .returning(),
      ),
    );
    if (updated.length > 0) {
      return { typographySettings: updated[0]!.typographySettings as TypographySettings };
    }

    const inserted = yield* $(
      query(async (db) =>
        db
          .insert(storeSettings)
          .values({ key: "default", typographySettings: settings })
          .returning(),
      ),
    );
    if (!inserted[0]) {
      return yield* $(
        Effect.fail(
          new ServerError({
            tag: "FailedToUpdateTypographySettings",
            statusCode: 500,
            clientMessage: "Failed to save typography settings",
          }),
        ),
      );
    }
    return { typographySettings: inserted[0].typographySettings as TypographySettings };
  });

/** Plain-async variant for SSR (+Head.tsx) — non-Effect context. Accepts the request-scoped DatabaseClient, same convention as listCustomFontsRaw above. */
export async function getTypographySettingsRaw(
  db: DatabaseClient = dbSingleton(),
): Promise<TypographySettings> {
  const rows = await db
    .select({ typographySettings: storeSettings.typographySettings })
    .from(storeSettings)
    .where(eq(storeSettings.key, "default"))
    .limit(1);
  const stored = rows[0]?.typographySettings;
  return {
    roles: { ...DEFAULT_TYPOGRAPHY_SETTINGS.roles, ...(stored?.roles ?? {}) },
  };
}
