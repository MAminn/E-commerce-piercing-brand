import { useEffect, useState } from "react";
import { usePageContext } from "vike-react/usePageContext";
import { trpc } from "#root/shared/trpc/client";

/** A category as the public `category.view` procedure returns it. */
export interface StorefrontCategory {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  sortOrder: number;
  hidden: boolean;
  showOnLanding: boolean;
  description: string | null;
  filename: string | null;
  productCount: number;
  createdAt?: string | Date | null;
}

let pending: Promise<StorefrontCategory[]> | null = null;
/** The list once it has arrived, so later mounts start with it. */
let resolved: StorefrontCategory[] | null = null;

function loadCategories(): Promise<StorefrontCategory[]> {
  // Started inside a promise so a client that cannot even issue the call
  // fails like a failed request (caught below) instead of throwing in render.
  pending ??= Promise.resolve()
    .then(() => trpc.category.view.query())
    .then((res) => {
      if (!res.success || !res.result) throw new Error("categories unavailable");
      resolved = res.result as StorefrontCategory[];
      return resolved;
    })
    .catch((err) => {
      // Let the next caller retry instead of caching the failure.
      pending = null;
      throw err;
    });
  return pending;
}

/**
 * The full public category list (main categories and subcategories, in admin
 * order), fetched once per page load and shared by every caller. Pair it with
 * the pure helpers in shared/categories/tree.ts to resolve, nest or filter.
 *
 * `categories` is `null` while loading; `failed` is true if the request
 * failed, so pages can fall back instead of spinning forever. A page mounted
 * after the list arrived (e.g. Back from a product) gets it on its first
 * render, so it never flashes a skeleton for data it already has.
 */
export function useStorefrontCategories() {
  // The server renders the list into the page context (server/server.ts), so
  // the first paint already has it and hydration matches. The browser keeps
  // it as the shared cache; the server never caches across requests.
  const ssr = (usePageContext() as { storefrontCategories?: StorefrontCategory[] } | undefined)
    ?.storefrontCategories;
  if (typeof window !== "undefined" && !resolved && ssr) resolved = ssr;
  const [categories, setCategories] = useState<StorefrontCategory[] | null>(resolved ?? ssr ?? null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (resolved) return;
    let cancelled = false;
    loadCategories()
      .then((rows) => {
        if (!cancelled) setCategories(rows);
      })
      .catch((err) => {
        console.error("Error loading categories:", err);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { categories, failed };
}
