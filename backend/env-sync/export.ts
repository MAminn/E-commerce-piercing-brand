import { spawn, spawnSync } from "node:child_process";
import { ZipArchive } from "archiver";
import type { FastifyReply } from "fastify";

/**
 * Streams a full DB snapshot (pg_dump custom format, zipped) directly to the
 * HTTP response. Uploaded files deliberately are NOT included — they live on
 * a persistent volume separate from the app and stay there; local dev falls
 * back to loading them straight from PROD_ASSET_ORIGIN instead (see the
 * /uploads/* route in server.ts). Nothing is buffered fully in memory or
 * written to a scratch file on this side — pg_dump's stdout is piped
 * straight into the archive, which pipes straight into the response.
 */
export async function streamFullExport(reply: FastifyReply): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error("DATABASE_URL is not set");
  }

  const preflight = spawnSync("pg_dump", ["--version"]);
  if (preflight.error || preflight.status !== 0) {
    throw new Error("pg_dump is not available on PATH in this environment");
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `synt-env-export-${timestamp}.zip`;

  reply.raw.setHeader("Content-Type", "application/zip");
  reply.raw.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  reply.hijack();

  const archive = new ZipArchive({ zlib: { level: 6 } });
  archive.on("warning", (err: Error) => {
    console.warn("[env-sync export] archive warning:", err);
  });
  archive.on("error", (err: Error) => {
    console.error("[env-sync export] archive error:", err);
    reply.raw.destroy(err instanceof Error ? err : new Error(String(err)));
  });
  archive.pipe(reply.raw);

  const pgDump = spawn("pg_dump", [
    "--format=custom",
    "--no-owner",
    "--no-privileges",
    dbUrl,
  ]);
  let stderr = "";
  pgDump.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  pgDump.on("error", (err) => {
    console.error("[env-sync export] pg_dump spawn error:", err);
  });
  pgDump.on("close", (code) => {
    if (code !== 0) {
      console.error(`[env-sync export] pg_dump exited with code ${code}:`, stderr);
    }
  });

  archive.append(pgDump.stdout, { name: "db.dump" });

  await archive.finalize();
}
