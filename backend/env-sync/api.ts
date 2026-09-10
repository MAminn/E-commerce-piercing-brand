import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import path from "node:path";
import { streamFullExport } from "./export";
import { importFullExport } from "./import";

const IMPORT_BODY_LIMIT = 2 * 1024 * 1024 * 1024; // 2GB — full DB + assets, not a normal upload

function isSuperadmin(request: FastifyRequest): boolean {
  return request.clientSession?.role === "superadmin";
}

export const envSyncApiPlugin: FastifyPluginAsync<{ rootDir: string }> = async (
  fastify,
  opts,
) => {
  const uploadsDir = path.join(opts.rootDir, "uploads");

  fastify.get("/export", async (request, reply) => {
    if (!isSuperadmin(request)) {
      return reply.code(403).send({ success: false, error: "Superadmin access required" });
    }

    try {
      await streamFullExport(reply);
    } catch (err) {
      console.error("[env-sync] export failed:", err);
      if (!reply.raw.headersSent) {
        return reply.code(500).send({
          success: false,
          error: err instanceof Error ? err.message : "Export failed",
        });
      }
    }
  });

  fastify.post(
    "/import",
    { bodyLimit: IMPORT_BODY_LIMIT },
    async (request, reply) => {
      if (!isSuperadmin(request)) {
        return reply.code(403).send({ success: false, error: "Superadmin access required" });
      }
      if (process.env.NODE_ENV === "production") {
        return reply.code(403).send({ success: false, error: "Import is disabled in production" });
      }

      const file = await request.file({ limits: { fileSize: IMPORT_BODY_LIMIT } });
      if (!file) {
        return reply.code(400).send({ success: false, error: "No file uploaded" });
      }

      const confirmField = file.fields.confirm;
      const confirmValue =
        confirmField && "value" in confirmField ? confirmField.value : undefined;
      if (confirmValue !== "OVERWRITE_DEV") {
        return reply.code(400).send({ success: false, error: "Missing confirmation" });
      }

      const result = await importFullExport(file.file, uploadsDir);
      return reply.code(result.success ? 200 : 500).send(result);
    },
  );
};
