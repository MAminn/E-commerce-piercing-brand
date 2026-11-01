import { useState, useEffect, useCallback } from "react";
import { Check, X } from "lucide-react";
import { buttonClass } from "#root/components/storefront/Button";
import { useMinimalI18n } from "#root/lib/i18n/MinimalI18nContext";
import { formatMoney } from "#root/shared/pricing/format-money";

interface CartToastItem {
  name: string;
  price: number;
  imageUrl?: string;
}

let showToastGlobal: ((item: CartToastItem) => void) | null = null;

/**
 * Trigger the cart toast from anywhere.
 * The <CartToastContainer> must be mounted in the layout.
 */
export function showCartToast(item: CartToastItem) {
  showToastGlobal?.(item);
}

/**
 * Launch a ghost image that flies from a source element to the cart toast area.
 * Call this before or alongside showCartToast() for the visual effect.
 *
 * @param sourceEl - The image element or its container to fly from
 * @param imageUrl - URL of the product image
 */
export function flyToCart(sourceEl: HTMLElement | null, imageUrl?: string) {
  if (!sourceEl || typeof document === "undefined") return;
  // Decorative motion: skipped entirely for anyone who asked for less.
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

  const rect = sourceEl.getBoundingClientRect();
  const ghost = document.createElement("img");
  ghost.src = imageUrl || (sourceEl instanceof HTMLImageElement ? sourceEl.src : "");
  if (!ghost.src) return;

  // Style the ghost
  Object.assign(ghost.style, {
    position: "fixed",
    top: `${rect.top}px`,
    left: `${rect.left}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    objectFit: "cover",
    zIndex: "20000",
    pointerEvents: "none",
    transition: "all 0.8s cubic-bezier(0.16, 1, 0.3, 1)",
    opacity: "1",
  });

  document.body.appendChild(ghost);

  // Force reflow
  ghost.getBoundingClientRect();

  // Animate to top-left (where the cart toast appears)
  requestAnimationFrame(() => {
    Object.assign(ghost.style, {
      top: "16px",
      left: "16px",
      width: "56px",
      height: "56px",
      opacity: "0",
    });
  });

  // Clean up
  ghost.addEventListener("transitionend", () => ghost.remove(), { once: true });
  setTimeout(() => ghost.remove(), 1300);
}

/**
 * Mount once in the layout. Renders the custom add-to-cart toast.
 */
export function CartToastContainer() {
  const [item, setItem] = useState<CartToastItem | null>(null);
  const [visible, setVisible] = useState(false);
  const { t } = useMinimalI18n();

  const show = useCallback((newItem: CartToastItem) => {
    setItem(newItem);
    setVisible(true);
  }, []);

  const dismiss = useCallback(() => setVisible(false), []);

  // Register the global trigger
  useEffect(() => {
    showToastGlobal = show;
    return () => {
      showToastGlobal = null;
    };
  }, [show]);

  // Auto-dismiss after 4s
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => setVisible(false), 4000);
    return () => clearTimeout(timer);
  }, [visible, item]);

  if (!visible || !item) return null;

  // Square `surface` panel with a hairline — no shadow, no colour wash. The
  // whole panel is a polite live region so the addition is announced.
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed start-4 top-4 w-[320px] max-w-[calc(100vw-2rem)] border border-line bg-surface text-ink"
      style={{ zIndex: "var(--perce-z-overlay)" }}>
      <div className="p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="flex items-center gap-2 t-label">
            <Check size={16} strokeWidth={1.5} aria-hidden />
            {t("product.added_to_cart") || "Added to cart"}
          </p>
          <button
            type="button"
            onClick={dismiss}
            aria-label={t("product.close_image") || "Close"}
            className="-me-3 -mt-3 flex h-11 w-11 items-center justify-center text-ink-2 transition-colors hover:text-ink">
            <X size={16} strokeWidth={1.5} aria-hidden />
          </button>
        </div>
        <div className="flex items-center gap-3">
          {item.imageUrl && (
            <img
              src={item.imageUrl}
              alt=""
              className="h-15 w-12 flex-none bg-surface-2 object-cover"
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate t-small text-ink">{item.name}</p>
            <p className="t-label tabular-nums text-ink">{formatMoney(item.price)}</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <a href="/cart" className={buttonClass({ variant: "secondary", size: "sm" })}>
            {t("product.view_cart") || "View Cart"}
          </a>
          <a href="/checkout" className={buttonClass({ variant: "primary", size: "sm" })}>
            {t("product.checkout") || "Checkout"}
          </a>
        </div>
      </div>
    </div>
  );
}
