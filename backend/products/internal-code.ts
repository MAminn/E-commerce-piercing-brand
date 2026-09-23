import { and, eq, ne } from "drizzle-orm";
import { product } from "#root/shared/database/drizzle/schema";
import { ServerError } from "#root/shared/error/server";
import type { DatabaseClient } from "#root/shared/database/drizzle/db";

/** Postgres `unique_violation`. */
const UNIQUE_VIOLATION = "23505";
const INTERNAL_CODE_INDEX = "product_internal_code_idx";

/**
 * Fails with a message an admin can act on when `code` is already on another
 * product. A `null` code (nothing entered) is always available — the unique
 * index exempts NULLs, so any number of products may be blank.
 *
 * Soft-deleted products are deliberately included in the check: their rows
 * still occupy the unique index, so excluding them here would let the admin
 * past this guard only to hit a raw database error on insert.
 *
 * @param excludeProductId the product being edited, so re-saving it without
 *   changing its code is not a conflict with itself.
 */
export async function assertInternalCodeAvailable(
  db: DatabaseClient,
  code: string | null,
  excludeProductId?: string,
): Promise<void> {
  if (code === null) return;

  const clash = await db
    .select({ id: product.id, name: product.name })
    .from(product)
    .where(
      excludeProductId
        ? and(eq(product.internalCode, code), ne(product.id, excludeProductId))
        : eq(product.internalCode, code),
    )
    .limit(1);

  const existing = clash[0];
  if (!existing) return;

  throw new ServerError({
    tag: "DuplicateInternalCode",
    statusCode: 400,
    message: `Internal code ${code} already in use by product ${existing.id}`,
    clientMessage: `Internal code "${code}" is already used by "${existing.name}". Internal codes must be unique.`,
  });
}

/**
 * Turns the internal-code unique-index violation into the same message the
 * pre-flight check produces. Two admins saving the same new code at once both
 * pass that check and one of them lands here; without this they would see an
 * opaque Postgres error instead of being told the code is taken.
 *
 * Only that one index is matched — any other unique violation (a slug clash,
 * say) is re-thrown untouched so it is not mislabelled.
 */
export function rethrowInternalCodeConflict(
  error: unknown,
  code: string | null,
): never {
  const e = error as
    | { code?: string; constraint?: string; message?: string }
    | null
    | undefined;

  const isInternalCodeClash =
    code !== null &&
    e?.code === UNIQUE_VIOLATION &&
    (e.constraint === INTERNAL_CODE_INDEX ||
      String(e.message ?? "").includes(INTERNAL_CODE_INDEX));

  if (isInternalCodeClash) {
    throw new ServerError({
      tag: "DuplicateInternalCode",
      statusCode: 400,
      message: `Internal code ${code} already in use`,
      clientMessage: `Internal code "${code}" is already used by another product. Internal codes must be unique.`,
    });
  }

  throw error;
}
