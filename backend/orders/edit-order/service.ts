import { type DatabaseClient, query } from "#root/shared/database/drizzle/db";
import {
  file,
  order,
  orderItem,
  orderLog,
  product,
  user,
} from "#root/shared/database/drizzle/schema";
import { ServerError } from "#root/shared/error/server";
import { and, asc, eq, gte, inArray, sql } from "drizzle-orm";
import { Effect } from "effect";
import { z } from "zod";
import { effectiveGa4PurchaseOwner } from "#root/shared/config/ga4-purchase-owner";
import { enqueueGa4PurchaseInTx } from "#root/backend/pixel-tracking/ga4-purchase/enqueue";
import { isPurchaseMilestone } from "#root/backend/pixel-tracking/ga4-purchase/eligibility";
import type { ClientSession } from "#root/backend/auth/shared/entities";
import { getStoreOwnerId } from "#root/shared/config/store";
import { loadPurchasableOptionGroups } from "#root/backend/products/option-groups";
import {
  type SelectedOptions,
  formatSelectedOptions,
  resolvePurchasableLinePrice,
  resolveSelectedOptions,
} from "#root/shared/products/options";
import { effectiveUnitPrice } from "#root/shared/pricing/effective-price";
import {
  ORDER_CHANGED_MESSAGE,
  type MergeableLine,
  addProductBlockReason,
  findMergeTarget,
  lineUnitCharge,
  orderTotalFromParts,
} from "#root/shared/orders/edit-rules";
import { computeOrderEditVersion } from "./version";

/**
 * Full admin edit for an order. Every field the admin can see is editable:
 * customer details, shipping address, line items (quantities, per-line price,
 * removals and additions), money (shipping/tax/discount and an optional
 * hard total override), payment method/status, order status and notes.
 *
 * Any omitted field is left untouched, so partial edits are safe. The
 * dashboard sends only what the admin actually changed.
 */
export const editOrderSchema = z.object({
  orderId: z.string().uuid(),

  /**
   * The order fingerprint the editor was opened against (order.editContext /
   * order.previewEdit). When present, the edit is refused if the order has
   * changed since — see ./version.ts.
   */
  expectedVersion: z.string().min(1).max(128).optional(),

  // ── Line items ──
  // Quantity to set for each existing order item. Setting quantity to 0
  // removes the item from the order and fully restores its stock.
  // `price`/`discountPrice` let the admin override what this line charges.
  items: z
    .array(
      z.object({
        orderItemId: z.string().uuid(),
        quantity: z.number().int().min(0),
        price: z.number().min(0).optional(),
        discountPrice: z.number().min(0).nullable().optional(),
      }),
    )
    .optional(),
  /**
   * Existing catalogue products to add to this order. Each one is resolved
   * server-side exactly like checkout resolves a line: the product must be
   * live, a product with options needs one valid value per option group, and
   * the price is the catalogue's effective price plus the option modifiers.
   * An addition that matches an existing standalone line (same product, same
   * options, same unit charge) increases that line's quantity instead of
   * creating a duplicate. `price` is a manual unit-price override; an
   * overridden addition is always its own line.
   */
  newItems: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.number().int().min(1).max(1000),
        selectedOptions: z
          .record(z.string().max(100), z.string().max(200))
          .optional(),
        price: z.number().min(0).optional(),
      }),
    )
    .max(50)
    .optional(),

  // ── Customer ──
  customerName: z.string().min(1).optional(),
  // Cash-on-delivery orders may carry no email ("" is what checkout stores),
  // so "" must round-trip through the editor.
  customerEmail: z.union([z.literal(""), z.string().trim().email()]).optional(),
  customerPhone: z.string().min(1).optional(),

  // ── Shipping address ──
  shippingAddress: z.string().min(1).optional(),
  shippingCity: z.string().min(1).optional(),
  shippingState: z.string().optional(),
  shippingPostalCode: z.string().optional(),
  shippingCountry: z.string().optional(),

  // ── Money ──
  shipping: z.number().min(0).optional(),
  tax: z.number().min(0).optional(),
  discount: z.number().min(0).optional(),
  /** Hard override. When omitted the total is recomputed from the lines. */
  total: z.number().min(0).optional(),

  // ── Payment / status / notes ──
  paymentMethod: z.enum(["cod", "stripe", "paymob"]).optional(),
  paymentStatus: z
    .enum(["not_required", "pending", "processing", "paid", "failed", "refunded"])
    .optional(),
  status: z
    .enum(["pending", "processing", "shipped", "delivered", "cancelled"])
    .optional(),
  notes: z.string().nullable().optional(),
});

