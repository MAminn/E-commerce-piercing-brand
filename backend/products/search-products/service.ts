import { formatCategoryName } from "#root/shared/utils/format";
import { query } from "#root/shared/database/drizzle/db";
import {
  category,
  file,
  product,
  productImage,
  productCategory,
} from "#root/shared/database/drizzle/schema";
import { and, desc, asc, eq, inArray, count, exists, sql } from "drizzle-orm";
import { Effect } from "effect";
import { z } from "zod";
import {
  effectivePrice,
  inCategoriesCondition,
  inStockCondition,
  onSaleCondition,
  priceRangeCondition,
  searchCondition,
  visibleProductCondition,
} from "../listing-conditions";

export const searchProductsSchema = z.object({
  categoryIds: z.array(z.string().uuid()).optional(),
  categoryType: z.string().trim().max(100).optional(),
  search: z.string().trim().max(255).optional(),
  sortBy: z.enum(["newest", "price-asc", "price-desc"]).optional(),
  limit: z.number().min(1).max(100).optional().default(12),
  offset: z.number().min(0).optional().default(0),
  includeOutOfStock: z.boolean().optional().default(false),
  discountedOnly: z.boolean().optional(),
  productIds: z.array(z.string().uuid()).optional(),
  /** Whole EGP bounds on the price the shopper pays (see effectivePrice). */
  minPrice: z.number().min(0).max(1_000_000).optional(),
  maxPrice: z.number().min(0).max(1_000_000).optional(),
});

export const searchProducts = (input: z.infer<typeof searchProductsSchema>) =>
  Effect.gen(function* ($) {
    return yield* $(
      query(async (db) => {
        // Prepare category filter condition
        let categoryCondition = undefined;
        if (input.categoryIds && input.categoryIds.length > 0) {
          categoryCondition = inCategoriesCondition(db, input.categoryIds);
        } else if (input.categoryType) {
          // If categoryType is specified but no categoryIds, fetch categories of that type
          const categoryIds = await db
            .select({ id: category.id })
            .from(category)
            .where(eq(category.type, input.categoryType))
            .execute()
            .then((cats) => cats.map((c) => c.id));

          if (categoryIds.length > 0) {
            categoryCondition = exists(
              db
                .select({ productId: productCategory.productId })
                .from(productCategory)
                .where(
                  and(
                    eq(productCategory.productId, product.id),
                    inArray(productCategory.categoryId, categoryIds),
                  ),
                ),
            );
          } else {
            // If no categories found for this type, ensure we return no products
            // by using an impossible condition
            categoryCondition = sql`false`;
          }
        }

        // One WHERE clause for the count and the page, so `total` always
        // describes exactly the rows being paged through.
        const where = and(
          visibleProductCondition(),
          input.productIds && input.productIds.length > 0
            ? inArray(product.id, input.productIds)
            : undefined,
          categoryCondition,
          input.search ? searchCondition(input.search) : undefined,
          !input.includeOutOfStock ? inStockCondition() : undefined,
          input.discountedOnly ? onSaleCondition() : undefined,
          priceRangeCondition(input.minPrice, input.maxPrice),
        );

        const countQuery = db
          .select({
            count: count(product.id),
          })
          .from(product)
          .where(where);

        // Build main query
        const productsQuery = db
          .select({
            id: product.id,
            slug: product.slug,
            name: product.name,
            description: product.description,
            price: product.price,
            discountPrice: product.discountPrice,
            stock: product.stock,
            imageUrl: file.diskname,
            categoryId: product.categoryId,
            categoryName: category.name,
            sortOrder: product.sortOrder,
          })
          .from(product)
          .leftJoin(file, eq(product.imageId, file.id))
          .leftJoin(category, eq(product.categoryId, category.id))
          .where(where)
          .limit(input.limit)
          .offset(input.offset);

        // Apply sort order. Price sorts use the price the shopper pays (a
        // discounted piece sorts by its sale price, as the card shows it).
        // Every order ends on the id: many pieces share a price or a
        // creation instant, and without a unique tie-breaker Postgres may
        // order ties differently per query — so LIMIT/OFFSET pages could
        // repeat or skip products, and "page 3" would not be the same page
        // when a shopper comes back to it.
        if (input.sortBy === "newest") {
          productsQuery.orderBy(desc(product.createdAt), desc(product.id));
        } else if (input.sortBy === "price-asc") {
          productsQuery.orderBy(asc(effectivePrice), asc(product.id));
        } else if (input.sortBy === "price-desc") {
          productsQuery.orderBy(desc(effectivePrice), asc(product.id));
        } else {
          // Default: sort by sortOrder (0 and null last), then newest first
          productsQuery.orderBy(
            sql`(${product.sortOrder} IS NULL OR ${product.sortOrder} = 0)`,
            asc(product.sortOrder),
            desc(product.createdAt),
            desc(product.id),
          );
        }

        // Run both queries
        const [totalCount, items] = await Promise.all([
          countQuery,
          productsQuery,
        ]);

        // Fetch additional product images for all products
        const productIds = items.map((item) => item.id);

        // Get all product images
        const productImagesQuery = await db
          .select({
            productId: productImage.productId,
            fileId: productImage.fileId,
            isPrimary: productImage.isPrimary,
            diskname: file.diskname,
          })
          .from(productImage)
          .innerJoin(file, eq(productImage.fileId, file.id))
          .where(inArray(productImage.productId, productIds))
          .orderBy(productImage.sortOrder, productImage.isPrimary)
          .execute();

        // Fetch all categories for these products
        const productCategoriesQuery = await db
          .select({
            productId: productCategory.productId,
            categoryId: productCategory.categoryId,
            categoryName: category.name,
            isPrimary: productCategory.isPrimary,
          })
          .from(productCategory)
          .innerJoin(category, eq(productCategory.categoryId, category.id))
          .where(inArray(productCategory.productId, productIds))
          .execute();

        // Organize categories by product ID
        const productCategoriesMap = new Map<
          string,
          Array<{ id: string; name: string }>
        >();
        for (const pc of productCategoriesQuery) {
          if (!productCategoriesMap.has(pc.productId)) {
            productCategoriesMap.set(pc.productId, []);
          }
          productCategoriesMap.get(pc.productId)?.push({
            id: pc.categoryId,
            name: formatCategoryName(pc.categoryName),
          });
        }

        // Process and add available flag to each item
        const processedItems = items.map((item) => {
          // Get all images for this product
          const productImages = productImagesQuery
            .filter((img) => img.productId === item.id)
            .map((img) => ({
              url: img.diskname,
              isPrimary: img.isPrimary,
            }));

          // Get all categories for this product
          const categories = productCategoriesMap.get(item.id) || [];

          return {
            ...item,
            categoryName: item.categoryName
              ? formatCategoryName(item.categoryName)
              : null,
            available: item.stock > 0,
            images:
              productImages.length > 0
                ? productImages
                : item.imageUrl
                  ? [{ url: item.imageUrl, isPrimary: true }]
                  : [],
            categories: categories,
          };
        });

        return {
          items: processedItems,
          total: totalCount[0]?.count || 0,
        };
      }),
    );
  });
