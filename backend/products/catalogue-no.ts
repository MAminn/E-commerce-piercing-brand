import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { product } from "#root/shared/database/drizzle/schema";
import { ServerError } from "#root/shared/error/server";
import type { DatabaseClient } from "#root/shared/database/drizzle/db";
import { CATALOGUE_NO_MAX, formatCatalogueNo } from "#root/shared/products/index-line";

/** Postgres `unique_violation`. */
const UNIQUE_VIOLATION = "23505";
const CATALOGUE_NO_INDEX = "product_catalogue_no_idx";

/**
 * Admin input for `product.catalogue_no`. A whole number 1–999 (shown as
 * "001"–"999"); `null` clears it. `undefined` is kept distinct from `null`,
 * as for the internal code: on the edit contract an absent key means "leave
 * the stored number alone".
 */
export const catalogueNoInputSchema = z
  .number()
  .int("Catalogue number must be a whole number")
  .min(1, "Catalogue number must be 1 or more")
  .max(CATALOGUE_NO_MAX, `Catalogue number must be ${CATALOGUE_NO_MAX} or less`)
  .nullable()
  .optional();

const taken = (no: number, name?: string) =>
  new ServerError({
    tag: "DuplicateCatalogueNo",
    statusCode: 400,
    message: `Catalogue number ${no} already in use`,
    clientMessage: name
      ? `Catalogue number ${formatCatalogueNo(no)} is already used by "${name}". Each product needs its own number.`
      : `Catalogue number ${formatCatalogueNo(no)} is already used by another product. Each product needs its own number.`,
  });

/**
 * Fails with a message an admin can act on when `no` is already on another
 * product. `null` (not numbered yet) is always available. Soft-deleted
 * products are included: their rows still occupy the unique index.
 */
export async function assertCatalogueNoAvailable(
  db: DatabaseClient,
  no: number | null | undefined,
  excludeProductId?: string,
): Promise<void> {
  if (no === null || no === undefined) return;
  const clash = await db
    .select({ id: product.id, name: product.name })
    .from(product)
    .where(
      excludeProductId
        ? and(eq(product.catalogueNo, no), ne(product.id, excludeProductId))
        : eq(product.catalogueNo, no),
    )
    .limit(1);
  const existing = clash[0];
  if (existing) throw taken(no, existing.name);
}

/**
 * Turns a catalogue-number unique-index violation (two saves racing past the
 * pre-flight check) into the same admin message. Anything else is returned
 * untouched for the next handler.
 */
export function catalogueNoConflict(error: unknown, no: number | null | undefined): unknown {
  const e = error as { code?: string; constraint?: string; message?: string } | null | undefined;
  const isClash =
    no !== null &&
    no !== undefined &&
    e?.code === UNIQUE_VIOLATION &&
    (e.constraint === CATALOGUE_NO_INDEX || String(e.message ?? "").includes(CATALOGUE_NO_INDEX));
  return isClash ? taken(no) : error;
}
