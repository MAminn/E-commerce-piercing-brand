import { query } from "#root/shared/database/drizzle/db";
import {
  order,
  orderItem,
  product,
  user,
  type orderStatus,
  promoCode,
  promoCodeProducts,
  promoCodeCategories,
  cartOffer,
  orderBundle,
} from "#root/shared/database/drizzle/schema";
import { and, asc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { Effect } from "effect";
import { z } from "zod";
import type { ClientSession } from "#root/backend/auth/shared/entities";
import { ServerError } from "#root/shared/error/server";
import { EmailService, renderEmailTemplate } from "#root/shared/email/service";
import { STORE_NAME } from "#root/shared/config/branding";
import { NewOrderEmailTemplate } from "./email-template";
import { MinimalOrderEmailTemplate } from "#root/backend/emails/minimal/order-confirmation";
import { getEmailBranding } from "#root/backend/emails/branding";
import axios from "axios";
import { validatePromoCode } from "#root/backend/promo-codes/validate-promo-code/validate-promo-code";
import { applyOffersToCart } from "#root/backend/offers/service";
import {
  buildOfferInputs,
  computeCartTotals,
  type PricingBundle,
  type PricingRegularLine,
} from "#root/shared/bundles/cart-pricing";
import {
  loadAndValidateBundleSelection,
  type ValidatedBundle,
} from "#root/backend/bundles/selection";
import { getStoreOwnerId } from "#root/shared/config/store";
import {
  type SelectedOptions,
  formatSelectedOptions,
  normalizeSelectedOptionsInput,
  resolvePurchasableLinePrice,
  resolveSelectedOptions,
} from "#root/shared/products/options";
import { loadPurchasableOptionGroups } from "#root/backend/products/option-groups";
import { getShippingFeeRaw } from "#root/backend/settings/get-shipping-fee";
import { createBostaDelivery, isBostaEnabled } from "#root/backend/orders/bosta/service";
import { persistBostaSyncStatus } from "#root/backend/orders/bosta/sync-status";
import { isFincartEnabled } from "#root/backend/orders/fincart/config";
import { logOrderEvent } from "#root/backend/orders/order-log";

/**
 * The chosen option configuration. New clients send the map itself
 * (`{ Color: "Gold" }`); the legacy checkout sent the display label
 * ("Color: Gold, Size: 8mm"), which is still accepted and parsed. Either way
 * the server resolves it against the product's CURRENT option groups — the
 * client's copy is a request, never the answer.
 */
const SelectedOptionsInputSchema = z.union([
  z.record(z.string().max(100), z.string().max(200)),
  z.string().max(2000),
]);

const OrderItemSchema = z.object({
  productId: z.string().uuid(),
  // Whole units only: `product.stock` is an integer column and is decremented
  // by this value in SQL, so a fractional quantity would corrupt inventory.
  quantity: z.number().int().min(1),
  selectedOptions: SelectedOptionsInputSchema.optional(),
});

/** Customer-safe wording for an option that no longer resolves at checkout. */
function optionRejection(
  code: "option_required" | "option_not_found" | "option_unavailable",
  productName: string,
  optionName: string,
): ServerError<"ProductOptionInvalid"> {
  const clientMessage =
    code === "option_required"
      ? `Please choose ${optionName} for ${productName} before checking out.`
      : code === "option_not_found"
        ? `The ${optionName} you chose for ${productName} is no longer available. Please choose another option.`
        : `The ${optionName} you chose for ${productName} is currently unavailable. Please choose another option.`;
  return new ServerError({
    tag: "ProductOptionInvalid",
    message: `${code}: ${productName} / ${optionName}`,
    statusCode: 400,
    clientMessage,
  });
}

/**
 * A Build Your Stack instance from the cart. Only identities and quantities
 * are trusted; the server re-derives every price. `expectedBundleTotal` is
 * the figure the shopper saw and is used solely to detect a price change.
 */
const OrderBundleSchema = z.object({
  instanceId: z.string().min(1).max(64),
  campaignId: z.string().uuid(),
  /** Build Your Stack: the chosen units. Curated stacks may send nothing — the server uses the composition. */
  items: z.array(OrderItemSchema).max(100).default([]),
  expectedBundleTotal: z.number().nonnegative().optional(),
});

export type CreateOrderBundleInput = z.infer<typeof OrderBundleSchema>;

export const createOrderSchema = z.object({
  customerName: z.string().min(1),
  customerEmail: z.string().email(),
  customerPhone: z.string().min(1),
  shippingAddress: z.string().min(1),
  shippingCity: z.string().min(1),
  /**
   * `order.shipping_state` / `shipping_postal_code` / `shipping_country` are
   * NOT NULL with no database default, so these keys must be PRESENT — an
   * absent or null value used to pass validation and then blow up as a
   * Postgres not-null violation (a 500 for what is really a bad request).
   *
   * Presence is all that is enforced for state and postal code: both are
   * legitimately EMPTY in this store. The Governorate input is explicitly
   * marked optional in the checkout templates and the Bosta mapping falls back
   * to the city when it is blank, and Egyptian addresses carry no postal code
   * at all, so checkout deliberately submits "" rather than inventing a
   * placeholder like "00000". Requiring `.min(1)` here would reject every
   * real checkout. `.trim()` normalises whitespace-only input to "" instead of
   * storing spaces.
   */
  shippingState: z.string().trim(),
  /** Free-text district hint — fuzzy-matched against Bosta's district list server-side. Column has a DB default, so it stays optional. */
  shippingDistrict: z.string().optional().nullable(),
  shippingPostalCode: z.string().trim(),
  /** Always populated by checkout (the store is Egypt-only), and a blank country is meaningless — so this one is non-empty. */
  shippingCountry: z.string().trim().min(1),
  /** Ordinary lines. May be empty when the order is bundles only. */
  items: z.array(OrderItemSchema),
  bundles: z.array(OrderBundleSchema).max(20).default([]),
  notes: z.string().optional(),
  promoCodeId: z.string().uuid().optional(),
  paymentMethod: z.enum(["cod", "stripe", "paymob"]).optional().default("cod"),
  /** Legacy: Bosta district ID from the old checkout location picker. No
   * longer collected by checkout, kept optional for backward compatibility. */
  bostaDistrictId: z.string().min(1).optional(),
  buildingNumber: z.string().trim().optional(),
  apartment: z.string().trim().optional(),
}).refine((data) => data.items.length + data.bundles.length > 0, {
  message: "An order needs at least one item",
  path: ["items"],
});

// Manually define the insert type matching the schema's nullability
type OrderInsertData = {
  userId: string | null;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string;
  shippingAddress: string;
  shippingCity: string;
  shippingState: string;
  shippingPostalCode: string;
  shippingCountry: string;
  subtotal: string;
  shipping: string;
  tax: string;
  total: string;
  status: (typeof orderStatus.enumValues)[number]; // Use enum values type
  notes: string | null;
  promoCodeId: string | null;
  discount: string | null;
  fincartStatus: string | null;
  fincartSubStatus: string | null;
  fincartTrackingNumber: string | null;
  fincartRejectionReason: string | null;
  fincartSupportNote: string | null;
  fincartReturnTrackingNumber: string | null;
  fincartStatusUpdatedDate: Date | null; // Use Date | null for timestamp
  fincartWebhookData: Record<string, unknown> | null; // More specific type for jsonb
  // createdAt is handled by DB default
  updatedAt: Date | null; // Use Date | null for timestamp
};

// Function to send order data to Fincart
interface FincartOrderData {
  id: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  shippingAddress: string;
  shippingCity: string;
  shippingState: string;
  shippingCountry: string;
  shippingPostalCode: string;
  subtotal: string | number;
  shipping: string | number;
  total: string | number;
  notes: string | null | undefined;
  items: Array<{
    name?: string;
    quantity: number;
    price: string | number;
  }>;
}

interface FincartResponse {
  success: boolean;
  data?: Record<string, unknown>;
  error?: unknown;
}

const sendOrderToFincart = async (
  orderData: FincartOrderData,
): Promise<FincartResponse> => {
  if (!isFincartEnabled()) {
    return { success: false, error: "Fincart integration is disabled" };
  }

  try {
    const FINCART_API_URL = process.env.FINCART_API_URL;
    const FINCART_API_KEY = process.env.FINCART_API_KEY;
    const FINCART_MERCHANT_LOCATION = process.env.FINCART_MERCHANT_LOCATION;
    const FINCART_PICKUP_ID = process.env.FINCART_PICKUP_ID;

    console.log(
      `Sending order to Fincart at: ${FINCART_API_URL}/merchant/app/s2s`,
    );
    console.log(`Using merchant location ID: "${FINCART_MERCHANT_LOCATION}"`);
    console.log(`Using pickup ID: "${FINCART_PICKUP_ID}"`);

    if (!FINCART_API_KEY) {
      console.error("FINCART_API_KEY is not set in the environment variables");
      return { success: false, error: "API Key not configured" };
    }

    if (!FINCART_MERCHANT_LOCATION) {
      console.warn("FINCART_MERCHANT_LOCATION is not set, using default value");
    }

    // Construct the API URL for creating orders
    const fincartOrdersEndpoint = `${FINCART_API_URL}/merchant/app/s2s`;

    // Format the data according to Fincart's API requirements
    const payload = {
      merchant_location:
        FINCART_MERCHANT_LOCATION || "67115a8c16713e3eaec19384", // Use merchant_location field name
      _id: FINCART_MERCHANT_LOCATION || "67115a8c16713e3eaec19384",
      city: orderData.shippingCity,
      location: FINCART_MERCHANT_LOCATION || "67115a8c16713e3eaec19384",
      zone: `${orderData.shippingState} - ${orderData.shippingCity}`,
      customer_name: orderData.customerName,
      customer_address: orderData.shippingAddress,
      customer_phone: orderData.customerPhone,
      customer_email: orderData.customerEmail,
      customer_backup_phone: orderData.customerPhone,
      customer_landmark: `Near ${orderData.shippingCity} Center`,
      ref_id: orderData.id.substring(0, 24), // Limit length to match their format
      pickup_id: FINCART_PICKUP_ID || "67115a8c16713e3eaec19384",
      id_default: true,
      desc: `Order #${orderData.id.substring(0, 8)} from ${orderData.customerName}`,
      no_items: orderData.items.reduce(
        (total, item) => total + item.quantity,
        0,
      ),
      weight: orderData.items.length > 0 ? orderData.items.length * 0.5 : 1,
      note:
        orderData.notes ||
        `Order for ${orderData.customerName} in ${orderData.shippingCity}`,
      open_shipment_allowed: false,
      cod: Number.parseFloat(orderData.total.toString()),
      country: "EG",
      merchant_id: FINCART_MERCHANT_LOCATION || "67115a8c16713e3eaec19384", // Add merchant_id field
      coordinates: "30.049683060160454, 31.333328930893973",
      merchant_address: "43 Al Gahez, St, Nasr City, Cairo Governorate 4441452",
      items: orderData.items.map((item) => ({
        name: item.name || "Product",
        quantity: item.quantity,
        price: Number.parseFloat(item.price.toString()),
      })),
    };

    // For debugging, log the exact payload that will be sent
    console.log(
      "Payload being sent to Fincart:",
      JSON.stringify(payload, null, 2),
    );

    // Send the data to Fincart
    const response = await axios.post(fincartOrdersEndpoint, payload, {
      headers: {
        Authorization: FINCART_API_KEY, // Use the API key directly without any formatting
        "Content-Type": "application/json",
      },
      // Set a timeout to prevent long-running requests
      timeout: 10000,
    });

    // Check if the response is HTML (which would indicate we're hitting a website not an API)
    const contentType =
      response?.headers && "content-type" in response.headers
        ? response.headers["content-type"]
        : null;
    if (
      contentType &&
      typeof contentType === "string" &&
      contentType.includes("text/html")
    ) {
      console.error(
        "Received HTML response from Fincart API. This indicates the URL is incorrect and points to a webpage, not an API endpoint.",
      );
      return {
        success: false,
        error: "Received HTML instead of JSON. API URL is likely incorrect.",
      };
    }

    // Log the full response for debugging
    console.log("Full Fincart API response:", {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      data: response.data,
    });

    // Check if the response indicates success
    if (response.data && response.data.status === "success") {
      console.log("Order sent to Fincart successfully:", response.data);
      return { success: true, data: response.data };
    }

    console.error("Fincart API returned an error:", response.data);
    return {
      success: false,
      error: response.data?.msg || "Unknown error from Fincart API",
    };
  } catch (error) {
    console.error("Failed to send order to Fincart:", error);

    // Provide more detailed error information
    if (axios.isAxiosError(error)) {
      const statusCode = error.response?.status;
      const responseData = error.response?.data;
      const errorMessage = error.message;

      console.error(`Fincart API error (${statusCode}): ${errorMessage}`);
      if (responseData) {
        console.error("Response data:", responseData);
      }

      return {
        success: false,
        error: {
          statusCode,
          message: errorMessage,
          data: responseData,
        },
      };
    }

    return { success: false, error };
  }
};

// ─── Bosta auto-send helper ───────────────────────────────────────────────────

interface CreatedOrder {
  id: string;
  customerName: string;
  customerPhone: string;
  shippingAddress: string;
  shippingCity: string;
  shippingState?: string | null;
  shippingDistrict?: string | null;
  bostaDistrictId?: string | null;
  buildingNumber?: string | null;
  apartment?: string | null;
  itemsCount?: number;
  total: string | number;
  notes?: string | null;
}

function formatStoredShippingAddress(input: {
  shippingAddress: string;
  buildingNumber?: string | null;
  apartment?: string | null;
}): string {
  const street = input.shippingAddress.trim();
  const parts: string[] = [];
  if (input.buildingNumber?.trim()) {
    parts.push(`Bldg ${input.buildingNumber.trim()}`);
  }
  if (input.apartment?.trim()) {
    parts.push(`Apt ${input.apartment.trim()}`);
  }
  if (parts.length === 0) return street;
  return `${street} (${parts.join(", ")})`;
}

async function autoSendOrderToBosta(orderData: CreatedOrder): Promise<void> {
  if (!isBostaEnabled()) return;

  await persistBostaSyncStatus(orderData.id, "pending");

  const nameParts = orderData.customerName.trim().split(/\s+/);
  const firstName = nameParts[0] ?? orderData.customerName;
  const lastName = nameParts.slice(1).join(" ") || "";

  const outcome = await createBostaDelivery({
    orderId: orderData.id,
    receiver: { firstName, lastName, phone: orderData.customerPhone },
    dropOffAddress: {
      firstLine: orderData.shippingAddress,
      // shippingState holds the customer's Bosta-governorate combobox pick
      // (Bosta's own "city" concept); shippingCity holds the free-text
      // city/area name, used as the zone hint.
      city: orderData.shippingState || orderData.shippingCity,
      zone: orderData.shippingCity ?? undefined,
      districtHint: orderData.shippingDistrict ?? undefined,
      districtId: orderData.bostaDistrictId ?? undefined,
      buildingNumber: orderData.buildingNumber ?? undefined,
      apartment: orderData.apartment ?? undefined,
    },
    cod: Number(orderData.total),
    notes: orderData.notes,
    itemsCount: orderData.itemsCount,
  });

  if (!outcome) return;

  if (outcome.success) {
    await persistBostaSyncStatus(orderData.id, "sent", {
      delivery: outcome.result,
    });
    await logOrderEvent({
      orderId: orderData.id,
      action: "bosta_sent",
      note: `Auto-sent to Bosta at checkout (COD) — tracking ${outcome.result.trackingNumber}`,
    });
    console.log(
      `[Order ${orderData.id}] Bosta delivery created — tracking: ${outcome.result.trackingNumber}`,
    );
    return;
  }

  await persistBostaSyncStatus(orderData.id, "failed", {
    error: outcome.error,
  });
  await logOrderEvent({
    orderId: orderData.id,
    action: "bosta_send_failed",
    note: `Auto-send to Bosta failed at checkout (COD): ${outcome.error}`,
  });
}

// ─── Main create-order service ────────────────────────────────────────────────

export const createOrder = (
  input: z.infer<typeof createOrderSchema>,
  session?: ClientSession,
) =>
  Effect.gen(function* ($) {
    // We no longer require a session for ordering
    const result = yield* $(
      query(async (db) => {
        return await db.transaction(async (tx) => {
          // Get user ID if the user is logged in, otherwise set to null
          let userId = null;
          if (session) {
            const userData = await tx
              .select({ id: user.id })
              .from(user)
              .where(eq(user.email, session.email))
              .execute();

            if (userData && userData.length > 0 && userData[0]?.id) {
              userId = userData[0].id;
            }
          }

          const productIds = input.items.map((item) => item.productId);

          // Fetch products (single-shop mode: no vendor data needed)
          const products =
            productIds.length === 0
              ? []
              : await tx
                  .select({
                    id: product.id,
                    price: product.price,
                    discountPrice: product.discountPrice,
                    name: product.name,
                    stock: product.stock,
                    hidden: product.hidden,
                    categoryId: product.categoryId,
                  })
                  .from(product)
                  .where(inArray(product.id, productIds))
                  .execute();

          if (productIds.length > 0 && products.length === 0) {
            throw new ServerError({
              tag: "ProductNotFound",
              message: "No products found for this order",
              statusCode: 404,
              clientMessage: "Products not found",
            });
          }

          for (const item of input.items) {
            const productData = products.find((p) => p.id === item.productId);
            if (!productData) {
              throw new ServerError({
                tag: "ProductNotFound",
                message: `Product with ID ${item.productId} not found`,
                statusCode: 404,
                clientMessage: "Some products in your order could not be found",
              });
            }

            if (productData.hidden) {
              throw new ServerError({
                tag: "ProductNotAvailable",
                message: `Product ${productData.name} is not available`,
                statusCode: 400,
                clientMessage: `${productData.name} is no longer available for purchase`,
              });
            }

            if (productData.stock < item.quantity) {
              throw new ServerError({
                tag: "InsufficientStock",
                message: `Insufficient stock for product ${productData.name}`,
                statusCode: 400,
                clientMessage: `Sorry, there's not enough stock available for ${productData.name}`,
              });
            }
          }

          // ─── Options ("variants") on ordinary lines ─────────────────────
          // One batched read of the products' option groups, then each line's
          // configuration is resolved against them (shared/products/options):
          // the canonical map is what gets priced and stored, and the chosen
          // values' modifiers are folded into the unit price — the same
          // helper the bundle path and the product page use.
          const optionGroups = await loadPurchasableOptionGroups(tx, productIds);
          const resolvedLines = input.items.map((item) => {
            const productData = products.find((p) => p.id === item.productId);
            if (!productData) {
              throw new ServerError({
                tag: "ProductNotFound",
                message: `Product with ID ${item.productId} not found`,
                statusCode: 404,
                clientMessage: "Some products in your order could not be found",
              });
            }
            // An ordinary line that names NO option at all is the storefront's
            // long-standing quick-add (product cards, quick view, search
            // results add a product without a configuration) and is accepted
            // exactly as before Phase 7: base price, no snapshot. Once the
            // client names an option, the configuration must resolve —
            // partial, unknown or unavailable values are refused. Bundle
            // children never get this leniency (see selection.ts): a stack
            // unit must be a resolvable variant.
            const requestedOptions = normalizeSelectedOptionsInput(item.selectedOptions);
            const resolved =
              Object.keys(requestedOptions).length === 0
                ? { ok: true as const, selectedOptions: {}, priceModifier: 0 }
                : resolveSelectedOptions(optionGroups.get(item.productId) ?? [], requestedOptions);
            if (!resolved.ok) throw optionRejection(resolved.code, productData.name, resolved.optionName);
            const selectedOptions: SelectedOptions | null =
              Object.keys(resolved.selectedOptions).length > 0 ? resolved.selectedOptions : null;
            const basePrice = Number.parseFloat(productData.price.toString());
            const baseDiscount = productData.discountPrice
              ? Number.parseFloat(productData.discountPrice.toString())
              : null;
            return {
              productId: item.productId,
              quantity: item.quantity,
              product: productData,
              selectedOptions,
              // Regular price and discount of THIS configuration.
              price: resolvePurchasableLinePrice(basePrice, resolved.priceModifier),
              discountPrice: baseDiscount === null ? null : resolvePurchasableLinePrice(baseDiscount, resolved.priceModifier),
              unitPrice: resolvePurchasableLinePrice(baseDiscount ?? basePrice, resolved.priceModifier),
            };
          });

          // ─── Bundles: server-authoritative revalidation ───────────────────
          // Every stack is re-priced from the live campaign + product rows
          // inside this transaction. The client's totals are never used;
          // `expectedBundleTotal` only lets us tell the shopper the price
          // changed instead of silently charging something else.
          const validatedBundles: (ValidatedBundle & { instanceId: string })[] = [];
          const instancesPerCampaign = new Map<string, number>();
          for (const bundleInput of input.bundles) {
            const check = await loadAndValidateBundleSelection(tx, {
              campaignId: bundleInput.campaignId,
              requested: bundleInput.items.map((item) => ({
                productId: item.productId,
                quantity: item.quantity,
                // Resolved server-side against the live option groups; the
                // validated bundle carries the canonical map, not this one.
                selectedOptions: normalizeSelectedOptionsInput(item.selectedOptions),
              })),
              expectedBundleTotal: bundleInput.expectedBundleTotal ?? null,
            });
            if (!check.ok) {
              throw new ServerError({
                tag: "BundleValidationFailed",
                message: `Bundle ${bundleInput.instanceId} rejected: ${check.code}`,
                statusCode: 400,
                clientMessage: check.message,
              });
            }
            const count = (instancesPerCampaign.get(check.bundle.campaignId) ?? 0) + 1;
            instancesPerCampaign.set(check.bundle.campaignId, count);
            if (count > 1 && !check.bundle.isRepeatable) {
              throw new ServerError({
                tag: "BundleValidationFailed",
                message: `Campaign ${check.bundle.campaignId} is not repeatable`,
                statusCode: 400,
                clientMessage: `"${check.bundle.campaignTitle}" can only be added once per order. Please remove the extra stack.`,
              });
            }
            // Every child line — its options, its label, its regular price —
            // is what the SERVER resolved. For a curated stack the server
            // replaced the item list with the stored composition (fixed
            // variants included); for Build Your Stack it resolved each line's
            // options against the live product. Nothing the client labelled
            // reaches the order.
            validatedBundles.push({ ...check.bundle, instanceId: bundleInput.instanceId });
          }

          // ─── Stock: one aggregate check per product across ordinary lines
          // and every bundle child, so two stacks (or a stack plus a loose
          // unit) of the same product can't each pass individually. ───────
          const stockByProduct = new Map<string, { name: string; stock: number }>();
          for (const p of products) stockByProduct.set(p.id, { name: p.name, stock: p.stock });
          for (const b of validatedBundles) {
            for (const item of b.items) {
              if (!stockByProduct.has(item.productId)) {
                stockByProduct.set(item.productId, { name: item.name, stock: item.stock });
              }
            }
          }
          const requestedByProduct = new Map<string, number>();
          for (const item of input.items) {
            requestedByProduct.set(item.productId, (requestedByProduct.get(item.productId) ?? 0) + item.quantity);
          }
          for (const b of validatedBundles) {
            for (const item of b.items) {
              requestedByProduct.set(item.productId, (requestedByProduct.get(item.productId) ?? 0) + item.quantity);
            }
          }
          for (const [productId, requested] of requestedByProduct) {
            const known = stockByProduct.get(productId);
            if (known && known.stock < requested) {
              throw new ServerError({
                tag: "InsufficientStock",
                message: `Insufficient combined stock for product ${known.name}`,
                statusCode: 400,
                clientMessage: `Sorry, there's not enough stock available for ${known.name}`,
              });
            }
          }

          // ─── Pricing inputs (see shared/bundles/cart-pricing.ts) ──────────
          const regularLines: PricingRegularLine[] = [];
          for (const line of resolvedLines) {
            regularLines.push({
              id: line.productId,
              name: line.product.name,
              quantity: line.quantity,
              // Effective price of the chosen configuration (modifiers in).
              price: line.unitPrice,
              categoryIds: line.product.categoryId ? [line.product.categoryId] : undefined,
            });
          }

          const pricingBundles: PricingBundle[] = validatedBundles.map((b) => ({
            instanceId: b.instanceId,
            offerStacking: b.offerStacking,
            regularTotal: b.regularTotal,
            bundleTotal: b.bundleTotal,
            items: b.items.map((item) => ({
              productId: item.productId,
              name: item.name,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              categoryIds: item.categoryId ? [item.categoryId] : undefined,
            })),
          }));

          const shipping = await getShippingFeeRaw(tx);

          // ─── Evaluate automatic cart offers server-side ───────────────────────
          // Evaluated before the promo code discount below so the promo code's
          // percentage/fixed discount applies to what's left *after* automatic
          // offers, not the raw subtotal (matches the shopper-facing cart math).
          // Exclusive bundles are invisible to the engine; stackable bundles
          // appear as their children at bundle-share prices.
          const now = new Date();
          const activeOffers = await tx
            .select()
            .from(cartOffer)
            .where(
              and(
                eq(cartOffer.isActive, true),
                or(isNull(cartOffer.startsAt), lte(cartOffer.startsAt, now)),
                or(isNull(cartOffer.endsAt), gte(cartOffer.endsAt, now)),
              ),
            )
            .orderBy(asc(cartOffer.priority))
            .execute();

          const offerInputs = buildOfferInputs(regularLines, pricingBundles);
          const cartItemsForOffers = offerInputs.cartItems;

          const appliedOffers = applyOffersToCart(activeOffers, cartItemsForOffers, offerInputs.subtotal);
          const offerDiscount = appliedOffers.reduce((s, o) => s + o.discountAmount, 0);
          const hasFreeShippingFromOffer = appliedOffers.some((o) => o.freeShipping);

          // Promo-code minimum-purchase and applicability checks look at the
          // same value/items offers do — an exclusive bundle counts toward
          // neither, a stackable one toward both.
          const subtotal = offerInputs.subtotal;

          // Check if a promo code is applied
          let promoCodeData = null;

          if (input.promoCodeId) {
            // Get the promo code first to get its code
            promoCodeData = await tx
              .select()
              .from(promoCode)
              .where(eq(promoCode.id, input.promoCodeId))
              .then((res) => res[0]);

            // A promo code id that doesn't resolve means the client sent
            // something stale or tampered with — never silently ignore it.
            if (!promoCodeData) {
              throw new ServerError({
                tag: "PromoCodeValidationFailed",
                statusCode: 400,
                clientMessage:
                  "The promo code on your order is no longer available. Please remove it and try again.",
              });
            }

            const nowForPromo = new Date();

            // Re-validate everything server-side at order time. The cart may
            // have changed since the code was applied, and the client's copy
            // of the discount is never trusted.
            const rejection: string | null = (() => {
              if (
                promoCodeData.status !== "active" &&
                promoCodeData.status !== "scheduled"
              ) {
                return promoCodeData.status === "expired"
                  ? "This promo code has expired."
                  : promoCodeData.status === "exhausted"
                    ? "This promo code has reached its usage limit and can no longer be used."
                    : "This promo code isn't active right now.";
              }
              if (
                promoCodeData.startDate &&
                promoCodeData.startDate > nowForPromo
              ) {
                return "This promo code isn't active yet.";
              }
              if (promoCodeData.endDate && promoCodeData.endDate < nowForPromo) {
                return "This promo code has expired.";
              }
              if (
                promoCodeData.usageLimit !== null &&
                promoCodeData.usedCount >= promoCodeData.usageLimit
              ) {
                return "This promo code has reached its usage limit and can no longer be used.";
              }
              const minPurchase = promoCodeData.minPurchaseAmount
                ? Number(promoCodeData.minPurchaseAmount)
                : 0;
              if (minPurchase > 0 && subtotal < minPurchase) {
                return `This promo code needs a minimum order of ${minPurchase.toFixed(2)} EGP.`;
              }
              return null;
            })();

            if (rejection) {
              throw new ServerError({
                tag: "PromoCodeValidationFailed",
                statusCode: 400,
                clientMessage: rejection,
              });
            }

            // Per-user usage limit — signed-in shoppers by user id, guests by
            // the email they're checking out with.
            if (promoCodeData.usageLimitPerUser !== null) {
              const previousUses = await tx
                .select({ id: order.id })
                .from(order)
                .where(
                  and(
                    eq(order.promoCodeId, promoCodeData.id),
                    userId
                      ? eq(order.userId, userId)
                      : eq(order.customerEmail, input.customerEmail),
                  ),
                )
                .execute();

              if (previousUses.length >= promoCodeData.usageLimitPerUser) {
                throw new ServerError({
                  tag: "PromoCodeValidationFailed",
                  statusCode: 400,
                  clientMessage:
                    promoCodeData.usageLimitPerUser === 1
                      ? "You've already used this promo code."
                      : `You've already used this promo code the maximum of ${promoCodeData.usageLimitPerUser} times.`,
                });
              }
            }

            // Product / category applicability — this was previously skipped
            // at order time, letting a restricted code through on any cart.
            if (!promoCodeData.appliesToAllProducts) {
              const cartProductIds = [...new Set(cartItemsForOffers.map((item) => item.id))];

              const applicableProducts = await tx
                .select({ productId: promoCodeProducts.productId })
                .from(promoCodeProducts)
                .where(
                  and(
                    eq(promoCodeProducts.promoCodeId, promoCodeData.id),
                    inArray(promoCodeProducts.productId, cartProductIds),
                  ),
                )
                .execute();

              const cartCategoryIds = [
                ...new Set(cartItemsForOffers.flatMap((item) => item.categoryIds ?? [])),
              ];

              const applicableCategories =
                cartCategoryIds.length > 0
                  ? await tx
                      .select({ categoryId: promoCodeCategories.categoryId })
                      .from(promoCodeCategories)
                      .where(
                        and(
                          eq(promoCodeCategories.promoCodeId, promoCodeData.id),
                          inArray(
                            promoCodeCategories.categoryId,
                            cartCategoryIds,
                          ),
                        ),
                      )
                      .execute()
                  : [];

              if (
                applicableProducts.length === 0 &&
                applicableCategories.length === 0
              ) {
                throw new ServerError({
                  tag: "PromoCodeValidationFailed",
                  statusCode: 400,
                  clientMessage:
                    "This promo code doesn't apply to any of the items in your cart.",
                });
              }
            }

            // The discount itself is computed by computeCartTotals below from
            // the code's own values, never the client's.

            // Increment used count for the promo code
            await tx
              .update(promoCode)
              .set({
                usedCount: promoCodeData.usedCount + 1,
                // If this was the last use, set status to exhausted
                status:
                  promoCodeData.usageLimit !== null &&
                  promoCodeData.usedCount + 1 >= promoCodeData.usageLimit
                    ? "exhausted"
                    : promoCodeData.status,
              })
              .where(eq(promoCode.id, promoCodeData.id));
          }

          // ─── Totals — single source of truth shared with the cart UI ───────
          const pricing = computeCartTotals({
            regularLines,
            bundles: pricingBundles,
            offerDiscount,
            promo: promoCodeData
              ? {
                  discountType: promoCodeData.discountType,
                  discountValue: Number(promoCodeData.discountValue),
                }
              : null,
            baseShippingFee: shipping,
            freeShipping: hasFreeShippingFromOffer,
          });
          const effectiveShipping = pricing.shipping;
          // order.subtotal = Σ regular line values (incl. bundle children at
          // regular price); order.discount = bundle savings + offers + promo.
          const orderSubtotal = pricing.subtotal;
          const combinedDiscount = pricing.bundleSavings + pricing.offerDiscount + pricing.promoDiscount;
          // Ensure shipping is included in the total (no tax)
          const total = pricing.total;

          // Only include fields directly provided or calculated
          const isOnlinePayment =
            input.paymentMethod === "stripe" ||
            input.paymentMethod === "paymob";
          const insertData = {
            userId: userId,
            customerName: input.customerName,
            customerEmail: input.customerEmail,
            customerPhone: input.customerPhone,
            shippingAddress: formatStoredShippingAddress({
              shippingAddress: input.shippingAddress,
              buildingNumber: input.buildingNumber,
              apartment: input.apartment,
            }),
            shippingCity: input.shippingCity,
            shippingState: input.shippingState,
            shippingDistrict: input.shippingDistrict,
            shippingPostalCode: input.shippingPostalCode,
            shippingCountry: input.shippingCountry,
            subtotal: orderSubtotal.toFixed(2),
            discount: combinedDiscount > 0 ? combinedDiscount.toFixed(2) : null,
            promoCodeId: input.promoCodeId || null,
            shipping: effectiveShipping.toFixed(2),
            tax: "0",
            total: total.toFixed(2),
            notes: input.notes,
            paymentMethod: input.paymentMethod ?? "cod",
            paymentStatus: isOnlinePayment ? "pending" : "not_required",
          };

          const definedInsertData = Object.fromEntries(
            Object.entries(insertData).filter(([_, v]) => v !== undefined),
          );

          const newOrdersInsert = await tx
            .insert(order)
            // @ts-ignore - Drizzle's insert type inference seems incorrect for nullable fields here
            .values(definedInsertData)
            .returning();

          if (!newOrdersInsert || newOrdersInsert.length === 0) {
            throw new ServerError({
              tag: "OrderCreationFailed",
              message: "Failed to create order",
              statusCode: 500,
              clientMessage: "Failed to create order. Please try again.",
            });
          }

          const newOrder = newOrdersInsert[0];
          if (!newOrder || !newOrder.id) {
            throw new ServerError({
              tag: "OrderCreationFailed",
              message: "Failed to create order - missing ID",
              statusCode: 500,
              clientMessage: "Failed to create order. Please try again.",
            });
          }

          const orderItems = await Promise.all(
            resolvedLines.map(async (item) => {
              const productData = item.product;

              // Decrement in SQL rather than from the loaded snapshot, so
              // several lines of one product (variants, a stack plus a loose
              // unit) each subtract their own quantity. Stock is product-level:
              // options never own inventory in this store.
              await tx
                .update(product)
                .set({
                  stock: sql`${product.stock} - ${item.quantity}`,
                })
                .where(eq(product.id, item.productId));

              // The label is built from the CANONICAL options, and the
              // snapshot prices already include the chosen modifiers, so the
              // line reads correctly forever — whatever happens to the
              // product's options later.
              const itemName = item.selectedOptions
                ? `${productData.name} (${formatSelectedOptions(item.selectedOptions)})`
                : productData.name;

              const orderItemInsert = await tx
                .insert(orderItem)
                .values({
                  orderId: newOrder.id,
                  productId: item.productId,
                  vendorId: getStoreOwnerId(), // Single-shop: use default store owner ID
                  quantity: item.quantity,
                  price: item.price.toFixed(2),
                  discountPrice: item.discountPrice === null ? null : item.discountPrice.toFixed(2),
                  name: itemName,
                  vendorName: null, // Single-shop: no vendor names
                  selectedOptions: item.selectedOptions,
                })
                .returning();

              if (!orderItemInsert[0]) {
                throw new ServerError({
                  tag: "OrderItemCreationFailed",
                  message: "Failed to create order item",
                  statusCode: 500,
                  clientMessage:
                    "Failed to create order item. Please try again.",
                });
              }

              return orderItemInsert[0];
            }),
          );

          // ─── Bundle snapshots + child lines ──────────────────────────────
          const bundleOrderItems: typeof orderItems = [];
          for (const b of validatedBundles) {
            const [snapshot] = await tx
              .insert(orderBundle)
              .values({
                orderId: newOrder.id,
                instanceId: b.instanceId,
                campaignId: b.campaignId,
                campaignSlug: b.campaignSlug,
                campaignTitle: b.campaignTitle,
                campaignType: b.campaignType,
                // Tier identity as a plain snapshot: the merchant may delete
                // this tier tomorrow and the order must still read correctly.
                tierId: b.tierId,
                requiredQuantity: b.tierQuantity,
                regularTotal: b.regularTotal.toFixed(2),
                bundleTotal: b.bundleTotal.toFixed(2),
                offerStacking: b.offerStacking,
              })
              .returning();
            if (!snapshot) {
              throw new ServerError({
                tag: "OrderCreationFailed",
                message: "Failed to snapshot bundle",
                statusCode: 500,
                clientMessage: "Failed to create order. Please try again.",
              });
            }

            for (const item of b.items) {
              // Same inventory unit as an ordinary line: the product's stock.
              await tx
                .update(product)
                .set({ stock: sql`${product.stock} - ${item.quantity}` })
                .where(eq(product.id, item.productId));

              // Regular price snapshot of THIS configuration, from the rows
              // the validation read inside this transaction — no re-read.
              const baseName = item.optionsLabel ? `${item.name} (${item.optionsLabel})` : item.name;
              const hasOptions = Object.keys(item.selectedOptions).length > 0;
              const [row] = await tx
                .insert(orderItem)
                .values({
                  orderId: newOrder.id,
                  productId: item.productId,
                  vendorId: getStoreOwnerId(),
                  quantity: item.quantity,
                  price: resolvePurchasableLinePrice(item.price, item.priceModifier).toFixed(2),
                  discountPrice:
                    item.discountPrice === null
                      ? null
                      : resolvePurchasableLinePrice(item.discountPrice, item.priceModifier).toFixed(2),
                  name: `${baseName} — ${b.campaignTitle}`,
                  vendorName: null,
                  orderBundleId: snapshot.id,
                  selectedOptions: hasOptions ? item.selectedOptions : null,
                })
                .returning();
              if (!row) {
                throw new ServerError({
                  tag: "OrderItemCreationFailed",
                  message: "Failed to create bundle order item",
                  statusCode: 500,
                  clientMessage: "Failed to create order item. Please try again.",
                });
              }
              bundleOrderItems.push(row);
            }
          }

          return {
            ...newOrder,
            items: [...orderItems, ...bundleOrderItems],
          };
        });
      }),
    );

    // Start of the per-order audit trail. Cart/checkout state before this
    // point is client-only (no server row exists to log against) — this is
    // the earliest point an order can be tracked server-side.
    yield* $(
      Effect.promise(() =>
        logOrderEvent({
          orderId: result.id,
          action: "created",
          newStatus: result.status,
          note: `Order placed — ${result.paymentMethod}${
            result.paymentMethod === "cod" ? "" : ` (payment ${result.paymentStatus})`
          }, total ${result.total} EGP`,
        }),
      ),
    );

    const emailService = yield* $(EmailService);

    const branding = yield* $(Effect.promise(() => getEmailBranding()));

    const orderItems = result.items.map((i) => ({
      name: i.name ?? "-",
      quantity: i.quantity ?? 0,
      price: i.price ? Number.parseFloat(i.price) : 0,
      discountPrice: i.discountPrice
        ? Number.parseFloat(i.discountPrice)
        : undefined,
      vendorName: i.vendorName ?? undefined,
    }));

    const emailTemplate = yield* $(
      renderEmailTemplate(
        branding.isMinimal
          ? MinimalOrderEmailTemplate({
              storeName: branding.storeName,
              logoUrl: branding.logoUrl,
              contactEmail: branding.contactEmail,
              currency: branding.currency,
              items: orderItems,
              shippingFees: Number.parseFloat(result.shipping),
              subTotal: Number.parseFloat(result.subtotal),
              total: Number.parseFloat(result.total),
              address: result.shippingAddress,
              city: result.shippingCity,
              state: result.shippingState,
              country: result.shippingCountry,
              postalCode: result.shippingPostalCode,
              customerName: result.customerName,
              customerEmail: result.customerEmail,
              customerPhone: result.customerPhone,
            })
          : NewOrderEmailTemplate({
              storeName: branding.storeName,
              logoUrl: branding.logoUrl,
              contactEmail: branding.contactEmail,
              currency: branding.currency,
              items: orderItems,
              shippingFees: Number.parseFloat(result.shipping),
              subTotal: Number.parseFloat(result.subtotal),
              total: Number.parseFloat(result.total),
              address: result.shippingAddress,
              city: result.shippingCity,
              state: result.shippingState,
              country: result.shippingCountry,
              postalCode: result.shippingPostalCode,
              customerName: result.customerName,
              customerEmail: result.customerEmail,
              customerPhone: result.customerPhone,
            }),
      ),
    );

    const admins = yield* $(
      query(
        async (db) =>
          await db.select().from(user).where(eq(user.role, "admin")),
      ),
    );

    // Send emails, but don't let failures block the order creation
    // Single-shop mode: Only send customer notification, no vendor emails
    try {
      yield* $(
        emailService.sendEmail(
          input.customerEmail,
          `${branding.storeName} Order Confirmation`,
          emailTemplate,
        ),
      );
    } catch (error) {
      console.error(
        `Failed to send confirmation email to customer ${input.customerEmail}:`,
        error,
      );
      // Continue with order creation even if email fails
    }

    // Send admin notifications
    for (const admin of admins) {
      try {
        yield* $(
          emailService.sendEmail(
            admin.email,
            "New Order Received",
            emailTemplate,
          ),
        );
      } catch (error) {
        console.error(
          `Failed to send notification email to admin ${admin.email}:`,
          error,
        );
        // Continue with order creation even if email fails
      }
    }

    // Single-shop mode: No vendor notifications needed

    // Send order to Fincart (opt-in via FINCART_ENABLED=true)
    const isOnlinePaymentOrder =
      input.paymentMethod === "stripe" || input.paymentMethod === "paymob";
    if (isFincartEnabled() && !isOnlinePaymentOrder) {
      try {
        // Use Effect to handle the async operation correctly
        yield* $(Effect.promise(() => sendOrderToFincart(result))).pipe(
          Effect.tap((fincartResult) => {
            if (!fincartResult.success) {
              console.error(
                "Failed to send order to Fincart:",
                fincartResult.error,
              );
            }
          }),
          Effect.catchAll((error) => {
            console.error("Exception when sending order to Fincart:", error);
            return Effect.succeed(undefined);
          }),
        );
      } catch (error) {
        console.error("Exception when sending order to Fincart:", error);
      }
    } else if (isFincartEnabled() && isOnlinePaymentOrder) {
      console.log(
        `[Order ${result.id}] Online payment (${input.paymentMethod}) — Fincart shipment deferred until payment confirmed`,
      );
    }

    // ── Bosta integration (feature-flagged) ──────────────────────────────────
    // Runs only when SYN_BOSTA_KEY is present. Never throws — a failure here
    // does NOT abort order creation.
    if (!isOnlinePaymentOrder) {
      yield* $(
        Effect.promise(async () => {
          try {
            await autoSendOrderToBosta({
              ...result,
              shippingAddress: input.shippingAddress,
              bostaDistrictId: input.bostaDistrictId,
              buildingNumber: input.buildingNumber,
              apartment: input.apartment,
              itemsCount: input.items.reduce((sum, item) => sum + item.quantity, 0),
            });
          } catch (err) {
            console.error("[Bosta] Auto-send failed (order still created):", err);
            if (isBostaEnabled()) {
              await persistBostaSyncStatus(result.id, "failed", {
                error: err instanceof Error ? err.message : String(err),
              });
            }
          }
        }),
      );
    } else if (isBostaEnabled()) {
      yield* $(
        Effect.promise(() =>
          persistBostaSyncStatus(result.id, "skipped", {
            error: "Deferred until online payment is confirmed",
          }),
        ),
      );
      yield* $(
        Effect.promise(() =>
          logOrderEvent({
            orderId: result.id,
            action: "bosta_skipped",
            note: `Bosta dispatch deferred — ${input.paymentMethod} payment not yet confirmed`,
          }),
        ),
      );
    }

    return result;
  });
