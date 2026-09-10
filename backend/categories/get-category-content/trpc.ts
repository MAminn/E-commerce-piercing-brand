import { z } from "zod";
import { publicProcedure } from "#root/shared/trpc/server";
import { getCategoryContent } from "./index";

/**
 * tRPC procedure to get category content
 * Public access - returns default content if not found
 */
export const getCategoryContentProcedure = publicProcedure
  .input(
    z.object({
      merchantId: z.string().uuid(),
      categoryId: z.string(),
    })
  )
  .query(async ({ input }) => {
    const content = await getCategoryContent(
      input.merchantId,
      input.categoryId
    );
    return {
      success: true,
      content,
    };
  });
