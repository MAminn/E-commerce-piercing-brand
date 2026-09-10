import { useState, useEffect, useCallback } from "react";
import { Check, X } from "lucide-react";
import { Link } from "#root/components/utils/Link";
import { useMinimalI18n } from "#root/lib/i18n/MinimalI18nContext";
import { STORE_CURRENCY } from "#root/shared/config/branding";

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
    borderRadius: "8px",
    boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
    transition: "all 1.1s cubic-bezier(0.22, 0.68, 0, 1.1)",
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
      opacity: "0.3",
      borderRadius: "50%",
      transform: "rotate(-8deg)",
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

  return (
    <div className="fixed top-4 start-4 z-[10001] w-[320px] bg-white border border-emerald-200 shadow-xl animate-[slideDown_400ms_ease-out_forwards,cartToastPulse_1.5s_ease-in-out_400ms_2]">
      <div className="h-1 bg-emerald-500 w-full animate-[shrink_4s_linear_forwards]" />
      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2 text-emerald-600">
            <Check className="w-4 h-4" />
            <span className="text-sm font-medium">
              {t("product.added_to_cart") || "Added to cart"}
            </span>
          </div>
          <button
            type="button"
            onClick={dismiss}
            className="text-stone-400 hover:text-stone-600 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex items-center gap-3">
          {item.imageUrl && (
            <img
              src={item.imageUrl}
              alt={item.name}
              className="w-14 h-14 object-cover flex-none"
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm text-stone-800 font-medium truncate">
              {item.name}
            </p>
            <p className="text-sm text-stone-500">
              {item.price} {STORE_CURRENCY}
            </p>
          </div>
        </div>
        <div className="flex gap-2 mt-3">
          <Link
            href="/cart"
            className="flex-1 py-2 text-center text-xs font-medium border border-stone-200 text-stone-700 hover:bg-stone-50 transition-colors">
            {t("product.view_cart") || "View Cart"}
          </Link>
          <Link
            href="/checkout"
            className="flex-1 py-2 text-center text-xs font-medium bg-stone-900 text-white hover:bg-stone-800 transition-colors">
            {t("product.checkout") || "Checkout"}
          </Link>
        </div>
      </div>
    </div>
  );
}
