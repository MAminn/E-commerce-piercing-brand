import * as Dialog from "@radix-ui/react-dialog";
import * as Popover from "@radix-ui/react-popover";
import * as Slider from "@radix-ui/react-slider";
import { Check, ChevronDown, SlidersHorizontal, X } from "lucide-react";
import { type ReactNode, useEffect, useId, useState } from "react";
import type { ListingFacets } from "#root/backend/products/listing-facets/compute";
import {
  type CategoryFacetOption,
  type FacetsInput,
  type SelectedCategory,
  useListingFacets,
} from "#root/hooks/useCatalogueListing";
import { useMinimalI18n } from "#root/lib/i18n/MinimalI18nContext";
import { cn } from "#root/lib/utils";
import { formatMoney } from "#root/shared/pricing/format-money";
import {
  EMPTY_FILTERS,
  type ListingFilters,
  activeFilterCount,
} from "#root/shared/products/listing-params";
import { useCategoryT } from "./useCategoryT";

/**
 * Shop filters. Two presentations of one model:
 *   - lg+  : a quiet bar of popovers and toggles that applies instantly;
 *   - <lg  : a "Filter" button opening a drawer with a draft that applies on
 *            "Show N products" (Escape / close discards it).
 *
 * A group only appears when the data behind it can actually narrow the
 * listing: no Price slider over a single price, no "In stock" when nothing
 * is out of stock, no "On sale" with no discounts. A filter that filters
 * nothing is worse than no filter. Active values always stay visible so a
 * shopper can undo them.
 */

export interface FilterModel {
  filters: ListingFilters;
  q: string;
  facets: ListingFacets | null;
  /** /shop's Category filter; empty on category pages (their tabs do that job). */
  categoryOptions: CategoryFacetOption[];
  selectedCategories: SelectedCategory[];
  refToId: (ref: string) => string | undefined;
  onChange: (filters: ListingFilters) => void;
  onClearAll: () => void;
  onClearSearch: () => void;
  facetsInputFor: (filters: ListingFilters) => FacetsInput | null;
}

interface VisibleGroups {
  category: boolean;
  price: boolean;
  inStock: boolean;
  onSale: boolean;
}

export function visibleFilterGroups(model: FilterModel, filters = model.filters): VisibleGroups {
  const f = model.facets;
  return {
    category: model.categoryOptions.length > 0,
    price: !!f?.price && f.price.max > f.price.min,
    inStock: (!!f && f.inStock.count < f.inStock.of) || filters.inStock,
    onSale: (!!f && f.onSale.count > 0) || filters.onSale,
  };
}

export function hasFilterGroups(model: FilterModel): boolean {
  return Object.values(visibleFilterGroups(model)).some(Boolean);
}

/** Toggles a category; picking a main category drops its now-redundant subcategories. */
export function toggleCategory(
  filters: ListingFilters,
  option: CategoryFacetOption,
  refToId: (ref: string) => string | undefined,
): ListingFilters {
  const resolved = filters.categories
    .map((ref) => ({ ref, id: refToId(ref) }))
    .filter((r): r is { ref: string; id: string } => !!r.id);
  const isOn = resolved.some((r) => r.id === option.id);
  const childIds = new Set(option.children.map((c) => c.id));
  const categories = isOn
    ? resolved.filter((r) => r.id !== option.id).map((r) => r.ref)
    : [...resolved.filter((r) => !childIds.has(r.id)).map((r) => r.ref), option.ref];
  return { ...filters, categories };
}

function usePriceLabel() {
  const ct = useCategoryT();
  const { locale } = useMinimalI18n();
  return (min: number | null, max: number | null) => {
    const fmt = (v: number) => formatMoney(v, { locale });
    if (min !== null && max !== null) return `${fmt(min)} – ${fmt(max)}`;
    if (min !== null) return ct("filter.price_from", { min: fmt(min) });
    if (max !== null) return ct("filter.price_to", { max: fmt(max) });
    return "";
  };
}

/* ── Building blocks ─────────────────────────────────────────────────── */

function FacetCheckbox({
  id,
  label,
  count,
  checked,
  disabled,
  hint,
  onChange,
}: {
  id: string;
  label: string;
  count?: number;
  checked: boolean;
  disabled?: boolean;
  hint?: string;
  onChange: () => void;
}) {
  const ct = useCategoryT();
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex min-h-11 cursor-pointer items-center gap-3 text-[length:var(--perce-text-body)] text-perce-ink",
        disabled && "cursor-default text-perce-ink-muted",
      )}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="h-4 w-4 shrink-0 cursor-pointer accent-[var(--perce-ink)] disabled:cursor-default"
      />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count !== undefined && (
        <>
          <span aria-hidden className="tabular-nums text-[length:var(--perce-text-small)] text-perce-ink-muted">
            {count}
          </span>
          <span className="sr-only">
            , {count === 1 ? ct("results.count_one") : ct("results.count", { count })}
          </span>
        </>
      )}
      {hint && (
        <span id={`${id}-hint`} className="sr-only">
          {hint}
        </span>
      )}
    </label>
  );
}

