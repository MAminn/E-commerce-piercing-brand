import { query } from "#root/shared/database/drizzle/db";
import { file, productImage } from "#root/shared/database/drizzle/schema";
import { eq, inArray } from "drizzle-orm";
import { Effect } from "effect";
import { z } from "zod";

export const getProductImagesSchema = z.object({
  productId: z.string().uuid(),
});

export const getProductImages = (
  input: z.infer<typeof getProductImagesSchema>
) =>
  Effect.gen(function* ($) {
    return yield* $(
      query(async (db) => {
        // Get all product images for this product
        const productImages = await db
          .select({
            productId: productImage.productId,
            fileId: productImage.fileId,
            isPrimary: productImage.isPrimary,
            diskname: file.diskname,
          })
          .from(productImage)
          .innerJoin(file, eq(productImage.fileId, file.id))
          .where(eq(productImage.productId, input.productId))
          .execute();

        return productImages;
      })
    );
  });
