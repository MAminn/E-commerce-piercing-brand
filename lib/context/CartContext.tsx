import React, { createContext, useContext, useState, useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import type { Product } from "../mock-data/products";
import { trpc } from "#root/shared/trpc/client";
import type { AppliedOffer } from "#root/backend/offers/service";
import { getCartSessionToken } from "#root/lib/cart-session";
import { computePromoDiscount, deriveEffectiveShipping, computeFreeItemQuantities } from "#root/shared/pricing/cart-math";

export interface CartItem extends Product {
  quantity: number;
  selectedOptions: Record<string, string>;
}

export interface PromoCodeInfo {
  id: string;
  code: string;
  discountType: "percentage" | "fixed_amount";
  discountValue: number;
  appliesToAllProducts: boolean;
  /** Human-readable discount, e.g. "10% off". Absent on older cached copies. */
  discountLabel?: string;
  description?: string | null;
}

/**
 * Outcome of applying a promo code. `message` is always populated with
 * something worth showing the shopper — on failure it's the server's specific
 * reason, on success a confirmation of what the code did.
 */
export interface PromoCodeApplyResult {
  success: boolean;
  message: string;
}

interface CartContextType {
  items: CartItem[];
  addItem: (
    item: Product,
    quantity: number,
    selectedOptions: CartItem["selectedOptions"],
  ) => boolean;
  removeItem: (itemId: string, options?: CartItem["selectedOptions"]) => void;
  updateQuantity: (
    itemId: string,
    quantity: number,
    options?: CartItem["selectedOptions"],
  ) => boolean;
  clearCart: () => void;
  totalItems: number;
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
  promoCode: PromoCodeInfo | null;
  applyPromoCode: (code: string) => Promise<PromoCodeApplyResult>;
  removePromoCode: () => void;
  /** Set when a previously applied code stopped being valid on its own. */
  promoCodeNotice: string | null;
  clearPromoCodeNotice: () => void;
  findItemInCart: (
    itemId: string,
    options: CartItem["selectedOptions"],
  ) => CartItem | undefined;
  appliedOffers: AppliedOffer[];
  offerDiscount: number;
  /** How many units of each cart item (by index, same order as `items`) an
   * offer made free — e.g. [0, 1, 0] means the second item has 1 free unit. */
  freeQuantities: number[];
}

const CartContext = createContext<CartContextType | undefined>(undefined);

/**
 * Pulls the server's user-facing reason out of a failed tRPC result.
 * The result is a discriminated union, so the error field only exists on the
 * failure branch.
 */
function promoErrorMessage(result: unknown): string | null {
  if (
    result &&
    typeof result === "object" &&
    "error" in result &&
    typeof (result as { error: unknown }).error === "string"
  ) {
    return (result as { error: string }).error;
  }
  return null;
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [promoCode, setPromoCode] = useState<PromoCodeInfo | null>(null);
  const [promoCodeNotice, setPromoCodeNotice] = useState<string | null>(null);
  // The store's configured shipping fee, fetched once. Never mutate this
  // directly to reflect "free shipping right now" — `shipping` below derives
  // that from current offer state instead, so it can never get stuck at 0
  // after a free-shipping offer stops applying (see appliedOffers).
  const [baseShippingFee, setBaseShippingFee] = useState<number>(0);
  const [appliedOffers, setAppliedOffers] = useState<AppliedOffer[]>([]);
  const [offerDiscount, setOfferDiscount] = useState<number>(0);

  useEffect(() => {
    const savedCart = localStorage.getItem("cart");
    if (savedCart) {
      try {
        const parsedCart = JSON.parse(savedCart);
        setItems(parsedCart);
      } catch (error) {
        console.error("Failed to parse cart from localStorage");
        localStorage.removeItem("cart");
      }
    }

    const savedPromoCode = localStorage.getItem("promoCode");
    if (savedPromoCode) {
      try {
        const parsedPromoCode = JSON.parse(savedPromoCode);
        // Re-validate the promo code against backend to check if it's still active/not expired
        const savedCartItems = savedCart ? JSON.parse(savedCart) : [];
        const cartItems = savedCartItems.map((item: CartItem) => ({
          id: item.id,
          quantity: item.quantity,
          price: item.price,
        }));
        const cartSubtotal = savedCartItems.reduce(
          (total: number, item: CartItem) => total + item.price * item.quantity,
          0,
        );
        trpc.promoCode.validate
          .query({
            code: parsedPromoCode.code,
            cartItems,
            subtotal: cartSubtotal,
          })
          .then((result) => {
            if (result.success && result.result) {
              setPromoCode(result.result);
            } else {
              setPromoCode(null);
              localStorage.removeItem("promoCode");
              // Tell the shopper why their saved discount disappeared instead
              // of silently dropping it. Skipped for an empty cart, where the
              // code simply has nothing to apply to yet.
              if (savedCartItems.length > 0) {
                const reason = promoErrorMessage(result);
                setPromoCodeNotice(
                  reason
                    ? `Your promo code "${parsedPromoCode.code}" was removed: ${reason}`
                    : `Your promo code "${parsedPromoCode.code}" is no longer valid and has been removed.`,
                );
              }
            }
          })
          .catch(() => {
            setPromoCode(null);
            localStorage.removeItem("promoCode");
          });
      } catch (error) {
        console.error("Failed to parse promo code from localStorage");
        localStorage.removeItem("promoCode");
      }
    }

    // Fetch shipping fee from backend
    trpc.settings.getShippingFee
      .query()
      .then((result) => {
        if (result.success) {
          setBaseShippingFee(result.result);
        }
      })
      .catch((err) => {
        console.error("Failed to fetch shipping fee:", err);
      });
  }, []);

  // Calculate subtotal
  const subtotal = items.reduce(
    (total, item) => total + item.price * item.quantity,
    0,
  );

  // Derived, not state: recomputes from current offers every render, so it
  // can never get stuck at 0 after a free-shipping offer stops applying.
  const shipping = deriveEffectiveShipping(baseShippingFee, appliedOffers);

  // Derived, not state — see shared/pricing/cart-math.ts for why.
  const discount = promoCode
    ? computePromoDiscount(promoCode.discountType, promoCode.discountValue, subtotal, offerDiscount)
    : 0;

  // Which specific cart line(s) an offer made free, so the UI can show a
  // "FREE" badge on the exact item instead of only an aggregate savings line.
  const freeQuantities = useMemo(
    () => computeFreeItemQuantities(items, appliedOffers),
    [items, appliedOffers],
  );

  useEffect(() => {
    localStorage.setItem("cart", JSON.stringify(items));

    // Re-check the applied promo code against the new cart. Editing the cart
    // can invalidate a code (dropping below its minimum, or removing the only
    // eligible product), and it's far better to surface that here than to let
    // checkout fail. Only failures act, so this can't loop.
    if (promoCode && items.length > 0) {
      const promoCartItems = items.map((item) => ({
        id: item.id,
        quantity: item.quantity,
        price: item.price,
      }));
      const promoSubtotal = items.reduce(
        (t, i) => t + i.price * i.quantity,
        0,
      );
      trpc.promoCode.validate
        .query({
          code: promoCode.code,
          cartItems: promoCartItems,
          subtotal: promoSubtotal,
        })
        .then((result) => {
          if (!result.success || !result.result) {
            const reason = promoErrorMessage(result);
            setPromoCode(null);
            setPromoCodeNotice(
              reason
                ? `Your promo code "${promoCode.code}" was removed: ${reason}`
                : `Your promo code "${promoCode.code}" no longer applies to your cart and has been removed.`,
            );
          }
        })
        .catch(() => {
          /* Network hiccup — leave the code applied; checkout re-validates. */
        });
    }

    // Re-evaluate automatic offers when cart changes
    const cartItems = items.map((item) => ({
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      price: item.price,
    }));
    const currentSubtotal = items.reduce((t, i) => t + i.price * i.quantity, 0);
    if (cartItems.length > 0) {
      trpc.offer.evaluate
        .query({ cartItems, subtotal: currentSubtotal })
        .then((result) => {
          if (result.success && result.result) {
            setAppliedOffers(result.result);
            const totalOfferDiscount = result.result.reduce((s, o) => s + o.discountAmount, 0);
            setOfferDiscount(totalOfferDiscount);
            // `shipping` derives from `appliedOffers` above — no manual
            // reset needed here, in either direction.
          } else {
            setAppliedOffers([]);
            setOfferDiscount(0);
          }
        })
        .catch(() => {
          setAppliedOffers([]);
          setOfferDiscount(0);
        });
    } else {
      setAppliedOffers([]);
      setOfferDiscount(0);
    }
  }, [items, promoCode]);

  // Server-side cart capture — debounced, purely additive, mirrors the
  // localStorage cart into captured_cart so abandoned-cart emails have
  // something to work from. Never blocks or affects the shopping UI: a
  // failure here is swallowed server-side (syncCart never throws) and
  // simply means this snapshot is missed, not a broken cart.
  useEffect(() => {
    if (items.length === 0) return; // nothing to abandon yet
    const timeoutId = window.setTimeout(() => {
      trpc.cartCapture.sync
        .mutate({
          sessionToken: getCartSessionToken(),
          items: items.map((item) => ({
            id: item.id,
            name: item.name,
            quantity: item.quantity,
            price: item.price,
            imageUrl: item.imageUrl,
          })),
          subtotal,
        })
        .catch(() => {
          /* Best-effort — abandoned-cart capture is not shopping-critical. */
        });
    }, 3000);
    return () => window.clearTimeout(timeoutId);
  }, [items, subtotal]);

  useEffect(() => {
    if (promoCode) {
      localStorage.setItem("promoCode", JSON.stringify(promoCode));
    } else {
      localStorage.removeItem("promoCode");
    }
  }, [promoCode]);

  const findItemInCart = (
    itemId: string,
    options: CartItem["selectedOptions"],
  ) => {
    return items.find(
      (item) =>
        item.id === itemId &&
        JSON.stringify(item.selectedOptions) === JSON.stringify(options),
    );
  };

  const addItem = (
    product: Product,
    quantity: number,
    selectedOptions: CartItem["selectedOptions"],
  ) => {
    if (!product.stock || product.stock < quantity) {
      return false;
    }

    const existingItemIndex = items.findIndex(
      (item) =>
        item.id === product.id &&
        JSON.stringify(item.selectedOptions) ===
          JSON.stringify(selectedOptions),
    );

    if (existingItemIndex >= 0) {
      const updatedItems = [...items];
      const existingItem = updatedItems[existingItemIndex];

      if (!existingItem) return false;

      const newQuantity = existingItem.quantity + quantity;

      if (newQuantity > product.stock) {
        return false;
      }

      updatedItems[existingItemIndex] = {
        ...existingItem,
        quantity: newQuantity,
      };
      setItems(updatedItems);
    } else {
      const newItem: CartItem = {
        ...product,
        quantity,
        selectedOptions,
      };
      setItems((prev) => [...prev, newItem]);
    }

    return true;
  };

  const removeItem = (
    itemId: string,
    options?: CartItem["selectedOptions"],
  ) => {
    if (options) {
      setItems((prev) =>
        prev.filter(
          (item) =>
            !(
              item.id === itemId &&
              JSON.stringify(item.selectedOptions) === JSON.stringify(options)
            ),
        ),
      );
    } else {
      setItems((prev) => prev.filter((item) => item.id !== itemId));
    }
  };

  const updateQuantity = (
    itemId: string,
    quantity: number,
    options?: CartItem["selectedOptions"],
  ) => {
    if (quantity <= 0) return false;

    let targetItemIndex: number;

    if (options) {
      targetItemIndex = items.findIndex(
        (item) =>
          item.id === itemId &&
          JSON.stringify(item.selectedOptions) === JSON.stringify(options),
      );
    } else {
      targetItemIndex = items.findIndex((item) => item.id === itemId);
    }

    if (targetItemIndex === -1) return false;

    const targetItem = items[targetItemIndex];
    if (!targetItem) return false;

    const stock = targetItem.stock || 0;

    if (quantity > stock) {
      return false;
    }

    const updatedItems = [...items];
    updatedItems[targetItemIndex] = {
      ...targetItem,
      quantity,
    };

    setItems(updatedItems);
    return true;
  };

  const clearCart = () => {
    setItems([]);
    removePromoCode();
  };

  const applyPromoCode = async (
    rawCode: string,
  ): Promise<PromoCodeApplyResult> => {
    const code = rawCode.trim().toUpperCase();

    // ── Client-side guards, so obvious mistakes get instant feedback ──
    if (code.length === 0) {
      return { success: false, message: "Enter a promo code first." };
    }
    if (code.length < 3) {
      return {
        success: false,
        message: "Promo codes are at least 3 characters long.",
      };
    }
    if (!/^[A-Z0-9_-]+$/.test(code)) {
      return {
        success: false,
        message:
          "Promo codes only contain letters, numbers, hyphens and underscores.",
      };
    }
    if (items.length === 0) {
      return {
        success: false,
        message: "Add something to your cart before applying a promo code.",
      };
    }
    if (promoCode && promoCode.code === code) {
      return {
        success: false,
        message: `"${code}" is already applied to your order.`,
      };
    }

    try {
      // Convert cart items to the format expected by the validatePromoCode endpoint
      const cartItems = items.map((item) => ({
        id: item.id,
        quantity: item.quantity,
        price: item.price,
      }));

      // Use the client directly instead of hooks since we're not in a component context
      const result = await trpc.promoCode.validate.query({
        code,
        cartItems,
        subtotal,
      });

      if (result.success && result.result) {
        setPromoCode(result.result);
        const label =
          result.result.discountLabel ??
          (result.result.discountType === "percentage"
            ? `${result.result.discountValue}% off`
            : `${result.result.discountValue.toFixed(2)} EGP off`);
        return {
          success: true,
          message: `"${code}" applied — ${label}.`,
        };
      }

      // A failed validation leaves any previously applied code alone; only the
      // code the shopper just tried is rejected.
      return {
        success: false,
        message:
          promoErrorMessage(result) ||
          "We couldn't apply that promo code. Please check it and try again.",
      };
    } catch (error) {
      console.error("Failed to apply promo code:", error);
      return {
        success: false,
        message:
          "We couldn't reach the server to check that code. Please try again.",
      };
    }
  };

  const removePromoCode = () => {
    setPromoCode(null);
  };

  const clearPromoCodeNotice = () => setPromoCodeNotice(null);

  const totalItems = items.reduce((total, item) => total + item.quantity, 0);

  // Total: subtotal minus promo discount, minus offer discount, plus shipping
  const total = Math.max(0, subtotal - discount - offerDiscount + shipping);

  return (
    <CartContext.Provider
      value={{
        items,
        addItem,
        removeItem,
        updateQuantity,
        clearCart,
        totalItems,
        subtotal,
        discount,
        shipping,
        total,
        promoCode,
        applyPromoCode,
        removePromoCode,
        promoCodeNotice,
        clearPromoCodeNotice,
        findItemInCart,
        appliedOffers,
        offerDiscount,
        freeQuantities,
      }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
}
