import { t } from "#root/shared/trpc/server";
import { productRouter } from "../products/trpc";
import { fileRouter } from "../file/trpc";
import { orderRouter } from "../orders/trpc";
import { categoriesRouter } from "../categories/trpc";
import { promoCodesRouter } from "../promo-codes/trpc";
import { homepageRouter } from "../homepage/trpc";

// Single-shop mode: No vendor router
export const appRouter = t.router({
  product: productRouter,
  file: fileRouter,
  order: orderRouter,
  category: categoriesRouter,
  promoCodes: promoCodesRouter,
  homepage: homepageRouter,
});
