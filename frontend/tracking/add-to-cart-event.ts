import { TrackingEventName } from "#root/shared/types/pixel-tracking";
import { STORE_CURRENCY } from "#root/shared/config/branding";

export interface AddToCartProduct {
  id: string;
  name: string;
  price: number;
  quantity?: number;
  categoryName?: string | null;
}

export function buildAddToCartEcommerce(product: AddToCartProduct) {
  const quantity = product.quantity ?? 1;
  return {
    currency: STORE_CURRENCY,
    value: product.price * quantity,
    items: [
      {
        itemId: product.id,
        itemName: product.name,
        price: product.price,
        quantity,
        category: product.categoryName ?? undefined,
      },
    ],
  };
}

export function trackAddToCartEvent(
  trackEvent: (
    eventName: TrackingEventName | string,
    data?: {
      ecommerce?: ReturnType<typeof buildAddToCartEcommerce>;
      customProperties?: Record<string, unknown>;
    },
  ) => void,
  product: AddToCartProduct,
) {
  trackEvent(TrackingEventName.PRODUCT_ADDED_TO_CART, {
    ecommerce: buildAddToCartEcommerce(product),
  });
}
