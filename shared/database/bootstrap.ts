/**
 * Single-Shop Database Bootstrap
 *
 * Ensures the database has the required default store/vendor row
 * for foreign key constraints in single-shop mode.
 *
 * This is NOT multi-vendor behavior - it's a technical requirement
 * to satisfy FK constraints (product.vendorId, orderItem.vendorId).
 */

import { db } from "#root/shared/database/drizzle/db";
import { vendor } from "#root/shared/database/drizzle/schema";
import { getStoreOwnerId } from "#root/shared/config/store";
import { eq } from "drizzle-orm";

/**
 * Ensures the default store owner vendor row exists
 * This must be called during server startup after DB connection is established
 */
export async function ensureDefaultStoreVendor(): Promise<void> {
  const storeOwnerId = getStoreOwnerId();
  const database = db();

  try {
    // Check if vendor row already exists
    const existing = await database.query.vendor.findFirst({
      where: eq(vendor.id, storeOwnerId),
    });

    if (existing) {
      console.log(
        `[Bootstrap] Default store vendor already exists (id: ${storeOwnerId})`,
      );
      return;
    }

    // Create the default store vendor row
    await database.insert(vendor).values({
      id: storeOwnerId,
      name: "Store",
      status: "active", // Must be active for FK references to work
      description: "Default store owner (single-shop mode)",
      logoId: null,
      socialLinks: [],
      featured: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    console.log(
      `[Bootstrap] ✅ Created default store vendor (id: ${storeOwnerId})`,
    );
  } catch (error) {
    console.error(
      "[Bootstrap] ❌ Failed to ensure default store vendor:",
      error,
    );
    throw error;
  }
}
