import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { splitMigrationStatements } from "../auto-migrate";

/**
 * The boot-time migrator is the ONLY mechanism that applies migrations in
 * deployment (see DEPLOYMENT.md), so its statement splitter must never lose a
 * statement. A chunk that begins with explanatory comments — the 0055 tier
 * backfill — used to be dropped wholesale while the file was still marked
 * applied.
 */
describe("splitMigrationStatements", () => {
  it("keeps a statement that follows leading comment lines", () => {
    const sql = `CREATE TABLE "a" ("id" int);--> statement-breakpoint
-- Backfill: explanation line one
-- explanation line two
INSERT INTO "a" ("id") SELECT 1
ON CONFLICT DO NOTHING;
`;
    expect(splitMigrationStatements(sql)).toEqual([
      'CREATE TABLE "a" ("id" int)',
      'INSERT INTO "a" ("id") SELECT 1\nON CONFLICT DO NOTHING',
    ]);
  });

  it("discards chunks that are only comments or whitespace", () => {
    expect(splitMigrationStatements("-- nothing here\n--> statement-breakpoint\n\n--> statement-breakpoint\nSELECT 1;")).toEqual(["SELECT 1"]);
  });

  it("leaves DO $$ blocks and inner comments intact", () => {
    const block = "DO $$ BEGIN\n  -- inner comment\n  PERFORM 1;\nEND $$;";
    expect(splitMigrationStatements(`${block}--> statement-breakpoint\nALTER TABLE "a" ADD COLUMN "b" int;`)).toEqual([
      block,
      'ALTER TABLE "a" ADD COLUMN "b" int',
    ]);
  });

  it("the committed 0055 migration yields its backfill INSERT as the last statement", () => {
    const sql = readFileSync("shared/database/migrations/0055_colorful_dazzler.sql", "utf-8");
    const statements = splitMigrationStatements(sql);
    expect(statements.at(-1)).toMatch(/^INSERT INTO "bundle_campaign_tier"/);
    expect(statements.at(-1)).toMatch(/ON CONFLICT \("bundle_campaign_id", "quantity"\) DO NOTHING$/);
    expect(statements).toHaveLength(6); // CREATE TABLE, ADD COLUMN, FK, two indexes, backfill
  });

  it("every committed breakpoint migration keeps at least as many statements as it has SQL chunks", () => {
    // Guard against regressions of the splitter on the whole folder.
    const { readdirSync } = require("node:fs") as typeof import("node:fs");
    const dir = "shared/database/migrations";
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql"))) {
      const sql = readFileSync(`${dir}/${file}`, "utf-8");
      if (!sql.includes("--> statement-breakpoint")) continue;
      const chunksWithSql = sql
        .split("--> statement-breakpoint")
        .filter((c) => c.split("\n").some((l) => l.trim() !== "" && !l.trim().startsWith("--"))).length;
      expect(splitMigrationStatements(sql).length, file).toBe(chunksWithSql);
    }
  });
});
