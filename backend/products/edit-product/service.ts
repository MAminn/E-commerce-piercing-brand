import type { ClientSession } from "#root/backend/auth/shared/entities";
import { query } from "#root/shared/database/drizzle/db";
import {
  product,
  productVariant,
  productImage,
  productCategory,
} from "#root/shared/database/drizzle/schema";
import { ServerError } from "#root/shared/error/server";
import { and, eq, inArray, not } from "drizzle-orm";
import { Effect } from "effect";
import { z } from "zod";
import { validateProductRules, fragranceInfoSchema } from "../shared";

export const editProductSchema = z.object({
  id: z.string().uuid(),
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

export const editProduct = (
  data: z.infer<typeof editProductSchema>,
  session?: ClientSession,
) =>
  Effect.gen(function* ($) {
    // Only admins can edit products (vendor role no longer valid)
    if (!session || (session.role !== "admin" && session.role !== "superadmin")) {
      return yield* $(
        Effect.fail(
          new ServerError({
            tag: "Unauthorized",
            statusCode: 401,
            clientMessage: "Unauthorized",
          }),
        ),
      );
    }

    yield* $(validateProductRules(data));

    return yield* $(
      query(async (db) => {
        const existingProduct = await db
          .select()
          .from(product)
          .where(eq(product.id, data.id))
          .then((data) => data[0]);

        if (!existingProduct) {
          throw new Error("Product not found");
        }

        const updatedProduct = await db.transaction(async (tx) => {
          // Update the product
          const updatedProduct = await tx
            .update(product)
            .set({
              name: data.name,
              description: data.description,
              imageId: data.imageId,
              categoryId: data.categoryId,
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
              updatedAt: new Date(),
            })
            .where(eq(product.id, data.id))
            .returning()
            .then((data) => data[0]);

          if (!updatedProduct) {
            throw new Error("Product not updated");
          }

          // Update product categories
          if (data.categoryIds && data.categoryIds.length > 0) {
            // First, remove all existing product-category relationships
            await tx
              .delete(productCategory)
              .where(eq(productCategory.productId, data.id));

            // Then add the new relationships
            for (let i = 0; i < data.categoryIds.length; i++) {
              const categoryId = data.categoryIds[i];
              const isPrimary = categoryId === data.categoryId;

              await tx.insert(productCategory).values({
                productId: data.id,
                categoryId: categoryId ?? "", // Ensure categoryId is never undefined
                isPrimary: isPrimary,
              });
            }
          }

          // Handle product images if provided
          if (data.productImages && data.productImages.length > 0) {
            // First, remove all existing product images
            await tx
              .delete(productImage)
              .where(eq(productImage.productId, data.id));

            // Then add the new images with sortOrder from array index
            for (let i = 0; i < data.productImages.length; i++) {
              const img = data.productImages[i]!;
              await tx.insert(productImage).values({
                productId: data.id,
                fileId: img.id,
                isPrimary: img.isPrimary || false,
                sortOrder: i,
              });
            }
          }
          // We only update images if explicitly provided - otherwise keep existing ones

          // Handle variants - check if variants array exists in the request
          if (data.variants !== undefined) {
            if (data.variants.length === 0) {
              // If empty array is provided, remove all variants for this product
              await tx
                .delete(productVariant)
                .where(eq(productVariant.productId, data.id));
            } else {
              // If variants exist, update them
              // Delete existing variants that are not in the new list
              const newVariantNames = data.variants.map((v) => v.name);
              await tx
                .delete(productVariant)
                .where(
                  and(
                    eq(productVariant.productId, data.id),
                    not(inArray(productVariant.name, newVariantNames)),
                  ),
                );

              // Update or insert variants
              for (const variant of data.variants) {
                const existingVariant = await tx
                  .select()
                  .from(productVariant)
                  .where(
                    and(
                      eq(productVariant.productId, data.id),
                      eq(productVariant.name, variant.name),
                    ),
                  )
                  .then((data) => data[0]);

                // Normalize: string values → {value, priceModifier: 0}
                const normalizedValues = variant.values.map((v) =>
                  typeof v === "string" ? { value: v, priceModifier: 0 } : v,
                );

                if (existingVariant) {
                  // Update existing variant
                  await tx
                    .update(productVariant)
                    .set({
                      values: normalizedValues,
                    })
                    .where(eq(productVariant.id, existingVariant.id));
                } else {
                  // Insert new variant
                  await tx.insert(productVariant).values({
                    name: variant.name,
                    values: normalizedValues,
                    productId: data.id,
                  });
                }
              }
            }
          }
          // We only update variants if explicitly provided - otherwise keep existing ones

          return updatedProduct;
        });

        return updatedProduct;
      }),
    );
  });
