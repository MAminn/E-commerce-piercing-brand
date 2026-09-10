import { useEffect, type ReactNode } from "react";
import { NoirFooter } from "./NoirFooter";
import { NoirNavbar } from "./NoirNavbar";
import { useMinimalI18n } from "#root/lib/i18n/MinimalI18nContext";
import { cn } from "#root/lib/utils";
import { NOIR_COLORS, NOIR_DISPLAY_FONT_CLASSES } from "./noir-tokens";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

interface NoirChromeProps {
  children: ReactNode;
  /** Announcement bar text — overrides the translated default. */
  announcementText?: string;
  /**
   * Admin preview mode — skips the <html data-noir-chrome> side effect
   * so the dashboard template previews don't restyle the page or hide
   * the global chrome.
   */
  previewMode?: boolean;
}

/* ------------------------------------------------------------------ */
/*  Announcement bar                                                  */
/* ------------------------------------------------------------------ */

function NoirAnnouncementBar({ text }: { text?: string }) {
  const { locale } = useMinimalI18n();
  const isAr = locale === "ar";
  const effectiveText =
    text || (isAr ? "شحن وإرجاع مجاني" : "Free shipping & returns");

  return (
    <div className='w-full bg-[#E8112D] text-white'>
      <p
        className={cn(
          "text-center text-[10px] uppercase font-medium py-1.5 px-4",
          // Letter-spacing gated off for Arabic (rule 8)
          isAr ? "" : "tracking-[0.28em]",
          NOIR_DISPLAY_FONT_CLASSES,
        )}>
        {effectiveText}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

/**
 * NoirChrome — wraps Noir (Demo 5) template pages.
 *
 * Follows the EditorialChrome precedent:
 * 1. Sets `data-noir-chrome="true"` on `<html>` (mount/unmount).
 *    The scoped CSS block in layouts/style.css hides `#global-navbar`
 *    and `#global-footer` and applies the Noir base canvas when set.
 * 2. Renders a NoirAnnouncementBar on top, NoirNavbar below it,
 *    children inside a full-width Noir canvas, and `<NoirFooter />`
 *    at the bottom.
 *
 * SSR-safe — attribute is set only in a `useEffect` (client-only).
 */
export function NoirChrome({
  children,
  announcementText,
  previewMode = false,
}: NoirChromeProps) {
  useEffect(() => {
    if (previewMode) return;
    document.documentElement.dataset.noirChrome = "true";
    return () => {
      delete document.documentElement.dataset.noirChrome;
    };
  }, [previewMode]);

  return (
    <div
      className='w-full min-h-screen'
      style={{
        backgroundColor: NOIR_COLORS.bgBase,
        color: NOIR_COLORS.textPrimary,
      }}>
      <NoirAnnouncementBar text={announcementText} />

      <NoirNavbar />

      {children}

      <NoirFooter />
    </div>
  );
}
