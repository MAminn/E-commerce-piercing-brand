/**
 * Utility functions for consistent URL creation throughout the application
 */

/**
 * Creates a properly formatted URL for a product detail page.
 * Prefers the slug (hides the raw UUID from the URL); falls back to the
 * id for any product that hasn't been backfilled with a slug yet.
 */
export function getProductUrl(product: {
  id: string;
  slug?: string | null;
}): string {
  return `/shop/${encodeURIComponent(product.slug || product.id)}`;
}

/**
 * Creates a properly formatted URL for a category page
 */
export function getCategoryUrl(categoryId: string): string {
  return `/featured/categories/${encodeURIComponent(categoryId)}`;
}
