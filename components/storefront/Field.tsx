import { ChevronDown } from "lucide-react";
import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import { cn } from "#root/lib/utils";

/**
 * Form controls (Object Index): 48px, square, 1px `line-input` rule on
 * `surface`, ink on focus, `error` when invalid. Pair every control with a
 * visible <label>; an error message goes in a FieldError whose id the
 * control names in aria-describedby.
 */
export const fieldClass =
  "h-12 w-full border border-line-input bg-surface px-3 t-body text-ink placeholder:text-ink-3 transition-colors focus:border-ink focus:outline-none aria-invalid:border-error disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-ink-3";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(fieldClass, className)} {...props} />;
  },
);

/** Native select, so the platform picker opens on phones. */
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <div className='relative'>
        <select
          ref={ref}
          className={cn(fieldClass, "appearance-none pe-10", className)}
          {...props}>
          {children}
        </select>
        <ChevronDown
          aria-hidden
          size={16}
          strokeWidth={1.5}
          className='pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-ink-2'
        />
      </div>
    );
  },
);

export function FieldLabel({
  htmlFor,
  children,
  optional,
  className,
}: {
  htmlFor: string;
  children: ReactNode;
  /** Text shown after the label, e.g. "(optional)". */
  optional?: string;
  className?: string;
}) {
  return (
    <label htmlFor={htmlFor} className={cn("mb-2 block t-label text-ink", className)}>
      {children}
      {optional && <span className='font-normal text-ink-2'> {optional}</span>}
    </label>
  );
}

/** Error line under a field. Give it the id the control lists in aria-describedby. */
export function FieldError({ id, children }: { id: string; children?: ReactNode }) {
  if (!children) return null;
  return (
    <p id={id} className='mt-2 t-small text-error'>
      {children}
    </p>
  );
}