export type EditOrderInput = z.infer<typeof editOrderSchema>;

type Tx = Parameters<Parameters<DatabaseClient["transaction"]>[0]>[0];
type Money = { subtotal: number; discount: number; shipping: number; tax: number; total: number };

/** One line of the order as it stands after the edit — what the review step shows. */
export interface OrderEditSummaryLine {
  id: string;
  productId: string;
  name: string;
  productImage: string | null;
  selectedOptions: SelectedOptions | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  inBundle: boolean;
}

/** A product this edit adds, and where it landed. */
export interface OrderEditAddition {
  productId: string;
  name: string;
  selectedOptions: SelectedOptions | null;
  quantity: number;
  unitPrice: number;
  /** Set when the units folded into an existing line instead of a new one. */
  mergedIntoLineId: string | null;
  previousLineQuantity: number | null;
  newLineQuantity: number;
}

export interface OrderEditSummary {
  orderId: string;
  /** The fingerprint the edit was computed against — send it back with the save. */
  version: string;
  paymentMethod: "cod" | "stripe" | "paymob";
  before: Money;
  after: Money;
  additions: OrderEditAddition[];
  /** Human-readable list of every line change, as recorded in the activity log. */
  changes: string[];
  lines: OrderEditSummaryLine[];
}

const num = (v: string | number | null | undefined): number => {
  if (v === null || v === undefined) return 0;
  const parsed = typeof v === "number" ? v : Number.parseFloat(v);
  return Number.isFinite(parsed) ? parsed : 0;
};
const fmt = (v: number) => `${v.toFixed(2)} EGP`;
const toMinor = (v: number) => Math.round(v * 100);

const forbidden = () =>
  new ServerError({
    tag: "Forbidden",
    message: "Admin access required",
    statusCode: 403,
    clientMessage: "Admin access required",
  });

const isAdmin = (session?: ClientSession) =>
  !!session && (session.role === "admin" || session.role === "superadmin");

/** The order row columns an edit reads, locked FOR UPDATE when `lock` is set. */
async function loadOrderForEdit(tx: Tx, orderId: string, lock: boolean) {
  const base = tx
    .select({
      id: order.id,
      status: order.status,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      subtotal: order.subtotal,
      shipping: order.shipping,
      tax: order.tax,
      discount: order.discount,
      total: order.total,
      stockRestored: order.stockRestored,
      bostaDeliveryId: order.bostaDeliveryId,
      fincartTrackingNumber: order.fincartTrackingNumber,
    })
    .from(order)
    .where(eq(order.id, orderId));
  const rows = lock ? await base.for("update") : await base;
  const row = rows[0];
  if (!row) {
    throw new ServerError({
      tag: "OrderNotFound",
      message: `Order with ID ${orderId} not found`,
      statusCode: 404,
      clientMessage: "Order not found",
    });
  }
  return row;
}

async function loadLines(tx: Tx, orderId: string) {
  return tx
    .select({
      id: orderItem.id,
      productId: orderItem.productId,
      name: orderItem.name,
      quantity: orderItem.quantity,
      price: orderItem.price,
      discountPrice: orderItem.discountPrice,
      orderBundleId: orderItem.orderBundleId,
      selectedOptions: orderItem.selectedOptions,
      productImageDiskname: file.diskname,
    })
    .from(orderItem)
    .leftJoin(product, eq(orderItem.productId, product.id))
    .leftJoin(file, eq(product.imageId, file.id))
    .where(eq(orderItem.orderId, orderId))
    .orderBy(asc(orderItem.createdAt), asc(orderItem.id));
}

