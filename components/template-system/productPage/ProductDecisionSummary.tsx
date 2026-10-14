import { useMinimalI18n } from "#root/lib/i18n/MinimalI18nContext";
import { cn } from "#root/lib/utils";
import { needsNoPiercing } from "#root/shared/products/no-piercing";

export interface DecisionSummaryProduct {
  categoryName?: string | null;
  categories?: readonly { id?: string; name: string }[] | null;
  specifications?: readonly { label: string; value: string }[] | null;
}

export interface DecisionSummaryRow {
  key: string;
  label: string;
  value: string;
}

/** Specification labels worth surfacing before the purchase decision. */
const KEY_SPEC = /material|metal|gauge|size|length|diameter|sold as/i;

/**
 * The short facts a shopper needs before Add to Bag, from data the product
 * actually has: its categories (placement), "No piercing needed" when a
 * category says so, and up to three key specifications when any exist.
 * Options are NOT repeated here — the option selector sits right below.
 * Nothing is inferred from the title or description.
 */
export function decisionSummaryRows(product: DecisionSummaryProduct, t: (key: string) => string): DecisionSummaryRow[] {
  const rows: DecisionSummaryRow[] = [];
  const names = [product.categoryName, ...(product.categories ?? []).map((c) => c.name)]
    .map((n) => n?.trim())
    .filter((n): n is string => Boolean(n));
  const unique = [...new Map(names.map((n) => [n.toLowerCase(), n])).values()];
  if (unique.length > 0) rows.push({ key: "category", label: t("product.summary_category"), value: unique.join(" · ") });
  if (needsNoPiercing(product)) {
    rows.push({ key: "piercing", label: t("product.summary_piercing"), value: t("product.no_piercing_needed") });
  }
  for (const spec of (product.specifications ?? []).filter((s) => KEY_SPEC.test(s.label) && s.value.trim()).slice(0, 3)) {
    rows.push({ key: `spec-${spec.label}`, label: spec.label, value: spec.value });
  }
  return rows;
}

export function ProductDecisionSummary({ product, className }: { product: DecisionSummaryProduct; className?: string }) {
  const { t } = useMinimalI18n();
  const rows = decisionSummaryRows(product, t);
  if (rows.length === 0) return null;
  return (
    <dl
      aria-label={t("product.summary_label")}
      className={cn("grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px] leading-snug", className)}
      data-testid="decision-summary">
      {rows.map((row) => (
        <div key={row.key} className="contents">
          <dt className="text-perce-ink-muted">{row.label}</dt>
          <dd className="font-medium text-perce-ink">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
