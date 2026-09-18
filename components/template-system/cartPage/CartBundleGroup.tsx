import { Layers, ShoppingCart, Trash2 } from "lucide-react";

/**
 * One completed Build Your Stack instance as the cart templates receive it.
 * Children are listed for transparency (real products, real variants) but
 * are not individually editable — a stack is removed or rebuilt as a whole,
 * because changing one child's quantity would silently break the campaign
 * rules the price depends on.
 */
export interface CartPageBundleGroup {
  instanceId: string;
  campaignTitle: string;
  campaignSlug: string;
  /**
   * Units in the purchased stack — the tier quantity the SERVER resolved when
   * the stack was validated, not anything the browser decided.
   */
  requiredQuantity: number;
  /** Fixed price charged for the whole stack. */
  bundlePrice: number;
  /** What the children would cost bought separately. */
  regularTotal: number;
  items: Array<{
    productId: string;
    name: string;
    quantity: number;
    unitPrice: number;
    imageUrl?: string | null;
    variant?: string | null;
  }>;
}

interface CartBundleGroupProps {
  bundle: CartPageBundleGroup;
  currency: string;
  onRemove?: (instanceId: string) => void;
  disabled?: boolean;
}

/**
 * Grouped cart line for a stack. Styled with the ZELI minimal tokens (it is
 * the active preset); the other cart templates reuse it as-is so a stack is
 * never invisible in a non-default template.
 */
export function CartBundleGroup({ bundle, currency, onRemove, disabled }: CartBundleGroupProps) {
  const unitCount = bundle.items.reduce((s, i) => s + i.quantity, 0);
  const saving = bundle.regularTotal - bundle.bundlePrice;

  return (
    <div
      data-bundle-instance={bundle.instanceId}
      className={`py-5 sm:py-6 transition-opacity ${disabled ? "opacity-60 pointer-events-none" : ""}`}>
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center bg-zeli-surface">
          <Layers className="h-4 w-4 text-zeli-ink-secondary" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium uppercase tracking-[var(--zeli-tracking-label)] text-zeli-ink-muted">
            Stack
          </p>
          <p
            className="text-[14px] font-medium leading-snug break-words"
            style={{ color: "var(--zeli-ink)", fontFamily: "var(--font-product-title)" }}>
            {bundle.campaignTitle}
          </p>
          <p className="text-[11px] text-zeli-ink-muted">
            {/* The size sold. `requiredQuantity` is the server-resolved tier
                quantity; the children's own count is the fallback. */}
            {bundle.requiredQuantity || unitCount}-piece stack
          </p>
        </div>
        <div className="text-end shrink-0">
          {saving > 0 && (
            <p className="text-[11px] text-zeli-ink-muted line-through">
              {bundle.regularTotal.toFixed(2)} {currency}
            </p>
          )}
          <p className="text-[15px] font-semibold" style={{ color: "var(--zeli-ink)", fontFamily: "var(--font-price)" }}>
            {bundle.bundlePrice.toFixed(2)} {currency}
          </p>
        </div>
        {onRemove && (
          <button
            type="button"
            onClick={() => onRemove(bundle.instanceId)}
            aria-label={`Remove stack: ${bundle.campaignTitle}`}
            className="-me-1 flex h-11 w-11 shrink-0 items-center justify-center text-zeli-ink-subtle transition-colors hover:text-zeli-sale">
            <Trash2 className="h-[15px] w-[15px]" />
          </button>
        )}
      </div>

      {/* Children */}
      <ul className="ms-[52px] mt-3 space-y-2">
        {bundle.items.map((item, index) => (
          <li key={`${item.productId}-${index}`} className="flex items-center gap-3">
            <div className="h-11 w-11 shrink-0 overflow-hidden bg-zeli-surface">
              {item.imageUrl ? (
                <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" loading="lazy" />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <ShoppingCart className="h-4 w-4 text-zeli-ink-subtle" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] text-zeli-ink">{item.name}</p>
              {item.variant && <p className="text-[11px] text-zeli-ink-muted">{item.variant}</p>}
            </div>
            <div className="shrink-0 text-end text-[11px] text-zeli-ink-muted">
              {item.quantity > 1 && <span>× {item.quantity} · </span>}
              <span className="line-through">
                {(item.unitPrice * item.quantity).toFixed(2)} {currency}
              </span>
            </div>
          </li>
        ))}
      </ul>

      {/* Bundle-level maths */}
      <div className="ms-[52px] mt-3 space-y-1 border-t border-zeli-line pt-2 text-[12px]">
        <div className="flex justify-between text-zeli-ink-secondary">
          <span>Bought separately</span>
          <span>
            {bundle.regularTotal.toFixed(2)} {currency}
          </span>
        </div>
        {saving !== 0 && (
          <div className={`flex justify-between ${saving > 0 ? "text-zeli-success" : "text-zeli-sale"}`}>
            <span>Stack saving</span>
            <span>
              {saving > 0 ? "−" : "+"}
              {Math.abs(saving).toFixed(2)} {currency}
            </span>
          </div>
        )}
        <div className="flex justify-between font-semibold text-zeli-ink">
          <span>Stack price</span>
          <span>
            {bundle.bundlePrice.toFixed(2)} {currency}
          </span>
        </div>
      </div>
    </div>
  );
}