/**
 * Takes `quantity` units of a product's stock, atomically: the row is only
 * updated while enough stock remains, so two concurrent edits (or an edit
 * racing a checkout) can never drive stock negative.
 */
async function takeStock(tx: Tx, productId: string, quantity: number, productName: string, increase: boolean) {
  const updated = await tx
    .update(product)
    .set({ stock: sql`${product.stock} - ${quantity}` })
    .where(and(eq(product.id, productId), gte(product.stock, quantity)))
    .returning({ stock: product.stock });
  if (updated.length > 0) return;
  const [row] = await tx.select({ stock: product.stock }).from(product).where(eq(product.id, productId));
  const available = row?.stock ?? 0;
  throw new ServerError({
    tag: "InsufficientStock",
    message: `Not enough stock for ${productName} (available: ${available}, requested: ${quantity})`,
    statusCode: 400,
    clientMessage: increase
      ? `Not enough stock available to increase this item's quantity (only ${available} left).`
      : `Not enough stock for ${productName} (only ${available} left).`,
  });
}

function optionError(code: "option_required" | "option_not_found" | "option_unavailable", productName: string, optionName: string) {
  const clientMessage =
    code === "option_required"
      ? `Choose a ${optionName} for ${productName}.`
      : code === "option_not_found"
        ? `The ${optionName} chosen for ${productName} no longer exists on the product.`
        : `The ${optionName} chosen for ${productName} is currently unavailable.`;
  return new ServerError({
    tag: "ProductOptionInvalid",
    message: `${code}: ${productName} / ${optionName}`,
    statusCode: 400,
    clientMessage,
  });
}

/**
 * The whole edit, inside the caller's transaction. Returns the updated order
 * row and a summary of what changed. Shared by the real save and the preview
 * (which runs it and rolls back), so what the admin reviews is exactly what
 * the save will write.
 */
