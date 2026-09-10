import { z } from "zod";
import { publicProcedure, router } from "#root/shared/trpc/server";
import {
  syncCart,
  attachContactToCart,
  recordProductView,
  markCartConverted,
} from "./service";

const cartItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  quantity: z.number().int().positive(),
  price: z.number().nonnegative(),
  imageUrl: z.string().optional(),
});

export const cartCaptureRouter = router({
  sync: publicProcedure
    .input(
      z.object({
        sessionToken: z.string().min(1),
        items: z.array(cartItemSchema),
        subtotal: z.number().nonnegative(),
        locale: z.enum(["en", "ar"]).optional(),
        email: z.string().email().optional(),
        phone: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Prefer the input's email (e.g. entered at checkout) but fall back
      // to the logged-in session's — a logged-in shopper's cart should
      // always be attributable even if they never typed an email anywhere.
      await syncCart({
        ...input,
        email: input.email ?? ctx.clientSession?.email,
        userId: ctx.clientSession?.id,
      });
      return { success: true as const };
    }),

  attachEmail: publicProcedure
    .input(
      z.object({
        sessionToken: z.string().min(1),
        email: z.string().email().optional(),
        phone: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await attachContactToCart({
        ...input,
        userId: ctx.clientSession?.id,
      });
      return { success: true as const };
    }),

  /** Called right after a real order is created — stops any pending abandoned-cart follow-ups for this session. */
  markConverted: publicProcedure
    .input(z.object({ sessionToken: z.string().min(1), orderId: z.string().uuid() }))
    .mutation(async ({ input }) => {
      await markCartConverted(input.sessionToken, input.orderId);
      return { success: true as const };
    }),

  recordProductView: publicProcedure
    .input(
      z.object({
        sessionToken: z.string().min(1),
        productId: z.string().uuid(),
        productName: z.string(),
        productImageUrl: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await recordProductView({ ...input, email: ctx.clientSession?.email });
      return { success: true as const };
    }),
});
