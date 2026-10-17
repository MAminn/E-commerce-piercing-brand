import { useCallback, useMemo, useSyncExternalStore } from "react";
import { usePageContext } from "vike-react/usePageContext";
import {
  type ListingSort,
  type ListingState,
  parseListingParams,
  serializeListingParams,
} from "#root/shared/products/listing-params";

/**
 * The shop / category listing state, read from and written to the URL.
 *
 * Why not Vike's `navigate()`: every navigate() — even to the same page —
 * runs the page-transition hooks, which fade the full-screen overlay and emit
 * a `page_viewed` tracking event. A filter click is neither a new page nor a
 * page view. So changes go through `history.pushState()` (Vike patches it and
 * leaves same-page entries to us) and this hook re-reads `location.search`
 * on its own events and on `popstate`.
 *
 * The browser keeps one history entry per committed change (page, sort,
 * filter), so Back and Forward walk through them; typing in search replaces
 * the current entry instead of stacking one per keystroke.
 */

const LISTING_URL_EVENT = "perce:listing-url";

/**
 * Scroll position to restore after a same-page Back/Forward. Vike restores
 * scroll itself when Back crosses pages (product → shop), but for two entries
 * of the same page it skips rendering — and scrolling — and leaves both to us.
 */
let pendingScroll: { pathname: string; x: number; y: number } | null = null;

function readScrollFromHistory(): { x: number; y: number } | null {
  const pos = (window.history.state as { vike?: { scrollPosition?: unknown } } | null)?.vike
    ?.scrollPosition as { x?: unknown; y?: unknown } | null | undefined;
  return pos && typeof pos.x === "number" && typeof pos.y === "number"
    ? { x: pos.x, y: pos.y }
    : null;
}

/** The saved scroll position for `pathname`, once; null when there is none. */
export function takePendingListingScroll(pathname: string): { x: number; y: number } | null {
  if (!pendingScroll || pendingScroll.pathname !== pathname) return null;
  const { x, y } = pendingScroll;
  pendingScroll = null;
  return { x, y };
}

function getSearchSnapshot(): string {
  return window.location.search;
}

export interface SetListingOptions {
  /** Replace the current history entry instead of adding one. */
  replace?: boolean;
}

export interface ListingUrlState {
  state: ListingState;
  /** The raw query string ("" or "?…"), for building hrefs that keep it. */
  search: string;
  pathname: string;
  setListing: (next: ListingState, options?: SetListingOptions) => void;
  /** The URL `next` would have on this page — for real `<a href>`s. */
  hrefFor: (next: ListingState, pathname?: string) => string;
}

/**
 * `location.search` as React state: updates on Vike navigations, on
 * listing changes made through useListingUrlState, and on Back/Forward.
 */
export function useLocationSearch(): { search: string; pathname: string } {
  const pageContext = usePageContext();
  const pathname = pageContext.urlPathname;

  const subscribe = useCallback(
    (onChange: () => void) => {
      const onPopState = () => {
        if (window.location.pathname === pathname) {
          const pos = readScrollFromHistory();
          pendingScroll = pos ? { pathname, ...pos } : null;
        }
        onChange();
      };
      window.addEventListener("popstate", onPopState);
      window.addEventListener(LISTING_URL_EVENT, onChange);
      return () => {
        window.removeEventListener("popstate", onPopState);
        window.removeEventListener(LISTING_URL_EVENT, onChange);
      };
    },
    [pathname],
  );

  const search = useSyncExternalStore(
    subscribe,
    getSearchSnapshot,
    // Server render and hydration: the URL Vike rendered.
    () => (pageContext.urlParsed as { searchOriginal?: string | null }).searchOriginal ?? "",
  );
  return { search, pathname };
}

export function useListingUrlState({
  allowCategories = true,
  defaultSort = "featured",
}: { allowCategories?: boolean; defaultSort?: ListingSort } = {}): ListingUrlState {
  const { search, pathname } = useLocationSearch();

  const state = useMemo(
    () => parseListingParams(search, { allowCategories, defaultSort }),
    [search, allowCategories, defaultSort],
  );

  const hrefFor = useCallback(
    (next: ListingState, targetPathname = pathname) =>
      `${targetPathname}${serializeListingParams(next, search, targetPathname === pathname ? { defaultSort } : {})}`,
    [pathname, search, defaultSort],
  );

  const setListing = useCallback(
    (next: ListingState, { replace = false }: SetListingOptions = {}) => {
      const url = `${window.location.pathname}${serializeListingParams(next, window.location.search, { defaultSort })}${window.location.hash}`;
      const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (url === current) return;
      if (replace) {
        // Keep Vike's bookkeeping (timestamp, scroll) on the entry.
        window.history.replaceState(window.history.state, "", url);
      } else {
        window.history.pushState({}, "", url);
      }
      window.dispatchEvent(new Event(LISTING_URL_EVENT));
    },
    [defaultSort],
  );

  return { state, search, pathname, setListing, hrefFor };
}
