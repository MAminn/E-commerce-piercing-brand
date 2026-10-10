import { runBackendEffect } from "#root/shared/backend/effect";
import type { FastifyPluginAsync } from "fastify";
import { createWriteStream } from "node:fs";
import { open, unlink } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { v7 } from "uuid";
import { createFile } from "./createFile";
import { DatabaseClientService } from "#root/shared/database/drizzle/db";
import { Effect, pipe } from "effect";
import { imageOptimizationService } from "#root/shared/backend/image-optimization";
import { isSingleShopMode } from "#root/shared/config/app";
import path from "node:path";
import fs from "node:fs";
import { ServerError } from "#root/shared/error/server";
import {
  FILE_UPLOAD_MAX_BYTES,
  FileUploadError,
  assertContentMatches,
  canUploadFiles,
  validateDeclaredImage,
} from "./validate";

// Function to clean up temporary files older than a specified time
export const cleanupTempFiles = async (maxAgeMs = 3600000, uploadsDir = "./uploads") => {
  // Default: 1 hour
  try {
    // Ensure uploads directory exists
    if (!fs.existsSync(uploadsDir)) {
      return;
    }

    const now = Date.now();
    const files = await fs.promises.readdir(uploadsDir);

    for (const file of files) {
      if (file.startsWith("temp_")) {
        try {
          const filePath = path.join(uploadsDir, file);
          const stats = await fs.promises.stat(filePath);

          // Check if file is older than maxAgeMs
          if (now - stats.mtime.getTime() > maxAgeMs) {
            await fs.promises.unlink(filePath);
            console.log(`Cleaned up stale temporary file: ${filePath}`);
          }
        } catch (err) {
          console.warn(`Failed to clean up temp file: ${file}`, err);
        }
      }
    }
  } catch (err) {
    console.error("Error in temporary file cleanup:", err);
  }
};

const SNIFF_BYTES = 64;

