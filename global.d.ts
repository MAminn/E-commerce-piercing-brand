import type { ClientSession } from "./backend/auth/shared/entities";
import type { DatabaseClient } from "./shared/database/drizzle/db";
import type { LayoutSettings } from "./shared/types/layout-settings";
import type { PublishedLegalPage } from "./shared/legal/legal-pages";
import type {
  CustomFontFileRow,
  TypographySettings,
} from "./shared/database/drizzle/schema";

declare global {
  namespace Vike {
    interface PageContext {
      db: DatabaseClient;
      clientSession?: ClientSession;
      templateSelection?: Record<string, string>;
      layoutSettingsData?: LayoutSettings;
      /** Legal pages that are live — drives the footer's policy links. */
      legalPages?: PublishedLegalPage[];
      brandName?: string;
      ssrLocale?: "en" | "ar";
      typographySettings?: TypographySettings;
      customFonts?: CustomFontFileRow[];
      activeGA4PixelId?: string | null;
    }
  }

  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

// biome-ignore lint/complexity/noUselessEmptyExport: ensure that the file is considered as a module
export {};
