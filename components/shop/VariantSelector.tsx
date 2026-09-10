import { cn } from "#root/lib/utils";

export interface VariantValue {
  value: string;
  priceModifier?: number;
}

export interface VariantOption {
  name: string;
  values: VariantValue[];
}

interface VariantSelectorProps {
  variants: VariantOption[];
  selectedVariants: Record<string, string>;
  onVariantChange: (variantName: string, value: string) => void;
  /** Per-variant-name map of values that should render with strikethrough */
  strikethroughMap?: Record<string, string[]>;
  className?: string;
}

export function VariantSelector({
  variants,
  selectedVariants,
  onVariantChange,
  strikethroughMap,
  className,
}: VariantSelectorProps) {
  return (
    <div className={cn("space-y-4", className)}>
      {variants.map((variant) => {
        const strikes = strikethroughMap?.[variant.name] ?? [];
        return (
          <div key={variant.name}>
            <p className='text-sm font-medium text-gray-700 mb-2'>
              {variant.name}
              {selectedVariants[variant.name] && (
                <span className='ml-1.5 font-normal text-gray-500'>
                  — {selectedVariants[variant.name]}
                </span>
              )}
            </p>
            <div className='flex flex-wrap gap-2'>
              {variant.values.map((variantValue) => {
                const value = variantValue.value;
                const isSelected = selectedVariants[variant.name] === value;
                const isStrikethrough = strikes.includes(value);
                return (
                  <button
                    key={value}
                    type='button'
                    onClick={() => !isStrikethrough && onVariantChange(variant.name, value)}
                    disabled={isStrikethrough}
                    className={cn(
                      "px-4 py-2 text-sm rounded-full border transition-all duration-150",
                      isSelected && !isStrikethrough
                        ? "bg-gray-900 text-white border-gray-900"
                        : "bg-white text-gray-700 border-gray-300 hover:border-gray-900 hover:text-gray-900",
                      isStrikethrough && "line-through opacity-50 cursor-not-allowed pointer-events-none",
                    )}>
                    {value}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
