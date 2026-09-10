import { query } from "#root/shared/database/drizzle/db";
import { storeSettings } from "#root/shared/database/drizzle/schema";
import { eq } from "drizzle-orm";
import { Effect } from "effect";

interface PresetValue {
  value: string;
  priceModifier?: number;
}

interface VariantPreset {
  id: string;
  name: string;
  values: PresetValue[];
  defaultValue?: string;
  strikethroughValues?: string[];
}

export const updateVariantPresets = (presets: VariantPreset[]) =>
  Effect.gen(function* ($) {
    const updated = yield* $(
      query(async (db) => {
        const result = await db
          .update(storeSettings)
          .set({ variantPresets: presets, updatedAt: new Date() })
          .where(eq(storeSettings.key, "default"))
          .returning();
        return result;
      }),
    );

    if (updated.length > 0) {
      return (updated[0]!.variantPresets ?? []) as VariantPreset[];
    }

    // No row exists yet — insert one
    const inserted = yield* $(
      query(async (db) => {
        const result = await db
          .insert(storeSettings)
          .values({ key: "default", variantPresets: presets })
          .returning();
        return result;
      }),
    );

    return (inserted[0]!.variantPresets ?? []) as VariantPreset[];
  });
