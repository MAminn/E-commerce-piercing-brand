import type { ClientSession } from "./backend/auth/shared/entities";
import type { DatabaseClient } from "./shared/database/drizzle/db";
import type { LayoutSettings } from "./shared/types/layout-settings";
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
