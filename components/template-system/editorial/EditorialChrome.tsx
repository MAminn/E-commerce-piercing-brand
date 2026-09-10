import { useEffect, type ReactNode } from "react";
import { EditorialFooter } from "./EditorialFooter";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

interface EditorialChromeProps {
  children: ReactNode;
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

/**
 * EditorialChrome — wraps editorial template pages.
 *
 * 1. Sets `data-editorial-chrome="true"` on `<html>` (mount/unmount).
 *    Global CSS rule hides `#global-footer` when set.
 * 2. Renders `<EditorialFooter />` below content.
 *
 * The navbar is now controlled globally via layout settings (navbarStyle).
 * SSR-safe — attribute is set only in a `useEffect` (client-only).
 */
export function EditorialChrome({ children }: EditorialChromeProps) {
  useEffect(() => {
    document.documentElement.dataset.editorialChrome = "true";
    return () => {
      delete document.documentElement.dataset.editorialChrome;
    };
  }, []);

  return (
    <>
      {children}
      <EditorialFooter />
    </>
  );
}
