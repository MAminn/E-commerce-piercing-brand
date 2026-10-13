import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from "react";
import type { ReactNode } from "react";
import type { Product } from "../mock-data/products";
import { trpc } from "#root/shared/trpc/client";
import type { AppliedOffer } from "#root/backend/offers/service";
import { getCartSessionToken } from "#root/lib/cart-session";
import { computeFreeItemQuantities } from "#root/shared/pricing/cart-math";
import type { GovernorateCode } from "#root/shared/shipping/egypt-governorates";
import type { ShippingQuoteResponse } from "#root/shared/shipping/quote";
import type { ShippingMode } from "#root/shared/shipping/rules";
import { deriveShippingLine, type ShippingLine } from "#root/shared/shipping/checkout-shipping";
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
  planPromo,
  type CartPromoInput,
  type PricingBundle,
  type PricingRegularLine,
  type PromoPlan,
} from "#root/shared/bundles/cart-pricing";
import { eligibilityFromProductIds } from "#root/shared/pricing/eligible-units";
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
  /** A qualifying code also waives shipping on a deliverable destination. Absent on older cached copies. */
  freeShipping?: boolean;
  /** Eligible-UNIT quantity rule (inclusive). Both null/absent = none. */
  eligibleMinQuantity?: number | null;
  eligibleMaxQuantity?: number | null;
  /**
   * The cart products the server said this code counts and discounts, for
   * the cart it validated. Absent on older cached copies (treated as "every
   * product", the old behaviour, until the mount-time re-validation answers).
   */
  eligibleProductIds?: string[];
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
  /** The shipping amount currently in `total`. 0 while no quote is usable — read `shippingLine.status` to tell "free" from "not yet known". */
  shipping: number;
  total: number;
  /** Server quote state for the summary line: pending / quoted / unavailable. */
  shippingLine: ShippingLine;
  /** "flat" until the first quote answers; "zones" means a governorate is required before ordering. */
  shippingMode: ShippingMode;
  shippingDestination: GovernorateCode | null;
  /** Re-quotes shipping for the chosen governorate; `null` clears it. */
  setShippingDestination: (code: GovernorateCode | null) => void;
  isShippingQuoteLoading: boolean;
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
  /** The applied promo code's eligibility outcome for the current cart (eligible units, quantity rule). Null without a code. */
  promoPlan: PromoPlan | null;
  /** A qualifying promo code is waiving the shipping charge. */
  promoFreeShipping: boolean;
  /** A free-shipping Pick Your Set in the cart is waiving the shipping charge. */
  bundleFreeShipping: boolean;
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
  // The latest server shipping quote. In flat mode it answers on mount with
  // the store fee (the cart shows it up front, as before); in zones mode it
  // answers "destination required" until `setShippingDestination` is called
  // from checkout. Never mutated to reflect "free shipping right now" —
  // `shipping` below derives that from current offer state instead, so it
  // can never get stuck at 0 after a free-shipping offer stops applying.
  const [shippingResponse, setShippingResponse] = useState<ShippingQuoteResponse | null>(null);
  const [shippingDestination, setShippingDestinationState] = useState<GovernorateCode | null>(null);
  const [isShippingQuoteLoading, setIsShippingQuoteLoading] = useState(false);
  // Quotes are requested as the shopper changes governorate; only the newest
  // request may write state, or a slow earlier answer would overwrite it.
  const shippingRequestSeq = useRef(0);
  const [appliedOffers, setAppliedOffers] = useState<AppliedOffer[]>([]);
  const [offerDiscount, setOfferDiscount] = useState<number>(0);
  // The applied code's eligible product ids as the server resolved them for
  // the CURRENT cart (re-validated on every change). Kept apart from
  // `promoCode` so refreshing it can't re-trigger the validation effect.
  const [promoEligibility, setPromoEligibility] = useState<{ code: string; productIds: string[] } | null>(null);

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

  }, []);

  const requestShippingQuote = useCallback((code: GovernorateCode | null) => {
    const seq = ++shippingRequestSeq.current;
    setIsShippingQuoteLoading(true);
    trpc.shipping.quote
      .query({ governorateCode: code })
      .then((result) => {
        if (seq !== shippingRequestSeq.current) return;
        if (result.success) setShippingResponse(result.result);
      })
      .catch((err) => {
        if (seq !== shippingRequestSeq.current) return;
        // Leave the previous quote in place; the summary keeps saying
        // "calculated at checkout" and the server re-quotes at order time.
        console.error("Failed to fetch shipping quote:", err);
      })
      .finally(() => {
        if (seq === shippingRequestSeq.current) setIsShippingQuoteLoading(false);
      });
  }, []);

  // Initial quote with no destination: the flat fee in flat mode, or
  // "destination required" in zones mode.
  useEffect(() => {
    requestShippingQuote(null);
  }, [requestShippingQuote]);

  const setShippingDestination = useCallback(
    (code: GovernorateCode | null) => {
      setShippingDestinationState(code);
      requestShippingQuote(code);
    },
    [requestShippingQuote],
  );

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
        freeShipping: b.freeShipping === true,
        items: b.items.map((i) => ({ productId: i.productId, name: i.name, quantity: i.quantity, unitPrice: i.unitPrice })),
      })),
    [bundles],
  );
  const bundleFreeShipping = pricingBundles.some((b) => b.freeShipping === true);

  // A set's free shipping is the LIVE campaign's, not whatever was saved
  // when it entered the cart: re-check every instance with the server when
  // the sets in the cart change (added, removed, restored on page load). A set
  // that no longer validates loses the benefit here — checkout would refuse
  // it anyway — and create-order re-reads the campaign regardless.
  const bundleKey = bundles.map((b) => `${b.instanceId}:${b.campaignId}`).join("|");
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed by the set of instances, not their (refreshed) flags
  useEffect(() => {
    if (!bundlesHydrated || bundles.length === 0) return;
    let cancelled = false;
    Promise.all(
      bundles.map((b) =>
        trpc.bundle.evaluateSelection
          .query({
            campaignId: b.campaignId,
            items: b.items.map((i) => ({ productId: i.productId, quantity: i.quantity, selectedOptions: i.selectedOptions })),
          })
          .then((res) => [b.instanceId, res.success && res.result?.ok ? res.result.bundle.freeShipping : false] as const)
          .catch(() => [b.instanceId, b.freeShipping === true] as const),
      ),
    ).then((answers) => {
      if (cancelled) return;
      const live = new Map(answers);
      setBundles((prev) => {
        const changed = prev.some((b) => live.has(b.instanceId) && live.get(b.instanceId) !== (b.freeShipping === true));
        return changed
          ? prev.map((b) => (live.has(b.instanceId) ? { ...b, freeShipping: live.get(b.instanceId) === true } : b))
          : prev;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [bundleKey, bundlesHydrated]);
  // What promo validation may see: ordinary lines plus stackable bundle
  // children at bundle-share prices (flagged `bundled`, which a set code never
  // counts). Exclusive bundles are invisible here by design.
  const promoValidationItems = useMemo(() => {
    const visible = buildOfferInputs(regularLines, pricingBundles);
    return visible.cartItems.map((item, index) => ({
      id: item.id,
      quantity: item.quantity,
      price: item.price,
      bundled: index >= visible.regularLineIndexes.length,
    }));
  }, [regularLines, pricingBundles]);
  const promoValidationSubtotal = useMemo(
    () => buildOfferInputs(regularLines, pricingBundles).subtotal,
    [regularLines, pricingBundles],
  );

  // The applied code as the SHARED pricing layer consumes it — the same shape
  // create-order builds from the database, with eligibility as the server
  // resolved it for this cart.
  const cartPromo = useMemo<CartPromoInput | null>(() => {
    if (!promoCode) return null;
    const eligibleIds =
      promoEligibility?.code === promoCode.code ? promoEligibility.productIds : promoCode.eligibleProductIds;
    return {
      discountType: promoCode.discountType,
      discountValue: promoCode.discountValue,
      eligibility: eligibleIds ? eligibilityFromProductIds(eligibleIds) : undefined,
      quantityRule: {
        minQuantity: promoCode.eligibleMinQuantity ?? null,
        maxQuantity: promoCode.eligibleMaxQuantity ?? null,
      },
      freeShipping: promoCode.freeShipping ?? false,
    };
  }, [promoCode, promoEligibility]);
  const promoPlan = useMemo(
    () => (cartPromo ? planPromo(regularLines, pricingBundles, cartPromo) : null),
    [cartPromo, regularLines, pricingBundles],
  );
  const promoFreeShipping = Boolean(cartPromo?.freeShipping && promoPlan?.qualifies);

  // What the offers engine may see: the promo-visible lines MINUS the lines a
  // qualifying set code owns (one discount per unit — see cart-pricing.ts).
  const offerInputs = useMemo(
    () => buildOfferInputs(regularLines, pricingBundles, promoPlan),
    [regularLines, pricingBundles, promoPlan],
  );

  // Derived, not state: recomputes from the latest quote, current offers and
  // the code's qualification every render, so it can never get stuck at 0
  // after a free-shipping offer or code stops applying. While no quote is
  // usable the fee is 0 and `shippingLine.status` tells the UI to say
  // "calculated at checkout"; an unavailable destination stays unavailable.
  const shippingLine = useMemo(
    () => deriveShippingLine(shippingResponse, appliedOffers, { promoFreeShipping, bundleFreeShipping }),
    [shippingResponse, appliedOffers, promoFreeShipping, bundleFreeShipping],
  );
  const baseShippingFee = shippingLine.baseFee;
  const shipping = shippingLine.fee;
  const shippingMode: ShippingMode = shippingResponse?.mode ?? "flat";

  // Derived, not state — see shared/bundles/cart-pricing.ts for the order of operations.
  const totals = useMemo(
    () =>
      computeCartTotals({
        regularLines,
        bundles: pricingBundles,
        offerDiscount,
        promo: cartPromo,
        baseShippingFee,
        freeShipping: appliedOffers.some((o) => o.freeShipping),
      }),
    [regularLines, pricingBundles, offerDiscount, cartPromo, baseShippingFee, appliedOffers],
  );
  const subtotal = totals.subtotal;
  const discount = totals.promoDiscount;

  // Which specific cart line(s) an offer made free, so the UI can show a
  // "FREE" badge on the exact item instead of only an aggregate savings line.
  // Offer inputs list the (non-owned) ordinary lines first and say which cart
  // line each came from; a free unit that lands on a stackable bundle child is
  // still counted in the discount, just not badged.
  const freeQuantities = useMemo(() => {
    const free = computeFreeItemQuantities(offerInputs.cartItems, appliedOffers);
    const byLine = new Array(items.length).fill(0) as number[];
    offerInputs.regularLineIndexes.forEach((lineIndex, k) => {
      if (lineIndex < byLine.length) byLine[lineIndex] = free[k] ?? 0;
    });
    return byLine;
  }, [offerInputs, appliedOffers, items.length]);

  useEffect(() => {
    if (bundlesHydrated) localStorage.setItem(BUNDLES_STORAGE_KEY, JSON.stringify(bundles));
  }, [bundles, bundlesHydrated]);

  useEffect(() => {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  // Re-check the applied promo code against the new cart. Editing the cart
  // can invalidate a code (dropping below its minimum, removing the only
  // eligible product, or leaving a set code's exact quantity — PICK6 with 5 or
  // 7 eligible pieces), and it's far better to surface that here than to let
  // checkout fail. A success refreshes which cart products the code counts,
  // in separate state, so this can't loop.
  const promoCodeKey = promoCode?.code ?? null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed by the code and the cart contents, not the object identity
  useEffect(() => {
    if (!promoCode || promoValidationItems.length === 0) return;
    const code = promoCode.code;
    let cancelled = false;
    trpc.promoCode.validate
      .query({
        code,
        cartItems: promoValidationItems,
        subtotal: promoValidationSubtotal,
      })
      .then((result) => {
        if (cancelled) return;
        if (!result.success || !result.result) {
          const reason = promoErrorMessage(result);
          setPromoCode(null);
          setPromoEligibility(null);
          setPromoCodeNotice(
            reason
              ? `Your promo code "${code}" was removed: ${reason}`
              : `Your promo code "${code}" no longer applies to your cart and has been removed.`,
          );
          return;
        }
        setPromoEligibility({ code, productIds: result.result.eligibleProductIds ?? [] });
      })
      .catch(() => {
        /* Network hiccup — leave the code applied; checkout re-validates. */
      });
    return () => {
      cancelled = true;
    };
  }, [promoCodeKey, promoValidationItems, promoValidationSubtotal]);

  // Re-evaluate automatic offers whenever what they may see changes — the
  // cart, or which lines a qualifying set code owns.
  const offerInputsKey = JSON.stringify(offerInputs.cartItems);
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed by value so an identical recomputation doesn't refetch
  useEffect(() => {
    const cartItems = offerInputs.cartItems;
    const currentSubtotal = offerInputs.subtotal;
    if (cartItems.length === 0) {
      setAppliedOffers([]);
      setOfferDiscount(0);
      return;
    }
    let cancelled = false;
    trpc.offer.evaluate
      .query({ cartItems, subtotal: currentSubtotal })
      .then((result) => {
        if (cancelled) return;
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
        if (cancelled) return;
        setAppliedOffers([]);
        setOfferDiscount(0);
      });
    return () => {
      cancelled = true;
    };
  }, [offerInputsKey]);

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
      // Use the client directly instead of hooks since we're not in a component context
      const result = await trpc.promoCode.validate.query({
        code,
        cartItems: promoValidationItems,
        subtotal: promoValidationSubtotal,
      });

      if (result.success && result.result) {
        setPromoEligibility({ code: result.result.code, productIds: result.result.eligibleProductIds ?? [] });
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
    setPromoEligibility(null);
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
        shippingLine,
        shippingMode,
        shippingDestination,
        setShippingDestination,
        isShippingQuoteLoading,
        promoCode,
        applyPromoCode,
        removePromoCode,
        promoCodeNotice,
        clearPromoCodeNotice,
        findItemInCart,
        appliedOffers,
        offerDiscount,
        promoPlan,
        promoFreeShipping,
        bundleFreeShipping,
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
