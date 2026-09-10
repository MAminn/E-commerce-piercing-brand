import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import unzipper from "unzipper";
import type { Readable } from "node:stream";

export interface ImportResult {
  success: boolean;
  error?: string;
  warning?: string;
}

/**
 * Fully overwrites the local Postgres DB from an uploaded environment-export
 * zip (see ./export.ts). Hard-blocked outside development — this is a
 * one-way, irreversible replace of whatever is currently in the target DB,
 * meant only for syncing a prod snapshot down into a throwaway dev
 * environment. Uploaded files are intentionally left where they are (see
 * PROD_ASSET_ORIGIN in server.ts) — this only touches uploadsDir if the zip
 * happens to contain an uploads/ entry, for backward compatibility with
 * older export files.
 */
export async function importFullExport(
  zipStream: Readable,
  uploadsDir: string,
): Promise<ImportResult> {
  if (process.env.NODE_ENV === "production") {
    return {
      success: false,
      error: "Import is disabled in production — this can only overwrite a dev database.",
    };
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    return { success: false, error: "DATABASE_URL is not set" };
  }

  const preflight = spawnSync("pg_restore", ["--version"]);
  if (preflight.error || preflight.status !== 0) {
    return { success: false, error: "pg_restore is not available on PATH" };
  }

  const workDir = await mkdtemp(path.join(tmpdir(), "synt-env-import-"));

  try {
    await zipStream.pipe(unzipper.Extract({ path: workDir })).promise();

    const dumpPath = path.join(workDir, "db.dump");
    if (!existsSync(dumpPath)) {
      return {
        success: false,
        error: "Uploaded archive is missing db.dump — not a valid export file",
      };
    }

    const restoreResult = await new Promise<{ code: number | null; stderr: string }>(
      (resolve) => {
        const child = spawn("pg_restore", [
          "--clean",
          "--if-exists",
          "--no-owner",
          "--no-privileges",
          `--dbname=${dbUrl}`,
          dumpPath,
        ]);
        let stderr = "";
        child.stderr.on("data", (chunk) => {
          stderr += chunk.toString();
        });
        child.on("close", (code) => resolve({ code, stderr }));
      },
    );

    const extractedUploads = path.join(workDir, "uploads");
    if (existsSync(extractedUploads)) {
      // A plain rename() fails with EXDEV when the OS temp dir and the
      // project dir live on different drives/filesystems (common on
      // Windows dev machines), so this copies across then removes the
      // source instead of relying on an atomic move.
      await rm(uploadsDir, { recursive: true, force: true });
      await cp(extractedUploads, uploadsDir, { recursive: true });
    }

    if (restoreResult.code !== 0) {
      // pg_restore commonly exits non-zero on benign notices (e.g. --clean
      // dropping objects that didn't exist yet on a fresh DB). The data
      // still lands correctly in that case, so this is surfaced as a
      // warning rather than treated as a hard failure.
      return {
        success: true,
        warning: `pg_restore reported issues (exit code ${restoreResult.code}). Review before trusting the result:\n${restoreResult.stderr.slice(0, 4000)}`,
      };
    }

    return { success: true };
  } catch (err) {
    console.error("[env-sync import] failed:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Import failed",
    };
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
