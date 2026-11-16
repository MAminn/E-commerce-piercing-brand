/**
 * "Add product" picker for the Edit Order panel: search the live catalogue by
 * name or SKU, pick the exact variant, set a quantity, and hand the line back
 * to the panel's draft. Nothing is written to the order here — the panel's
 * review-and-confirm step does that.
 *
 * Prices shown are a preview computed with the same shared rules the server
 * uses (effective price + option modifiers); the server re-resolves every
 * added line from the catalogue when the change is previewed and saved.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Loader2, Minus, Plus, Search } from "lucide-react";
import { Button } from "#root/components/ui/button";
import { Input } from "#root/components/ui/input";
import { Label } from "#root/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#root/components/ui/dialog";
import { type ImagePreview, ImagePreviewDialog } from "#root/components/ui/image-preview-dialog";
import { trpc } from "#root/shared/trpc/client";
import {
  type PurchasableOptionGroup,
  type SelectedOptions,
  resolvePurchasableLinePrice,
  resolveSelectedOptions,
} from "#root/shared/products/options";
import { STORE_CURRENCY } from "#root/shared/config/branding";

export interface CatalogProduct {
  id: string;
  name: string;
  internalCode: string | null;
  catalogueNo: number | null;
  image: string | null;
  price: number;
  discountPrice: number | null;
  effectivePrice: number;
  stock: number;
  optionGroups: PurchasableOptionGroup[];
  purchasable: boolean;
}

/** What the picker hands back to the panel. */
export interface PickedProduct {
  productId: string;
  name: string;
  internalCode: string | null;
  image: string | null;
  selectedOptions: SelectedOptions | null;
  quantity: number;
  /** Preview unit price (effective price + modifiers). */
  unitPrice: number;
  stock: number;
}

const money = (v: number) => `${v.toFixed(2)} ${STORE_CURRENCY}`;

function Thumb({ src, alt, className }: { src: string | null; alt: string; className: string }) {
  return (
    <div className={`${className} rounded-md overflow-hidden bg-stone-100 flex items-center justify-center text-sm font-medium text-stone-600 shrink-0`}>
      {src ? <img src={src} alt={alt} className='h-full w-full object-cover' /> : <span>{(alt || "?").charAt(0).toUpperCase()}</span>}
    </div>
  );
}

function PriceTag({ product }: { product: CatalogProduct }) {
  if (product.discountPrice !== null) {
    return (
      <span className='text-sm'>
        <span className='line-through text-muted-foreground mr-1'>{money(product.price)}</span>
        <span className='text-red-600 font-medium'>{money(product.discountPrice)}</span>
      </span>
    );
  }
  return <span className='text-sm font-medium'>{money(product.price)}</span>;
}

