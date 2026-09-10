import {
  runBackendEffect,
  serializeBackendEffectResult,
} from "#root/shared/backend/effect";
import { provideDatabase, protectedProcedure } from "#root/shared/trpc/server";
import { z } from "zod";
import { createFile } from "./createFile";
import { createWriteStream } from "node:fs";
import { unlink, writeFile } from "node:fs/promises";
import { v7 } from "uuid";
import sharp from "sharp";
import { Effect } from "effect";
import { cleanupTempFiles } from "./api";

// This will be invoked when the module is loaded
// Important: The cleanup interval is managed in api.ts to avoid duplicate intervals
// This just ensures cleanup runs if only tRPC route is used
setTimeout(() => {
  cleanupTempFiles().catch((err) => {
    console.error("Initial tRPC temp file cleanup failed:", err);
  });
}, 5000); // Slight delay to ensure server is fully started

// Create a file upload procedure
export const uploadFileProcedure = protectedProcedure
  .input(
    z.object({
      // This will be populated from FormData
      file: z.object({
        name: z.string(),
        type: z.string(),
        buffer: z.instanceof(Uint8Array),
      }),
    }),
  )
  .mutation(async ({ ctx, input }) => {
    const session = ctx.clientSession;

    // In single-shop mode, only admins can upload files
    if (!session || (session.role !== "admin" && session.role !== "superadmin")) {
      return {
        success: false as const,
        error: "Unauthorized",
      };
    }

    // Handle file upload
    try {
      // Generate a unique ID for the file
      const fileId = v7();
      let outputFormat = "webp";
      let filename = `${fileId}.webp`;
      const tempFilePath = `./uploads/temp_${fileId}`;

      // Determine optimal format based on mime type
      const mimeType = input.file.type.toLowerCase();
      if (mimeType.includes("image/")) {
        if (mimeType === "image/jpeg" || mimeType === "image/jpg") {
          // For JPEG, WebP is a good balance of quality/compression
          outputFormat = "webp";
        } else if (mimeType === "image/png") {
          // For PNG with transparency, preserve it with WebP
          outputFormat = "webp";
        } else if (mimeType === "image/gif") {
          // For GIFs, keep the format to preserve animation
          outputFormat = "gif";
          filename = `${fileId}.gif`;
        } else if (mimeType === "image/webp") {
          // WebP files can be re-optimized as WebP
          outputFormat = "webp";
        } else if (mimeType === "image/avif") {
          // AVIF files can be kept as AVIF
          outputFormat = "avif";
          filename = `${fileId}.avif`;
        } else {
          // Default to WebP for any other image type
          outputFormat = "webp";
        }
      }

      const finalFilePath = `./uploads/${filename}`;

      // First save the buffer to a temporary file
      await writeFile(tempFilePath, Buffer.from(input.file.buffer));

      // Create a Sharp processor with the appropriate format
      const imageProcessor = sharp(tempFilePath)
        // Remove metadata to reduce file size
        .rotate() // Auto-rotate based on EXIF orientation
        .withMetadata({
          // Keep only orientation metadata, strip everything else
          orientation: undefined,
        })
        // Resize but preserve aspect ratio
        .resize({
          height: 1000,
          width: 1500,
          fit: "inside", // Don't enlarge if smaller than these dimensions
          withoutEnlargement: true,
        });

      // Apply format-specific optimizations
      try {
        if (outputFormat === "webp") {
          await imageProcessor
            .webp({
              quality: 85, // Good balance between quality and file size
              effort: 6, // Higher compression effort (0-6)
              smartSubsample: true, // Better chroma subsampling
            })
            .toFile(finalFilePath);
        } else if (outputFormat === "avif") {
          await imageProcessor
            .avif({
              quality: 80,
              effort: 8, // Higher effort for compression (0-9)
            })
            .toFile(finalFilePath);
        } else if (outputFormat === "jpeg") {
          await imageProcessor
            .jpeg({
              quality: 85,
              progressive: true, // For progressive loading
              mozjpeg: true, // Better compression
              trellisQuantisation: true, // Better compression
              overshootDeringing: true, // Reduce artifacts
            })
            .toFile(finalFilePath);
        } else if (outputFormat === "png") {
          await imageProcessor
            .png({
              compressionLevel: 9, // Max compression (0-9)
              progressive: true,
              adaptiveFiltering: true, // Better compression
              palette: true, // Use palette for fewer colors if possible
            })
            .toFile(finalFilePath);
        } else if (outputFormat === "gif") {
          await imageProcessor
            .gif({
              // Keep GIF animation, optimize size
              colours: 256,
              effort: 10, // Max effort (1-10)
            })
            .toFile(finalFilePath);
        } else {
          // Fallback for any other format
          await imageProcessor
            .webp({
              quality: 85,
            })
            .toFile(finalFilePath);
        }

        // Add a small delay to ensure file handles are released
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Remove the temporary file with a safer approach
        try {
          await unlink(tempFilePath);
        } catch (err) {
          // Log but don't fail the upload if temp file deletion fails
          console.warn(
            "Warning: Could not delete temp file, will be cleaned up later:",
            tempFilePath,
          );
        }
      } catch (processingError) {
        // If image processing fails, try to clean up and re-throw
        try {
          await unlink(tempFilePath);
        } catch (err) {
          // Just log if cleanup fails
          console.warn(
            "Failed to clean up temp file after processing error:",
            tempFilePath,
          );
        }
        throw processingError;
      }

      // Save the file record to the database
      const result = await runBackendEffect(
        createFile({
          diskname: filename,
        }).pipe(provideDatabase(ctx)),
      ).then(serializeBackendEffectResult);

      // Return the result
      return result;
    } catch (error) {
      console.error("File upload error:", error);
      return {
        success: false as const,
        error: "Failed to upload file",
      };
    }
  });
