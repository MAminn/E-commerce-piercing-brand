/**
 * "Which listing did this product page come from?" — so the product page's
 * Shop breadcrumb can return to the exact listing state (page, sort, search,
 * filters) instead of a bare /shop, without putting listing parameters in
 * the product URL.
 *
 *   1. Every listing writes its current URL to sessionStorage (per tab) as
 *      it changes — the last write is the state the shopper left from.
 *   2. A product page reached straight from a listing (Vike's
 *      previousPageContext is that listing's path) adopts the stored URL and
 *      pins it to its own history entry (history.state), so a reload, or
 *      coming back to the entry with Back/Forward, keeps the same origin.
 *   3. A product page reached any other way (home, search, a related
 *      product, a shared link) has no origin: the breadcrumb is plain /shop.
 *
 * Everything read back is validated: only same-site /shop and
 * /categories/<slug> URLs are ever used as an href.
 */

const STORAGE_KEY = "perce:listing-origin";
const STATE_KEY = "perceListingOrigin";
const MAX_URL_LENGTH = 2000;

export interface ListingOrigin {
  /** Path + query of the listing, e.g. "/shop?category=nose-piercings&page=3". */
  url: string;
  /** Set for a category page, for the breadcrumb label. */
  categoryName?: string;
}

export function pathnameOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url, "https://listing.invalid").pathname;
  } catch {
    return null;
  }
}

export function isListingPath(pathname: string | null | undefined): boolean {
  return !!pathname && (pathname === "/shop" || /^\/categories\/[^/]+\/?$/.test(pathname));
}

export function sanitizeListingOrigin(raw: unknown): ListingOrigin | null {
  if (!raw || typeof raw !== "object") return null;
  const { url, categoryName } = raw as Record<string, unknown>;
  if (typeof url !== "string" || url.length > MAX_URL_LENGTH) return null;
  // Same-site paths only: no "//host", no "https:", no "javascript:".
  if (!url.startsWith("/") || url.startsWith("//") || url.includes("\\")) return null;
  let parsed: URL;
  try {
    parsed = new URL(url, "https://listing.invalid");
  } catch {
    return null;
  }
  if (parsed.origin !== "https://listing.invalid" || !isListingPath(parsed.pathname)) return null;
  return {
    url: parsed.pathname + parsed.search,
    ...(typeof categoryName === "string" && categoryName.trim() && categoryName.length <= 200
      ? { categoryName: categoryName.trim() }
      : {}),
  };
}

/** Called by listings whenever their URL changes. */
export function rememberListingOrigin(origin: ListingOrigin): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(origin));
  } catch {
    // Storage blocked (private mode, quota): the breadcrumb falls back to /shop.
  }
}

function readStoredOrigin(): ListingOrigin | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw ? sanitizeListingOrigin(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function originOnThisEntry(): ListingOrigin | null {
  const state = window.history.state as Record<string, unknown> | null;
  return sanitizeListingOrigin(state?.[STATE_KEY]);
}

/**
 * The listing this product page entry belongs to, or null. `previousUrl` is
 * Vike's `previousPageContext.urlOriginal` (null on a first render).
 */
export function resolveListingOrigin(previousUrl: string | null | undefined): ListingOrigin | null {
  const pinned = originOnThisEntry();
  if (pinned) return pinned;

  const previousPath = pathnameOf(previousUrl);
  if (!isListingPath(previousPath)) return null;
  const stored = readStoredOrigin();
  // The stored URL must be the listing we just left (Vike's previous URL is
  // the one it rendered; the listing's own query changes happen after that,
  // so compare paths and take the stored, up-to-date query).
  if (!stored || pathnameOf(stored.url) !== previousPath) return null;

  try {
    // Pin it to this entry (same URL; Vike's own state is kept).
    window.history.replaceState({ ...(window.history.state ?? {}), [STATE_KEY]: stored }, "");
  } catch {
    // Not fatal: the breadcrumb still works for this render.
  }
  return stored;
}

/**
 * True when Back from this entry lands exactly on `origin` — the product was
 * opened straight from that listing in this tab and nothing was pushed since.
 * Back then also restores the listing's scroll position, which a fresh
 * navigation to the same URL cannot.
 */
export function canReturnWithBack(origin: ListingOrigin, previousUrl: string | null | undefined): boolean {
  return (
    !!previousUrl &&
    pathnameOf(previousUrl) === pathnameOf(origin.url) &&
    originOnThisEntry()?.url === origin.url
  );
}
