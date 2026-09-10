import { z } from "zod";
import { adminProcedure } from "#root/shared/trpc/server";
import { updateCategoryContent } from "./index";

// Zod schema for category content validation
const CategoryContentSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.object({
    enabled: z.boolean(),
    text: z.string(),
  }),
  hero: z.object({
    enabled: z.boolean(),
    imageUrl: z.string().url().optional().or(z.literal("")),
  }),
});

/**
 * tRPC procedure to update category content
 * Admin-only — single-shop mode means only admins manage content
 */
export const updateCategoryContentProcedure = adminProcedure
  .input(
    z.object({
      merchantId: z.string().uuid(),
      categoryId: z.string(),
      content: CategoryContentSchema,
    })
  )
  .mutation(async ({ input }) => {
    const updatedContent = await updateCategoryContent(
      input.merchantId,
      input.categoryId,
      input.content
    );

    return {
      success: true,
      content: updatedContent,
    };
  });
