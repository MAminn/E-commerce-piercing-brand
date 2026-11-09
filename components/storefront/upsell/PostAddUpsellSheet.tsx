import { Check, X } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "#root/components/ui/dialog";
import { cn } from "#root/lib/utils";
import { useMinimalI18n } from "#root/lib/i18n/MinimalI18nContext";
import { fillTemplate } from "#root/components/bundles/bundle-ui";
import { formatMoney } from "#root/shared/pricing/format-money";
import { buttonClass } from "#root/components/storefront/Button";
import { UpsellList } from "./UpsellList";
import type { PostAddMainItem, UpsellProduct } from "./types";

/**
 * Post-add upsell — a bottom sheet on phones, a centred modal from 640px.
 * Ported from Mach's `PostAddUpsellSheet`; drawn with the same Dialog
 * geometry and surface as Percé's Entry Popup (square, flat, hairline, no
 * shadow), so it reads as part of this storefront.
 *
 * One component with responsive placement rather than two, so the content,
 * focus handling and dismissal are identical at every width. It is opened
 * only by the product page after the cart has accepted the main product, so
 * by the time this is on screen the shopper's add has already happened —
 * closing it, ignoring it or navigating away changes nothing about that.
 */
export function PostAddUpsellSheet({
  open,
  main,
  products,
  onClose,
}: {
  open: boolean;
  main: PostAddMainItem | null;
  products: UpsellProduct[];
  onClose: () => void;
}) {
  const { t, locale, dir } = useMinimalI18n();
  const moneyLocale = locale === "ar" ? "ar" : "en";

  // Never an empty sheet: without recommendations the caller confirms the add
  // with the usual toast instead of opening this.
  if (!main || products.length === 0) return null;

  const options = Object.entries(main.selectedOptions ?? {}).filter(([, v]) => Boolean(v));

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}>
      <DialogContent
        dir={dir}
        data-testid='post-add-upsell'
        className={cn(
          "flex max-h-[88dvh] flex-col gap-0 overflow-hidden rounded-none border-line bg-surface p-0 text-ink shadow-none [&>button]:hidden",
          "inset-x-0 bottom-0 top-auto left-0 w-full max-w-none translate-x-0 translate-y-0 border-x-0 border-b-0",
          "data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom data-[state=open]:zoom-in-100 data-[state=closed]:zoom-out-100",
          "sm:inset-x-auto sm:bottom-auto sm:top-[50%] sm:left-[50%] sm:max-h-[85vh] sm:w-[calc(100%-2rem)] sm:max-w-[460px] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:border",
          "sm:data-[state=open]:slide-in-from-bottom-0 sm:data-[state=closed]:slide-out-to-bottom-0",
        )}
        style={{ zIndex: "var(--perce-z-overlay)" }}>
        {/* Confirmation strip — the same words and mark as the add-to-bag toast. */}
        <div className='flex shrink-0 items-center justify-between gap-3 border-b border-line px-4 py-2'>
          <DialogTitle className='flex items-center gap-2 t-label text-ink'>
            <Check size={16} strokeWidth={1.5} aria-hidden />
            {t("product.added_to_cart")}
          </DialogTitle>
          <DialogClose
            className='-me-3 flex h-11 w-11 items-center justify-center text-ink-2 transition-colors hover:text-ink'
            aria-label={t("product.close_image")}>
            <X size={16} strokeWidth={1.5} aria-hidden />
          </DialogClose>
        </div>

        <div className='min-h-0 flex-1 overflow-y-auto px-4'>
          {/* The product that was just added. */}
          <div className='flex items-center gap-3 py-4'>
            {main.imageUrl && (
              <div className='h-15 w-12 shrink-0 overflow-hidden bg-surface-2'>
                <img src={main.imageUrl} alt='' aria-hidden='true' className='h-full w-full object-cover' />
              </div>
            )}
            <div className='min-w-0 flex-1'>
              <p className='line-clamp-2 t-small text-ink'>{main.name}</p>
              {options.length > 0 && (
                <p className='mt-0.5 truncate t-micro text-ink-2'>
                  {options.map(([k, v]) => `${k}: ${v}`).join(" · ")}
                </p>
              )}
              <p className='mt-0.5 t-label tabular-nums text-ink'>
                {main.quantity > 1 ? `${main.quantity} × ` : ""}
                {formatMoney(main.price, { locale: moneyLocale })}
              </p>
            </div>
          </div>

          <DialogDescription className='sr-only'>
            {fillTemplate(t("upsell.sheet_description"), { name: main.name })}
          </DialogDescription>

          <p className='border-t border-line pt-4 t-label text-ink'>{t("upsell.post_add_heading")}</p>
          <UpsellList products={products} toast={false} onNavigate={onClose} className='mt-3' />
        </div>

        <div className='shrink-0 space-y-2 border-t border-line px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4'>
          <div className='grid grid-cols-2 gap-2'>
            <a href='/cart' onClick={onClose} className={buttonClass({ variant: "secondary", size: "md" })}>
              {t("product.view_cart")}
            </a>
            <a href='/checkout' onClick={onClose} className={buttonClass({ variant: "primary", size: "md" })}>
              {t("product.checkout")}
            </a>
          </div>
          <DialogClose className={buttonClass({ variant: "text", size: "sm", fullWidth: true })}>
            {t("cart.continue_shopping")}
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}
