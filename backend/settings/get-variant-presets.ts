import { query } from "#root/shared/database/drizzle/db";
import { storeSettings } from "#root/shared/database/drizzle/schema";
import { eq } from "drizzle-orm";
import { Effect } from "effect";

export const getVariantPresets = () =>
  Effect.gen(function* ($) {
    const rows = yield* $(
      query(async (db) =>
        db
          .select({ variantPresets: storeSettings.variantPresets })
          .from(storeSettings)
          .where(eq(storeSettings.key, "default"))
          .limit(1),
      ),
    );

    type PresetValue = { value: string; priceModifier?: number };
    type Preset = { id: string; name: string; values: PresetValue[]; defaultValue?: string; strikethroughValues?: string[] };

    const raw = (rows[0]?.variantPresets ?? []) as Array<{
      id: string;
      name: string;
      values: (string | PresetValue)[];
      defaultValue?: string;
      strikethroughValues?: string[];
    }>;

    // Normalize: old presets stored values as plain strings — convert to objects
    return raw.map((p) => ({
      ...p,
      values: p.values.map((v) =>
        typeof v === "string" ? { value: v } : v,
      ) as PresetValue[],
    })) as Preset[];
  });
