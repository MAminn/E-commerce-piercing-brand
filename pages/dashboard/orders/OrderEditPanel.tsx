import { useEffect, useMemo, useState } from "react";
import { Button } from "#root/components/ui/button";
import { Input } from "#root/components/ui/input";
import { Label } from "#root/components/ui/label";
import { Textarea } from "#root/components/ui/textarea";
import { Checkbox } from "#root/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#root/components/ui/select";
import { Info, Loader2, Plus, Trash2 } from "lucide-react";
import { trpc } from "#root/shared/trpc/client";
import { type ImagePreview, ImagePreviewDialog } from "#root/components/ui/image-preview-dialog";
import type { OrderEditSummary } from "#root/backend/orders/edit-order/service";
import {
  type MergeableLine,
  findMergeTarget,
  orderTotalFromParts,
} from "#root/shared/orders/edit-rules";
import {
  type SelectedOptions,
  formatSelectedOptions,
  productLineKey,
} from "#root/shared/products/options";
import { AddProductDialog, type PickedProduct } from "./AddProductDialog";
import { OrderEditReviewDialog } from "./OrderEditReviewDialog";
import {
  type OrderEditPayload,
  buildOrderEditPayload,
  describeDetailChanges,
  originalUnitPrice,
  parseAmount,
  payloadChangesMoney,
} from "./order-edit-payload";

/** Minimal shape this panel needs from an order row. */
export interface EditableOrder {
  id: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  shippingAddress: string;
  shippingCity: string;
  shippingState: string | null;
  shippingPostalCode: string | null;
  shippingCountry: string | null;
  subtotal: string;
  shipping: string;
  tax?: string | null;
  discount: string | null;
  total: string;
  status: "pending" | "processing" | "shipped" | "delivered" | "cancelled";
  notes: string | null;
  paymentMethod: "cod" | "stripe" | "paymob";
  paymentStatus:
    | "not_required"
    | "pending"
    | "processing"
    | "paid"
    | "failed"
    | "refunded";
  items: {
    id: string;
    productId: string;
    quantity: number;
    price: string;
    name: string;
    discountPrice?: string | null;
    productImage?: string | null;
    /** Merchant-only snapshot from the moment the line was placed. */
    internalCode?: string | null;
    /** Set on a bundle (Set) child line — never merged with a loose addition. */
    orderBundleId?: string | null;
    /** Option snapshot (`{ Color: "Gold" }`); null on simple / legacy lines. */
    selectedOptions?: Record<string, string> | null;
  }[];
}

interface DraftItem {
  orderItemId: string;
  productId: string;
  name: string;
  productImage?: string | null;
  /**
   * Carried through the draft read-only: the admin edits quantity and price,
   * never the snapshot. Rewriting it would falsify what the line was sold as.
   */
  internalCode?: string | null;
  orderBundleId: string | null;
  selectedOptions: SelectedOptions | null;
  quantity: number;
  /** Unit price charged for this line, as typed. */
  unitPrice: string;
  removed: boolean;
}

/** A catalogue product queued to be added on save. */
interface DraftNewItem extends PickedProduct {
  key: string;
}

const num = parseAmount;
const toMinor = (v: number) => Math.round(v * 100);

/**
 * Full-control admin editor for a single order. Every stored field the admin
 * can see in the details view is editable here: customer, shipping address,
 * line items (quantity, unit price, removal), products added from the
 * catalogue, money (shipping/tax/discount plus an optional hard total
 * override), payment method/status, order status and notes.
 *
 * Saving is two-step: the server previews the exact edit (nothing written),
 * the admin reviews the updated order and totals, and only "Confirm & save"
 * writes it.
 */