async function applyOrderEdit(tx: Tx, input: EditOrderInput, session: ClientSession) {
  const { orderId, items, newItems } = input;

  // Row lock: two admins saving the same order serialise here instead of
  // each recomputing totals from a stale read.
  const existingOrder = await loadOrderForEdit(tx, orderId, true);
  const existingItems = await loadLines(tx, orderId);
  const version = computeOrderEditVersion(existingOrder, existingItems);

  if (input.expectedVersion !== undefined && input.expectedVersion !== version) {
    throw new ServerError({
      tag: "OrderChanged",
      message: `Order ${orderId} changed since the editor opened (expected ${input.expectedVersion}, now ${version})`,
      statusCode: 409,
      clientMessage: ORDER_CHANGED_MESSAGE,
    });
  }

  // Adding catalogue products is only allowed while the order is still open
  // and cash-on-delivery (shared/orders/edit-rules.ts). Judged on the order
  // as it is AND as this same edit would leave it, so one save cannot add a
  // product and ship/cancel/re-tender the order at the same time.
  if (newItems && newItems.length > 0) {
    const reason =
      addProductBlockReason(existingOrder) ??
      addProductBlockReason({
        ...existingOrder,
        status: input.status ?? existingOrder.status,
        paymentMethod: input.paymentMethod ?? existingOrder.paymentMethod,
      });
    if (reason) {
      throw new ServerError({
        tag: "OrderNotEditable",
        message: `Cannot add products to order ${orderId}: ${reason}`,
        statusCode: 409,
        clientMessage: reason,
      });
    }
  }

  const before: Money = {
    subtotal: num(existingOrder.subtotal),
    discount: num(existingOrder.discount),
    shipping: num(existingOrder.shipping),
    tax: num(existingOrder.tax),
    total: num(existingOrder.total),
  };

  // Working copy of the lines, kept in step with every write below so later
  // additions merge against the order as this edit leaves it.
  const lines: (MergeableLine & { name: string })[] = existingItems.map((it) => ({
    id: it.id,
    productId: it.productId,
    name: it.name,
    quantity: it.quantity,
    price: num(it.price),
    discountPrice: it.discountPrice === null ? null : num(it.discountPrice),
    orderBundleId: it.orderBundleId,
    selectedOptions: it.selectedOptions ?? null,
  }));
  const lineById = new Map(lines.map((l) => [l.id, l]));
  const changes: string[] = [];
  let linesChanged = false;

  // ── Update existing line items ──
  for (const change of items ?? []) {
    const existing = lineById.get(change.orderItemId);
    if (!existing) {
      throw new ServerError({
        tag: "OrderItemNotFound",
        message: `Order item ${change.orderItemId} not found on this order`,
        statusCode: 404,
        clientMessage: "One of the items on this order could not be found",
      });
    }

    const delta = change.quantity - existing.quantity;
    if (delta > 0) {
      // Increasing quantity — take the extra units from stock.
      await takeStock(tx, existing.productId, delta, existing.name, true);
    } else if (delta < 0) {
      // Decreasing (or removing) — release the difference back to stock.
      await tx
        .update(product)
        .set({ stock: sql`${product.stock} + ${-delta}` })
        .where(eq(product.id, existing.productId));
    }

    if (change.quantity === 0) {
      await tx.delete(orderItem).where(eq(orderItem.id, existing.id));
      changes.push(`Removed ${existing.name} (qty ${existing.quantity})`);
      existing.removed = true;
      existing.quantity = 0;
      linesChanged = true;
      continue;
    }

    const lineUpdate: { quantity: number; price?: string; discountPrice?: string | null } = {
      quantity: change.quantity,
    };
    const oldCharge = lineUnitCharge(existing.price, existing.discountPrice);
    let nextPrice = existing.price;
    let nextDiscount = existing.discountPrice;
    if (change.price !== undefined) {
      lineUpdate.price = change.price.toFixed(2);
      nextPrice = change.price;
    }
    if (change.discountPrice !== undefined) {
      lineUpdate.discountPrice = change.discountPrice === null ? null : change.discountPrice.toFixed(2);
      nextDiscount = change.discountPrice;
    }
    const newCharge = lineUnitCharge(nextPrice, nextDiscount);

    await tx.update(orderItem).set(lineUpdate).where(eq(orderItem.id, existing.id));

    if (delta !== 0) {
      changes.push(`${existing.name}: qty ${existing.quantity} → ${change.quantity}`);
      linesChanged = true;
    }
    if (toMinor(oldCharge) !== toMinor(newCharge)) {
      changes.push(`${existing.name}: unit price ${fmt(oldCharge)} → ${fmt(newCharge)}`);
      linesChanged = true;
    }
    if (toMinor(nextPrice) !== toMinor(existing.price) || nextDiscount !== existing.discountPrice) {
      // A snapshot rewrite with the same charge still changes the line.
      linesChanged = true;
    }
    existing.quantity = change.quantity;
    existing.price = nextPrice;
    existing.discountPrice = nextDiscount;
  }

  // ── Add existing catalogue products ──
  const additions: OrderEditAddition[] = [];
  if (newItems && newItems.length > 0) {
    const productIds = [...new Set(newItems.map((n) => n.productId))];
    const productRows = await tx
      .select({
        id: product.id,
        name: product.name,
        price: product.price,
        discountPrice: product.discountPrice,
        internalCode: product.internalCode,
        deleted: product.deleted,
        hidden: product.hidden,
      })
      .from(product)
      .where(inArray(product.id, productIds));
    const productById = new Map(productRows.map((p) => [p.id, p]));
    // The same loader checkout and bundles resolve options with.
    const optionGroups = await loadPurchasableOptionGroups(tx, productIds);

    for (const addition of newItems) {
      const productData = productById.get(addition.productId);
      if (!productData) {
        throw new ServerError({
          tag: "ProductNotFound",
          message: `Product ${addition.productId} not found`,
          statusCode: 404,
          clientMessage: "One of the products you tried to add could not be found",
        });
      }
      if (productData.deleted) {
        throw new ServerError({
          tag: "ProductNotAvailable",
          message: `Product ${productData.name} is deleted`,
          statusCode: 400,
          clientMessage: `${productData.name} has been deleted from the catalogue and can't be added.`,
        });
      }
      if (productData.hidden) {
        throw new ServerError({
          tag: "ProductNotAvailable",
          message: `Product ${productData.name} is hidden`,
          statusCode: 400,
          clientMessage: `${productData.name} is hidden from the shop and can't be added to an order.`,
        });
      }

      // The admin must name the exact variant: unlike the storefront's
      // quick-add, a product with option groups is never added without one.
      const groups = optionGroups.get(productData.id) ?? [];
      const resolved = resolveSelectedOptions(groups, addition.selectedOptions ?? {});
      if (!resolved.ok) throw optionError(resolved.code, productData.name, resolved.optionName);
      const selectedOptions: SelectedOptions | null =
        Object.keys(resolved.selectedOptions).length > 0 ? resolved.selectedOptions : null;

      // Catalogue price of THIS configuration, snapshotted the way checkout
      // snapshots it: only a valid sale price becomes the line's discount.
      const basePrice = num(productData.price);
      const rawDiscount = productData.discountPrice === null ? null : num(productData.discountPrice);
      const baseDiscount = effectiveUnitPrice(basePrice, rawDiscount) < basePrice ? rawDiscount : null;
      let price = resolvePurchasableLinePrice(basePrice, resolved.priceModifier);
      let discountPrice =
        baseDiscount === null ? null : resolvePurchasableLinePrice(baseDiscount, resolved.priceModifier);
      const overridden = addition.price !== undefined;
      if (addition.price !== undefined) {
        price = addition.price;
        discountPrice = null;
      }
      const unitPrice = lineUnitCharge(price, discountPrice);
      const name = selectedOptions
        ? `${productData.name} (${formatSelectedOptions(selectedOptions)})`
        : productData.name;

      await takeStock(tx, productData.id, addition.quantity, productData.name, false);

      const target = overridden
        ? null
        : findMergeTarget(lines, { productId: productData.id, selectedOptions, unitPrice });

      if (target) {
        const previous = target.quantity;
        const next = previous + addition.quantity;
        await tx.update(orderItem).set({ quantity: next }).where(eq(orderItem.id, target.id));
        target.quantity = next;
        additions.push({
          productId: productData.id,
          name,
          selectedOptions,
          quantity: addition.quantity,
          unitPrice,
          mergedIntoLineId: target.id,
          previousLineQuantity: previous,
          newLineQuantity: next,
        });
        changes.push(
          `Added ${addition.quantity} × ${name} at ${fmt(unitPrice)} each — merged into the existing line (qty ${previous} → ${next})`,
        );
      } else {
        const [inserted] = await tx
          .insert(orderItem)
          .values({
            orderId,
            productId: productData.id,
            vendorId: getStoreOwnerId(),
            quantity: addition.quantity,
            price: price.toFixed(2),
            discountPrice: discountPrice === null ? null : discountPrice.toFixed(2),
            name,
            vendorName: null,
            selectedOptions,
            // Snapshotted at the moment the admin adds the line, the same
            // way `name` and `price` beside it are. Null when the product
            // has no code.
            internalCode: productData.internalCode ?? null,
          })
          .returning({ id: orderItem.id });
        if (!inserted) {
          throw new ServerError({
            tag: "OrderItemCreationFailed",
            message: "Failed to insert the added order item",
            statusCode: 500,
            clientMessage: "Failed to add the product. Please try again.",
          });
        }
        lines.push({
          id: inserted.id,
          productId: productData.id,
          name,
          quantity: addition.quantity,
          price,
          discountPrice,
          orderBundleId: null,
          selectedOptions,
        });
        additions.push({
          productId: productData.id,
          name,
          selectedOptions,
          quantity: addition.quantity,
          unitPrice,
          mergedIntoLineId: null,
          previousLineQuantity: null,
          newLineQuantity: addition.quantity,
        });
        changes.push(
          `Added ${addition.quantity} × ${name} at ${fmt(unitPrice)} each${overridden ? " (manual price)" : ""}`,
        );
      }
      linesChanged = true;
    }
  }

  // ── Recompute the money from whatever the lines now say ──
  const refreshedItems = await loadLines(tx, orderId);
  if (refreshedItems.length === 0) {
    throw new ServerError({
      tag: "OrderWouldBeEmpty",
      message: "An order must have at least one item",
      statusCode: 400,
      clientMessage: "An order can't be edited down to zero items — cancel or delete it instead.",
    });
  }

  const subtotalMinor = refreshedItems.reduce(
    (acc, item) =>
      acc + toMinor(lineUnitCharge(num(item.price), item.discountPrice === null ? null : num(item.discountPrice))) * item.quantity,
    0,
  );
  const subtotal = subtotalMinor / 100;

  // Admin-supplied values win; otherwise keep what the order already had.
  // The stored discount (Set savings, offers, promo code) is carried as an
  // amount: it is never silently re-derived or re-applied to added lines.
  const shipping = input.shipping ?? before.shipping;
  const tax = input.tax ?? before.tax;
  const discount = input.discount ?? before.discount;

  const moneyChanged =
    linesChanged ||
    input.shipping !== undefined ||
    input.tax !== undefined ||
    input.discount !== undefined ||
    input.total !== undefined;

  const total =
    input.total ?? (moneyChanged ? orderTotalFromParts({ subtotal, discount, shipping, tax }) : before.total);

  const orderUpdate: Partial<typeof order.$inferInsert> = { updatedAt: new Date() };
  if (moneyChanged) {
    // Untouched columns stay exactly as stored (a NULL discount stays NULL).
    orderUpdate.subtotal = subtotal.toFixed(2);
    orderUpdate.total = total.toFixed(2);
    if (input.shipping !== undefined) orderUpdate.shipping = shipping.toFixed(2);
    if (input.tax !== undefined) orderUpdate.tax = tax.toFixed(2);
    if (input.discount !== undefined) orderUpdate.discount = discount.toFixed(2);
  }

  if (input.customerName !== undefined) orderUpdate.customerName = input.customerName;
  if (input.customerEmail !== undefined) orderUpdate.customerEmail = input.customerEmail;
  if (input.customerPhone !== undefined) orderUpdate.customerPhone = input.customerPhone;
  if (input.shippingAddress !== undefined) orderUpdate.shippingAddress = input.shippingAddress;
  if (input.shippingCity !== undefined) orderUpdate.shippingCity = input.shippingCity;
  if (input.shippingState !== undefined) orderUpdate.shippingState = input.shippingState;
  if (input.shippingPostalCode !== undefined) orderUpdate.shippingPostalCode = input.shippingPostalCode;
  if (input.shippingCountry !== undefined) orderUpdate.shippingCountry = input.shippingCountry;
  if (input.paymentMethod !== undefined) orderUpdate.paymentMethod = input.paymentMethod;
  if (input.paymentStatus !== undefined) orderUpdate.paymentStatus = input.paymentStatus;
  if (input.status !== undefined) orderUpdate.status = input.status;
  if (input.notes !== undefined) orderUpdate.notes = input.notes;

  const updatedOrder = await tx.update(order).set(orderUpdate).where(eq(order.id, orderId)).returning();
  const after = updatedOrder[0];

  // GA4 server-owned purchase (shadow/server only): an ONLINE order
  // that staff move to `paid` is a confirmed payment. Edits of COD
  // orders, or of an order already paid, never enqueue — so adding a
  // product to an order never produces a purchase event.
  const ga4Owner = effectiveGa4PurchaseOwner();
  if (ga4Owner !== "browser" && after && isPurchaseMilestone("admin_edit", existingOrder, after)) {
    // Delivered by the worker's next poll (≤ 15 s) once this commits.
    await enqueueGa4PurchaseInTx(
      tx,
      { orderId, source: "admin_edit", eligibleAt: after.updatedAt ?? new Date() },
      ga4Owner,
    );
  }

  const afterMoney: Money = {
    subtotal: num(after?.subtotal),
    discount: num(after?.discount),
    shipping: num(after?.shipping),
    tax: num(after?.tax),
    total: num(after?.total),
  };

  const userData = await tx.select({ id: user.id }).from(user).where(eq(user.email, session.email));

  const previousStatus = existingOrder.status;
  const nextStatus = input.status ?? previousStatus;

  // The activity log records what was added and the money before/after.
  // (Internal only: the ERP export never carries activity-log notes.)
  const noteLines = [`Order edited by ${session.role}`, ...changes];
  if (toMinor(before.subtotal) !== toMinor(afterMoney.subtotal) || toMinor(before.total) !== toMinor(afterMoney.total)) {
    noteLines.push(
      `Subtotal ${fmt(before.subtotal)} → ${fmt(afterMoney.subtotal)} · Total ${fmt(before.total)} → ${fmt(afterMoney.total)}`,
    );
  }

  await tx.insert(orderLog).values({
    orderId,
    userId: userData[0]?.id,
    action: input.status && input.status !== previousStatus ? "status_changed" : "items_edited",
    oldStatus: previousStatus,
    newStatus: nextStatus,
    note: noteLines.join("\n"),
  });

  const summary: OrderEditSummary = {
    orderId,
    version,
    paymentMethod: after?.paymentMethod ?? existingOrder.paymentMethod,
    before,
    after: afterMoney,
    additions,
    changes,
    lines: refreshedItems.map((it) => {
      const unit = lineUnitCharge(num(it.price), it.discountPrice === null ? null : num(it.discountPrice));
      return {
        id: it.id,
        productId: it.productId,
        name: it.name,
        productImage: it.productImageDiskname ? `/uploads/${it.productImageDiskname}` : null,
        selectedOptions: it.selectedOptions ?? null,
        quantity: it.quantity,
        unitPrice: unit,
        lineTotal: (toMinor(unit) * it.quantity) / 100,
        inBundle: it.orderBundleId !== null,
      };
    }),
  };

  return { order: after, summary };
}

