import { describe, expect, it } from "vitest";
import { rethrowInternalCodeConflict } from "../internal-code";

/**
 * The race fallback: two admins pass the pre-flight uniqueness check at once
 * and the unique index rejects one of them. That rejection has to reach the
 * admin as the same "already used" message, not an opaque database error.
 */
const pgClash = (constraint: string) =>
  Object.assign(new Error(`duplicate key value violates unique constraint "${constraint}"`), {
    code: "23505",
    constraint,
  });

/** drizzle-orm 0.44+ shape: the Postgres error is the `cause`. */
const drizzleWrapped = (cause: Error) =>
  Object.assign(new Error('Failed query: update "product" set ...'), { cause });

const capture = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e;
  }
  throw new Error("expected a throw");
};

describe("rethrowInternalCodeConflict", () => {
  it("maps a bare Postgres clash on the internal-code index", () => {
    const e = capture(() =>
      rethrowInternalCodeConflict(pgClash("product_internal_code_idx"), "FB2_001_R1"),
    );
    expect(e).toMatchObject({ _tag: "DuplicateInternalCode", statusCode: 400 });
    expect((e as { clientMessage: string }).clientMessage).toMatch(/"FB2_001_R1" is already used/);
  });

  it("maps a clash on the live-products-only index (migration 0068)", () => {
    const e = capture(() =>
      rethrowInternalCodeConflict(
        drizzleWrapped(pgClash("product_internal_code_active_idx")),
        "FB2_001",
      ),
    );
    expect(e).toMatchObject({ _tag: "DuplicateInternalCode" });
  });

  it("maps the same clash when drizzle wraps it as the cause", () => {
    const e = capture(() =>
      rethrowInternalCodeConflict(
        drizzleWrapped(pgClash("product_internal_code_idx")),
        "FB2_001_R1",
      ),
    );
    expect(e).toMatchObject({ _tag: "DuplicateInternalCode" });
  });

  it("re-throws any other unique violation untouched, wrapped or not", () => {
    const bare = pgClash("product_slug_idx");
    const wrapped = drizzleWrapped(pgClash("product_catalogue_no_idx"));
    expect(capture(() => rethrowInternalCodeConflict(bare, "FB2_001_R1"))).toBe(bare);
    expect(capture(() => rethrowInternalCodeConflict(wrapped, "FB2_001_R1"))).toBe(wrapped);
  });

  it("never claims a clash for a blank code", () => {
    const clash = drizzleWrapped(pgClash("product_internal_code_idx"));
    expect(capture(() => rethrowInternalCodeConflict(clash, null))).toBe(clash);
  });

  it("re-throws non-database errors untouched", () => {
    const err = new Error("Product not updated");
    expect(capture(() => rethrowInternalCodeConflict(err, "FB2_001_R1"))).toBe(err);
  });
});
