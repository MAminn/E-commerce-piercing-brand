import { protectedProcedure } from "#root/shared/trpc/server";
import { z } from "zod";
import { uploadHeroImage } from "./index";
import { Effect } from "effect";

/**
 * tRPC procedure for uploading homepage hero background image
 * Protected: Requires admin role
 */
export const uploadHeroImageProcedure = protectedProcedure
  .input(
    z.object({
      file: z.object({
        name: z.string(),
        type: z.string(),
        buffer: z.instanceof(Uint8Array),
      }),
    })
  )
  .mutation(async ({ ctx, input }) => {
    const session = ctx.clientSession;

    // Only admins can upload homepage hero images
    if (!session || (session.role !== "admin" && session.role !== "superadmin")) {
      return {
        success: false as const,
        error: "Unauthorized. Only admins can upload homepage images.",
      };
    }

    try {
      const result = await Effect.runPromise(
        uploadHeroImage({
          buffer: input.file.buffer,
          mimeType: input.file.type,
        })
      );

      return {
        success: true as const,
        data: result,
      };
    } catch (error) {
      console.error("Homepage hero image upload error:", error);
      return {
        success: false as const,
        error:
          error instanceof Error ? error.message : "Failed to upload image",
      };
    }
  });
