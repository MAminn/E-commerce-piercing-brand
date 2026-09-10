/**
 * Application Configuration
 * Central configuration for app-wide settings
 */

/**
 * Single Shop Mode
 * When enabled, the platform operates as a single-shop e-commerce site
 * instead of a multi-vendor marketplace.
 *
 * Effects when enabled:
 * - Only admin and user roles are active
 * - Dashboard is admin-only
 * - Products and orders managed by admin
 * - Single-store commerce flow
 */
export const SINGLE_SHOP_MODE = process.env.SINGLE_SHOP_MODE === "true";

/**
 * Helper function to check if single-shop mode is enabled
 * Use this throughout the app to conditionally enable/disable multi-vendor features
 */
export function isSingleShopMode(): boolean {
  return SINGLE_SHOP_MODE;
}
