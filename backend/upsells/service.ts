import { formatCategoryName } from "#root/shared/utils/format";
import { query } from "#root/shared/database/drizzle/db";
import {
  category,
  file,
  product,
  productCategory,
  productVariant,
  storeSettings,
} from "#root/shared/database/drizzle/schema";
import { ServerError } from "#root/shared/error/server";
import {
  normalizeUpsellMode,
  normalizeUpsellSettings,
  type UpsellSettings,
} from "#root/shared/upsell/config";
import {
  resolveUpsells,
  upsellPoolSize,
  type UpsellSource,
} from "#root/shared/upsell/select";
import { and, eq, gt, inArray } from "drizzle-orm";
import { Effect } from "effect";
import { z } from "zod";

/**
 * The one server-side upsell resolver.
 *
 * Every storefront surface — the product-page block and the post-add sheet —
 * reads from this, so Manual / Random / Disabled is decided in exactly one
 * place. The rules themselves live in shared/upsell/select.ts; this file only
 * loads the data they need and shapes the answer.
 */

export const productUpsellsSchema = z.object({
  productId: z.string().uuid(),
  /** Products the shopper already has in the bag. */
  excludeProductIds: z.array(z.string().uuid()).max(100).optional(),
  /**
   * Per-session seed from the storefront, so random picks stay put for the
   * session instead of reshuffling on every page view.
   */
  seed: z.string().trim().max(64).optional(),
});

export interface UpsellItem {
  id: string;
  slug: string | null;
  name: string;
  price: number;
  discountPrice: number | null;
  stock: number;
  available: boolean;
  imageUrl?: string;
  images: { url: string; isPrimary: boolean }[];
  categoryName: string;
  /** Option groups the product carries; > 0 means it needs a selection first. */
  variantCount: number;
  /**
   * Percé's name for the same fact (`FeaturedProduct.requiresOptions`), so an
   * upsell row can be handed to any Percé product surface unchanged.
   */
  requiresOptions: boolean;
}

export interface ProductUpsellsResult {
  /** Store-wide master switch. */
  enabled: boolean;
  productPage: boolean;
  postAdd: boolean;
  /** How many each surface shows. `items` may hold more, as replacements. */
  limit: number;
  source: UpsellSource;
  items: UpsellItem[];
}

export const getUpsellSettings = () =>
  Effect.gen(function* ($) {
    const rows = yield* $(
      query(async (db) =>
        db
          .select({ upsellConfig: storeSettings.upsellConfig })
          .from(storeSettings)
          .where(eq(storeSettings.key, "default"))
          .limit(1),
      ),
    );
    return normalizeUpsellSettings(rows[0]?.upsellConfig);
  });

export const updateUpsellSettings = (input: UpsellSettings) =>
  Effect.gen(function* ($) {
    const config = normalizeUpsellSettings(input);
    const updated = yield* $(
      query(async (db) =>
        db
          .update(storeSettings)
          .set({ upsellConfig: config, updatedAt: new Date() })
          .where(eq(storeSettings.key, "default"))
          .returning({ upsellConfig: storeSettings.upsellConfig }),
      ),
    );
    if (updated.length > 0) {
      return normalizeUpsellSettings(updated[0]!.upsellConfig);
    }

    // No settings row yet (fresh install) — create it carrying just this config.
    const inserted = yield* $(
      query(async (db) =>
        db
          .insert(storeSettings)
          .values({ key: "default", upsellConfig: config })
          .returning({ upsellConfig: storeSettings.upsellConfig }),
      ),
    );
    if (!inserted[0]) {
      return yield* $(
        Effect.fail(
          new ServerError({
            tag: "FailedToUpdateUpsellSettings",
            statusCode: 500,
            clientMessage: "Failed to save upsell settings",
          }),
        ),
      );
    }
    return normalizeUpsellSettings(inserted[0].upsellConfig);
  });

/** Upper bound on the catalogue scanned for random picks. */
const RANDOM_CANDIDATE_LIMIT = 500;

