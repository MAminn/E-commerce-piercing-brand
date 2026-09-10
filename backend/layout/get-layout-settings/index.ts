import { db } from "#root/shared/database/drizzle/db";
import { layoutSettings } from "#root/shared/database/drizzle/schema";
import { eq, and } from "drizzle-orm";
import type { LayoutSettings } from "#root/shared/types/layout-settings";
import {
  DEFAULT_LAYOUT_SETTINGS,
  DEFAULT_LOGO_SIZE,
  DEFAULT_FOOTER_LOGO_SIZE,
} from "#root/shared/types/layout-settings";

/**
 * Fetches layout settings (header/footer) for a specific merchant and template.
 * Falls back chain: template-specific → "default" row → hardcoded defaults.
 */
export async function getLayoutSettings(
  merchantId: string,
  templateId?: string,
): Promise<LayoutSettings> {
  try {
    const database = db();
    const resolvedTemplateId = templateId || "default";

    // 1. Try template-specific content
    const result = await database
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
      const stored = result[0].content as unknown as LayoutSettings;
      return mergeWithDefaults(stored);
    }

    // 2. Fallback to legacy "default" row for backward compatibility
    if (resolvedTemplateId !== "default") {
      const fallback = await database
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
        const stored = fallback[0].content as unknown as LayoutSettings;
        return mergeWithDefaults(stored);
      }
    }

    // 3. Hardcoded defaults
    return DEFAULT_LAYOUT_SETTINGS;
  } catch (error) {
    console.error("Error fetching layout settings:", error);
    return DEFAULT_LAYOUT_SETTINGS;
  }
}

/**
 * Merges stored settings with defaults to ensure all required fields exist.
 * Prevents errors if the schema evolves or data is incomplete.
 */
function mergeWithDefaults(stored: Partial<LayoutSettings>): LayoutSettings {
  return {
    siteTitle: stored.siteTitle ?? DEFAULT_LAYOUT_SETTINGS.siteTitle,
    faviconUrl: stored.faviconUrl ?? DEFAULT_LAYOUT_SETTINGS.faviconUrl,
    shareImageUrl: stored.shareImageUrl ?? DEFAULT_LAYOUT_SETTINGS.shareImageUrl,
    translationOverrides: stored.translationOverrides ?? DEFAULT_LAYOUT_SETTINGS.translationOverrides,
    header: {
      ...DEFAULT_LAYOUT_SETTINGS.header,
      ...stored.header,
      logoSize: {
        ...DEFAULT_LOGO_SIZE,
        ...stored.header?.logoSize,
      },
      navigationLinks:
        stored.header?.navigationLinks ??
        DEFAULT_LAYOUT_SETTINGS.header.navigationLinks,
    },
    footer: {
      ...DEFAULT_LAYOUT_SETTINGS.footer,
      ...stored.footer,
      logoSize: {
        ...DEFAULT_FOOTER_LOGO_SIZE,
        ...stored.footer?.logoSize,
      },
      footerLinkGroups:
        stored.footer?.footerLinkGroups ??
        DEFAULT_LAYOUT_SETTINGS.footer.footerLinkGroups,
      socialLinks:
        stored.footer?.socialLinks ??
        DEFAULT_LAYOUT_SETTINGS.footer.socialLinks,
    },
  };
}
