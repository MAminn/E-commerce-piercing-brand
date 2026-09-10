import { t, adminProcedure, publicProcedure } from "#root/shared/trpc/server";
import { z } from "zod";
import { eq, and, inArray } from "drizzle-orm";
import { product, productVariant, productImage, file as fileTable } from "#root/shared/database/drizzle/schema";
import { createProductProcedure } from "./create-product/trpc";
import { deleteProductProcedure } from "./delete-product/trpc";
import { editProductProcedure } from "./edit-product/trpc";
import { getCategoriesProcedure } from "./get-categories/trpc";
import { productStatsProcedure } from "./get-product-stats/trpc";
import { topSellingProcedure } from "./get-top-selling/trpc";
import { totalRevenueProcedure } from "./get-total-revenue/trpc";
import { searchProductsProcedure } from "./search-products/trpc";
import { viewProductsProcedure } from "./view-products/trpc";
import { viewReviewsProcedure, viewAllReviewsProcedure } from "./view-reviews/trpc";
import { createReviewProcedure } from "./create-review/trpc";
import { deleteReviewProcedure } from "./delete-review/trpc";
import { moderateReviewProcedure } from "./moderate-review/trpc";
import { uploadReviewImageProcedure } from "./upload-review-image/trpc";
import { getProductImagesProcedure } from "./get-product-images/trpc";
import { getProductByIdProcedure } from "./get-product-by-id/trpc";

export const productRouter = t.router({
  view: viewProductsProcedure,
  create: createProductProcedure,
  edit: editProductProcedure,
  delete: deleteProductProcedure,
  stats: productStatsProcedure,
  topSelling: topSellingProcedure,
  revenue: totalRevenueProcedure,
  search: searchProductsProcedure,
  getReviews: viewReviewsProcedure,
  getAllReviews: viewAllReviewsProcedure,
  createReview: createReviewProcedure,
  deleteReview: deleteReviewProcedure,
  moderateReview: moderateReviewProcedure,
  uploadReviewImage: uploadReviewImageProcedure,
  getProductImages: getProductImagesProcedure,
  getCategories: getCategoriesProcedure,
  getById: getProductByIdProcedure,
  /** Fetch multiple products by IDs — used by the wishlist tab */
  getByIds: publicProcedure
    .input(z.object({ ids: z.array(z.string().uuid()).max(100) }))
    .query(async ({ ctx, input }) => {
      if (input.ids.length === 0) return { success: true as const, result: [] };
      try {
        const rows = await ctx.db
          .select({
            id: product.id,
            slug: product.slug,
            name: product.name,
            price: product.price,
            discountPrice: product.discountPrice,
            stock: product.stock,
            imageUrl: fileTable.diskname,
          })
          .from(product)
          .leftJoin(fileTable, eq(product.imageId, fileTable.id))
          .where(
            and(
              eq(product.deleted, false),
              inArray(product.id, input.ids),
            ),
          );

        // Also fetch primary images from productImage table for products that have them
        const productIds = rows.map((r) => r.id);
        const primaryImages = productIds.length > 0
          ? await ctx.db
              .select({ productId: productImage.productId, url: fileTable.diskname })
              .from(productImage)
              .innerJoin(fileTable, eq(productImage.fileId, fileTable.id))
              .where(
                and(
                  inArray(productImage.productId, productIds),
                  eq(productImage.isPrimary, true),
                ),
              )
          : [];

        const primaryImageMap = new Map(primaryImages.map((pi) => [pi.productId, pi.url]));

        return {
          success: true as const,
          result: rows.map((r) => ({
            id: r.id,
            slug: r.slug,
            name: r.name,
            price: Number(r.price),
            discountPrice: r.discountPrice ? Number(r.discountPrice) : null,
            stock: r.stock ?? 0,
            available: (r.stock ?? 0) > 0,
            imageUrl: primaryImageMap.get(r.id) ?? r.imageUrl ?? null,
          })),
        };
      } catch {
        return { success: false as const, error: "Failed to fetch products" };
      }
    }),
  /** Admin-only: apply/update a variant preset across ALL non-deleted products */
  applyPresetToAll: adminProcedure
    .input(
      z.object({
        name: z.string().min(1),
        values: z.array(
          z.object({
            value: z.string().min(1),
            priceModifier: z.number().min(0).optional(),
          }),
        ),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db;
      const allProducts = await db
        .select({ id: product.id })
        .from(product)
        .where(eq(product.deleted, false));

      for (const p of allProducts) {
        const existing = await db
          .select({ id: productVariant.id })
          .from(productVariant)
          .where(
            and(
              eq(productVariant.productId, p.id),
              eq(productVariant.name, input.name),
            ),
          );

        if (existing.length > 0) {
          await db
            .update(productVariant)
            .set({ values: input.values })
            .where(
              and(
                eq(productVariant.productId, p.id),
                eq(productVariant.name, input.name),
              ),
            );
        } else {
          await db.insert(productVariant).values({
            productId: p.id,
            name: input.name,
            values: input.values,
          });
        }
      }

      return { success: true, result: { updatedCount: allProducts.length } };
    }),

  /** Admin-only: remove a variant (by name) from ALL non-deleted products */
  removeVariantFromAllProducts: adminProcedure
    .input(z.object({ name: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db;
      const { inArray } = await import("drizzle-orm");

      const allProducts = await db
        .select({ id: product.id })
        .from(product)
        .where(eq(product.deleted, false));

      if (allProducts.length > 0) {
        const productIds = allProducts.map((p) => p.id);
        await db
          .delete(productVariant)
          .where(
            and(
              inArray(productVariant.productId, productIds),
              eq(productVariant.name, input.name),
            ),
          );
      }

      return { success: true, result: { removedCount: allProducts.length } };
    }),
});
