import { searchProducts } from "#root/backend/products/search-products/service";
import {
  runBackendEffect,
  serializeBackendEffectResult,
} from "#root/shared/backend/effect";
import { DatabaseClientService } from "#root/shared/database/drizzle/db";
import { Effect } from "effect";
import type { PageContext } from "vike/types";

// Define clear success and error types
type ProductSuccess = {
  success: true;
  products: Array<{
    id: string;
    name: string;
    price: string | number;
    discountPrice?: number | string | null;
    stock: number;
    imageUrl: string | null;
    images?: Array<{
      url: string;
      isPrimary?: boolean;
    }>;
    available: boolean;
    categoryId: string;
    categoryName: string | null;
  }>;
};

type ProductError = {
  success: false;
  error: string;
};

export type Data = ProductSuccess | ProductError;

export const data = async (ctx: PageContext): Promise<Data> => {
  const searchResult = await runBackendEffect(
    searchProducts({
      limit: 100,
      offset: 0,
      includeOutOfStock: true,
    }).pipe(Effect.provideService(DatabaseClientService, ctx.db))
  ).then(serializeBackendEffectResult);

  if (!searchResult.success) {
    return {
      success: false,
      error: searchResult.error || "Failed to load products",
    };
  }

  return {
    success: true,
    products: searchResult.result.items,
  };
};
