import { createContext, useContext } from "react";

/**
 * Navbar display mode:
 *
 * "overlay"  — Transparent at top, fixed over content, transitions to solid
 *              on scroll. Used on pages with hero sections (Landing, Shop).
 *
 * "solid"    — Solid background from the start, sticky so it occupies layout
 *              space. Content is automatically pushed below. Used on pages
 *              without hero sections (Product, Cart, Checkout, etc.).
 */
export type NavbarMode = "overlay" | "solid";

export const NavbarModeContext = createContext<NavbarMode>("overlay");

export function useNavbarMode(): NavbarMode {
  return useContext(NavbarModeContext);
}

// ─── Route → Mode mapping ──────────────────────────────────────────────

/**
 * Overlay routes: pages that have a full-bleed hero and expect the navbar
 * to float transparently over it.
 *
 * Everything else gets solid mode automatically.
 */
const OVERLAY_ROUTES: ((path: string) => boolean)[] = [
  // Landing / homepage
  (p) => p === "/",
  // Shop collection (has dark hero banner)
  (p) => p === "/shop",
  // Dynamic category pages (use SortingMinimalTemplate with dark hero)
  (p) => p.startsWith("/categories/"),
];

/**
 * Determine navbar mode from the current URL pathname.
 * Solid is the safe default — only explicitly listed routes get overlay.
 */
export function getNavbarMode(pathname: string): NavbarMode {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  return OVERLAY_ROUTES.some((match) => match(normalized))
    ? "overlay"
    : "solid";
}
