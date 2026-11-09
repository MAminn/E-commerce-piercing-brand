import { useEffect, useRef, useState } from "react";
import { Check, Plus } from "lucide-react";
import { useCart } from "#root/lib/context/CartContext";
import { useTracking } from "#root/frontend/contexts/TrackingContext";
import { trackAddToCartEvent } from "#root/frontend/tracking/add-to-cart-event";
import { showCartToast } from "#root/components/ui/cart-toast";
import { useMinimalI18n } from "#root/lib/i18n/MinimalI18nContext";
import { fillTemplate } from "#root/components/bundles/bundle-ui";
import { formatMoney } from "#root/shared/pricing/format-money";
import { buttonClass } from "#root/components/storefront/Button";
import { getProductUrl } from "#root/lib/utils/route-helpers";
import type { UpsellProduct } from "./types";

/**
 * The compact upsell row list — photo, name, price, and one action.
 *
 * Ported from Mach's `MachUpsellList`; shared by the product-page block and
 * the post-add sheet so the two look and behave identically. The action
 * follows the same rules as Percé's card quick-add (MinimalProductCard),
 * because a recommendation is no more entitled to guess than a shelf card:
 *
 *  - no option groups      → "+ Add" through the one cart path
 *                            (CartContext.addItem: stock gate and line
 *                            merging), the existing AddToCart tracking event,
 *                            and Percé's own add-to-bag toast
 *  - option groups (> 0)   → "Options", a link to the product page, never a
 *                            guessed size or colour
 *  - option state unknown  → treated as "Options" for the same reason
 *  - already in the bag    → "Added", and it cannot be pressed again, which is
 *                            also what stops a double-tap adding two units
 *
 * Prices: the row shows (and the cart line carries) what the shopper pays —
 * the discount price when one applies, else the price — exactly as the card
 * quick-add does. Set/bundle and promo pricing are then applied by the cart
 * and re-checked by the server at checkout, as for any other line.
 */

function toNumber(v: number | string | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "string" ? Number.parseFloat(v) : v;
  return Number.isFinite(n) ? n : null;
}

function imageOf(p: UpsellProduct): string | undefined {
  const raw = p.imageUrl ?? p.images?.[0]?.url;
  if (!raw) return undefined;
  return raw.startsWith("http") || raw.startsWith("/") ? raw : `/uploads/${raw}`;
}

/** What the shopper pays per unit: the discount price when it is lower. */
export function upsellUnitPrice(p: Pick<UpsellProduct, "price" | "discountPrice">): {
  price: number;
  originalPrice?: number;
} {
  const price = toNumber(p.price) ?? 0;
  const discount = toNumber(p.discountPrice);
  return discount != null && discount < price
    ? { price: discount, originalPrice: price }
    : { price };
}

export function UpsellAddButton({
  product,
  toast = true,
  onNavigate,
}: {
  product: UpsellProduct;
  /** Off inside the post-add sheet, which is its own confirmation. */
  toast?: boolean;
  /** Called before following the options link (the sheet closes itself). */
  onNavigate?: () => void;
}) {
  const { items, addItem } = useCart();
  const { trackEvent } = useTracking();
  const { t } = useMinimalI18n();
  const inBag = items.some((i) => i.id === product.id);
  const [refused, setRefused] = useState(false);

  // Set synchronously on press, so a second tap landing before React has
  // re-rendered with the new cart cannot add a second unit.
  const busy = useRef(false);
  useEffect(() => {
    if (!inBag) busy.current = false;
  }, [inBag]);

  const isSoldOut = !product.available || product.stock <= 0;
  if (isSoldOut) return null;

  const needsOptions =
    product.variantCount === undefined
      ? product.requiresOptions !== false
      : product.variantCount > 0;

  if (needsOptions) {
    return (
      <a
        href={getProductUrl(product)}
        onClick={onNavigate}
        aria-label={fillTemplate(t("upsell.options_label"), { name: product.name })}
        data-upsell-action='options'
        className={buttonClass({ variant: "secondary", size: "sm", className: "shrink-0" })}>
        {t("upsell.options")}
      </a>
    );
  }

  if (inBag) {
    return (
      <button
        type='button'
        disabled
        aria-label={fillTemplate(t("upsell.added_label"), { name: product.name })}
        data-upsell-action='added'
        className={buttonClass({ variant: "secondary", size: "sm", className: "shrink-0" })}>
        <Check size={14} strokeWidth={1.5} aria-hidden />
        {t("upsell.added")}
      </button>
    );
  }

  const handleAdd = () => {
    if (busy.current) return;
    busy.current = true;
    const { price, originalPrice } = upsellUnitPrice(product);
    const imageUrl = imageOf(product);
    // `addItem` is the stock gate: it returns false when the request cannot
    // be satisfied, and this never works around that. Only reached for a
    // product the server reported as having no option groups, so `{}` is
    // the complete selection.
    const ok = addItem(
      {
        id: product.id,
        slug: product.slug ?? undefined,
        name: product.name,
        price,
        originalPrice,
        stock: product.stock,
        available: product.available,
        imageUrl,
        categoryName: product.categoryName ?? undefined,
      },
      1,
      {},
    );
    if (!ok) {
      busy.current = false;
      setRefused(true);
      return;
    }
    trackAddToCartEvent(trackEvent, {
      id: product.id,
      name: product.name,
      price,
      quantity: 1,
      categoryName: product.categoryName,
    });
    if (toast) {
      showCartToast({ name: product.name, price, imageUrl: imageUrl ?? "" });
    }
  };

  return (
    <button
      type='button'
      onClick={handleAdd}
      disabled={refused}
      aria-label={fillTemplate(t("upsell.add_label"), { name: product.name })}
      data-upsell-action='add'
      className={buttonClass({ variant: "primary", size: "sm", className: "shrink-0" })}>
      {refused ? (
        t("upsell.unavailable")
      ) : (
        <>
          <Plus size={14} strokeWidth={1.5} aria-hidden />
          {t("upsell.add")}
        </>
      )}
    </button>
  );
}

export function UpsellList({
  products,
  toast = true,
  onNavigate,
  className = "",
}: {
  products: UpsellProduct[];
  toast?: boolean;
  onNavigate?: () => void;
  className?: string;
}) {
  const { locale } = useMinimalI18n();
  const moneyLocale = locale === "ar" ? "ar" : "en";
  if (products.length === 0) return null;
  return (
    <ul className={`border-t border-line ${className}`}>
      {products.map((p) => {
        const src = imageOf(p);
        const { price } = upsellUnitPrice(p);
        return (
          <li
            key={p.id}
            data-upsell-item={p.id}
            className='flex items-center gap-3 border-b border-line py-3'>
            <div className='h-[60px] w-12 shrink-0 overflow-hidden bg-surface-2'>
              {src && (
                <img src={src} alt='' loading='lazy' className='h-full w-full object-cover' />
              )}
            </div>
            <div className='min-w-0 flex-1'>
              <a
                href={getProductUrl(p)}
                onClick={onNavigate}
                className='line-clamp-2 t-card-title text-ink hover:underline'>
                {p.name}
              </a>
              <p className='mt-1 t-card-price text-ink'>
                {formatMoney(price, { locale: moneyLocale })}
              </p>
            </div>
            <UpsellAddButton product={p} toast={toast} onNavigate={onNavigate} />
          </li>
        );
      })}
    </ul>
  );
}