async function readHead(filePath: string): Promise<Uint8Array> {
  const handle = await open(filePath, "r");
  try {
    const buffer = new Uint8Array(SNIFF_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, SNIFF_BYTES, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

/**
 * POST /file — the dashboard's generic image upload (category images, bundle
 * images, the category-type image field).
 *
 * Images only, and only for dashboard roles (see canUploadFiles). The file
 * must be an allowed image by extension, MIME type and content, and is then
 * re-encoded by sharp — so what lands on disk is always a freshly written
 * WebP (or GIF, to keep animation) under a server-generated name, never the
 * uploaded bytes or the client's filename.
 *
 * This route used to accept any file from anyone and store non-images
 * verbatim with the client's extension, which made it possible to host
 * HTML/script on the storefront's own origin. Files already stored keep
 * working; the static /uploads serving is unchanged.
 */
export const uploadFileApiPlugin: FastifyPluginAsync<{
  uploadsDir?: string;
}> = async (app, opts) => {
  const uploadsDir = opts.uploadsDir ?? "./uploads";

  // Set up periodic cleanup - run every 30 minutes
  const CLEANUP_INTERVAL = 30 * 60 * 1000; // 30 minutes
  const cleanupTimer = setInterval(() => {
    cleanupTempFiles(undefined, uploadsDir).catch((err) => {
      console.error("Background temp file cleanup failed:", err);
    });
  }, CLEANUP_INTERVAL);
  cleanupTimer.unref?.();
  app.addHook("onClose", async () => clearInterval(cleanupTimer));

  // Run initial cleanup on startup
  cleanupTempFiles(undefined, uploadsDir).catch((err) => {
    console.error("Initial temp file cleanup failed:", err);
  });

  app.post("/file", async (req, res) => {
    const session = req.clientSession;
    if (!session) {
      return res.status(401).send({ success: false, error: "Please sign in to upload files" });
    }
    if (!canUploadFiles(session.role, isSingleShopMode())) {
      return res.status(403).send({
        success: false,
        error: "You don't have permission to upload files",
      });
    }
    if (!req.isMultipart()) {
      return res.status(400).send({ success: false, error: "No file provided" });
    }

    const fileId = v7();
    const tempFilePath = path.join(uploadsDir, `temp_${fileId}`);
    let outputPath: string | null = null;
    // Built inside the try and sent only after the temp/output cleanup in
    // `finally`, so a rejected upload is gone from disk before the client hears back.
    let response: { status: number; body: unknown };

    try {
      const data = await req.file({
        limits: { fileSize: FILE_UPLOAD_MAX_BYTES, files: 1 },
      });
      if (!data) {
        throw new FileUploadError("No file provided", 400);
      }

      let declared: ReturnType<typeof validateDeclaredImage>;
      try {
        declared = validateDeclaredImage(data.filename ?? "", data.mimetype ?? "");
      } catch (err) {
        // Drain the unread body so the client gets the error, not a reset.
        data.file.on("error", () => {});
        data.file.resume();
        throw err;
      }

      await fs.promises.mkdir(uploadsDir, { recursive: true });
      try {
        await pipeline(data.file, createWriteStream(tempFilePath));
      } catch (err) {
        if ((err as { code?: string }).code === "FST_REQ_FILE_TOO_LARGE") {
          throw new FileUploadError(
            `File too large. Maximum size is ${FILE_UPLOAD_MAX_BYTES / (1024 * 1024)}MB.`,
            413,
          );
        }
        throw err;
      }
      if (data.file.truncated) {
        throw new FileUploadError(
          `File too large. Maximum size is ${FILE_UPLOAD_MAX_BYTES / (1024 * 1024)}MB.`,
          413,
        );
      }

      const format = assertContentMatches(declared, await readHead(tempFilePath));

      // GIFs stay GIF to keep animation; everything else becomes WebP.
      const outputFilename = `${fileId}.${format === "gif" ? "gif" : "webp"}`;
      outputPath = path.join(uploadsDir, outputFilename);

      const optimizationResult = await runBackendEffect(
        pipe(
          imageOptimizationService.optimizeFile(tempFilePath, outputPath, "default", {
            format: format === "gif" ? "gif" : "webp",
          }),
          Effect.mapError(
            (err) =>
              new ServerError({
                tag: "IMAGE_OPTIMIZATION_ERROR",
                message: "Failed to optimize image",
                clientMessage: "Failed to optimize image",
                cause: err,
              }),
          ),
        ),
      );

      // optimizeFile reports decode failures as success:false rather than throwing.
      if (!optimizationResult.success || !optimizationResult.result.success) {
        throw new FileUploadError("This file couldn't be processed as an image.", 415);
      }

      const result = await runBackendEffect(
        createFile({ diskname: outputFilename }).pipe(
          Effect.provideService(DatabaseClientService, req.db),
        ),
      );
      if (!result.success) {
        throw new FileUploadError("Failed to upload file", 500);
      }
      outputPath = null; // Keep the stored file.

      const optimization = optimizationResult.result;
      response = {
        status: 200,
        body: {
          success: true,
          result: {
            ...result.result,
            optimization: {
              originalSize: optimization.originalSize,
              optimizedSize: optimization.optimizedSize,
              compressionRatio: optimization.compressionRatio,
              width: optimization.width,
              height: optimization.height,
              format: optimization.format,
            },
          },
        },
      };
    } catch (err) {
      if (err instanceof FileUploadError) {
        response = {
          status: err.statusCode,
          body: { success: false, error: err.message },
        };
      } else {
        console.error("Error processing file upload:", err);
        response = {
          status: 500,
          body: { success: false, error: "Failed to upload file" },
        };
      }
    } finally {
      await unlink(tempFilePath).catch(() => {});
      if (outputPath) await unlink(outputPath).catch(() => {});
    }
    return res.status(response.status).send(response.body);
  });
};
