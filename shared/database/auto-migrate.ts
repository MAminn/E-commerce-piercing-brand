import pg from "pg";
import { readdir, readFile } from "fs/promises";
import path from "path";

/**
 * Runs all pending Drizzle migrations on server startup.
 * Gracefully handles "already exists" / "does not exist" errors.
 * Executes each SQL statement individually so one failure doesn't block others.
 *
 * IMPORTANT: On first boot against a fresh database the tracking table
 * (__drizzle_migrations) is empty, so every migration runs in order.
 * If migrations were previously recorded but the actual schema was dropped
 * (e.g. new database on a second deployment), we detect the mismatch and
 * re-run all migrations.
 */
export async function runMigrations(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;

  if (!dbUrl) {
    console.warn("⚠️  DATABASE_URL not set — skipping auto-migration");
    return;
  }

  let client: pg.Client | undefined;
  try {
    console.log("📡 [Auto-Migrate] Connecting to database...");
    client = new pg.Client({ connectionString: dbUrl });
    await client.connect();

    // Ensure migration tracking table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS __drizzle_migrations (
        id SERIAL PRIMARY KEY,
        hash VARCHAR(255) NOT NULL UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // ── Integrity check ──────────────────────────────────────────────
    // If the tracking table claims migrations were applied but core
    // tables are missing, the tracking data is stale (fresh DB, different
    // cluster, etc.).  Wipe it so every migration re-runs cleanly.
    //
    // We check multiple core tables — not just one — so that a partially
    // migrated database (e.g. `product` exists but `homepage_content`
    // doesn't) is caught and the missing migrations are re-applied.
    const tracked = await client.query(
      "SELECT COUNT(*)::int AS cnt FROM __drizzle_migrations",
    );
    if (tracked.rows[0].cnt > 0) {
      const coreTables = ["product", "homepage_content", "layout_settings"];
      const probe = await client.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = ANY($1)
      `, [coreTables]);

      const existing = new Set(probe.rows.map((r: any) => r.table_name));
      const missing = coreTables.filter((t) => !existing.has(t));

      if (missing.length > 0) {
        console.warn(
          `⚠️  [Auto-Migrate] Tracking table has entries but core tables are missing (${missing.join(", ")}) — resetting tracking`,
        );
        await client.query("DELETE FROM __drizzle_migrations");
      }
    }

    const migrationsFolder = path.join(
      process.cwd(),
      "shared/database/migrations",
    );

    let migrationFiles: string[];
    try {
      migrationFiles = (await readdir(migrationsFolder))
        .filter((file) => file.endsWith(".sql"))
        .sort();
    } catch {
      console.log("📁 [Auto-Migrate] No migrations folder found — skipping");
      await client.end();
      return;
    }

    if (migrationFiles.length === 0) {
      console.log("📁 [Auto-Migrate] No migration files found — skipping");
      await client.end();
      return;
    }

    console.log(
      `📁 [Auto-Migrate] Found ${migrationFiles.length} migration files`,
    );

    let applied = 0;
    let skipped = 0;
    let failed = 0;

    for (const file of migrationFiles) {
      // Check if migration was already applied
      const result = await client.query(
        "SELECT * FROM __drizzle_migrations WHERE hash = $1",
        [file],
      );

      if (result.rows.length > 0) {
        skipped++;
        continue;
      }

      console.log(`📝 [Auto-Migrate] Applying: ${file}`);
      const migrationSQL = await readFile(
        path.join(migrationsFolder, file),
        "utf-8",
      );

      // Custom (non-Drizzle) migrations don't use the statement-breakpoint
      // delimiter — detect and handle them as a single block.
      const usesBreakpoints = migrationSQL.includes(
        "--> statement-breakpoint",
      );

      let statements: string[];
      if (usesBreakpoints) {
        statements = migrationSQL
          .split("--> statement-breakpoint")
          .map((s) => s.trim())
          .filter((s) => s.length > 0)
          .map((s) => {
            // Only strip trailing semicolons for simple statements, not DO blocks
            if (s.endsWith(";") && !s.includes("$$")) {
              return s.slice(0, -1).trim();
            }
            return s;
          })
          .filter((s) => s.length > 0 && !s.startsWith("--"));

        // Drizzle generates ALTER COLUMN TYPE statements alphabetically by table name.
        // This breaks FK constraints: PostgreSQL requires the referenced (parent) column
        // to be altered BEFORE any FK child columns that reference it.
        // Sort so that ALTER TABLE "user" (the only PK referenced by FKs) comes first.
        const isParentAlter = (s: string) =>
          /ALTER TABLE "user" ALTER COLUMN/i.test(s);
        statements.sort((a, b) => {
          if (isParentAlter(a) && !isParentAlter(b)) return -1;
          if (!isParentAlter(a) && isParentAlter(b)) return 1;
          return 0;
        });
      } else {
        // Run the entire file as a single statement — this handles
        // multi-statement custom scripts (they rely on their own semicolons).
        const trimmed = migrationSQL.trim();
        statements = trimmed.length > 0 ? [trimmed] : [];
      }

      let migrationFailed = false;

      // ── FK-aware type-change handling ────────────────────────────────────
      // When a migration contains SET DATA TYPE statements, PostgreSQL will
      // reject changing a referenced PK column while FK constraints exist, and
      // reject changing FK columns to a type that doesn't match the parent.
      // Fix: drop all affected FK constraints, run the type changes, recreate them.
      const hasTypeChanges = statements.some((s) =>
        /SET DATA TYPE/i.test(s),
      );

      if (hasTypeChanges) {
        const affectedTables = [
          ...new Set(
            statements
              .filter((s) => /SET DATA TYPE/i.test(s))
              .map((s) => s.match(/ALTER TABLE "([^"]+)"/)?.[1])
              .filter((t): t is string => Boolean(t)),
          ),
        ];

        // Query all FK constraints where the table OR the referenced table is affected
        const fkResult = await client.query(
          `SELECT
             tc.constraint_name,
             tc.table_name,
             kcu.column_name,
             ccu.table_name  AS foreign_table_name,
             ccu.column_name AS foreign_column_name,
             rc.update_rule,
             rc.delete_rule
           FROM information_schema.table_constraints AS tc
           JOIN information_schema.key_column_usage AS kcu
             ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema    = kcu.table_schema
           JOIN information_schema.constraint_column_usage AS ccu
             ON ccu.constraint_name = tc.constraint_name
            AND ccu.table_schema    = tc.table_schema
           JOIN information_schema.referential_constraints AS rc
             ON rc.constraint_name  = tc.constraint_name
            AND rc.constraint_schema = tc.table_schema
           WHERE tc.constraint_type = 'FOREIGN KEY'
             AND tc.table_schema = 'public'
             AND (tc.table_name = ANY($1) OR ccu.table_name = ANY($1))`,
          [affectedTables],
        );

        const fkConstraints = fkResult.rows as Array<{
          constraint_name: string;
          table_name: string;
          column_name: string;
          foreign_table_name: string;
          foreign_column_name: string;
          update_rule: string;
          delete_rule: string;
        }>;

        // Drop all affected FK constraints
        for (const fk of fkConstraints) {
          try {
            await client.query(
              `ALTER TABLE "${fk.table_name}" DROP CONSTRAINT IF EXISTS "${fk.constraint_name}"`,
            );
          } catch (e: any) {
            console.warn(`  [Auto-Migrate] Could not drop FK ${fk.constraint_name}: ${e.message}`);
          }
        }

        // Run all the type-change statements
        for (const statement of statements) {
          try {
            await client.query(statement);
          } catch (error: any) {
            const msg = String(error.message || "").toLowerCase();
            const code = error.code;
            const isIgnorable =
              code === "42P07" || code === "42701" || code === "42710" ||
              code === "42704" || msg.includes("already exists") ||
              msg.includes("duplicate key value");
            if (isIgnorable) {
              console.log(`⚠️  [Auto-Migrate] Skipping (${code}): ${msg.slice(0, 120)}`);
              continue;
            }
            console.error(`❌ [Auto-Migrate] Statement failed in ${file} (${code}): ${msg.slice(0, 200)}`);
            migrationFailed = true;
            break;
          }
        }

        // Recreate all FK constraints (even if some statements failed — best effort)
        for (const fk of fkConstraints) {
          try {
            await client.query(
              `ALTER TABLE "${fk.table_name}"
               ADD CONSTRAINT "${fk.constraint_name}"
               FOREIGN KEY ("${fk.column_name}")
               REFERENCES "${fk.foreign_table_name}"("${fk.foreign_column_name}")
               ON UPDATE ${fk.update_rule} ON DELETE ${fk.delete_rule}`,
            );
          } catch (e: any) {
            console.warn(`  [Auto-Migrate] Could not recreate FK ${fk.constraint_name}: ${e.message}`);
          }
        }
      } else {
        // Normal path — no type changes, run statements as-is
        for (const statement of statements) {
          try {
            await client.query(statement);
          } catch (error: any) {
            const msg = String(error.message || "").toLowerCase();
            const code = error.code;

            // PostgreSQL error codes for idempotent DDL scenarios:
            // 42P07 = duplicate_table (relation already exists)
            // 42701 = duplicate_column (column already exists)
            // 42710 = duplicate_object (type/constraint/index already exists)
            // 42704 = undefined_object (constraint/type does not exist — safe to skip for DROP IF EXISTS)
            const isIgnorable =
              code === "42P07" ||
              code === "42701" ||
              code === "42710" ||
              code === "42704" ||
              msg.includes("already exists") ||
              msg.includes("duplicate key value");

            if (isIgnorable) {
              console.log(
                `⚠️  [Auto-Migrate] Skipping statement (${code || "unknown"}): ${msg.slice(0, 120)}`,
              );
              continue;
            }

            // Log but don't throw — continue to next migrations
            console.error(
              `❌ [Auto-Migrate] Statement failed in ${file} (${code || "unknown"}): ${msg.slice(0, 200)}`,
            );
            migrationFailed = true;
            break;
          }
        }
      }

      if (migrationFailed) {
        failed++;
        continue; // Skip marking as applied, but continue with next migration
      }

      // Mark migration as applied
      await client.query(
        "INSERT INTO __drizzle_migrations (hash) VALUES ($1)",
        [file],
      );
      applied++;
      console.log(`✅ [Auto-Migrate] Applied: ${file}`);
    }

    if (failed > 0) {
      console.warn(
        `⚠️  [Auto-Migrate] Done — ${applied} applied, ${skipped} up-to-date, ${failed} FAILED (will retry next restart)`,
      );
    } else {
      console.log(
        `✅ [Auto-Migrate] Done — ${applied} applied, ${skipped} already up-to-date`,
      );
    }
    await client.end();
  } catch (error: any) {
    console.error("❌ [Auto-Migrate] Migration failed:", error.message);
    if (client) await client.end();
    // Don't crash the server — just log the error
  }
}
