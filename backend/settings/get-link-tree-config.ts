import { query } from "#root/shared/database/drizzle/db";
import { storeSettings } from "#root/shared/database/drizzle/schema";
import { eq } from "drizzle-orm";
import { Effect } from "effect";
import {
  linkTreeConfigSchema,
  DEFAULT_LINK_TREE_CONFIG,
  type LinkTreeConfig,
} from "#root/shared/types/link-tree";

/**
 * Get the link tree configuration from the store_settings table.
 * If no row exists or the field is empty, returns defaults.
 */
export const getLinkTreeConfig = () =>
  Effect.gen(function* ($) {
    const rows = yield* $(
      query(async (db) =>
        db
          .select({ linkTreeConfig: storeSettings.linkTreeConfig })
          .from(storeSettings)
          .where(eq(storeSettings.key, "default"))
          .limit(1),
      ),
    );

    const raw = rows[0]?.linkTreeConfig;
    if (!raw || typeof raw !== "object") return DEFAULT_LINK_TREE_CONFIG;

    const parsed = linkTreeConfigSchema.safeParse(raw);
    return parsed.success ? parsed.data : DEFAULT_LINK_TREE_CONFIG;
  });

/**
 * Raw (non-Effect) version for SSR / public page rendering.
 */
export async function getLinkTreeConfigRaw(
  db: Pick<Parameters<Parameters<typeof query>[0]>[0], "select">,
): Promise<LinkTreeConfig> {
  const rows = await db
    .select({ linkTreeConfig: storeSettings.linkTreeConfig })
    .from(storeSettings)
    .where(eq(storeSettings.key, "default"))
    .limit(1);

  const raw = rows[0]?.linkTreeConfig;
  if (!raw || typeof raw !== "object") return DEFAULT_LINK_TREE_CONFIG;

  const parsed = linkTreeConfigSchema.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_LINK_TREE_CONFIG;
}
