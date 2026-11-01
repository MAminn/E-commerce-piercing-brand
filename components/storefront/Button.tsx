import { forwardRef, type AnchorHTMLAttributes, type ButtonHTMLAttributes } from "react";
import { cn } from "#root/lib/utils";

/**
 * The storefront's only button system (Object Index).
 *
 * Four variants, three sizes — nothing else. Square, flat, hairline; ink is
 * the only accent.
 *
 *   primary    ink fill, stone type. One per view: Add to bag, Checkout,
 *              Place order (size lg).
 *   secondary  1px ink rule, no fill.
 *   text       an underlined text link that is still a 44px target.
 *   icon       a square glyph button (see IconButton) — always aria-labelled.
 *
 *   lg  52px    md  44px    sm  36px visual, 44px hit area
 */
export type ButtonVariant = "primary" | "secondary" | "text" | "icon";
export type ButtonSize = "lg" | "md" | "sm";

const base =
  "relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap t-button transition-colors duration-[var(--perce-duration-fast)] disabled:cursor-not-allowed aria-disabled:cursor-not-allowed";

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-ink text-bg hover:bg-hover disabled:bg-surface-2 disabled:text-ink-3 aria-disabled:bg-surface-2 aria-disabled:text-ink-3",
  secondary:
    "border border-ink bg-transparent text-ink hover:bg-surface-2 disabled:border-line disabled:text-ink-3 disabled:hover:bg-transparent",
  text: "bg-transparent px-0 text-ink underline decoration-1 underline-offset-4 hover:text-ink-2 disabled:text-ink-3",
  icon: "bg-transparent text-ink hover:bg-surface-2 disabled:text-ink-3 disabled:hover:bg-transparent",
};

/* The sm size draws 36px but extends its hit area to 44px with an
   invisible pseudo-element, so a dense row stays tappable. */
const smHitArea = "before:absolute before:inset-x-0 before:-inset-y-1 before:content-['']";

const sizes: Record<ButtonVariant, Record<ButtonSize, string>> = {
  primary: { lg: "h-13 px-6", md: "h-11 px-5", sm: `h-9 px-4 ${smHitArea}` },
  secondary: { lg: "h-13 px-6", md: "h-11 px-5", sm: `h-9 px-4 ${smHitArea}` },
  text: { lg: "min-h-13", md: "min-h-11", sm: "min-h-11" },
  icon: {
    lg: "h-13 w-13",
    md: "h-11 w-11",
    sm: "h-9 w-9 before:absolute before:-inset-1 before:content-['']",
  },
};

export function buttonClass({
  variant = "primary",
  size = "md",
  fullWidth = false,
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
} = {}): string {
  return cn(base, variants[variant], sizes[variant][size], fullWidth && "w-full", className);
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", fullWidth, className, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      data-slot='button'
      className={buttonClass({ variant, size, fullWidth, className })}
      {...props}
    />
  );
});

export interface ButtonLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  variant?: Exclude<ButtonVariant, "icon">;
  size?: ButtonSize;
  fullWidth?: boolean;
}

/** A link that looks like a Button (Vike routes plain anchors client-side). */
export const ButtonLink = forwardRef<HTMLAnchorElement, ButtonLinkProps>(function ButtonLink(
  { variant = "primary", size = "md", fullWidth, className, ...props },
  ref,
) {
  return (
    <a
      ref={ref}
      data-slot='button'
      className={buttonClass({ variant, size, fullWidth, className })}
      {...props}
    />
  );
});

export interface IconButtonProps extends Omit<ButtonProps, "variant" | "aria-label"> {
  /** Required: an icon button has no visible text. */
  "aria-label": string;
}

/** Square glyph button. Icons inside should be Lucide at 20px / 1.5 stroke. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { size = "md", ...props },
  ref,
) {
  return <Button ref={ref} variant='icon' size={size} {...props} />;
});

/** Lucide props for every storefront glyph: 20px, 1.5 stroke. */
export const ICON_PROPS = { size: 20, strokeWidth: 1.5, "aria-hidden": true } as const;