export function AddProductDialog({
  open,
  onOpenChange,
  onAdd,
  mergeHint,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (picked: PickedProduct) => void;
  /**
   * Given a configured product, describes what adding it will do to the
   * draft (e.g. "already on this order — quantity 1 → 3"), or null.
   */
  mergeHint?: (candidate: { productId: string; selectedOptions: SelectedOptions | null; unitPrice: number; quantity: number }) => string | null;
}) {
  const [queryText, setQueryText] = useState("");
  const [results, setResults] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<CatalogProduct | null>(null);
  const [options, setOptions] = useState<SelectedOptions>({});
  const [quantity, setQuantity] = useState(1);
  const [preview, setPreview] = useState<ImagePreview | null>(null);
  const requestId = useRef(0);

  // Reset every time the picker opens.
  useEffect(() => {
    if (!open) return;
    setQueryText("");
    setSelected(null);
    setOptions({});
    setQuantity(1);
    setError(null);
  }, [open]);

  // Debounced search; a stale response never overwrites a newer one.
  useEffect(() => {
    if (!open) return;
    const id = ++requestId.current;
    setLoading(true);
    const timer = setTimeout(() => {
      trpc.order.searchProductsForEdit
        .query({ query: queryText.trim(), limit: 20 })
        .then((res) => {
          if (id !== requestId.current) return;
          if (res.success) {
            setResults(res.result as CatalogProduct[]);
            setError(null);
          } else {
            setResults([]);
            setError(res.error || "Couldn't search the catalogue.");
          }
        })
        .catch(() => {
          if (id !== requestId.current) return;
          setResults([]);
          setError("Couldn't search the catalogue. Check your connection and try again.");
        })
        .finally(() => {
          if (id === requestId.current) setLoading(false);
        });
    }, 250);
    return () => clearTimeout(timer);
  }, [queryText, open]);

  const resolution = useMemo(
    () => (selected ? resolveSelectedOptions(selected.optionGroups, options) : null),
    [selected, options],
  );
  const unitPrice =
    selected && resolution?.ok ? resolvePurchasableLinePrice(selected.effectivePrice, resolution.priceModifier) : null;
  const selectedOptions: SelectedOptions | null =
    resolution?.ok && Object.keys(resolution.selectedOptions).length > 0 ? resolution.selectedOptions : null;
  const maxQty = selected ? Math.max(0, selected.stock) : 0;
  const quantityValid = quantity >= 1 && quantity <= maxQty;
  const canAdd = !!selected && !!resolution?.ok && unitPrice !== null && quantityValid;
  const hint =
    canAdd && selected && mergeHint && unitPrice !== null
      ? mergeHint({ productId: selected.id, selectedOptions, unitPrice, quantity })
      : null;

  const choose = (product: CatalogProduct) => {
    setSelected(product);
    setQuantity(1);
    // Pre-select the only available value of single-choice groups.
    const initial: SelectedOptions = {};
    for (const group of product.optionGroups) {
      const available = group.values.filter((v) => v.available);
      if (available.length === 1 && available[0]) initial[group.name] = available[0].value;
    }
    setOptions(initial);
  };

  const handleAdd = () => {
    if (!canAdd || !selected || unitPrice === null) return;
    onAdd({
      productId: selected.id,
      name: selected.name,
      internalCode: selected.internalCode,
      image: selected.image,
      selectedOptions,
      quantity,
      unitPrice,
      stock: selected.stock,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* z-[10002]: above the mobile order Sheet (z-[10001]), which hosts the editor there. */}
      <DialogContent
        className='z-[10002] grid-cols-[minmax(0,1fr)] sm:max-w-2xl max-h-[90dvh] overflow-y-auto'
        overlayClassName='z-[10002]'
        data-testid='add-product-dialog'>
        <DialogHeader>
          <DialogTitle>Add product to order</DialogTitle>
          <DialogDescription>
            Choose an existing catalogue product. Nothing changes on the order until you review and save.
          </DialogDescription>
        </DialogHeader>

        {!selected ? (
          <div className='space-y-3'>
            <div className='relative'>
              <Search className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
              <Input
                autoFocus
                aria-label='Search products by name or SKU'
                placeholder='Search by product name or SKU'
                className='pl-9'
                value={queryText}
                onChange={(e) => setQueryText(e.target.value)}
              />
            </div>

            {error && <p className='text-sm text-destructive'>{error}</p>}

            <div className='min-h-[200px] space-y-1' aria-busy={loading}>
              {loading && results.length === 0 ? (
                <div className='flex items-center justify-center py-10 text-muted-foreground'>
                  <Loader2 className='h-5 w-5 animate-spin' />
                </div>
              ) : results.length === 0 && !error ? (
                <p className='py-10 text-center text-sm text-muted-foreground'>
                  {queryText.trim() ? `No products match “${queryText.trim()}”.` : "No products available."}
                </p>
              ) : (
                results.map((p) => {
                  const unavailable = p.stock <= 0 || !p.purchasable;
                  return (
                    <button
                      key={p.id}
                      type='button'
                      disabled={unavailable}
                      onClick={() => choose(p)}
                      data-testid='add-product-result'
                      className='flex w-full items-center gap-3 rounded-md border p-2 text-left transition-colors hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-50'>
                      <Thumb src={p.image} alt={p.name} className='h-12 w-12' />
                      <div className='min-w-0 flex-1'>
                        <p className='truncate text-sm font-medium'>{p.name}</p>
                        <p className='text-[11px] text-muted-foreground'>
                          {p.internalCode && <span className='font-mono mr-2'>SKU: {p.internalCode}</span>}
                          {p.optionGroups.length > 0 && (
                            <span>Options: {p.optionGroups.map((g) => g.name).join(", ")}</span>
                          )}
                        </p>
                      </div>
                      <div className='text-right shrink-0'>
                        <PriceTag product={p} />
                        <p className={`text-[11px] ${p.stock <= 0 ? "text-destructive" : "text-muted-foreground"}`}>
                          {p.stock <= 0 ? "Out of stock" : !p.purchasable ? "No option available" : `${p.stock} in stock`}
                        </p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        ) : (
          <div className='space-y-4'>
            <Button type='button' variant='ghost' size='sm' className='-ml-2' onClick={() => setSelected(null)}>
              <ArrowLeft className='h-4 w-4 mr-1' />
              Back to results
            </Button>

            <div className='flex flex-col sm:flex-row gap-4'>
              {selected.image ? (
                <button
                  type='button'
                  aria-label={`Preview image of ${selected.name}`}
                  className='h-40 w-40 self-center sm:self-start rounded-md overflow-hidden bg-stone-100 shrink-0 cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                  onClick={() => selected.image && setPreview({ url: selected.image, alt: selected.name })}>
                  <img src={selected.image} alt={selected.name} className='h-full w-full object-cover' />
                </button>
              ) : (
                <Thumb src={null} alt={selected.name} className='h-40 w-40 self-center sm:self-start' />
              )}
              <div className='min-w-0 flex-1 space-y-3'>
                <div>
                  <p className='font-medium'>{selected.name}</p>
                  {selected.internalCode && (
                    <p className='text-[11px] font-mono text-muted-foreground'>SKU: {selected.internalCode}</p>
                  )}
                  <div className='mt-1'>
                    <PriceTag product={selected} />
                  </div>
                </div>

                {selected.optionGroups.map((group) => (
                  <fieldset key={group.name} className='space-y-1'>
                    <legend className='text-xs font-medium'>{group.name}</legend>
                    <div className='flex flex-wrap gap-2'>
                      {group.values.map((v) => {
                        const active = options[group.name] === v.value;
                        return (
                          <button
                            key={v.value}
                            type='button'
                            aria-pressed={active}
                            disabled={!v.available}
                            onClick={() => setOptions((prev) => ({ ...prev, [group.name]: v.value }))}
                            className={`rounded-md border px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:line-through disabled:opacity-40 ${
                              active ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"
                            }`}>
                            {v.value}
                            {v.priceModifier !== 0 && (
                              <span className='ml-1 text-xs opacity-80'>
                                {v.priceModifier > 0 ? "+" : "−"}
                                {Math.abs(v.priceModifier).toFixed(2)}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>
                ))}

                <div className='space-y-1'>
                  <Label htmlFor='add-product-qty' className='text-xs'>
                    Quantity
                  </Label>
                  <div className='flex items-center gap-2'>
                    <Button
                      type='button'
                      variant='outline'
                      size='icon'
                      className='h-9 w-9'
                      aria-label='Decrease quantity'
                      disabled={quantity <= 1}
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}>
                      <Minus className='h-4 w-4' />
                    </Button>
                    <Input
                      id='add-product-qty'
                      type='number'
                      inputMode='numeric'
                      min={1}
                      max={maxQty}
                      className='h-9 w-20 text-center'
                      value={quantity}
                      onChange={(e) => setQuantity(Math.max(1, Number.parseInt(e.target.value, 10) || 1))}
                    />
                    <Button
                      type='button'
                      variant='outline'
                      size='icon'
                      className='h-9 w-9'
                      aria-label='Increase quantity'
                      disabled={quantity >= maxQty}
                      onClick={() => setQuantity((q) => Math.min(maxQty, q + 1))}>
                      <Plus className='h-4 w-4' />
                    </Button>
                    <span className='text-xs text-muted-foreground'>{selected.stock} in stock</span>
                  </div>
                  {!quantityValid && (
                    <p className='text-xs text-destructive'>Only {maxQty} in stock.</p>
                  )}
                </div>

                <div className='rounded-md border bg-muted/30 p-3 text-sm space-y-1'>
                  <div className='flex justify-between'>
                    <span>Unit price</span>
                    <span data-testid='add-product-unit-price'>{unitPrice === null ? "Choose options" : money(unitPrice)}</span>
                  </div>
                  <div className='flex justify-between font-medium'>
                    <span>Line total</span>
                    <span>{unitPrice === null ? "—" : money(unitPrice * Math.max(0, quantity))}</span>
                  </div>
                  {hint && <p className='pt-1 text-xs text-muted-foreground'>{hint}</p>}
                </div>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button type='button' variant='ghost' onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {selected && (
            <Button type='button' onClick={handleAdd} disabled={!canAdd}>
              <Plus className='h-4 w-4 mr-1' />
              Add to order
            </Button>
          )}
        </DialogFooter>
        <ImagePreviewDialog preview={preview} onClose={() => setPreview(null)} />
      </DialogContent>
    </Dialog>
  );
}
