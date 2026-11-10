import { and, eq, ne } from "drizzle-orm";
import { product } from "#root/shared/database/drizzle/schema";
import { ServerError } from "#root/shared/error/server";
import type { DatabaseClient } from "#root/shared/database/drizzle/db";

/** Postgres `unique_violation`. */
const UNIQUE_VIOLATION = "23505";
/**
 * The live-products-only index (migration 0068). The old all-rows name is
 * still matched so a clash is reported cleanly on a database that has not run
 * 0068 yet.
 */
const INTERNAL_CODE_INDEXES = [
  "product_internal_code_active_idx",
  "product_internal_code_idx",
];

/**
 * Fails with a message an admin can act on when `code` is already on another
 * LIVE product. A `null` code (nothing entered) is always available — the
 * unique index exempts NULLs, so any number of products may be blank.
 *
 * Soft-deleted products are ignored: they keep their historical code for
 * order/ERP history but do not reserve it. This mirrors the partial unique
 * index `product_internal_code_active_idx` (deleted = false), which stays the
 * authority for simultaneous saves.
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
      and(
        eq(product.internalCode, code),
        eq(product.deleted, false),
        excludeProductId ? ne(product.id, excludeProductId) : undefined,
      ),
    )
    .limit(1);

  const existing = clash[0];
  if (!existing) return;

  throw new ServerError({
    tag: "DuplicateInternalCode",
    statusCode: 400,
    message: `Internal code ${code} already in use by product ${existing.id}`,
    clientMessage: `Internal code "${code}" is already used by "${existing.name}".`,
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
 *
 * drizzle-orm (0.44+) wraps driver errors in a `DrizzleQueryError` whose own
 * `code`/`constraint` are undefined; the Postgres fields live on `.cause`.
 * Both the error and its cause are checked so the mapping works whether or
 * not the driver error arrives wrapped.
 */
export function rethrowInternalCodeConflict(
  error: unknown,
  code: string | null,
): never {
  type PgLike =
    | { code?: string; constraint?: string; message?: string; cause?: unknown }
    | null
    | undefined;
  const isIndexClash = (e: PgLike) =>
    e?.code === UNIQUE_VIOLATION &&
    INTERNAL_CODE_INDEXES.some(
      (index) =>
        e.constraint === index || String(e.message ?? "").includes(`"${index}"`),
    );

  const e = error as PgLike;
  const isInternalCodeClash =
    code !== null && (isIndexClash(e) || isIndexClash(e?.cause as PgLike));

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
