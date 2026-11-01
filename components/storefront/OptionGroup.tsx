import { type KeyboardEvent, useId, useRef } from "react";
import { cn } from "#root/lib/utils";

export interface OptionGroupOption {
  value: string;
  label: string;
  /** Shown but not choosable (sold out / unavailable for this product). */
  disabled?: boolean;
  /** Appended after the label, e.g. "+ EGP 20". */
  detail?: string;
}

/**
 * Square segmented control with real radio semantics: role="radiogroup",
 * role="radio" + aria-checked on each option, aria-disabled on unavailable
 * ones, roving tabindex and arrow-key movement (Home/End too). The chosen
 * option is drawn inverted (ink fill, stone type) — a change of fill and
 * contrast, not of hue — and unavailable ones are struck through.
 */
export function OptionGroup({
  label,
  options,
  value,
  onChange,
  className,
  labelHidden = false,
  valueText,
}: {
  /** The group's visible name, e.g. "Colour". */
  label: string;
  /** Shown after the label, e.g. the chosen value ("Gold"). */
  valueText?: string;
  options: OptionGroupOption[];
  value: string | null | undefined;
  onChange: (value: string) => void;
  className?: string;
  /** Hide the visible label (the group still has an accessible name). */
  labelHidden?: boolean;
}) {
  const labelId = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const enabled = options.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0);
  const checkedIndex = options.findIndex((o) => o.value === value);
  // Roving tabindex: the checked option, else the first choosable one.
  const tabStop = checkedIndex >= 0 && !options[checkedIndex]?.disabled ? checkedIndex : (enabled[0] ?? -1);

  const move = (from: number, step: 1 | -1 | "first" | "last") => {
    if (enabled.length === 0) return;
    let next: number;
    if (step === "first") next = enabled[0]!;
    else if (step === "last") next = enabled[enabled.length - 1]!;
    else {
      const pos = enabled.indexOf(from);
      const at = pos < 0 ? 0 : (pos + step + enabled.length) % enabled.length;
      next = enabled[at]!;
    }
    const option = options[next];
    if (!option) return;
    onChange(option.value);
    refs.current[next]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    // The element's own direction decides which arrow is "next" in RTL.
    const rtl = getComputedStyle(e.currentTarget).direction === "rtl";
    const keys: Record<string, 1 | -1 | "first" | "last"> = {
      ArrowRight: rtl ? -1 : 1,
      ArrowDown: 1,
      ArrowLeft: rtl ? 1 : -1,
      ArrowUp: -1,
      Home: "first",
      End: "last",
    };
    const step = keys[e.key];
    if (step === undefined) return;
    e.preventDefault();
    move(index, step);
  };

  return (
    <div className={className}>
      <p className={cn("mb-2 t-label text-ink", labelHidden && "sr-only")}>
        <span id={labelId}>{label}</span>
        {valueText && (
          <span aria-hidden='true' className='ms-2 font-normal text-ink-2'>
            {valueText}
          </span>
        )}
      </p>
      <div role='radiogroup' aria-labelledby={labelId} className='flex flex-wrap gap-2'>
        {options.map((option, i) => {
          const checked = i === checkedIndex;
          return (
            <button
              key={option.value}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type='button'
              role='radio'
              aria-checked={checked}
              aria-disabled={option.disabled || undefined}
              tabIndex={i === tabStop ? 0 : -1}
              onClick={() => {
                if (!option.disabled) onChange(option.value);
              }}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={cn(
                "inline-flex h-11 min-w-11 items-center justify-center gap-1 border px-4 t-label transition-colors",
                checked
                  ? "border-ink bg-ink text-bg"
                  : "border-line-input bg-surface text-ink hover:border-ink",
                option.disabled &&
                  "cursor-not-allowed border-line bg-transparent text-ink-3 line-through hover:border-line",
              )}>
              {option.label}
              {option.detail && (
                <span className={cn("tabular-nums", checked ? "text-bg" : "text-ink-2")}>{option.detail}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
