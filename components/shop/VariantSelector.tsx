import { OptionGroup } from "#root/components/storefront/OptionGroup";
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

/**
 * One square radiogroup per option group (see storefront/OptionGroup):
 * role="radiogroup" / role="radio" / aria-checked, unavailable values
 * struck through and aria-disabled, arrow keys move the choice.
 */
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
          <OptionGroup
            key={variant.name}
            label={variant.name}
            valueText={selectedVariants[variant.name]}
            value={selectedVariants[variant.name]}
            onChange={(value) => onVariantChange(variant.name, value)}
            options={variant.values.map((v) => ({
              value: v.value,
              label: v.value,
              disabled: strikes.includes(v.value),
            }))}
          />
        );
      })}
    </div>
  );
}
