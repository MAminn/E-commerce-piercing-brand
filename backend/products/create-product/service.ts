import type { ClientSession } from "#root/backend/auth/shared/entities";
import { query } from "#root/shared/database/drizzle/db";
import {
  product,
  productVariant,
  productImage,
  productCategory,
} from "#root/shared/database/drizzle/schema";
import { ServerError } from "#root/shared/error/server";
import { Effect } from "effect";
import { z } from "zod";
import { validateProductRules, fragranceInfoSchema } from "../shared";
import { getStoreOwnerId } from "#root/shared/config/store";
import { generateUniqueProductSlug } from "../slug";
import { eq } from "drizzle-orm";

export const createProductSchema = z.object({
  name: z.string().nonempty().max(255),
  description: z.string().nonempty().max(3000),
  imageId: z.string().uuid(),
  categoryId: z.string().uuid(),
  categoryIds: z
    .array(z.string().uuid())
    .min(1, "At least one category is required"),
  price: z.number().min(0).max(10000),
  discountPrice: z.number().min(0).max(10000).optional(),
  stock: z.number().min(0).max(10000),
  variants: z
    .array(
      z.object({
        name: z.string().nonempty().max(255),
        values: z.array(
          z.union([
            z.string().nonempty().max(255),
            z.object({
              value: z.string().nonempty().max(255),
              priceModifier: z.number().min(0).max(100000).optional(),
              enabledOverride: z.boolean().optional(),
            }),
          ]),
        ),
      }),
    )
    .optional(),
  productImages: z
    .array(
      z.object({
        id: z.string().uuid(),
        isPrimary: z.boolean().optional(),
      }),
    )
    .optional(),
  inspiredBy: z.string().max(1000).optional(),
  sortOrder: z.number().int().min(0).optional(),
  hidden: z.boolean().optional().default(false),
  fragranceInfo: fragranceInfoSchema,
  bestLayeredWithIds: z.array(z.string().uuid()).optional(),
});

export const createProduct = (
  data: z.infer<typeof createProductSchema>,
  session?: ClientSession,
) =>
  Effect.gen(function* ($) {
    // Admin-only product creation
    if (!session || (session.role !== "admin" && session.role !== "superadmin")) {
      return yield* $(
        Effect.fail(
          new ServerError({
            tag: "Unauthorized",
            statusCode: 401,
            clientMessage: "Unauthorized - Admin access required",
          }),
        ),
      );
    }

    yield* $(validateProductRules(data));

    return yield* $(
      query(async (db) => {
        const newProduct = await db.transaction(async (tx) => {
          const newProduct = await tx
            .insert(product)
            .values({
              name: data.name,
              description: data.description,
              imageId: data.imageId,
              categoryId: data.categoryId,
              vendorId: getStoreOwnerId(), // Single-shop: use default store owner ID
              price: data.price.toString(),
              discountPrice: data.discountPrice
                ? data.discountPrice.toString()
                : null,
              stock: data.stock,
              inspiredBy: data.inspiredBy || null,
              sortOrder: data.sortOrder ?? 0,
              hidden: data.hidden ?? false,
              fragranceInfo: data.fragranceInfo ?? null,
              bestLayeredWithIds: data.bestLayeredWithIds ?? [],
            })
            .returning()
            .then((data) => data[0]);

          if (!newProduct) {
            throw new Error("Product not created");
          }

          const newSlug = await generateUniqueProductSlug(
            data.name,
            newProduct.id,
            newProduct.id,
          );
          await tx
            .update(product)
            .set({ slug: newSlug })
            .where(eq(product.id, newProduct.id));
          newProduct.slug = newSlug;

          // Create product-category relationships
          if (data.categoryIds && data.categoryIds.length > 0) {
            await Promise.all(
              data.categoryIds.map(async (categoryId) => {
                if (categoryId) {
                  const isPrimary = categoryId === data.categoryId;

                  await tx.insert(productCategory).values({
                    productId: newProduct.id,
                    categoryId: categoryId,
                    isPrimary: isPrimary,
                  });
                }
              })
            );
          }

          // Handle product images
          if (data.productImages && data.productImages.length > 0) {
            // Add all product images with sortOrder from array index
            for (let i = 0; i < data.productImages.length; i++) {
              const img = data.productImages[i]!;
              await tx.insert(productImage).values({
                productId: newProduct.id,
                fileId: img.id,
                isPrimary: img.isPrimary || false,
                sortOrder: i,
              });
            }
          } else if (data.imageId) {
            // If no product images but imageId is set, create one product image
            await tx.insert(productImage).values({
              productId: newProduct.id,
              fileId: data.imageId,
              isPrimary: true,
              sortOrder: 0,
            });
          }

          // Only insert variants if they exist and have elements
          if (data.variants && data.variants.length > 0) {
            await tx
              .insert(productVariant)
              .values(
                data.variants.map((variant) => {
                  return {
                    name: variant.name,
                    // Normalize: string values → {value, priceModifier: 0}
                    values: variant.values.map((v) =>
                      typeof v === "string" ? { value: v, priceModifier: 0 } : v,
                    ),
                    productId: newProduct.id,
                  };
                }),
              )
              .returning()
              .then((data) => data[0]);
          }

          return newProduct;
        });

        return newProduct;
      }),
    );
  });