export const editOrder = (input: EditOrderInput, session?: ClientSession) =>
  Effect.gen(function* ($) {
    if (!session || !isAdmin(session)) return yield* $(Effect.fail(forbidden()));
    return yield* $(
      query(async (db) =>
        db.transaction(async (tx) => (await applyOrderEdit(tx, input, session)).order),
      ),
    );
  });

/** Carries the preview's result out of the transaction it rolls back. */
class PreviewRollback extends Error {
  constructor(readonly summary: OrderEditSummary) {
    super("order edit preview rollback");
  }
}

/**
 * Runs the exact edit inside a transaction, captures the resulting summary
 * and ROLLS BACK — nothing is written (no lines, stock, totals, activity log
 * or GA4 outbox row). Validation (stock, variants, eligibility, a stale
 * version) fails here exactly as the save would.
 */
export const previewOrderEdit = (input: EditOrderInput, session?: ClientSession) =>
  Effect.gen(function* ($) {
    if (!session || !isAdmin(session)) return yield* $(Effect.fail(forbidden()));
    return yield* $(
      query(async (db) => {
        try {
          await db.transaction(async (tx) => {
            const { summary } = await applyOrderEdit(tx, input, session);
            throw new PreviewRollback(summary);
          });
        } catch (err) {
          if (err instanceof PreviewRollback) return err.summary;
          throw err;
        }
        throw new ServerError({ tag: "PreviewFailed", message: "Preview transaction committed unexpectedly" });
      }),
    );
  });

export const orderEditContextSchema = z.object({ orderId: z.string().uuid() });

/**
 * What the editor needs when it opens: the order's current fingerprint and
 * whether products may be added (with the reason when not).
 */
export const getOrderEditContext = (input: z.infer<typeof orderEditContextSchema>, session?: ClientSession) =>
  Effect.gen(function* ($) {
    if (!session || !isAdmin(session)) return yield* $(Effect.fail(forbidden()));
    return yield* $(
      query(async (db) =>
        db.transaction(async (tx) => {
          const existingOrder = await loadOrderForEdit(tx, input.orderId, false);
          const lines = await loadLines(tx, input.orderId);
          return {
            orderId: input.orderId,
            version: computeOrderEditVersion(existingOrder, lines),
            addProductBlockedReason: addProductBlockReason(existingOrder),
          };
        }),
      ),
    );
  });
