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
import { Loader2, Plus, Trash2 } from "lucide-react";
import { trpc } from "#root/shared/trpc/client";

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
  }[];
}

interface DraftItem {
  orderItemId: string;
  name: string;
  productImage?: string | null;
  quantity: number;
  /** Unit price charged for this line, as typed. */
  unitPrice: string;
  removed: boolean;
}

interface DraftNewItem {
  key: string;
  productId: string;
  quantity: number;
}

const num = (v: string | null | undefined) => {
  const parsed = Number.parseFloat(v ?? "0");
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Full-control admin editor for a single order. Every stored field the admin
 * can see in the details view is editable here: customer, shipping address,
 * line items (quantity, unit price, removal), added products, money
 * (shipping/tax/discount plus an optional hard total override), payment
 * method/status, order status and notes.
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
      name: it.name,
      productImage: it.productImage,
      quantity: it.quantity,
      unitPrice: num(it.discountPrice || it.price).toFixed(2),
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

  const [catalog, setCatalog] = useState<
    { id: string; name: string; price: string; stock: number }[]
  >([]);
  const [isSaving, setIsSaving] = useState(false);

  // Catalog for the "add product" rows.
  useEffect(() => {
    let cancelled = false;
    trpc.product.view
      .query({ limit: 200 })
      .then((res) => {
        if (cancelled || !res.success || !res.result) return;
        setCatalog(
          (res.result.products ?? []).map((p: any) => ({
            id: p.product.id as string,
            name: p.product.name as string,
            price: String(p.product.price),
            stock: Number(p.product.stock ?? 0),
          })),
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  /** Live preview of what the server will compute. */
  const computed = useMemo(() => {
    let subtotal = 0;
    for (const it of items) {
      if (it.removed || it.quantity <= 0) continue;
      subtotal += num(it.unitPrice) * it.quantity;
    }
    for (const it of newItems) {
      const product = catalog.find((c) => c.id === it.productId);
      if (!product) continue;
      subtotal += num(product.price) * it.quantity;
    }
    const computedTotal = Math.max(
      0,
      subtotal + num(shipping) + num(tax) - num(discount),
    );
    return { subtotal, computedTotal };
  }, [items, newItems, catalog, shipping, tax, discount]);

  const handleSave = async () => {
    const remaining = items.filter((it) => !it.removed && it.quantity > 0);
    if (remaining.length === 0 && newItems.length === 0) {
      onError(
        "An order can't be saved with zero items — cancel or delete it instead.",
      );
      return;
    }

    const pendingNew = newItems.filter((it) => it.productId && it.quantity > 0);

    setIsSaving(true);
    try {
      const result = await trpc.order.edit.mutate({
        orderId: order.id,
        items: items.map((it) => ({
          orderItemId: it.orderItemId,
          quantity: it.removed ? 0 : it.quantity,
          price: num(it.unitPrice),
          discountPrice: null,
        })),
        ...(pendingNew.length > 0
          ? {
              newItems: pendingNew.map((it) => ({
                productId: it.productId,
                quantity: it.quantity,
              })),
            }
          : {}),
        customerName,
        customerEmail,
        customerPhone,
        shippingAddress,
        shippingCity,
        shippingState,
        shippingPostalCode,
        shippingCountry,
        shipping: num(shipping),
        tax: num(tax),
        discount: num(discount),
        ...(overrideTotal ? { total: num(total) } : {}),
        paymentMethod,
        paymentStatus,
        status,
        notes: notes.trim() === "" ? null : notes,
      });

      if (result.success) {
        onSaved("Order updated");
      } else {
        onError(result.error || "Please try again.");
      }
    } catch (err) {
      console.error(err);
      onError("An unexpected error occurred while saving this order.");
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
              <div className='h-10 w-10 rounded-md overflow-hidden bg-stone-100 flex items-center justify-center text-xs font-medium text-stone-600 shrink-0'>
                {it.productImage ? (
                  <img
                    src={it.productImage}
                    alt={it.name}
                    className='h-full w-full object-cover'
                  />
                ) : (
                  <span>{(it.name || "?").charAt(0).toUpperCase()}</span>
                )}
              </div>
              <div className='min-w-[120px] flex-1'>
                <p className='text-sm font-medium truncate'>{it.name}</p>
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

          {/* Added products */}
          {newItems.map((it, idx) => (
            <div
              key={it.key}
              className='flex flex-wrap items-end gap-2 rounded-md border border-dashed p-2'>
              <div className='min-w-[180px] flex-1 space-y-1'>
                <Label className='text-xs'>Product</Label>
                <Select
                  value={it.productId}
                  onValueChange={(value) =>
                    setNewItems((prev) =>
                      prev.map((row, i) =>
                        i === idx ? { ...row, productId: value } : row,
                      ),
                    )
                  }>
                  <SelectTrigger className='h-8'>
                    <SelectValue placeholder='Select a product' />
                  </SelectTrigger>
                  <SelectContent>
                    {catalog.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} — {num(p.price).toFixed(2)} EGP ({p.stock} in
                        stock)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className='space-y-1'>
                <Label className='text-xs'>Qty</Label>
                <Input
                  type='number'
                  min={1}
                  className='h-8 w-20'
                  value={it.quantity}
                  onChange={(e) => {
                    const value = Math.max(
                      1,
                      Number.parseInt(e.target.value, 10) || 1,
                    );
                    setNewItems((prev) =>
                      prev.map((row, i) =>
                        i === idx ? { ...row, quantity: value } : row,
                      ),
                    );
                  }}
                />
              </div>
              <Button
                type='button'
                variant='ghost'
                size='sm'
                className='h-8 text-destructive'
                onClick={() =>
                  setNewItems((prev) => prev.filter((_, i) => i !== idx))
                }>
                <Trash2 className='h-3.5 w-3.5' />
              </Button>
            </div>
          ))}

          <Button
            type='button'
            variant='outline'
            size='sm'
            onClick={() =>
              setNewItems((prev) => [
                ...prev,
                {
                  key: `new-${Date.now()}-${prev.length}`,
                  productId: "",
                  quantity: 1,
                },
              ])
            }>
            <Plus className='h-3.5 w-3.5 mr-1' />
            Add product
          </Button>
        </div>
      </section>

      {/* ── Money ── */}
      <section>
        <h3 className='font-medium text-sm mb-3'>Order Summary</h3>
        <div className='grid grid-cols-1 sm:grid-cols-3 gap-3'>
          <div className='space-y-1'>
            <Label className='text-xs'>Shipping</Label>
            <Input
              type='number'
              min={0}
              step='0.01'
              value={shipping}
              onChange={(e) => setShipping(e.target.value)}
            />
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
          </div>
        </div>

        <div className='mt-3 rounded-md border bg-muted/30 p-3 space-y-1 text-sm'>
          <div className='flex justify-between'>
            <span className='font-medium'>Subtotal (recalculated)</span>
            <span>{computed.subtotal.toFixed(2)} EGP</span>
          </div>
          <div className='flex justify-between font-bold'>
            <span>Total</span>
            <span>
              {(overrideTotal ? num(total) : computed.computedTotal).toFixed(2)}{" "}
              EGP
            </span>
          </div>
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

      <div className='flex items-center justify-end gap-2 border-t pt-4'>
        <Button variant='ghost' onClick={onCancel} disabled={isSaving}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? (
            <>
              <Loader2 className='h-4 w-4 animate-spin mr-1' />
              Saving...
            </>
          ) : (
            "Save Changes"
          )}
        </Button>
      </div>
    </div>
  );
}
