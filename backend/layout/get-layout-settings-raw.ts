import { layoutSettings } from "#root/shared/database/drizzle/schema";
import { eq, and } from "drizzle-orm";
import type { DatabaseClient } from "#root/shared/database/drizzle/db";
import type { LayoutSettings } from "#root/shared/types/layout-settings";
import {
  DEFAULT_LAYOUT_SETTINGS,
  DEFAULT_LOGO_SIZE,
  DEFAULT_FOOTER_LOGO_SIZE,
} from "#root/shared/types/layout-settings";

/**
 * Direct database query for SSR layout-settings injection.
 * Accepts the request-scoped `DatabaseClient` (not the singleton)
 * so it works in the server render path without Effect.
 */
export async function getLayoutSettingsRaw(
  db: DatabaseClient,
  merchantId: string,
  templateId?: string,
): Promise<LayoutSettings> {
  try {
    const resolvedTemplateId = templateId || "default";

    const result = await db
      .select()
      .from(layoutSettings)
      .where(
        and(
          eq(layoutSettings.merchantId, merchantId),
          eq(layoutSettings.templateId, resolvedTemplateId),
        ),
      )
      .limit(1);

    if (result.length > 0 && result[0]?.content) {
      return mergeWithDefaults(result[0].content as unknown as LayoutSettings);
    }

    // Fallback to "default" row
    if (resolvedTemplateId !== "default") {
      const fallback = await db
        .select()
        .from(layoutSettings)
        .where(
          and(
            eq(layoutSettings.merchantId, merchantId),
            eq(layoutSettings.templateId, "default"),
          ),
        )
        .limit(1);

      if (fallback.length > 0 && fallback[0]?.content) {
        return mergeWithDefaults(fallback[0].content as unknown as LayoutSettings);
      }
    }

    return DEFAULT_LAYOUT_SETTINGS;
  } catch {
    return DEFAULT_LAYOUT_SETTINGS;
  }
}

function mergeWithDefaults(stored: Partial<LayoutSettings>): LayoutSettings {
  return {
    siteTitle: stored.siteTitle ?? DEFAULT_LAYOUT_SETTINGS.siteTitle,
    faviconUrl: stored.faviconUrl ?? DEFAULT_LAYOUT_SETTINGS.faviconUrl,
    shareImageUrl: stored.shareImageUrl ?? DEFAULT_LAYOUT_SETTINGS.shareImageUrl,
    translationOverrides: stored.translationOverrides ?? DEFAULT_LAYOUT_SETTINGS.translationOverrides,
    header: {
      ...DEFAULT_LAYOUT_SETTINGS.header,
      ...stored.header,
      logoSize: { ...DEFAULT_LOGO_SIZE, ...stored.header?.logoSize },
      navigationLinks:
        stored.header?.navigationLinks ??
        DEFAULT_LAYOUT_SETTINGS.header.navigationLinks,
    },
    footer: {
      ...DEFAULT_LAYOUT_SETTINGS.footer,
      ...stored.footer,
      logoSize: { ...DEFAULT_FOOTER_LOGO_SIZE, ...stored.footer?.logoSize },
      footerLinkGroups:
        stored.footer?.footerLinkGroups ??
        DEFAULT_LAYOUT_SETTINGS.footer.footerLinkGroups,
      socialLinks:
        stored.footer?.socialLinks ??
        DEFAULT_LAYOUT_SETTINGS.footer.socialLinks,
    },
  };
}
