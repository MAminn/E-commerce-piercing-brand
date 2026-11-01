import { Minus, Plus } from "lucide-react";
import { cn } from "#root/lib/utils";

/**
 * Square quantity stepper: [−] n [+], one 1px `line-input` rule around the
 * whole control. 44px cells (md) or 36px visual cells with 44px hit areas
 * (sm). The count is tabular and announced politely when it changes.
 */
export function Stepper({
  value,
  onDecrement,
  onIncrement,
  canDecrement = value > 1,
  canIncrement = true,
  size = "md",
  label,
  decrementLabel,
  incrementLabel,
  className,
}: {
  value: number;
  onDecrement: () => void;
  onIncrement: () => void;
  canDecrement?: boolean;
  canIncrement?: boolean;
  size?: "md" | "sm";
  /** Names the group, e.g. "Quantity" or "Quantity, Gold hoop". */
  label: string;
  decrementLabel: string;
  incrementLabel: string;
  className?: string;
}) {
  const cell = size === "md" ? "h-11 w-11" : "h-9 w-9 before:absolute before:-inset-1 before:content-['']";
  const button = cn(
    "relative inline-flex items-center justify-center text-ink transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:text-ink-3 disabled:hover:bg-transparent",
    cell,
  );
  return (
    <div
      role='group'
      aria-label={label}
      className={cn("inline-flex items-center border border-line-input bg-surface", className)}>
      <button
        type='button'
        onClick={onDecrement}
        disabled={!canDecrement}
        aria-label={decrementLabel}
        className={button}>
        <Minus aria-hidden size={16} strokeWidth={1.5} />
      </button>
      <span
        aria-live='polite'
        className={cn(
          "inline-flex items-center justify-center t-label tabular-nums text-ink",
          size === "md" ? "h-11 min-w-11" : "h-9 min-w-9",
        )}>
        {value}
      </span>
      <button
        type='button'
        onClick={onIncrement}
        disabled={!canIncrement}
        aria-label={incrementLabel}
        className={button}>
        <Plus aria-hidden size={16} strokeWidth={1.5} />
      </button>
    </div>
  );
}
