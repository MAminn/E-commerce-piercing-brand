/**
 * Store Configuration
 * Configuration for single-shop mode store settings
 */

/**
 * Default Store ID (Single-Shop Mode)
 * 
 * This is a placeholder UUID used as the store owner ID in database fields
 * that require a vendorId due to schema constraints (product.vendorId, orderItem.vendorId).
 * 
 * IMPORTANT: This is NOT vendor behavior - it's a technical workaround for DB constraints.
 * In single-shop mode, all products belong to the single store, not to vendors.
 * 
 * You can override this with the STORE_OWNER_ID environment variable.
 * Default: '00000000-0000-0000-0000-000000000001' (dev placeholder)
 */
export const DEFAULT_STORE_ID =
  process.env.STORE_OWNER_ID || "00000000-0000-0000-0000-000000000001";

/**
 * Helper to get the store owner ID
 * Use this instead of directly accessing DEFAULT_STORE_ID
 */
export function getStoreOwnerId(): string {
  return DEFAULT_STORE_ID;
}
