"use client";

import type * as React from "react";
import { cn } from "#root/lib/utils";
import { fieldClass } from "#root/components/storefront/Field";
import {
  EGYPT_GOVERNORATES,
  governorateLabel,
  isGovernorateCode,
  type GovernorateCode,
} from "#root/shared/shipping/egypt-governorates";

export interface GovernorateSelectProps
  extends Omit<React.ComponentProps<"select">, "value" | "onChange"> {
  value: GovernorateCode | null;
  onChange: (code: GovernorateCode | null) => void;
  locale?: "en" | "ar";
  placeholder?: string;
}

/**
 * The checkout governorate picker — a native <select> over the canonical
 * list (shared/shipping/egypt-governorates.ts), so the value sent to the
 * server is always a code the shipping rules can price, never free text.
 *
 * Native rather than a combobox: 27 fixed entries, works with autofill
 * (`address-level1`), keyboard and screen readers without extra wiring, and
 * renders on the server for the static-markup tests.
 */
export function GovernorateSelect({
  value,
  onChange,
  locale = "en",
  placeholder,
  className,
  ...selectProps
}: GovernorateSelectProps) {
  return (
    <select
      {...selectProps}
      data-slot="governorate-select"
      value={value ?? ""}
      onChange={(e) => {
        const next = e.target.value;
        onChange(isGovernorateCode(next) ? next : null);
      }}
      className={cn(fieldClass, "min-w-0", !value && "text-ink-2", className)}>
      <option value="">{placeholder ?? (locale === "ar" ? "اختر المحافظة" : "Select governorate")}</option>
      {EGYPT_GOVERNORATES.map((g) => (
        <option key={g.code} value={g.code}>
          {governorateLabel(g, locale)}
        </option>
      ))}
    </select>
  );
}
