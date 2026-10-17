import { useEffect, useReducer, useRef } from "react";

/**
 * A tiny keyed query cache for storefront listings.
 *
 * Results live in a module-level cache shared by every mount, and a cached
 * key is returned synchronously on the very first render. That is what makes
 * Back from a product page land exactly: the shop page remounts with the
 * same grid it had, at the same height, before Vike restores the scroll
 * position — not on a skeleton that the saved position overshoots.
 *
 * Entries younger than `FRESH_MS` are served without a request; older ones
 * are served immediately and refreshed in the background (stock and prices
 * can change while a shopper browses). Identical in-flight requests share
 * one promise.
 */

const FRESH_MS = 2 * 60_000;
const MAX_ENTRIES = 60;

interface Entry {
  data: unknown;
  at: number;
}

const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();

function remember(key: string, data: unknown) {
  cache.delete(key);
  cache.set(key, { data, at: Date.now() });
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

function load<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  let promise = inflight.get(key) as Promise<T> | undefined;
  if (!promise) {
    promise = fetcher()
      .then((data) => {
        remember(key, data);
        return data;
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, promise);
  }
  return promise;
}

/** Test seam: forget every cached result. */
export function clearQueryCache() {
  cache.clear();
  inflight.clear();
}

export interface CachedQuery<T> {
  /** Data for the current key, or undefined until it arrives. */
  data: T | undefined;
  /** The most recent data for any key — kept on screen while a new key loads. */
  previous: T | undefined;
  /** No data for the current key yet and no error. */
  isLoading: boolean;
  failed: boolean;
  retry: () => void;
}

/**
 * `key` null means "not ready to ask yet" (e.g. waiting for categories).
 * `fetcher` must return the data for `key`; it is read when a request starts.
 */
export function useCachedQuery<T>(key: string | null, fetcher: () => Promise<T>): CachedQuery<T> {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const [attempt, retry] = useReducer((n: number) => n + 1, 0);
  const failedKey = useRef<string | null>(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const entry = key ? cache.get(key) : undefined;
  const lastData = useRef<T | undefined>(undefined);
  if (entry) lastData.current = entry.data as T;

  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` re-runs a failed request on retry()
  useEffect(() => {
    if (!key) return;
    const existing = cache.get(key);
    if (existing && Date.now() - existing.at < FRESH_MS) return;
    let cancelled = false;
    failedKey.current = null;
    load(key, () => fetcherRef.current())
      .then(() => {
        if (!cancelled) rerender();
      })
      .catch((err) => {
        console.error("Listing request failed:", err);
        if (cancelled) return;
        failedKey.current = key;
        rerender();
      });
    return () => {
      cancelled = true;
    };
  }, [key, attempt]);

  const failed = !!key && !entry && failedKey.current === key;
  return {
    data: entry?.data as T | undefined,
    previous: lastData.current,
    isLoading: !!key && !entry && !failed,
    failed,
    retry,
  };
}
