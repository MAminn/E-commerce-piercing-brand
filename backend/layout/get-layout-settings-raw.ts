import { layoutSettings } from "#root/shared/database/drizzle/schema";
import { eq, and } from "drizzle-orm";
import type { DatabaseClient } from "#root/shared/database/drizzle/db";
import type { LayoutSettings } from "#root/shared/types/layout-settings";
import {
  DEFAULT_LAYOUT_SETTINGS,
  DEFAULT_LOGO_SIZE,
  DEFAULT_FOOTER_LOGO_SIZE,
} from "#root/shared/types/layout-settings";
import { resolveLandingTemplateId } from "#root/shared/config/storefront";

/**
 * The layout settings the storefront shell renders, resolved from the stored
 * template selection.
 *
 * Both SSR entry points used to pass `templateSelection?.landing` straight
 * through. On a store that has never saved a template selection that is
 * `undefined`, so the storefront read the legacy `"default"` row (or the
 * hardcoded defaults) — while Dashboard > Layout Settings resolves the same
 * unset selection to the Percé preset (`landing-minimal`) and writes there.
 * An admin switching the footer newsletter OFF saved `showNewsletter: false`
 * into a row the storefront never looked at, and the shipped default (`true`)
 * kept rendering the signup. Resolving with the same helper the dashboard and
 * the homepage `+data.ts` use makes both sides agree on the row; the
 * `"default"` row is still the fallback when no template row exists.
 */
export async function getStorefrontLayoutSettingsRaw(
  db: DatabaseClient,
  merchantId: string,
  templateSelection: Record<string, string> | undefined | null,
): Promise<LayoutSettings> {
  return getLayoutSettingsRaw(
    db,
    merchantId,
    resolveLandingTemplateId(templateSelection),
  );
}

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
