import { formatMoney } from "#root/shared/pricing/format-money";
import { getProductUrl } from "#root/lib/utils/route-helpers";

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
 * Grouped cart line for a set (Pick 3 / Pick 6 / Ready Sets) — Object Index.
 * One block: the set's name and price, then its pieces as a numbered index
 * (01, 02 …), then the set maths on hairlines. Pieces are listed for
 * transparency but are not individually editable; the set is removed as a
 * whole. The other cart templates reuse it as-is so a set is never invisible
 * in a non-default template.
 */
export function CartBundleGroup({ bundle, currency, onRemove, disabled }: CartBundleGroupProps) {
  const unitCount = bundle.items.reduce((s, i) => s + i.quantity, 0);
  const saving = bundle.regularTotal - bundle.bundlePrice;
  const money = (amount: number) => formatMoney(amount, { currency });
  let index = 0;

  return (
    <div
      data-bundle-instance={bundle.instanceId}
      className={`py-6 transition-opacity ${disabled ? "opacity-60 pointer-events-none" : ""}`}>
      <div className="border border-line">
        {/* Header */}
        <div className="flex items-start gap-4 p-4">
          <div className="min-w-0 flex-1">
            <p className="t-micro text-ink-2">
              {/* The size sold. `requiredQuantity` is the server-resolved tier
                  quantity; the children's own count is the fallback. */}
              Set · {bundle.requiredQuantity || unitCount} pieces
            </p>
            <p className="mt-1 t-body text-ink break-words" style={{ fontFamily: "var(--font-product-title)" }}>
              {bundle.campaignTitle}
            </p>
          </div>
          <p className="shrink-0 text-end t-label tabular-nums text-ink" style={{ fontFamily: "var(--font-price)" }}>
            {money(bundle.bundlePrice)}
          </p>
        </div>

        {/* Pieces, indexed */}
        <ol className="border-t border-line">
          {bundle.items.map((item) => {
            index += 1;
            return (
              <li
                key={`${item.productId}-${index}`}
                className="flex items-center gap-3 border-b border-line px-4 py-2 last:border-b-0">
                <span aria-hidden className="w-6 shrink-0 t-micro tabular-nums text-ink-2">
                  {String(index).padStart(2, "0")}
                </span>
                {/* Each piece links to its own product page. The set stays one
                    unit in the cart; looking at a piece changes nothing about it. */}
                <a
                  href={getProductUrl({ id: item.productId })}
                  tabIndex={-1}

                  className="block h-12 w-10 shrink-0 bg-surface-2">
                  {item.imageUrl && (
                    <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" loading="lazy" />
                  )}
                </a>
                <div className="min-w-0 flex-1">
                  <p className="truncate t-small text-ink">
                    <a
                      href={getProductUrl({ id: item.productId })}
                      className="hover:underline hover:decoration-1 hover:underline-offset-4">
                      {item.name}
                    </a>
                  </p>
                  {item.variant && <p className="t-micro font-normal text-ink-2">{item.variant}</p>}
                </div>
                <p className="shrink-0 text-end t-small tabular-nums text-ink-2">
                  {item.quantity > 1 && <span>× {item.quantity} · </span>}
                  <s>{money(item.unitPrice * item.quantity)}</s>
                </p>
              </li>
            );
          })}
        </ol>

        {/* Set maths */}
        <dl className="border-t border-line px-4 py-3 t-small">
          <div className="flex justify-between py-1 text-ink-2">
            <dt>Bought separately</dt>
            <dd className="tabular-nums">{money(bundle.regularTotal)}</dd>
          </div>
          {saving !== 0 && (
            <div className="flex justify-between py-1 text-ink-2">
              <dt>Set saving</dt>
              <dd className="tabular-nums">
                {saving > 0 ? "−" : "+"}
                {money(Math.abs(saving))}
              </dd>
            </div>
          )}
          <div className="flex justify-between py-1 t-label text-ink">
            <dt>Set price</dt>
            <dd className="tabular-nums">{money(bundle.bundlePrice)}</dd>
          </div>
        </dl>
      </div>

      {onRemove && (
        <button
          type="button"
          onClick={() => onRemove(bundle.instanceId)}
          aria-label={`Remove set: ${bundle.campaignTitle}`}
          className="mt-2 inline-flex min-h-11 items-center t-small text-ink underline decoration-1 underline-offset-4 hover:text-ink-2">
          Remove
        </button>
      )}
    </div>
  );
}
