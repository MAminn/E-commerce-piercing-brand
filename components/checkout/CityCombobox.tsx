"use client";

import { useEffect, useMemo, useState } from "react";
import { Input, type InputProps } from "#root/components/ui/input";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "#root/components/ui/popover";
import { cn } from "#root/lib/utils";
import { trpc } from "#root/shared/trpc/client";

interface CityComboboxProps
  extends Omit<InputProps, "value" | "onChange" | "type"> {
  value: string | undefined;
  onChange: (value: string) => void;
}

/**
 * A plain text input that also offers a searchable dropdown of Bosta's known
 * cities. Free typing always remains the source of truth — selecting a
 * suggestion just fills the input, it never blocks or requires a match.
 * Degrades to an ordinary text input when Bosta isn't configured (empty
 * city list) or its API is unreachable.
 */
export function CityCombobox({
  value,
  onChange,
  className,
  ...inputProps
}: CityComboboxProps) {
  const [open, setOpen] = useState(false);
  const [cities, setCities] = useState<string[]>([]);
  const safeValue = value ?? "";

  useEffect(() => {
    let cancelled = false;
    trpc.order.bosta.listShippingLocations
      .query()
      .then((res) => {
        if (!cancelled) {
          setCities(res.cities.map((c) => c.cityName));
        }
      })
      .catch(() => {
        // Bosta unavailable — component silently behaves as a plain input.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = safeValue.trim().toLowerCase();
    if (!q) return cities.slice(0, 8);
    return cities.filter((c) => c.toLowerCase().includes(q)).slice(0, 8);
  }, [cities, safeValue]);

  const showDropdown = open && filtered.length > 0;

  return (
    <Popover open={showDropdown} onOpenChange={(next) => setOpen(next)}>
      <PopoverTrigger asChild>
        <Input
          {...inputProps}
          type='text'
          value={safeValue}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
          className={className}
          autoCorrect='off'
          spellCheck={false}
        />
      </PopoverTrigger>
      <PopoverContent
        className='w-[var(--radix-popover-trigger-width)] p-1'
        align='start'
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}>
        <div className='max-h-56 overflow-y-auto'>
          {filtered.map((city) => (
            <button
              key={city}
              type='button'
              onClick={() => {
                onChange(city);
                setOpen(false);
              }}
              className={cn(
                "w-full text-left px-3 py-2 text-sm rounded-md hover:bg-muted transition-colors",
                city.toLowerCase() === safeValue.trim().toLowerCase() &&
                  "bg-muted font-medium",
              )}>
              {city}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