function CategoryFacetList({
  options,
  filters,
  counts,
  refToId,
  onChange,
  idPrefix,
}: {
  options: CategoryFacetOption[];
  filters: ListingFilters;
  counts?: Record<string, number>;
  refToId: (ref: string) => string | undefined;
  onChange: (filters: ListingFilters) => void;
  idPrefix: string;
}) {
  const ct = useCategoryT();
  const selected = new Set(filters.categories.map(refToId).filter(Boolean));
  const countOf = (o: CategoryFacetOption) => (counts ? (counts[o.id] ?? 0) : o.count);
  return (
    <ul>
      {options.map((main) => {
        const mainOn = selected.has(main.id);
        return (
          <li key={main.id}>
            <FacetCheckbox
              id={`${idPrefix}-${main.id}`}
              label={main.name}
              count={countOf(main)}
              checked={mainOn}
              onChange={() => onChange(toggleCategory(filters, main, refToId))}
            />
            {main.children.length > 0 && (
              <ul className="border-s border-perce-line ps-4 ms-2">
                {main.children.map((child) => (
                  <li key={child.id}>
                    <FacetCheckbox
                      id={`${idPrefix}-${child.id}`}
                      label={child.name}
                      count={countOf(child)}
                      // A selected main category already includes every
                      // subcategory: shown ticked, not separately toggleable.
                      checked={mainOn || selected.has(child.id)}
                      disabled={mainOn}
                      hint={mainOn ? ct("filter.includes_all", { name: main.name }) : undefined}
                      onChange={() => onChange(toggleCategory(filters, child, refToId))}
                    />
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}

const PRICE_STEP = 5;

export function PriceRangeField({
  bounds,
  minPrice,
  maxPrice,
  onCommit,
}: {
  bounds: { min: number; max: number };
  minPrice: number | null;
  maxPrice: number | null;
  /** null = that end is unbounded (the slider is at the edge). */
  onCommit: (min: number | null, max: number | null) => void;
}) {
  const ct = useCategoryT();
  const { dir } = useMinimalI18n();
  const id = useId();
  const lo = Math.floor(bounds.min / PRICE_STEP) * PRICE_STEP;
  const hi = Math.ceil(bounds.max / PRICE_STEP) * PRICE_STEP;
  const clamp = (v: number) => Math.min(hi, Math.max(lo, v));
  const a = clamp(minPrice ?? lo);
  const b = clamp(maxPrice ?? hi);

  const [value, setValue] = useState<[number, number]>([a, b]);
  const [text, setText] = useState<[string, string]>([String(a), String(b)]);
  useEffect(() => {
    setValue([a, b]);
    setText([String(a), String(b)]);
  }, [a, b]);

  const commit = (x: number, y: number) => {
    const [low, high] = x <= y ? [x, y] : [y, x];
    onCommit(low <= lo ? null : low, high >= hi ? null : high);
  };

  const commitText = () => {
    const x = Number.parseInt(text[0], 10);
    const y = Number.parseInt(text[1], 10);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      setText([String(value[0]), String(value[1])]);
      return;
    }
    const next: [number, number] = [clamp(Math.min(x, y)), clamp(Math.max(x, y))];
    setValue(next);
    setText([String(next[0]), String(next[1])]);
    if (next[0] !== a || next[1] !== b) commit(next[0], next[1]);
  };

  const inputClass =
    "min-h-11 w-full border border-perce-line-strong bg-perce-surface-raised pe-3 ps-12 text-[length:var(--perce-text-body)] tabular-nums text-perce-ink focus:border-perce-ink focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

  return (
    <div className="space-y-5 pt-1">
      <Slider.Root
        dir={dir}
        min={lo}
        max={hi}
        step={PRICE_STEP}
        value={value}
        minStepsBetweenThumbs={0}
        onValueChange={(v) => {
          const next: [number, number] = [v[0] ?? lo, v[1] ?? hi];
          setValue(next);
          setText([String(next[0]), String(next[1])]);
        }}
        onValueCommit={(v) => commit(v[0] ?? lo, v[1] ?? hi)}
        className="relative flex h-6 w-full touch-none select-none items-center">
        <Slider.Track className="relative h-px grow bg-perce-line-strong">
          <Slider.Range className="absolute h-px bg-perce-ink" />
        </Slider.Track>
        {[ct("filter.min"), ct("filter.max")].map((label) => (
          <Slider.Thumb
            key={label}
            aria-label={label}
            className="block h-5 w-5 rounded-full border border-perce-ink bg-perce-surface-raised transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--perce-focus)]"
          />
        ))}
      </Slider.Root>
      <div className="grid grid-cols-2 gap-3">
        {([0, 1] as const).map((i) => (
          <div key={i}>
            <label htmlFor={`${id}-${i}`} className="perce-eyebrow mb-1.5 block">
              {i === 0 ? ct("filter.min") : ct("filter.max")}
            </label>
            <div className="relative">
              <span
                aria-hidden
                className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-[length:var(--perce-text-small)] text-perce-ink-muted">
                {ct("filter.currency")}
              </span>
              <input
                id={`${id}-${i}`}
                type="number"
                inputMode="numeric"
                min={lo}
                max={hi}
                step={1}
                value={text[i]}
                onChange={(e) => {
                  const next: [string, string] = [...text];
                  next[i] = e.target.value;
                  setText(next);
                }}
                onBlur={commitText}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commitText();
                  }
                }}
                className={inputClass}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Desktop: bar of popovers and toggles ───────────────────────────── */

const triggerClass =
  "inline-flex min-h-11 items-center gap-2 border px-4 text-[length:var(--perce-text-small)] font-medium transition-colors";

function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      aria-hidden
      className="inline-flex h-5 min-w-5 items-center justify-center bg-perce-ink px-1 text-[11px] leading-none tabular-nums text-perce-ink-inverse">
      {count}
    </span>
  );
}

function FilterPopover({
  label,
  count,
  active = count > 0,
  children,
  onClear,
}: {
  label: string;
  count: number;
  /** Styled as applied (defaults to count > 0). */
  active?: boolean;
  children: ReactNode;
  onClear?: () => void;
}) {
  const ct = useCategoryT();
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={cn(
            triggerClass,
            "group data-[state=open]:border-perce-ink",
            active
              ? "border-perce-ink text-perce-ink"
              : "border-perce-line-strong text-perce-ink-secondary hover:border-perce-ink hover:text-perce-ink",
          )}>
          {label}
          <CountBadge count={count} />
          {count > 0 && <span className="sr-only">, {ct("filter.active_count", { count })}</span>}
          <ChevronDown aria-hidden className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={8}
          collisionPadding={16}
          className="z-[10001] w-80 border border-perce-line bg-perce-surface-raised p-5 shadow-[0_12px_32px_-12px_rgba(14,14,14,0.18)] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0">
          <div className="max-h-[min(60vh,28rem)] overflow-y-auto">{children}</div>
          {onClear && active && (
            <div className="mt-3 border-t border-perce-line pt-3">
              <button
                type="button"
                onClick={onClear}
                className="perce-underline inline-flex min-h-9 items-center text-[length:var(--perce-text-small)] font-medium text-perce-ink">
                {ct("filter.clear_all")}
              </button>
            </div>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function ToggleFilter({
  pressed,
  label,
  onToggle,
}: {
  pressed: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onToggle}
      className={cn(
        triggerClass,
        pressed
          ? "border-perce-ink text-perce-ink"
          : "border-perce-line-strong text-perce-ink-secondary hover:border-perce-ink hover:text-perce-ink",
      )}>
      {pressed && <Check aria-hidden className="h-4 w-4" />}
      {label}
    </button>
  );
}

export function DesktopFilterBar({ model }: { model: FilterModel }) {
  const ct = useCategoryT();
  const priceLabel = usePriceLabel();
  const { filters, facets, onChange } = model;
  const groups = visibleFilterGroups(model);
  if (!Object.values(groups).some(Boolean)) return null;
  const priceActive = filters.minPrice !== null || filters.maxPrice !== null;

  return (
    <fieldset className="flex min-w-0 flex-wrap items-center gap-2 border-0 p-0">
      <legend className="sr-only">{ct("filter.label")}</legend>
      {groups.category && (
        <FilterPopover
          label={ct("filter.category")}
          count={model.selectedCategories.length}
          onClear={() => onChange({ ...filters, categories: [] })}>
          <CategoryFacetList
            options={model.categoryOptions}
            filters={filters}
            refToId={model.refToId}
            onChange={onChange}
            idPrefix="bar-cat"
          />
        </FilterPopover>
      )}
      {groups.price && facets?.price && (
        <FilterPopover
          label={priceActive ? priceLabel(filters.minPrice, filters.maxPrice) : ct("filter.price")}
          count={0}
          active={priceActive}
          onClear={() => onChange({ ...filters, minPrice: null, maxPrice: null })}>
          <PriceRangeField
            bounds={facets.price}
            minPrice={filters.minPrice}
            maxPrice={filters.maxPrice}
            onCommit={(minPrice, maxPrice) => onChange({ ...filters, minPrice, maxPrice })}
          />
        </FilterPopover>
      )}
      {groups.inStock && (
        <ToggleFilter
          pressed={filters.inStock}
          label={ct("filter.in_stock")}
          onToggle={() => onChange({ ...filters, inStock: !filters.inStock })}
        />
      )}
      {groups.onSale && (
        <ToggleFilter
          pressed={filters.onSale}
          label={ct("filter.on_sale")}
          onToggle={() => onChange({ ...filters, onSale: !filters.onSale })}
        />
      )}
    </fieldset>
  );
}

/* ── Mobile / tablet: button + drawer ───────────────────────────────── */

export function FilterButton({
  count,
  onClick,
  className,
}: {
  count: number;
  onClick: () => void;
  className?: string;
}) {
  const ct = useCategoryT();
  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup="dialog"
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 border border-perce-line-strong bg-perce-surface-raised px-4 text-[length:var(--perce-text-body)] font-medium text-perce-ink transition-colors hover:border-perce-ink",
        className,
      )}>
      <SlidersHorizontal aria-hidden className="h-4 w-4" />
      {ct("filter.button")}
      <CountBadge count={count} />
      {count > 0 && <span className="sr-only">, {ct("filter.active_count", { count })}</span>}
    </button>
  );
}

function DrawerGroup({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  const id = useId();
  return (
    <section className="border-b border-perce-line last:border-b-0">
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((v) => !v)}
          className="flex min-h-14 w-full items-center justify-between text-[length:var(--perce-text-body)] font-medium text-perce-ink">
          {title}
          <ChevronDown aria-hidden className={cn("h-4 w-4 text-perce-ink-muted transition-transform", open && "rotate-180")} />
        </button>
      </h3>
      <div id={id} hidden={!open} className="pb-5">
        {children}
      </div>
    </section>
  );
}

export function MobileFilterDrawer({
  model,
  open,
  onOpenChange,
}: {
  model: FilterModel;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const ct = useCategoryT();
  const { dir } = useMinimalI18n();
  const [draft, setDraft] = useState<ListingFilters>(model.filters);

  // Every opening starts from what is applied; closing without "Show"
  // discards the draft.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset only when the drawer opens
  useEffect(() => {
    if (open) setDraft(model.filters);
  }, [open]);

  const draftFacets = useListingFacets(open ? model.facetsInputFor(draft) : null);
  const f = draftFacets.data ?? draftFacets.previous ?? model.facets;
  const count = draftFacets.data?.total;
  const groups = visibleFilterGroups(model, draft);

  const applyLabel =
    count === undefined
      ? ct("filter.apply_count", { count: "…" })
      : count === 0
        ? ct("filter.apply_none")
        : count === 1
          ? ct("filter.apply_count_one")
          : ct("filter.apply_count", { count });

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[10001] bg-[rgba(14,14,14,0.4)] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <Dialog.Content
          dir={dir}
          aria-describedby={undefined}
          data-testid="filter-drawer"
          className={cn(
            "fixed inset-y-0 z-[10001] flex w-full max-w-md flex-col bg-perce-bg shadow-[0_0_48px_-12px_rgba(14,14,14,0.3)] focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:duration-300 data-[state=closed]:duration-200",
            dir === "rtl"
              ? "left-0 data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left"
              : "right-0 data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right",
          )}>
          <div className="flex items-center justify-between border-b border-perce-line px-5 py-3">
            <Dialog.Title className="text-[length:var(--perce-text-h3)] font-medium tracking-[var(--perce-tracking-heading)] text-perce-ink">
              {ct("filter.title")}
            </Dialog.Title>
            <Dialog.Close
              aria-label={ct("filter.close")}
              className="-me-3 inline-flex h-11 w-11 items-center justify-center text-perce-ink-muted transition-colors hover:text-perce-ink">
              <X aria-hidden className="h-5 w-5" />
            </Dialog.Close>
          </div>

          <div className="flex-1 overflow-y-auto overscroll-contain px-5">
            {groups.category && (
              <DrawerGroup title={ct("filter.category")}>
                <CategoryFacetList
                  options={model.categoryOptions}
                  filters={draft}
                  counts={f?.categories}
                  refToId={model.refToId}
                  onChange={setDraft}
                  idPrefix="drawer-cat"
                />
              </DrawerGroup>
            )}
            {groups.price && model.facets?.price && (
              <DrawerGroup title={ct("filter.price")}>
                <PriceRangeField
                  bounds={model.facets.price}
                  minPrice={draft.minPrice}
                  maxPrice={draft.maxPrice}
                  onCommit={(minPrice, maxPrice) => setDraft((d) => ({ ...d, minPrice, maxPrice }))}
                />
              </DrawerGroup>
            )}
            {groups.inStock && (
              <DrawerGroup title={ct("filter.availability")}>
                <FacetCheckbox
                  id="drawer-in-stock"
                  label={ct("filter.in_stock")}
                  count={f?.inStock.count}
                  checked={draft.inStock}
                  onChange={() => setDraft((d) => ({ ...d, inStock: !d.inStock }))}
                />
              </DrawerGroup>
            )}
            {groups.onSale && (
              <DrawerGroup title={ct("filter.offers")}>
                <FacetCheckbox
                  id="drawer-on-sale"
                  label={ct("filter.on_sale")}
                  count={f?.onSale.count}
                  checked={draft.onSale}
                  onChange={() => setDraft((d) => ({ ...d, onSale: !d.onSale }))}
                />
              </DrawerGroup>
            )}
          </div>

          <div className="grid grid-cols-[auto_1fr] items-center gap-3 border-t border-perce-line px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={() => setDraft(EMPTY_FILTERS)}
              disabled={activeFilterCount(draft) === 0}
              className="perce-underline-hover inline-flex min-h-12 items-center px-1 text-[length:var(--perce-text-small)] font-medium text-perce-ink disabled:cursor-not-allowed disabled:opacity-40">
              {ct("filter.clear_all")}
            </button>
            <button
              type="button"
              onClick={() => {
                model.onChange(draft);
                onOpenChange(false);
              }}
              aria-live="polite"
              className="inline-flex min-h-12 items-center justify-center bg-perce-cta px-5 text-[length:var(--perce-text-small)] font-medium text-perce-cta-ink transition-colors hover:bg-perce-cta-hover">
              {applyLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/* ── Active filter chips ─────────────────────────────────────────────── */

export function ActiveFilterChips({ model }: { model: FilterModel }) {
  const ct = useCategoryT();
  const priceLabel = usePriceLabel();
  const { filters, onChange } = model;

  const chips: { key: string; label: string; remove: () => void }[] = [
    ...model.selectedCategories.map((c) => ({
      key: `cat-${c.id}`,
      label: c.name,
      remove: () =>
        onChange({
          ...filters,
          categories: filters.categories.filter((ref) => model.refToId(ref) !== c.id),
        }),
    })),
  ];
  if (filters.minPrice !== null || filters.maxPrice !== null) {
    chips.push({
      key: "price",
      label: priceLabel(filters.minPrice, filters.maxPrice),
      remove: () => onChange({ ...filters, minPrice: null, maxPrice: null }),
    });
  }
  if (filters.inStock) {
    chips.push({
      key: "stock",
      label: ct("filter.in_stock"),
      remove: () => onChange({ ...filters, inStock: false }),
    });
  }
  if (filters.onSale) {
    chips.push({
      key: "sale",
      label: ct("filter.on_sale"),
      remove: () => onChange({ ...filters, onSale: false }),
    });
  }
  if (model.q) {
    chips.push({ key: "q", label: ct("filter.search_chip", { q: model.q }), remove: model.onClearSearch });
  }
  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="active-filters">
      <h2 className="sr-only">{ct("filter.active")}</h2>
      <ul className="contents">
        {chips.map((chip) => (
          <li key={chip.key}>
            <button
              type="button"
              onClick={chip.remove}
              aria-label={ct("filter.remove", { label: chip.label })}
              className="inline-flex min-h-9 max-w-[16rem] items-center gap-2 bg-perce-surface px-3 text-[length:var(--perce-text-small)] text-perce-ink transition-colors hover:bg-perce-border">
              <span className="truncate">{chip.label}</span>
              <X aria-hidden className="h-3.5 w-3.5 shrink-0 text-perce-ink-muted" />
            </button>
          </li>
        ))}
      </ul>
      {chips.length > 1 && (
        <button
          type="button"
          onClick={model.onClearAll}
          className="perce-underline ms-1 inline-flex min-h-9 items-center text-[length:var(--perce-text-small)] font-medium text-perce-ink">
          {ct("filter.clear_all")}
        </button>
      )}
    </div>
  );
}