export const getProductUpsells = (
  input: z.infer<typeof productUpsellsSchema>,
) =>
  Effect.gen(function* ($) {
    const settings = yield* $(getUpsellSettings());

    const empty = (
      overrides: Partial<ProductUpsellsResult> = {},
    ): ProductUpsellsResult => ({
      enabled: settings.enabled,
      productPage: settings.enabled && settings.productPageEnabled,
      postAdd: settings.enabled && settings.postAddEnabled,
      limit: settings.maxItems,
      source: "none",
      items: [],
      ...overrides,
    });

    // Nothing is read about the catalogue while the feature is off.
    if (!settings.enabled) return empty();

    return yield* $(
      query(async (db): Promise<ProductUpsellsResult> => {
        const [subject] = await db
          .select({
            id: product.id,
            categoryId: product.categoryId,
            upsellMode: product.upsellMode,
            manualIds: product.bestLayeredWithIds,
          })
          .from(product)
          .where(
            and(
              eq(product.id, input.productId),
              eq(product.deleted, false),
              eq(product.hidden, false),
            ),
          )
          .limit(1);

        if (!subject) return empty();

        const mode = normalizeUpsellMode(subject.upsellMode);
        if (mode === "disabled") return empty();

        const manualIds = Array.isArray(subject.manualIds)
          ? subject.manualIds.filter(
              (id): id is string => typeof id === "string",
            )
          : [];
        if (mode === "manual" && manualIds.length === 0) {
          return empty({ source: "manual" });
        }

        const subjectCategoryRows = await db
          .select({ categoryId: productCategory.categoryId })
          .from(productCategory)
          .where(eq(productCategory.productId, subject.id));
        const subjectCategoryIds = [
          ...new Set([
            subject.categoryId,
            ...subjectCategoryRows.map((r) => r.categoryId),
          ]),
        ];

        // Visible, in stock, under a live primary category — the same
        // conditions under which the product page itself would load.
        const rows = await db
          .select({
            id: product.id,
            slug: product.slug,
            name: product.name,
            price: product.price,
            discountPrice: product.discountPrice,
            stock: product.stock,
            hidden: product.hidden,
            deleted: product.deleted,
            categoryId: product.categoryId,
            categoryName: category.name,
            imageDiskname: file.diskname,
          })
          .from(product)
          .innerJoin(category, eq(product.categoryId, category.id))
          .leftJoin(file, eq(product.imageId, file.id))
          .where(
            and(
              eq(product.deleted, false),
              eq(product.hidden, false),
              eq(category.deleted, false),
              gt(product.stock, 0),
              mode === "manual" ? inArray(product.id, manualIds) : undefined,
            ),
          )
          .limit(RANDOM_CANDIDATE_LIMIT);

        // Every category each candidate belongs to, for the random pool rule.
        const candidateIds = rows.map((r) => r.id);
        const junction =
          mode === "global" &&
          settings.randomPool !== "any" &&
          candidateIds.length > 0
            ? await db
                .select({
                  productId: productCategory.productId,
                  categoryId: productCategory.categoryId,
                })
                .from(productCategory)
                .where(inArray(productCategory.productId, candidateIds))
            : [];
        const categoriesOf = new Map<string, Set<string>>();
        for (const r of rows) categoriesOf.set(r.id, new Set([r.categoryId]));
        for (const j of junction) categoriesOf.get(j.productId)?.add(j.categoryId);

        const resolved = resolveUpsells({
          settings,
          product: {
            id: subject.id,
            mode,
            manualIds,
            categoryIds: subjectCategoryIds,
          },
          candidates: rows.map((r) => ({
            ...r,
            categoryIds: [...(categoriesOf.get(r.id) ?? [])],
          })),
          excludeIds: input.excludeProductIds,
          // Combined with the product, so each product page has its own
          // stable order rather than every page sharing one ranking.
          seed: `${input.seed || Math.random().toString(36).slice(2)}:${subject.id}`,
          poolSize: upsellPoolSize(settings.maxItems, mode),
        });

        if (resolved.items.length === 0) {
          return empty({ source: resolved.source });
        }

        const pickedIds = resolved.items.map((r) => r.id);
        const variantRows = await db
          .select({ productId: productVariant.productId })
          .from(productVariant)
          .where(inArray(productVariant.productId, pickedIds));
        const variantCount = new Map<string, number>();
        for (const v of variantRows) {
          variantCount.set(v.productId, (variantCount.get(v.productId) ?? 0) + 1);
        }

        return {
          ...empty({ source: resolved.source }),
          items: resolved.items.map((r) => {
            const imageUrl = r.imageDiskname
              ? `/uploads/${r.imageDiskname}`
              : undefined;
            return {
              id: r.id,
              slug: r.slug,
              name: r.name,
              price: Number(r.price),
              discountPrice: r.discountPrice ? Number(r.discountPrice) : null,
              stock: r.stock,
              available: r.stock > 0,
              imageUrl,
              images: imageUrl ? [{ url: imageUrl, isPrimary: true }] : [],
              categoryName: formatCategoryName(r.categoryName),
              variantCount: variantCount.get(r.id) ?? 0,
              requiresOptions: (variantCount.get(r.id) ?? 0) > 0,
            };
          }),
        };
      }),
    );
  });