export function OrderEditPanel({
  order,
  onCancel,
  onSaved,
  onError,
}: {
  order: EditableOrder;
  onCancel: () => void;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [customerName, setCustomerName] = useState(order.customerName);
  const [customerEmail, setCustomerEmail] = useState(order.customerEmail);
  const [customerPhone, setCustomerPhone] = useState(order.customerPhone);

  const [shippingAddress, setShippingAddress] = useState(order.shippingAddress);
  const [shippingCity, setShippingCity] = useState(order.shippingCity);
  const [shippingState, setShippingState] = useState(order.shippingState ?? "");
  const [shippingPostalCode, setShippingPostalCode] = useState(
    order.shippingPostalCode ?? "",
  );
  const [shippingCountry, setShippingCountry] = useState(
    order.shippingCountry ?? "",
  );

  const [items, setItems] = useState<DraftItem[]>(() =>
    (order.items ?? []).map((it) => ({
      orderItemId: it.id,
      productId: it.productId,
      name: it.name,
      productImage: it.productImage,
      internalCode: it.internalCode,
      orderBundleId: it.orderBundleId ?? null,
      selectedOptions: it.selectedOptions ?? null,
      quantity: it.quantity,
      unitPrice: originalUnitPrice(it).toFixed(2),
      removed: false,
    })),
  );
  const [newItems, setNewItems] = useState<DraftNewItem[]>([]);

  const [shipping, setShipping] = useState(num(order.shipping).toFixed(2));
  const [tax, setTax] = useState(num(order.tax).toFixed(2));
  const [discount, setDiscount] = useState(num(order.discount).toFixed(2));
  const [overrideTotal, setOverrideTotal] = useState(false);
  const [total, setTotal] = useState(num(order.total).toFixed(2));

  const [paymentMethod, setPaymentMethod] = useState(order.paymentMethod);
  const [paymentStatus, setPaymentStatus] = useState(order.paymentStatus);
  const [status, setStatus] = useState(order.status);
  const [notes, setNotes] = useState(order.notes ?? "");

  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [review, setReview] = useState<{ summary: OrderEditSummary; payload: OrderEditPayload } | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [preview, setPreview] = useState<ImagePreview | null>(null);
  // Shown in the panel as well as the page toast: on mobile the editor lives
  // in a Sheet that stacks above the toast layer, so a toast alone is unseen.
  const [inlineError, setInlineError] = useState<string | null>(null);
  const fail = (message: string) => {
    setInlineError(message);
    onError(message);
  };

  // What the server says about this order right now: its fingerprint (sent
  // back with the preview and the save so a stale summary can't be
  // confirmed) and whether products may be added.
  const [context, setContext] = useState<
    | { state: "loading" }
    | { state: "ready"; version: string; addProductBlockedReason: string | null }
    | { state: "error" }
  >({ state: "loading" });
  useEffect(() => {
    let cancelled = false;
    trpc.order.editContext
      .query({ orderId: order.id })
      .then((res) => {
        if (cancelled) return;
        setContext(
          res.success && res.result
            ? { state: "ready", version: res.result.version, addProductBlockedReason: res.result.addProductBlockedReason }
            : { state: "error" },
        );
      })
      .catch(() => {
        if (!cancelled) setContext({ state: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [order.id]);

  const addProductDisabledReason =
    context.state === "loading"
      ? "Checking whether products can be added…"
      : context.state === "error"
        ? "Couldn't check whether products can be added to this order. Close the editor and try again."
        : context.addProductBlockedReason;

  /** The draft as the payload builder sees it. */
  const draft = {
    customerName,
    customerEmail,
    customerPhone,
    shippingAddress,
    shippingCity,
    shippingState,
    shippingPostalCode,
    shippingCountry,
    items: items.map((it) => ({
      orderItemId: it.orderItemId,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      removed: it.removed,
    })),
    newItems: newItems.map((it) => ({
      productId: it.productId,
      quantity: it.quantity,
      selectedOptions: it.selectedOptions,
    })),
    shipping,
    tax,
    discount,
    overrideTotal,
    total,
    paymentMethod,
    paymentStatus,
    status,
    notes,
  };
  const payload = buildOrderEditPayload(order, draft);
  const hasChanges = Object.keys(payload).length > 0;

  /** Existing lines as the merge rule sees them (with this draft's edits applied). */
  const mergeableLines = (): (MergeableLine & { name: string })[] =>
    items.map((it) => ({
      id: it.orderItemId,
      productId: it.productId,
      name: it.name,
      quantity: it.quantity,
      price: num(it.unitPrice),
      discountPrice: null,
      orderBundleId: it.orderBundleId,
      selectedOptions: it.selectedOptions,
      removed: it.removed,
    }));

  /** Live preview of what the server will compute (the review step shows the server's figures). */
  const computed = useMemo(() => {
    let subtotalMinor = 0;
    for (const it of items) {
      if (it.removed || it.quantity <= 0) continue;
      subtotalMinor += toMinor(num(it.unitPrice)) * it.quantity;
    }
    for (const it of newItems) subtotalMinor += toMinor(it.unitPrice) * it.quantity;
    const subtotal = subtotalMinor / 100;
    const computedTotal = orderTotalFromParts({
      subtotal,
      discount: num(discount),
      shipping: num(shipping),
      tax: num(tax),
    });
    return { subtotal, computedTotal };
  }, [items, newItems, shipping, tax, discount]);

  const moneyChanged = payloadChangesMoney(payload);
  const displayedTotal = overrideTotal ? num(total) : moneyChanged ? computed.computedTotal : num(order.total);
  const totalDelta = displayedTotal - num(order.total);

  const handleAddPicked = (picked: PickedProduct) => {
    setNewItems((prev) => {
      // The same variant picked twice is one queued line, not two.
      const key = productLineKey(picked.productId, picked.selectedOptions);
      const existing = prev.find(
        (it) => productLineKey(it.productId, it.selectedOptions) === key && toMinor(it.unitPrice) === toMinor(picked.unitPrice),
      );
      if (existing) {
        return prev.map((it) =>
          it === existing ? { ...it, quantity: Math.min(it.stock, it.quantity + picked.quantity) } : it,
        );
      }
      return [...prev, { ...picked, key: `new-${Date.now()}-${prev.length}` }];
    });
  };

  const mergeTargetFor = (candidate: { productId: string; selectedOptions: SelectedOptions | null; unitPrice: number }) =>
    findMergeTarget(mergeableLines(), candidate);

  const mergeHint = (candidate: {
    productId: string;
    selectedOptions: SelectedOptions | null;
    unitPrice: number;
    quantity: number;
  }): string | null => {
    const target = mergeTargetFor(candidate);
    if (!target) return null;
    const queued = newItems
      .filter(
        (it) =>
          productLineKey(it.productId, it.selectedOptions) === productLineKey(candidate.productId, candidate.selectedOptions) &&
          toMinor(it.unitPrice) === toMinor(candidate.unitPrice),
      )
      .reduce((s, it) => s + it.quantity, 0);
    const from = target.quantity + queued;
    return `This exact item is already on the order — its quantity will go from ${from} to ${from + candidate.quantity} instead of adding a new line.`;
  };

  const startReview = async () => {
    const remaining = items.filter((it) => !it.removed && it.quantity > 0);
    if (remaining.length === 0 && newItems.length === 0) {
      fail("An order can't be saved with zero items — cancel or delete it instead.");
      return;
    }
    if (!hasChanges) {
      fail("Nothing has changed yet.");
      return;
    }

    setInlineError(null);
    setIsPreviewing(true);
    try {
      const result = await trpc.order.previewEdit.mutate({
        orderId: order.id,
        ...(context.state === "ready" ? { expectedVersion: context.version } : {}),
        ...payload,
      });
      if (result.success) {
        setReview({ summary: result.result, payload });
      } else {
        fail(result.error || "Please try again.");
      }
    } catch (err) {
      console.error(err);
      fail("These changes couldn't be checked. Review the fields and try again.");
    } finally {
      setIsPreviewing(false);
    }
  };

  const confirmSave = async () => {
    if (!review) return;
    setIsSaving(true);
    try {
      // Exactly the payload that was previewed, pinned to the version the
      // preview was computed against.
      const result = await trpc.order.edit.mutate({
        orderId: order.id,
        expectedVersion: review.summary.version,
        ...review.payload,
      });
      if (result.success) {
        setReview(null);
        onSaved(
          review.summary.additions.length > 0
            ? `Order updated — ${review.summary.additions.length} product${review.summary.additions.length === 1 ? "" : "s"} added`
            : "Order updated",
        );
      } else {
        setReview(null);
        fail(result.error || "Please try again.");
      }
    } catch (err) {
      console.error(err);
      setReview(null);
      fail("An unexpected error occurred while saving this order.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className='space-y-6'>
      {/* ── Customer ── */}
      <section>
        <h3 className='font-medium text-sm mb-3'>Customer Information</h3>
        <div className='grid grid-cols-1 sm:grid-cols-3 gap-3'>
          <div className='space-y-1'>
            <Label className='text-xs'>Name</Label>
            <Input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
            />
          </div>
          <div className='space-y-1'>
            <Label className='text-xs'>Email</Label>
            <Input
              type='email'
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
            />
          </div>
          <div className='space-y-1'>
            <Label className='text-xs'>Phone</Label>
            <Input
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
            />
          </div>
        </div>
      </section>

      {/* ── Shipping address ── */}
      <section>
        <h3 className='font-medium text-sm mb-3'>Shipping Address</h3>
        <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
          <div className='space-y-1 sm:col-span-2'>
            <Label className='text-xs'>Address</Label>
            <Input
              value={shippingAddress}
              onChange={(e) => setShippingAddress(e.target.value)}
            />
          </div>
          <div className='space-y-1'>
            <Label className='text-xs'>City</Label>
            <Input
              value={shippingCity}
              onChange={(e) => setShippingCity(e.target.value)}
            />
          </div>
          <div className='space-y-1'>
            <Label className='text-xs'>State / Governorate</Label>
            <Input
              value={shippingState}
              onChange={(e) => setShippingState(e.target.value)}
            />
          </div>
          <div className='space-y-1'>
            <Label className='text-xs'>Postal Code</Label>
            <Input
              value={shippingPostalCode}
              onChange={(e) => setShippingPostalCode(e.target.value)}
            />
          </div>
          <div className='space-y-1'>
            <Label className='text-xs'>Country</Label>
            <Input
              value={shippingCountry}
              onChange={(e) => setShippingCountry(e.target.value)}
            />
          </div>
        </div>
      </section>

      {/* ── Line items ── */}
      <section>
        <h3 className='font-medium text-sm mb-3'>Order Items</h3>
        <div className='space-y-2'>
          {items.map((it, idx) => (
            <div
              key={it.orderItemId}
              className={`flex flex-wrap items-end gap-2 rounded-md border p-2 ${
                it.removed ? "opacity-50" : ""
              }`}>
              {it.productImage ? (
                <button
                  type='button'
                  aria-label={`Preview image of ${it.name}`}
                  title='View larger image'
                  onClick={() => it.productImage && setPreview({ url: it.productImage, alt: it.name })}
                  className='h-10 w-10 rounded-md overflow-hidden bg-stone-100 shrink-0 cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'>
                  <img
                    src={it.productImage}
                    alt={it.name}
                    className='h-full w-full object-cover'
                  />
                </button>
              ) : (
                <div className='h-10 w-10 rounded-md overflow-hidden bg-stone-100 flex items-center justify-center text-xs font-medium text-stone-600 shrink-0'>
                  <span>{(it.name || "?").charAt(0).toUpperCase()}</span>
                </div>
              )}
              <div className='min-w-[120px] flex-1'>
                <p className='text-sm font-medium truncate'>{it.name}</p>
                {/* Merchant-only, and read-only: the snapshot records what the
                    line was sold as, so editing the order must not rewrite it. */}
                {it.internalCode && (
                  <p className='text-[11px] font-mono text-muted-foreground'>
                    Code: {it.internalCode}
                  </p>
                )}
                <p className='text-xs text-muted-foreground'>
                  {(num(it.unitPrice) * (it.removed ? 0 : it.quantity)).toFixed(
                    2,
                  )}{" "}
                  EGP
                </p>
              </div>
              <div className='space-y-1'>
                <Label className='text-xs'>Qty</Label>
                <Input
                  type='number'
                  min={1}
                  className='h-8 w-20'
                  disabled={it.removed}
                  value={it.quantity}
                  onChange={(e) => {
                    const value = Math.max(
                      1,
                      Number.parseInt(e.target.value, 10) || 1,
                    );
                    setItems((prev) =>
                      prev.map((row, i) =>
                        i === idx ? { ...row, quantity: value } : row,
                      ),
                    );
                  }}
                />
              </div>
              <div className='space-y-1'>
                <Label className='text-xs'>Unit price</Label>
                <Input
                  type='number'
                  min={0}
                  step='0.01'
                  className='h-8 w-28'
                  disabled={it.removed}
                  value={it.unitPrice}
                  onChange={(e) =>
                    setItems((prev) =>
                      prev.map((row, i) =>
                        i === idx ? { ...row, unitPrice: e.target.value } : row,
                      ),
                    )
                  }
                />
              </div>
              <Button
                type='button'
                variant={it.removed ? "outline" : "ghost"}
                size='sm'
                className={it.removed ? "h-8" : "h-8 text-destructive"}
                onClick={() =>
                  setItems((prev) =>
                    prev.map((row, i) =>
                      i === idx ? { ...row, removed: !row.removed } : row,
                    ),
                  )
                }>
                {it.removed ? (
                  "Restore"
                ) : (
                  <>
                    <Trash2 className='h-3.5 w-3.5 mr-1' />
                    Remove
                  </>
                )}
              </Button>
            </div>
          ))}

          {/* Products queued to be added from the catalogue */}
          {newItems.map((it, idx) => {
            const merges = mergeTargetFor(it) !== null;
            const label = formatSelectedOptions(it.selectedOptions);
            return (
              <div
                key={it.key}
                data-testid='queued-product'
                className='flex flex-wrap items-end gap-2 rounded-md border border-dashed border-primary/50 bg-primary/5 p-2'>
                {it.image ? (
                  <button
                    type='button'
                    aria-label={`Preview image of ${it.name}`}
                    title='View larger image'
                    onClick={() => it.image && setPreview({ url: it.image, alt: it.name })}
                    className='h-10 w-10 rounded-md overflow-hidden bg-stone-100 shrink-0 cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'>
                    <img src={it.image} alt={it.name} className='h-full w-full object-cover' />
                  </button>
                ) : (
                  <div className='h-10 w-10 rounded-md bg-stone-100 flex items-center justify-center text-xs font-medium text-stone-600 shrink-0'>
                    {(it.name || "?").charAt(0).toUpperCase()}
                  </div>
                )}
                <div className='min-w-[120px] flex-1'>
                  <p className='text-sm font-medium truncate'>
                    {it.name}
                    <span className='ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary'>
                      {merges ? "Adds to existing line" : "New"}
                    </span>
                  </p>
                  {label && <p className='text-xs text-muted-foreground'>{label}</p>}
                  {it.internalCode && (
                    <p className='text-[11px] font-mono text-muted-foreground'>Code: {it.internalCode}</p>
                  )}
                  <p className='text-xs text-muted-foreground'>
                    {it.unitPrice.toFixed(2)} EGP each · {((toMinor(it.unitPrice) * it.quantity) / 100).toFixed(2)} EGP
                  </p>
                </div>
                <div className='space-y-1'>
                  <Label className='text-xs'>Qty</Label>
                  <Input
                    type='number'
                    min={1}
                    max={it.stock}
                    className='h-8 w-20'
                    value={it.quantity}
                    onChange={(e) => {
                      const value = Math.min(
                        Math.max(1, it.stock),
                        Math.max(1, Number.parseInt(e.target.value, 10) || 1),
                      );
                      setNewItems((prev) =>
                        prev.map((row, i) => (i === idx ? { ...row, quantity: value } : row)),
                      );
                    }}
                  />
                </div>
                <Button
                  type='button'
                  variant='ghost'
                  size='sm'
                  className='h-8 text-destructive'
                  aria-label={`Remove ${it.name} from the products to add`}
                  onClick={() => setNewItems((prev) => prev.filter((_, i) => i !== idx))}>
                  <Trash2 className='h-3.5 w-3.5' />
                </Button>
              </div>
            );
          })}

          <div className='space-y-1'>
            <Button
              type='button'
              variant='outline'
              size='sm'
              disabled={addProductDisabledReason !== null}
              onClick={() => setIsAddOpen(true)}>
              <Plus className='h-3.5 w-3.5 mr-1' />
              Add product
            </Button>
            {addProductDisabledReason && context.state !== "loading" && (
              <p className='flex items-start gap-1 text-xs text-muted-foreground'>
                <Info className='h-3.5 w-3.5 mt-px shrink-0' />
                {addProductDisabledReason}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ── Money ── */}
      <section>
        <h3 className='font-medium text-sm mb-3'>Order Summary</h3>
        <div className='grid grid-cols-1 sm:grid-cols-3 gap-3'>
          <div className='space-y-1'>
            <Label htmlFor='edit-shipping' className='text-xs'>Shipping</Label>
            <Input
              id='edit-shipping'
              type='number'
              min={0}
              step='0.01'
              value={shipping}
              onChange={(e) => setShipping(e.target.value)}
            />
            {/* The quoted fee is frozen on the order (shipping_quote). Editing
                the address here never re-runs the shipping rules — what is
                typed in this box is what the order is charged. */}
            <p className='text-[11px] text-muted-foreground'>
              Manual override — not re-quoted
            </p>
          </div>
          <div className='space-y-1'>
            <Label className='text-xs'>Tax</Label>
            <Input
              type='number'
              min={0}
              step='0.01'
              value={tax}
              onChange={(e) => setTax(e.target.value)}
            />
          </div>
          <div className='space-y-1'>
            <Label className='text-xs'>Discount</Label>
            <Input
              type='number'
              min={0}
              step='0.01'
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
            />
            <p className='text-[11px] text-muted-foreground'>
              Kept as an amount — not re-applied to added products
            </p>
          </div>
        </div>

        <div className='mt-3 rounded-md border bg-muted/30 p-3 space-y-1 text-sm'>
          <div className='flex justify-between'>
            <span className='font-medium'>Subtotal (recalculated)</span>
            <span>{computed.subtotal.toFixed(2)} EGP</span>
          </div>
          <div className='flex justify-between font-bold'>
            <span>Total</span>
            <span data-testid='edit-total'>
              {displayedTotal.toFixed(2)} EGP
            </span>
          </div>
          {toMinor(totalDelta) !== 0 && (
            <div className='flex justify-between text-xs text-muted-foreground'>
              <span>Previously {num(order.total).toFixed(2)} EGP</span>
              <span>
                {totalDelta > 0 ? "+" : "−"}
                {Math.abs(totalDelta).toFixed(2)} EGP
              </span>
            </div>
          )}
        </div>

        <div className='mt-3 flex flex-wrap items-center gap-3'>
          <label className='flex items-center gap-2 text-sm'>
            <Checkbox
              checked={overrideTotal}
              onCheckedChange={(checked) => {
                const next = checked === true;
                setOverrideTotal(next);
                if (next) setTotal(computed.computedTotal.toFixed(2));
              }}
            />
            Override total manually
          </label>
          {overrideTotal && (
            <Input
              type='number'
              min={0}
              step='0.01'
              className='h-8 w-32'
              value={total}
              onChange={(e) => setTotal(e.target.value)}
            />
          )}
        </div>
      </section>

      {/* ── Payment & status ── */}
      <section>
        <h3 className='font-medium text-sm mb-3'>Payment &amp; Status</h3>
        <div className='grid grid-cols-1 sm:grid-cols-3 gap-3'>
          <div className='space-y-1'>
            <Label className='text-xs'>Payment method</Label>
            <Select
              value={paymentMethod}
              onValueChange={(v) =>
                setPaymentMethod(v as EditableOrder["paymentMethod"])
              }>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='cod'>Cash on Delivery</SelectItem>
                <SelectItem value='stripe'>Stripe</SelectItem>
                <SelectItem value='paymob'>Paymob</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className='space-y-1'>
            <Label className='text-xs'>Payment status</Label>
            <Select
              value={paymentStatus}
              onValueChange={(v) =>
                setPaymentStatus(v as EditableOrder["paymentStatus"])
              }>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='not_required'>Not required</SelectItem>
                <SelectItem value='pending'>Pending</SelectItem>
                <SelectItem value='processing'>Processing</SelectItem>
                <SelectItem value='paid'>Paid</SelectItem>
                <SelectItem value='failed'>Failed</SelectItem>
                <SelectItem value='refunded'>Refunded</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className='space-y-1'>
            <Label className='text-xs'>Order status</Label>
            <Select
              value={status}
              onValueChange={(v) => setStatus(v as EditableOrder["status"])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='pending'>Pending</SelectItem>
                <SelectItem value='processing'>Processing</SelectItem>
                <SelectItem value='shipped'>Shipped</SelectItem>
                <SelectItem value='delivered'>Delivered</SelectItem>
                <SelectItem value='cancelled'>Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      {/* ── Notes ── */}
      <section>
        <h3 className='font-medium text-sm mb-3'>Order Notes</h3>
        <Textarea
          rows={3}
          value={notes}
          placeholder='Internal notes for this order'
          onChange={(e) => setNotes(e.target.value)}
        />
      </section>

      {inlineError && (
        <div
          role='alert'
          className='flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800'>
          <Info className='h-4 w-4 mt-0.5 shrink-0' />
          <p>{inlineError}</p>
        </div>
      )}

      <div className='flex items-center justify-end gap-2 border-t pt-4'>
        <Button variant='ghost' onClick={onCancel} disabled={isPreviewing || isSaving}>
          Cancel
        </Button>
        <Button onClick={startReview} disabled={isPreviewing || isSaving || !hasChanges}>
          {isPreviewing ? (
            <>
              <Loader2 className='h-4 w-4 animate-spin mr-1' />
              Checking...
            </>
          ) : (
            "Review & Save"
          )}
        </Button>
      </div>

      <AddProductDialog
        open={isAddOpen}
        onOpenChange={setIsAddOpen}
        onAdd={handleAddPicked}
        mergeHint={mergeHint}
      />
      <OrderEditReviewDialog
        summary={review?.summary ?? null}
        detailChanges={review ? describeDetailChanges(order, review.payload) : []}
        saving={isSaving}
        onConfirm={confirmSave}
        onCancel={() => setReview(null)}
      />
      <ImagePreviewDialog preview={preview} onClose={() => setPreview(null)} />
    </div>
  );
}
