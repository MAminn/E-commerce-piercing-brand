import path from "node:path";
import type { FastifyPluginAsync } from "fastify";
import { HERO_VIDEO_MAX_BYTES } from "#root/shared/homepage/hero-video";
import {
  HeroVideoUploadError,
  type HeroVideoVariant,
  saveHeroVideoUpload,
} from "./index";

/**
 * POST /api/homepage/hero-video?variant=desktop|mobile (multipart, one file)
 *
 * A plain multipart route rather than a tRPC mutation like uploadHeroImage:
 * tRPC here runs over superjson, which serialises a Uint8Array as a JSON array
 * of numbers — a 20MB video becomes ~70MB of JSON parsed in memory. This
 * streams the file straight to disk instead.
 */
export const heroVideoUploadApiPlugin: FastifyPluginAsync<{ rootDir: string }> = async (
  fastify,
  opts,
) => {
  const uploadsDir = path.join(opts.rootDir, "uploads");

  fastify.post("/hero-video", async (request, reply) => {
    const role = request.clientSession?.role;
    if (role !== "admin" && role !== "superadmin") {
      return reply.code(403).send({
        success: false,
        error: "Unauthorized. Only admins can upload homepage videos.",
      });
    }

    if (!request.isMultipart()) {
      return reply.code(400).send({ success: false, error: "Expected a multipart upload" });
    }

    const { variant: rawVariant } = request.query as { variant?: string };
    const variant: HeroVideoVariant = rawVariant === "mobile" ? "mobile" : "desktop";

    try {
      const file = await request.file({
        limits: { fileSize: HERO_VIDEO_MAX_BYTES, files: 1 },
      });
      if (!file) {
        return reply.code(400).send({ success: false, error: "No file provided" });
      }

      const result = await saveHeroVideoUpload({
        stream: file.file,
        filename: file.filename ?? "",
        mimeType: file.mimetype ?? "",
        variant,
        uploadsDir,
      });

      return reply.code(200).send({ success: true, data: result });
    } catch (err) {
      if (err instanceof HeroVideoUploadError) {
        return reply.code(err.statusCode).send({ success: false, error: err.message });
      }
      console.error("Homepage hero video upload error:", err);
      return reply.code(500).send({ success: false, error: "Failed to upload video" });
    }
  });
};
