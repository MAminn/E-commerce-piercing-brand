import { db, query } from "#root/shared/database/drizzle/db";
import { storeSettings } from "#root/shared/database/drizzle/schema";
import type { PopupConfig, PopupDiscountConfig } from "#root/shared/database/drizzle/schema";
import { eq } from "drizzle-orm";
import { Effect } from "effect";
import { ServerError } from "#root/shared/error/server";
import { DEFAULT_POPUP_CONFIG, DEFAULT_POPUP_DISCOUNT_CONFIG } from "./defaults";

export const getPopupConfig = () =>
  Effect.gen(function* ($) {
    const rows = yield* $(
      query(async (db) =>
        db
          .select({ popupConfig: storeSettings.popupConfig })
          .from(storeSettings)
          .where(eq(storeSettings.key, "default"))
          .limit(1),
      ),
    );
    return { ...DEFAULT_POPUP_CONFIG, ...(rows[0]?.popupConfig ?? {}) };
  });

export const updatePopupConfig = (config: PopupConfig) =>
  Effect.gen(function* ($) {
    const updated = yield* $(
      query(async (db) =>
        db
          .update(storeSettings)
          .set({ popupConfig: config, updatedAt: new Date() })
          .where(eq(storeSettings.key, "default"))
          .returning(),
      ),
    );
    if (updated.length > 0) {
      return { popupConfig: updated[0]!.popupConfig as PopupConfig };
    }

    const inserted = yield* $(
      query(async (db) =>
        db.insert(storeSettings).values({ key: "default", popupConfig: config }).returning(),
      ),
    );
    if (!inserted[0]) {
      return yield* $(
        Effect.fail(
          new ServerError({
            tag: "FailedToUpdatePopupConfig",
            statusCode: 500,
            clientMessage: "Failed to save popup settings",
          }),
        ),
      );
    }
    return { popupConfig: inserted[0].popupConfig as PopupConfig };
  });

/** Admin-only — never expose through a public procedure (see schema.ts PopupDiscountConfig doc comment). */
export const getPopupDiscountConfig = () =>
  Effect.gen(function* ($) {
    const rows = yield* $(
      query(async (db) =>
        db
          .select({ popupDiscountConfig: storeSettings.popupDiscountConfig })
          .from(storeSettings)
          .where(eq(storeSettings.key, "default"))
          .limit(1),
      ),
    );
    return { ...DEFAULT_POPUP_DISCOUNT_CONFIG, ...(rows[0]?.popupDiscountConfig ?? {}) };
  });

export const updatePopupDiscountConfig = (config: PopupDiscountConfig) =>
  Effect.gen(function* ($) {
    const updated = yield* $(
      query(async (db) =>
        db
          .update(storeSettings)
          .set({ popupDiscountConfig: config, updatedAt: new Date() })
          .where(eq(storeSettings.key, "default"))
          .returning(),
      ),
    );
    if (updated.length > 0) {
      return { popupDiscountConfig: updated[0]!.popupDiscountConfig as PopupDiscountConfig };
    }

    const inserted = yield* $(
      query(async (db) =>
        db
          .insert(storeSettings)
          .values({ key: "default", popupDiscountConfig: config })
          .returning(),
      ),
    );
    if (!inserted[0]) {
      return yield* $(
        Effect.fail(
          new ServerError({
            tag: "FailedToUpdatePopupDiscountConfig",
            statusCode: 500,
            clientMessage: "Failed to save popup discount settings",
          }),
        ),
      );
    }
    return {
      popupDiscountConfig: inserted[0].popupDiscountConfig as PopupDiscountConfig,
    };
  });

/** Plain-async variant for the claim flow (non-Effect context, matches order-log.ts's convention). */
export async function getPopupDiscountConfigRaw(): Promise<PopupDiscountConfig> {
  const rows = await db()
    .select({ popupDiscountConfig: storeSettings.popupDiscountConfig })
    .from(storeSettings)
    .where(eq(storeSettings.key, "default"))
    .limit(1);
  return { ...DEFAULT_POPUP_DISCOUNT_CONFIG, ...(rows[0]?.popupDiscountConfig ?? {}) };
}
