/**
 * Demo Seed Script
 *
 * Populates the database with sample categories, products, and promo codes
 * for fresh installs. Idempotent — safe to run multiple times.
 *
 * Usage: pnpm tsx scripts/seed.ts
 */

import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { v7 as uuid } from "uuid";
import { eq } from "drizzle-orm";
import {
  category,
  product,
  file,
  promoCode,
  productCategory,
} from "#root/shared/database/drizzle/schema.js";

const DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:8051/postgres";

const VENDOR_ID =
  process.env.STORE_OWNER_ID || "00000000-0000-0000-0000-000000000001";

async function seed() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const db = drizzle(pool);

  console.log("[Seed] Starting demo data seeding...");

  // ──────────────────────────────────────────────
  // 1. Categories  (flat — `type` acts as grouping)
  // ──────────────────────────────────────────────
  const categoryData = [
    { name: "T-Shirts", slug: "t-shirts", type: "Men" },
    { name: "Jeans", slug: "jeans", type: "Men" },
    { name: "Jackets", slug: "jackets", type: "Men" },
    { name: "Dresses", slug: "dresses", type: "Women" },
    { name: "Handbags", slug: "handbags", type: "Women" },
    { name: "Heels", slug: "heels", type: "Women" },
    { name: "Watches", slug: "watches", type: "Accessories" },
    { name: "Sunglasses", slug: "sunglasses", type: "Accessories" },
  ];

  const categoryMap = new Map<string, string>(); // slug → id

  for (const cat of categoryData) {
    const existing = await db
      .select({ id: category.id })
      .from(category)
      .where(eq(category.slug, cat.slug))
      .limit(1);

    if (existing.length > 0 && existing[0]) {
      categoryMap.set(cat.slug, existing[0].id);
      console.log(`[Seed] Category "${cat.name}" already exists, skipping`);
    } else {
      const id = uuid();
      await db.insert(category).values({ id, ...cat });
      categoryMap.set(cat.slug, id);
      console.log(`[Seed] Created category "${cat.name}"`);
    }
  }

  // ──────────────────────────────────────────────
  // 2. Placeholder image files
  // ──────────────────────────────────────────────
  const productEntries = [
    {
      name: "Classic White T-Shirt",
      description:
        "A timeless essential. Crafted from premium Egyptian cotton with a relaxed fit that drapes beautifully.",
      price: "249.00",
      discountPrice: null,
      stock: 50,
      categorySlug: "t-shirts",
      image: "demo/classic-white-tshirt.webp",
    },
    {
      name: "Slim Fit Dark Jeans",
      description:
        "Modern slim-fit jeans in deep indigo wash. Stretch denim for all-day comfort.",
      price: "599.00",
      discountPrice: "449.00",
      stock: 35,
      categorySlug: "jeans",
      image: "demo/slim-dark-jeans.webp",
    },
    {
      name: "Leather Bomber Jacket",
      description:
        "Genuine leather bomber with quilted lining. A statement piece that ages beautifully.",
      price: "1899.00",
      discountPrice: null,
      stock: 12,
      categorySlug: "jackets",
      image: "demo/leather-bomber.webp",
    },
    {
      name: "Floral Midi Dress",
      description:
        "Elegant midi dress with delicate floral print. Perfect for brunches and evening outings.",
      price: "799.00",
      discountPrice: "649.00",
      stock: 25,
      categorySlug: "dresses",
      image: "demo/floral-midi.webp",
    },
    {
      name: "Structured Leather Tote",
      description:
        "Handcrafted leather tote with interior organizer pockets. Understated luxury for everyday.",
      price: "1299.00",
      discountPrice: null,
      stock: 18,
      categorySlug: "handbags",
      image: "demo/leather-tote.webp",
    },
    {
      name: "Pointed Stiletto Heels",
      description:
        "Classic pointed-toe stilettos in Italian patent leather. 90mm heel height.",
      price: "899.00",
      discountPrice: null,
      stock: 20,
      categorySlug: "heels",
      image: "demo/stiletto-heels.webp",
    },
    {
      name: "Minimalist Steel Watch",
      description:
        "Swiss quartz movement with sapphire crystal. 40mm case in brushed stainless steel.",
      price: "2499.00",
      discountPrice: "1999.00",
      stock: 10,
      categorySlug: "watches",
      image: "demo/steel-watch.webp",
    },
    {
      name: "Aviator Sunglasses",
      description:
        "Polarized lenses in a titanium frame. UV400 protection with anti-reflective coating.",
      price: "599.00",
      discountPrice: null,
      stock: 30,
      categorySlug: "sunglasses",
      image: "demo/aviator-sunglasses.webp",
    },
    {
      name: "Vintage Graphic Tee",
      description:
        "Washed cotton tee with retro-inspired typography. Pre-shrunk and garment-dyed.",
      price: "199.00",
      discountPrice: "149.00",
      stock: 60,
      categorySlug: "t-shirts",
      image: "demo/vintage-tee.webp",
    },
    {
      name: "Crossbody Mini Bag",
      description:
        "Compact crossbody in pebbled leather with gold hardware. Adjustable chain strap.",
      price: "699.00",
      discountPrice: null,
      stock: 22,
      categorySlug: "handbags",
      image: "demo/crossbody-mini.webp",
    },
    {
      name: "Oversized Denim Jacket",
      description:
        "Relaxed oversized denim jacket in stonewash. Vintage-inspired with modern proportions.",
      price: "749.00",
      discountPrice: "599.00",
      stock: 28,
      categorySlug: "jackets",
      image: "demo/denim-jacket.webp",
    },
    {
      name: "Wrap Knit Dress",
      description:
        "Soft ribbed-knit wrap dress with tie waist. Versatile silhouette for any occasion.",
      price: "549.00",
      discountPrice: null,
      stock: 15,
      categorySlug: "dresses",
      image: "demo/wrap-knit-dress.webp",
    },
  ];

  // ──────────────────────────────────────────────
  // 3. Create products (with placeholder file rows)
  // ──────────────────────────────────────────────
  for (const entry of productEntries) {
    // Check if a product with same name already exists
    const existing = await db
      .select({ id: product.id })
      .from(product)
      .where(eq(product.name, entry.name))
      .limit(1);

    if (existing.length > 0) {
      console.log(`[Seed] Product "${entry.name}" already exists, skipping`);
      continue;
    }

    const categoryId = categoryMap.get(entry.categorySlug);
    if (!categoryId) {
      console.warn(
        `[Seed] Category "${entry.categorySlug}" not found, skipping product "${entry.name}"`,
      );
      continue;
    }

    // Create a placeholder file record for the product image
    const fileId = uuid();
    await db.insert(file).values({
      id: fileId,
      diskname: entry.image,
    });

    // Create the product
    const productId = uuid();
    await db.insert(product).values({
      id: productId,
      name: entry.name,
      description: entry.description,
      price: entry.price,
      discountPrice: entry.discountPrice,
      stock: entry.stock,
      imageId: fileId,
      categoryId,
      vendorId: VENDOR_ID,
    });

    // Also add to productCategory junction
    await db.insert(productCategory).values({
      productId,
      categoryId,
      isPrimary: true,
    });

    console.log(`[Seed] Created product "${entry.name}"`);
  }

  // ──────────────────────────────────────────────
  // 4. Promo codes
  // ──────────────────────────────────────────────
  const promoData = [
    {
      code: "WELCOME10",
      description: "10% off your first order",
      discountType: "percentage" as const,
      discountValue: "10.00",
      status: "active" as const,
      usageLimit: 500,
      usageLimitPerUser: 1,
      appliesToAllProducts: true,
    },
    {
      code: "SUMMER25",
      description: "Summer sale — 25 EGP off orders over 500 EGP",
      discountType: "fixed_amount" as const,
      discountValue: "25.00",
      status: "active" as const,
      usageLimit: 200,
      usageLimitPerUser: 3,
      minPurchaseAmount: "500.00",
      appliesToAllProducts: true,
    },
  ];

  for (const promo of promoData) {
    const existing = await db
      .select({ id: promoCode.id })
      .from(promoCode)
      .where(eq(promoCode.code, promo.code))
      .limit(1);

    if (existing.length > 0) {
      console.log(`[Seed] Promo code "${promo.code}" already exists, skipping`);
    } else {
      await db.insert(promoCode).values(promo);
      console.log(`[Seed] Created promo code "${promo.code}"`);
    }
  }

  console.log("[Seed] Done!");
  await pool.end();
}

seed().catch((err) => {
  console.error("[Seed] Error:", err);
  process.exit(1);
});
