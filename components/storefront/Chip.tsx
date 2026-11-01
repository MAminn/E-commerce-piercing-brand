import { Check, X } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "#root/lib/utils";

/**
 * Square chip. Two uses:
 *  - removable (an active filter): label + ×, removes on click;
 *  - toggle (`pressed` set): aria-pressed, ink rule and a check when on, so
 *    the state never depends on colour alone.
 * 36px visual height with a 44px hit area.
 */
export function Chip({
  pressed,
  removable,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  pressed?: boolean;
  removable?: boolean;
}) {
  return (
    <button
      type='button'
      aria-pressed={pressed}
      className={cn(
        "relative inline-flex h-9 max-w-[16rem] items-center gap-2 border px-3 t-small text-ink transition-colors before:absolute before:inset-x-0 before:-inset-y-1 before:content-['']",
        pressed ? "border-ink" : "border-line hover:border-ink",
        removable && "bg-surface",
        className,
      )}
      {...props}>
      {pressed && <Check aria-hidden size={14} strokeWidth={1.5} className='shrink-0' />}
      <span className='truncate'>{children}</span>
      {removable && <X aria-hidden size={14} strokeWidth={1.5} className='shrink-0 text-ink-2' />}
    </button>
  );
}
