import { Minus, Plus } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { cn } from "#root/lib/utils";

/**
 * One row of an information index: a hairline above, the title as a full-
 * width button (aria-expanded / aria-controls), + / − at the end. Content
 * stays in the DOM when closed (hidden), so it is still in the server render
 * for crawlers and find-in-page.
 */
export function AccordionRow({
  title,
  children,
  defaultOpen = false,
  className,
}: {
  title: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <section className={cn("border-t border-line", className)}>
      <h3>
        <button
          type='button'
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((v) => !v)}
          className='flex min-h-13 w-full items-center justify-between gap-4 text-start t-label text-ink'>
          {title}
          {open ? (
            <Minus aria-hidden size={16} strokeWidth={1.5} className='shrink-0' />
          ) : (
            <Plus aria-hidden size={16} strokeWidth={1.5} className='shrink-0' />
          )}
        </button>
      </h3>
      <div id={id} hidden={!open} className='pb-6 t-body text-ink-2'>
        {children}
      </div>
    </section>
  );
}
