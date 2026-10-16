import { useEffect, useState } from "react";
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

function loadCategories(): Promise<StorefrontCategory[]> {
  pending ??= trpc.category.view
    .query()
    .then((res) => {
      if (!res.success || !res.result) throw new Error("categories unavailable");
      return res.result as StorefrontCategory[];
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
 * failed, so pages can fall back instead of spinning forever.
 */
export function useStorefrontCategories() {
  const [categories, setCategories] = useState<StorefrontCategory[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
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
