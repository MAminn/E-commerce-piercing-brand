import { query } from "#root/shared/database/drizzle/db";
import { file, product } from "#root/shared/database/drizzle/schema";
import { ServerError } from "#root/shared/error/server";
import { and, asc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { Effect } from "effect";
import { z } from "zod";
import type { ClientSession } from "#root/backend/auth/shared/entities";
import { loadPurchasableOptionGroups } from "#root/backend/products/option-groups";
import {
  type PurchasableOptionGroup,
  hasPurchasableConfiguration,
} from "#root/shared/products/options";
import { effectiveUnitPrice } from "#root/shared/pricing/effective-price";

/**
 * Admin-only catalogue search for "Add product" in the order editor.
 *
 * Matches product name or the merchant SKU (`internal_code`), plus the
 * customer-facing catalogue number when the query is a number. Only products
 * an order may actually receive are returned: live (not deleted) and not
 * hidden from the shop — the same products checkout would accept. Each row
 * carries what the picker needs to choose the exact variant: the purchasable
 * option groups (store-wide strikethrough already applied, the same loader
 * checkout resolves options with), prices and the product-level stock.
 *
 * The internal code is merchant-only; this procedure is admin-gated.
 */
export const searchProductsForOrderEditSchema = z.object({
  query: z.string().trim().max(100).default(""),
  limit: z.number().int().min(1).max(30).default(20),
});

export interface OrderEditCatalogProduct {
  id: string;
  name: string;
  internalCode: string | null;
  catalogueNo: number | null;
  image: string | null;
  /** Regular price, EGP. */
  price: number;
  /** A VALID sale price (below `price`), else null. */
  discountPrice: number | null;
  /** What one unit costs before options: the effective-price rule. */
  effectivePrice: number;
  stock: number;
  optionGroups: PurchasableOptionGroup[];
  /** False when an option group has no available value — nothing can be added. */
  purchasable: boolean;
}

/** `%`, `_` and `\` are LIKE metacharacters; a SKU like "FB_01" must match literally. */
function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export const searchProductsForOrderEdit = (
  input: z.infer<typeof searchProductsForOrderEditSchema>,
  session?: ClientSession,
) =>
  Effect.gen(function* ($) {
    if (!session || (session.role !== "admin" && session.role !== "superadmin")) {
      return yield* $(
        Effect.fail(
          new ServerError({
            tag: "Forbidden",
            message: "Admin access required",
            statusCode: 403,
            clientMessage: "Admin access required",
          }),
        ),
      );
    }

    return yield* $(
      query(async (db): Promise<OrderEditCatalogProduct[]> => {
        const conditions: SQL[] = [eq(product.deleted, false), eq(product.hidden, false)];
        const text = input.query;
        if (text !== "") {
          const pattern = `%${escapeLike(text)}%`;
          const matches: SQL[] = [ilike(product.name, pattern), ilike(product.internalCode, pattern)];
          if (/^\d{1,6}$/.test(text)) matches.push(eq(product.catalogueNo, Number(text)));
          const match = or(...matches);
          if (match) conditions.push(match);
        }

        const rows = await db
          .select({
            id: product.id,
            name: product.name,
            internalCode: product.internalCode,
            catalogueNo: product.catalogueNo,
            price: product.price,
            discountPrice: product.discountPrice,
            stock: product.stock,
            diskname: file.diskname,
          })
          .from(product)
          .leftJoin(file, eq(product.imageId, file.id))
          .where(and(...conditions))
          .orderBy(
            // An exact SKU hit first, then names that start with the query.
            ...(text === ""
              ? []
              : [
                  sql`case when lower(${product.internalCode}) = lower(${text}) then 0 when ${product.name} ilike ${`${escapeLike(text)}%`} then 1 else 2 end`,
                ]),
            asc(product.name),
          )
          .limit(input.limit);

        const groups = await loadPurchasableOptionGroups(
          db,
          rows.map((r) => r.id),
        );

        return rows.map((r) => {
          const price = Number(r.price);
          const rawDiscount = r.discountPrice === null ? null : Number(r.discountPrice);
          const effectivePrice = effectiveUnitPrice(price, rawDiscount);
          const optionGroups = groups.get(r.id) ?? [];
          return {
            id: r.id,
            name: r.name,
            internalCode: r.internalCode,
            catalogueNo: r.catalogueNo,
            image: r.diskname ? `/uploads/${r.diskname}` : null,
            price,
            discountPrice: effectivePrice < price ? rawDiscount : null,
            effectivePrice,
            stock: r.stock,
            optionGroups,
            purchasable: hasPurchasableConfiguration(optionGroups),
          };
        });
      }),
    );
  });
