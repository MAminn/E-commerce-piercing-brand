/// <reference lib="webworker" />
import { renderPage } from "vike/server";
import { createMiddleware } from "hono/factory";
import { getTemplateSelectionRaw } from "#root/backend/settings/get-template-selection-raw.js";
import { getLayoutSettingsRaw } from "#root/backend/layout/get-layout-settings-raw.js";
import { getLinkTreeConfigRaw } from "#root/backend/settings/get-link-tree-config.js";
import { getStoreOwnerId } from "#root/shared/config/store.js";
import {
  getTypographySettingsRaw,
  listCustomFontsRaw,
} from "#root/backend/typography/service.js";
import { listActiveClientConfigsRaw } from "#root/backend/pixel-tracking/pixel-config/ssr.js";
import { PixelPlatform } from "#root/shared/types/pixel-tracking.js";

export const vikeHonoMiddleware = createMiddleware(
  async (c) => {
    // Fetch template selection for SSR to prevent hydration flicker
    const templateSelection = await getTemplateSelectionRaw(c.var.db);
    // Fetch layout settings for SSR to prevent navbar/footer flicker
    const activeLandingTemplate = templateSelection?.landing;
    const layoutSettingsData = await getLayoutSettingsRaw(
      c.var.db,
      getStoreOwnerId(),
      activeLandingTemplate,
    );
    // Fetch brand name from link-tree config for dynamic page titles
    const linkTreeConfig = await getLinkTreeConfigRaw(c.var.db);
    const brandName = linkTreeConfig.brandName || undefined;
    // Fetch admin-configured typography (custom fonts + role assignments)
    // for SSR so the correct @font-face/CSS vars render on first paint
    const typographySettings = await getTypographySettingsRaw(c.var.db);
    const customFonts = await listCustomFontsRaw(c.var.db);
    // Fetch the active GA4 config for SSR so the gtag script is present in
    // the raw HTML rather than only loading after client hydration/tRPC
    const activePixelConfigs = await listActiveClientConfigsRaw(c.var.db);
    const activeGA4PixelId =
      activePixelConfigs.find((p) => p.platform === PixelPlatform.GOOGLE_GA4)
        ?.pixelId ?? null;

    // Read locale from cookie for SSR (prevents EN→AR flicker)
    const cookieHeader = c.req.header("cookie") ?? "";
    const localeMatch = cookieHeader.match(/(?:^|;\s*)minimal-locale=(en|ar)/);
    const ssrLocale = (localeMatch?.[1] as "en" | "ar") ?? "en";

    const pageContextInit = {
      db: c.var.db,
      clientSession: c.var.clientSession,
      urlOriginal: c.req.url,
      headersOriginal: c.req.raw.headers,
      templateSelection,
      layoutSettingsData,
      brandName,
      ssrLocale,
      typographySettings,
      customFonts,
      activeGA4PixelId,
    };
    const pageContext = await renderPage(pageContextInit);
    const response = pageContext.httpResponse;

    const { readable, writable } = new TransformStream();
    response.pipe(writable);

    return new Response(readable, {
      status: response.statusCode,
      headers: response.headers,
    });
  }
);
