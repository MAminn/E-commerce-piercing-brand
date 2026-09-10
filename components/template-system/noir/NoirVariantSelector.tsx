import { cn } from "#root/lib/utils";
import { useMinimalI18n } from "#root/lib/i18n/MinimalI18nContext";
import { NOIR_DISPLAY_FONT_CLASSES } from "./noir-tokens";

/* ------------------------------------------------------------------ */
/*  Types — same contract as components/shop/VariantSelector (read-   */
/*  only reference; that component hardcodes light-theme styling, so  */
/*  Noir renders its own picker with identical props/behavior).       */
/* ------------------------------------------------------------------ */

export interface NoirVariantValue {
  value: string;
  priceModifier?: number;
}

export interface NoirVariantOption {
  name: string;
  values: NoirVariantValue[];
}

interface NoirVariantSelectorProps {
  variants: NoirVariantOption[];
  selectedVariants: Record<string, string>;
  onVariantChange: (variantName: string, value: string) => void;
  className?: string;
}

/**
 * NoirVariantSelector — dark variant picker. Uppercase tracked group
 * labels, hairline-bordered value pills, red selected state.
 */
export function NoirVariantSelector({
  variants,
  selectedVariants,
  onVariantChange,
  className,
}: NoirVariantSelectorProps) {
  const { locale } = useMinimalI18n();
  const isAr = locale === "ar";
  const track = isAr ? "" : "tracking-[0.18em]";

  return (
    <div className={cn("space-y-5", className)}>
      {variants.map((variant) => (
        <div key={variant.name}>
          <p
            className={cn(
              "text-[11px] uppercase font-medium text-white mb-3",
              track,
              NOIR_DISPLAY_FONT_CLASSES,
            )}>
            {variant.name}
            {selectedVariants[variant.name] && (
              <span className='ms-2 font-normal normal-case tracking-normal text-[#A3A3A3]'>
                — {selectedVariants[variant.name]}
              </span>
            )}
          </p>
          <div className='flex flex-wrap gap-2'>
            {variant.values.map((variantValue) => {
              const value = variantValue.value;
              const isSelected = selectedVariants[variant.name] === value;
              return (
                <button
                  key={value}
                  type='button'
                  onClick={() => onVariantChange(variant.name, value)}
                  className={cn(
                    "px-4 py-2 text-sm rounded-md border transition-colors duration-200",
                    isSelected
                      ? "bg-[#E8112D] text-white border-[#E8112D]"
                      : "bg-transparent text-[#A3A3A3] border-white/15 hover:border-white/40 hover:text-white",
                  )}>
                  {value}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
