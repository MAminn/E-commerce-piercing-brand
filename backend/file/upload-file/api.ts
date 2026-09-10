import { runBackendEffect } from "#root/shared/backend/effect";
import type { FastifyInstance } from "fastify";
import { createWriteStream } from "node:fs";
import { unlink } from "node:fs/promises";
import { v7 } from "uuid";
import { createFile } from "./createFile";
import { DatabaseClientService } from "#root/shared/database/drizzle/db";
import { Effect, pipe } from "effect";
import { imageOptimizationService } from "#root/shared/backend/image-optimization";
import path from "node:path";
import fs from "node:fs";
import { ServerError } from "#root/shared/error/server";

// Function to clean up temporary files older than a specified time
export const cleanupTempFiles = async (maxAgeMs = 3600000) => {
  // Default: 1 hour
  try {
    const uploadsDir = "./uploads";

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

export const uploadFileApiPlugin = (app: FastifyInstance) => {
  // Set up periodic cleanup - run every 30 minutes
  const CLEANUP_INTERVAL = 30 * 60 * 1000; // 30 minutes
  setInterval(() => {
    cleanupTempFiles().catch((err) => {
      console.error("Background temp file cleanup failed:", err);
    });
  }, CLEANUP_INTERVAL);

  // Run initial cleanup on startup
  cleanupTempFiles().catch((err) => {
    console.error("Initial temp file cleanup failed:", err);
  });

  app.post("/file", async (req, res) => {
    const session = req.clientSession;

    const data = await req.file();
    if (!data) {
      return res
        .status(400)
        .send({ success: false, error: "No file provided" });
    }

    // if (!data.type.startsWith("image/")) {
    // 	return res
    // 		.status(400)
    // 		.send({ success: false, error: "Invalid file type" });
    // }

    try {
      const fileId = v7();

      // Determine if this is an image file
      const mimeType = data.mimetype?.toLowerCase() || "";
      const isImage = mimeType.startsWith("image/");

      // Determine output type based on mime type
      let outputFormat = "default";
      if (
        mimeType === "image/jpeg" ||
        mimeType === "image/jpg" ||
        mimeType === "image/png" ||
        mimeType === "image/webp" ||
        mimeType === "image/avif" ||
        mimeType === "image/gif" ||
        mimeType === "image/svg+xml"
      ) {
        outputFormat = "default";
      }

      // For non-image files or special formats, just save the original
      if (!isImage) {
        const tempFilePath = `./uploads/temp_${fileId}`;
        const finalFileName = `${fileId}${path.extname(data.filename || "")}`;
        const finalFilePath = `./uploads/${finalFileName}`;

        // Save the uploaded file to a temporary location
        await new Promise<void>((resolve, reject) => {
          const writeStream = createWriteStream(tempFilePath);
          data.file.pipe(writeStream).on("finish", resolve).on("error", reject);
        }).catch(async (err) => {
          console.error("Error saving temporary file:", err);
          throw err;
        });

        try {
          // Move the file to its final location
          await fs.promises.rename(tempFilePath, finalFilePath);
        } catch (err) {
          // If rename fails, try to clean up and throw
          try {
            await unlink(tempFilePath);
          } catch (cleanupErr) {
            console.warn(
              "Failed to clean up temp file after rename error:",
              tempFilePath
            );
          }
          throw err;
        }

        const result = await runBackendEffect(
          createFile({
            diskname: finalFileName,
          }).pipe(Effect.provideService(DatabaseClientService, req.db))
        );

        if (!result.success) {
          await unlink(finalFilePath);
          return res
            .status(500)
            .send({ success: false, error: "Failed to upload file" });
        }

        return res.status(200).send({
          success: true,
          result: result.result,
        });
      }

      // For image files, optimize using our service
      // First save to a temporary file
      const tempFilePath = `./uploads/temp_${fileId}`;
      await new Promise<void>((resolve, reject) => {
        const writeStream = createWriteStream(tempFilePath);
        data.file.pipe(writeStream).on("finish", resolve).on("error", reject);
      }).catch(async (err) => {
        console.error("Error saving temporary file:", err);
        throw err;
      });

      // Determine output format and filename
      const outputFilename = `${fileId}.webp`;
      const outputPath = `./uploads/${outputFilename}`;

      // Optimize the image using our service
      const optimizationResult = await runBackendEffect(
        pipe(
          imageOptimizationService.optimizeFile(
            tempFilePath,
            outputPath,
            "default", // Use default optimization settings
            {
              // For GIFs, preserve animation by using GIF format
              format: mimeType === "image/gif" ? "gif" : "webp",
            }
          ),
          Effect.mapError(
            (err) =>
              new ServerError({
                tag: "IMAGE_OPTIMIZATION_ERROR",
                message: "Failed to optimize image",
                clientMessage: "Failed to optimize image",
                cause: err,
              })
          )
        )
      );

      // Clean up temporary file
      try {
        // Add a small delay to ensure file handles are released
        await new Promise((resolve) => setTimeout(resolve, 100));
        await unlink(tempFilePath);
      } catch (err) {
        // Just log but don't fail the upload if temp deletion fails
        console.warn(
          "Warning: Could not delete temp file, will be cleaned up later:",
          tempFilePath
        );
      }

      // If optimization failed, return error
      if (!optimizationResult.success) {
        return res.status(500).send({
          success: false,
          error:
            optimizationResult.error?.clientMessage ||
            "Failed to optimize image",
        });
      }

      // Get actual output filename considering format
      const actualOutput = path.basename(
        optimizationResult.result.outputPath || outputPath
      );

      // Save to database
      const result = await runBackendEffect(
        createFile({
          diskname: actualOutput,
        }).pipe(Effect.provideService(DatabaseClientService, req.db))
      );

      if (!result.success) {
        // Delete the file if database insert fails
        await unlink(outputPath);
        return res
          .status(500)
          .send({ success: false, error: "Failed to upload file" });
      }

      // Return file info and optimization stats
      return res.status(200).send({
        success: true,
        result: {
          ...result.result,
          optimization: {
            originalSize: optimizationResult.result.originalSize,
            optimizedSize: optimizationResult.result.optimizedSize,
            compressionRatio: optimizationResult.result.compressionRatio,
            width: optimizationResult.result.width,
            height: optimizationResult.result.height,
            format: optimizationResult.result.format,
          },
        },
      });
    } catch (err) {
      console.error("Error processing file upload:", err);
      return res
        .status(500)
        .send({ success: false, error: "Failed to upload file" });
    }
  });
};
