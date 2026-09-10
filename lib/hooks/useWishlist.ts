import { useState, useCallback, useEffect } from "react";

const WISHLIST_STORAGE_KEY = "minimal-wishlist";

function readWishlist(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(WISHLIST_STORAGE_KEY);
    if (raw) return JSON.parse(raw) as string[];
  } catch {}
  return [];
}

function writeWishlist(ids: string[]) {
  try {
    localStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(ids));
  } catch {}
}

/**
 * localStorage-backed wishlist for the minimal template.
 * Stores product IDs. No server-side persistence.
 */
export function useWishlist() {
  const [items, setItems] = useState<string[]>(readWishlist);

  // Sync across tabs
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === WISHLIST_STORAGE_KEY) {
        setItems(readWishlist());
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const toggle = useCallback((productId: string) => {
    setItems((prev) => {
      const next = prev.includes(productId)
        ? prev.filter((id) => id !== productId)
        : [...prev, productId];
      writeWishlist(next);
      return next;
    });
  }, []);

  const isWishlisted = useCallback(
    (productId: string) => items.includes(productId),
    [items],
  );

  return { items, toggle, isWishlisted };
}
