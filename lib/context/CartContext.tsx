import React, { createContext, useContext, useState, useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import type { Product } from "../mock-data/products";
import { trpc } from "#root/shared/trpc/client";
import type { AppliedOffer } from "#root/backend/offers/service";
import { getCartSessionToken } from "#root/lib/cart-session";
import { deriveEffectiveShipping, computeFreeItemQuantities } from "#root/shared/pricing/cart-math";
import {
  addBundleInstance,
  bundleRegularTotal,
  bundleUnitCount,
  newBundleInstanceId,
  parseStoredBundleInstances,
  removeBundleInstance,
  type CartBundleInstance,
} from "#root/shared/bundles/cart-instance";
import {
  buildOfferInputs,
  computeCartTotals,
  type PricingBundle,
  type PricingRegularLine,
} from "#root/shared/bundles/cart-pricing";
import { formatMoney } from "#root/shared/pricing/format-money";

const CART_STORAGE_KEY = "cart";
/** Separate key from the legacy "cart" array so pre-Phase-2 carts parse unchanged. */
const BUNDLES_STORAGE_KEY = "cartBundles";

/** What the builder hands to `addBundle` — ids/timestamps are assigned here. */
export type NewCartBundle = Omit<CartBundleInstance, "instanceId" | "addedAt" | "regularTotal">;

export interface AddBundleResult {
  success: boolean;
  instanceId?: string;
  /** True when a non-repeatable campaign's existing stack was swapped for this one. */
  replaced?: boolean;
  message?: string;
}

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
  /** Completed Build Your Stack instances — grouped units, never flattened into `items`. */
  bundles: CartBundleInstance[];
  addBundle: (bundle: NewCartBundle) => AddBundleResult;
  removeBundle: (instanceId: string) => void;
  /** Σ ordinary line prices (excludes bundles). */
  merchandiseSubtotal: number;
  /** What the bundle children would cost bought separately. */
  bundleRegularValue: number;
  /** What the bundles actually cost (fixed campaign prices). */
  bundleChargedValue: number;
  bundleSavings: number;
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
  const [bundles, setBundles] = useState<CartBundleInstance[]>([]);
  // localStorage is read in an effect (SSR-safe); until then `bundles` is
  // empty and must not be written back, or a refresh would wipe the stacks.
  const [bundlesHydrated, setBundlesHydrated] = useState(false);
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
    const savedCart = localStorage.getItem(CART_STORAGE_KEY);
    if (savedCart) {
      try {
        const parsedCart = JSON.parse(savedCart);
        setItems(parsedCart);
      } catch (error) {
        console.error("Failed to parse cart from localStorage");
        localStorage.removeItem(CART_STORAGE_KEY);
      }
    }

    // Tolerant parse: a legacy browser has no key at all, a malformed value
    // yields [] — never a crash.
    try {
      setBundles(parseStoredBundleInstances(localStorage.getItem(BUNDLES_STORAGE_KEY)));
    } catch {
      setBundles([]);
    }
    setBundlesHydrated(true);

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

  // ─── Pricing inputs (shared with the server: shared/bundles/cart-pricing.ts) ──
  const regularLines = useMemo<PricingRegularLine[]>(
    () => items.map((item) => ({ id: item.id, name: item.name, quantity: item.quantity, price: item.price })),
    [items],
  );
  const pricingBundles = useMemo<PricingBundle[]>(
    () =>
      bundles.map((b) => ({
        instanceId: b.instanceId,
        offerStacking: b.offerStacking,
        regularTotal: b.regularTotal,
        bundleTotal: b.bundlePrice,
        items: b.items.map((i) => ({ productId: i.productId, name: i.name, quantity: i.quantity, unitPrice: i.unitPrice })),
      })),
    [bundles],
  );
  // What the offers engine / promo validation may see: ordinary lines plus
  // stackable bundle children at bundle-share prices. Exclusive bundles are
  // invisible here by design.
  const offerInputs = useMemo(() => buildOfferInputs(regularLines, pricingBundles), [regularLines, pricingBundles]);

  // Derived, not state: recomputes from current offers every render, so it
  // can never get stuck at 0 after a free-shipping offer stops applying.
  const shipping = deriveEffectiveShipping(baseShippingFee, appliedOffers);

  // Derived, not state — see shared/bundles/cart-pricing.ts for the order of operations.
  const totals = useMemo(
    () =>
      computeCartTotals({
        regularLines,
        bundles: pricingBundles,
        offerDiscount,
        promo: promoCode ? { discountType: promoCode.discountType, discountValue: promoCode.discountValue } : null,
        baseShippingFee,
        freeShipping: appliedOffers.some((o) => o.freeShipping),
      }),
    [regularLines, pricingBundles, offerDiscount, promoCode, baseShippingFee, appliedOffers],
  );
  const subtotal = totals.subtotal;
  const discount = totals.promoDiscount;

  // Which specific cart line(s) an offer made free, so the UI can show a
  // "FREE" badge on the exact item instead of only an aggregate savings line.
  // Offer inputs list ordinary lines first, so the first `items.length`
  // entries line up with `items`; a free unit that lands on a stackable
  // bundle child is still counted in the discount, just not badged.
  const freeQuantities = useMemo(
    () => computeFreeItemQuantities(offerInputs.cartItems, appliedOffers).slice(0, items.length),
    [offerInputs, appliedOffers, items.length],
  );

  useEffect(() => {
    if (bundlesHydrated) localStorage.setItem(BUNDLES_STORAGE_KEY, JSON.stringify(bundles));
  }, [bundles, bundlesHydrated]);

  useEffect(() => {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));

    // Re-check the applied promo code against the new cart. Editing the cart
    // can invalidate a code (dropping below its minimum, or removing the only
    // eligible product), and it's far better to surface that here than to let
    // checkout fail. Only failures act, so this can't loop.
    const offerVisible = buildOfferInputs(
      items.map((item) => ({ id: item.id, name: item.name, quantity: item.quantity, price: item.price })),
      bundles.map((b) => ({
        instanceId: b.instanceId,
        offerStacking: b.offerStacking,
        regularTotal: b.regularTotal,
        bundleTotal: b.bundlePrice,
        items: b.items.map((i) => ({ productId: i.productId, name: i.name, quantity: i.quantity, unitPrice: i.unitPrice })),
      })),
    );
    if (promoCode && offerVisible.cartItems.length > 0) {
      const promoCartItems = offerVisible.cartItems.map((item) => ({
        id: item.id,
        quantity: item.quantity,
        price: item.price,
      }));
      const promoSubtotal = offerVisible.subtotal;
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
    const cartItems = offerVisible.cartItems;
    const currentSubtotal = offerVisible.subtotal;
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
  }, [items, bundles, promoCode]);

  // Server-side cart capture — debounced, purely additive, mirrors the
  // localStorage cart into captured_cart so abandoned-cart emails have
  // something to work from. Never blocks or affects the shopping UI: a
  // failure here is swallowed server-side (syncCart never throws) and
  // simply means this snapshot is missed, not a broken cart.
  useEffect(() => {
    if (items.length === 0 && bundles.length === 0) return; // nothing to abandon yet
    const timeoutId = window.setTimeout(() => {
      trpc.cartCapture.sync
        .mutate({
          sessionToken: getCartSessionToken(),
          items: [
            ...items.map((item) => ({
              id: item.id,
              name: item.name,
              quantity: item.quantity,
              price: item.price,
              imageUrl: item.imageUrl,
            })),
            // Bundle children flattened — the abandoned-cart email only needs
            // real products to show; grouping is irrelevant there.
            ...bundles.flatMap((b) =>
              b.items.map((item) => ({
                id: item.productId,
                name: item.name,
                quantity: item.quantity,
                price: item.unitPrice,
                imageUrl: item.imageUrl ?? undefined,
              })),
            ),
          ],
          subtotal,
        })
        .catch(() => {
          /* Best-effort — abandoned-cart capture is not shopping-critical. */
        });
    }, 3000);
    return () => window.clearTimeout(timeoutId);
  }, [items, bundles, subtotal]);

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
    setBundles([]);
    removePromoCode();
  };

  /**
   * Adds a completed stack as ONE grouped unit. A non-repeatable campaign can
   * hold a single instance per cart: adding again replaces the earlier stack
   * (the shopper rebuilt it) rather than silently merging or duplicating.
   */
  const addBundle = (bundle: NewCartBundle): AddBundleResult => {
    if (bundle.items.length === 0) {
      return { success: false, message: "Your stack is empty." };
    }
    const instance: CartBundleInstance = {
      ...bundle,
      instanceId: newBundleInstanceId(),
      regularTotal: bundleRegularTotal(bundle.items),
      addedAt: new Date().toISOString(),
    };
    const { next, replaced } = addBundleInstance(bundles, instance);
    setBundles(next);
    return { success: true, instanceId: instance.instanceId, replaced };
  };

  const removeBundle = (instanceId: string) => {
    setBundles((prev) => removeBundleInstance(prev, instanceId));
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
    if (items.length === 0 && bundles.length === 0) {
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
      // The code is validated against what it may discount: ordinary lines
      // plus stackable bundle children (exclusive bundles are excluded).
      const cartItems = offerInputs.cartItems.map((item) => ({
        id: item.id,
        quantity: item.quantity,
        price: item.price,
      }));

      // Use the client directly instead of hooks since we're not in a component context
      const result = await trpc.promoCode.validate.query({
        code,
        cartItems,
        subtotal: offerInputs.subtotal,
      });

      if (result.success && result.result) {
        setPromoCode(result.result);
        const label =
          result.result.discountLabel ??
          (result.result.discountType === "percentage"
            ? `${result.result.discountValue}% off`
            : `${formatMoney(result.result.discountValue)} off`);
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

  const totalItems =
    items.reduce((total, item) => total + item.quantity, 0) +
    bundles.reduce((total, b) => total + bundleUnitCount(b), 0);

  const total = totals.total;

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
        bundles,
        addBundle,
        removeBundle,
        merchandiseSubtotal: totals.merchandiseSubtotal,
        bundleRegularValue: totals.bundleRegularValue,
        bundleChargedValue: totals.bundleChargedValue,
        bundleSavings: totals.bundleSavings,
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
