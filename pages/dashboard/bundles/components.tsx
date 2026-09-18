import { useEffect, useMemo, useState } from "react";
import slugify from "slug";
import { toast } from "sonner";
import { Check, ChevronsUpDown, GripVertical, Layers, Loader2, Sparkles, X } from "lucide-react";
import { trpc } from "#root/shared/trpc/client";
import { STORE_CURRENCY } from "#root/shared/config/branding";
import type { BundleCampaignDto } from "#root/backend/bundles/service";
import {
  type BundleCampaignType,
  type BundleTier,
  curatedUnitCount,
  describeBundleCampaign,
  sortTiers,
  validateBundleCampaignConfig,
  validateBundleCampaignSchedule,
  validateBundleTiers,
} from "#root/shared/bundles/evaluate";
import {
  type BundleEligibilityMode,
  modeUsesDynamic,
  modeUsesManual,
  validateEligibilityRules,
} from "#root/shared/bundles/eligibility";
import { Button } from "#root/components/ui/button";
import { Badge } from "#root/components/ui/badge";
import { Checkbox } from "#root/components/ui/checkbox";
import { Input } from "#root/components/ui/input";
import { Label } from "#root/components/ui/label";
import { Switch } from "#root/components/ui/switch";
import { Textarea } from "#root/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#root/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#root/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "#root/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "#root/components/ui/popover";
import { CategoryImageUpload } from "#root/components/file-uploads/CategoryImageUpload";
import { cn } from "#root/lib/utils";
import {
  type OptionStrikethroughMap,
  type PurchasableOptionGroup,
  type SelectedOptions,
  requiresOptionSelection,
  resolvePurchasableLinePrice,
  resolveSelectedOptions,
  toPurchasableOptionGroups,
} from "#root/shared/products/options";

// ─── Types ────────────────────────────────────────────────────────────────────

export type BundleCampaign = BundleCampaignDto;

export interface EligibleProductOption {
  id: string;
  name: string;
  price: number;
  discountPrice: number | null;
  stock: number;
  hidden: boolean;
  deleted: boolean;
  imageUrl: string | null;
  /** Units in a curated stack; always 1 in a build-your-stack pool. */
  quantity: number;
  /** Phase 7: the product's option groups (empty for a simple product). */
  optionGroups: PurchasableOptionGroup[];
  /** Curated composition only: the exact variant fixed for this line. Null for a simple product / a BYS pool row. */
  selectedOptions: SelectedOptions | null;
}

export const effectiveUnitPrice = (p: Pick<EligibleProductOption, "price" | "discountPrice">): number =>
  p.discountPrice !== null && p.discountPrice < p.price ? p.discountPrice : p.price;

/**
 * A curated line's regular unit price: effective price plus its fixed
 * variant's modifiers — the same helper the server prices with. Falls back to
 * the base price while the variant is still unchosen/invalid.
 */
export const lineUnitPrice = (p: Pick<EligibleProductOption, "price" | "discountPrice" | "optionGroups" | "selectedOptions">): number => {
  const resolved = resolveSelectedOptions(p.optionGroups, p.selectedOptions);
  return resolved.ok ? resolvePurchasableLinePrice(effectiveUnitPrice(p), resolved.priceModifier) : effectiveUnitPrice(p);
};

/** Why a curated line cannot be sold as configured, for the admin. Null when it can. */
export function compositionLineProblem(p: Pick<EligibleProductOption, "name" | "optionGroups" | "selectedOptions">): string | null {
  if (!requiresOptionSelection(p.optionGroups)) return null;
  const resolved = resolveSelectedOptions(p.optionGroups, p.selectedOptions);
  if (resolved.ok) return null;
  switch (resolved.code) {
    case "option_required":
      return `Choose a ${resolved.optionName} for "${p.name}".`;
    case "option_not_found":
      return `"${resolved.value}" is no longer a ${resolved.optionName} of "${p.name}".`;
    case "option_unavailable":
      return `The ${resolved.optionName} "${resolved.value}" of "${p.name}" is unavailable in the store settings.`;
  }
}

// ─── Date helpers (datetime-local wants LOCAL wall time, not the UTC ISO slice) ─

function toLocalInputValue(value: Date | string | null): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInputValue(value: string): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ─── Product picker (pool or composition) ─────────────────────────────────────

/**
 * Searchable multi-select over the (admin) product catalogue. Only the current
 * page of search results is rendered — never the whole catalogue — so it stays
 * usable at any store size. Selected products are listed below in the order
 * the shopper will see them, with move up/down and remove. With
 * `withQuantities` each row also gets a unit count and a line total (the
 * curated composition builder).
 */
export function EligibleProductPicker({
  selected,
  onChange,
  withQuantities = false,
}: {
  selected: EligibleProductOption[];
  onChange: (next: EligibleProductOption[]) => void;
  withQuantities?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<EligibleProductOption[]>([]);
  const [searching, setSearching] = useState(false);
  /** Store-wide struck-through option values, so the variant pickers mirror the storefront. */
  const [strikethrough, setStrikethrough] = useState<OptionStrikethroughMap>({});

  useEffect(() => {
    if (!withQuantities) return;
    trpc.settings.getVariantPresets
      .query()
      .then((res) => {
        if (!res.success || !Array.isArray(res.result)) return;
        const map: Record<string, string[]> = {};
        for (const preset of res.result as { name: string; strikethroughValues?: string[] }[]) {
          if (preset.strikethroughValues?.length) map[preset.name] = preset.strikethroughValues;
        }
        setStrikethrough(map);
      })
      .catch(() => {});
  }, [withQuantities]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setSearching(true);
    const handle = window.setTimeout(() => {
      trpc.product.view
        .query({ search: search || undefined, limit: 25, includeHidden: true })
        .then((res) => {
          if (cancelled || !res.success || !res.result) return;
          setResults(
            res.result.products.map((row) => ({
              id: row.product.id,
              name: row.product.name,
              price: Number(row.product.price),
              discountPrice: row.product.discountPrice === null ? null : Number(row.product.discountPrice),
              stock: row.product.stock,
              hidden: row.product.hidden,
              deleted: row.product.deleted,
              imageUrl: row.file?.diskname ?? null,
              quantity: 1,
              optionGroups: toPurchasableOptionGroups(row.variants ?? [], strikethrough),
              selectedOptions: null,
            })),
          );
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [search, open, strikethrough]);

  const selectedIds = useMemo(() => new Set(selected.map((p) => p.id)), [selected]);

  /** Curated: fix one value of one option group on a line. Never guesses the others. */
  function setLineOption(id: string, optionName: string, value: string) {
    onChange(
      selected.map((p) =>
        p.id === id ? { ...p, selectedOptions: { ...(p.selectedOptions ?? {}), [optionName]: value } } : p,
      ),
    );
  }

  function toggle(option: EligibleProductOption) {
    if (selectedIds.has(option.id)) onChange(selected.filter((p) => p.id !== option.id));
    // A freshly added product starts with NO variant chosen — switching
    // products can never carry a stale selection across.
    else onChange([...selected, { ...option, quantity: 1, selectedOptions: null }]);
  }

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= selected.length) return;
    const next = [...selected];
    const [item] = next.splice(index, 1);
    if (!item) return;
    next.splice(target, 0, item);
    onChange(next);
  }

  function setQuantity(id: string, quantity: number) {
    onChange(selected.map((p) => (p.id === id ? { ...p, quantity: Math.max(1, Math.min(100, Math.floor(quantity) || 1)) } : p)));
  }

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal">
            {selected.length === 0
              ? "Search and add products…"
              : `${selected.length} product${selected.length > 1 ? "s" : ""} — add more`}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[440px] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput placeholder="Search products by name…" value={search} onValueChange={setSearch} />
            <CommandList>
              {searching && <CommandEmpty>Searching…</CommandEmpty>}
              {!searching && results.length === 0 && <CommandEmpty>No products found.</CommandEmpty>}
              <CommandGroup>
                {results.map((p) => (
                  <CommandItem key={p.id} value={p.id} onSelect={() => toggle(p)}>
                    <Check className={cn("mr-2 h-4 w-4", selectedIds.has(p.id) ? "opacity-100" : "opacity-0")} />
                    <span className="flex-1 truncate">{p.name}</span>
                    <span className="ml-2 text-xs text-muted-foreground tabular-nums">
                      {effectiveUnitPrice(p).toFixed(2)} {STORE_CURRENCY}
                    </span>
                    {p.hidden && (
                      <Badge variant="outline" className="ml-2 text-[10px]">
                        Hidden
                      </Badge>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {selected.length > 0 && (
        <ul className="divide-y rounded-md border">
          {selected.map((p, index) => {
            const unit = withQuantities ? lineUnitPrice(p) : effectiveUnitPrice(p);
            const stockShort = !p.deleted && p.stock < p.quantity;
            const variantProblem = withQuantities ? compositionLineProblem(p) : null;
            return (
              <li key={p.id} className="flex flex-wrap items-center gap-2 px-2 py-1.5 text-sm">
                <GripVertical className="h-4 w-4 text-muted-foreground/50" />
                {p.imageUrl ? (
                  <img src={`/uploads/${p.imageUrl}`} alt="" className="h-8 w-8 rounded object-cover" />
                ) : (
                  <div className="h-8 w-8 rounded bg-muted" />
                )}
                <div className="min-w-0 flex-1">
                  <span className="block truncate">{p.name}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {unit.toFixed(2)} {STORE_CURRENCY}
                    {withQuantities && p.quantity > 1 && ` × ${p.quantity} = ${(unit * p.quantity).toFixed(2)} ${STORE_CURRENCY}`}
                    {" · "}
                    {p.stock} in stock
                  </span>
                </div>
                {withQuantities && (
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    value={p.quantity}
                    onChange={(e) => setQuantity(p.id, Number(e.target.value))}
                    className="h-8 w-16 text-center"
                    aria-label={`Quantity of ${p.name}`}
                  />
                )}
                {p.deleted && <Badge variant="destructive">Deleted</Badge>}
                {!p.deleted && p.hidden && <Badge variant="outline">Hidden</Badge>}
                {!p.deleted && p.stock <= 0 && <Badge variant="outline">Out of stock</Badge>}
                {stockShort && p.stock > 0 && <Badge variant="destructive">Only {p.stock} in stock</Badge>}
                {variantProblem && <Badge variant="destructive">Variant needed</Badge>}
                <div className="flex items-center">
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={index === 0} onClick={() => move(index, -1)} aria-label="Move up">
                    ↑
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={index === selected.length - 1} onClick={() => move(index, 1)} aria-label="Move down">
                    ↓
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onChange(selected.filter((s) => s.id !== p.id))} aria-label="Remove">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                {/* Curated stacks fix the EXACT variant of every line with
                    options — one native select per option group, stored as
                    the option identity (group → value), never as display
                    text. Struck-through values stay listed but disabled. */}
                {withQuantities && requiresOptionSelection(p.optionGroups) && (
                  <div className="flex w-full flex-wrap items-center gap-2 ps-6 pb-1">
                    {p.optionGroups.map((group) => {
                      const current = p.selectedOptions?.[group.name] ?? "";
                      const known = group.values.some((v) => v.value === current);
                      return (
                        <label key={group.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          {group.name}
                          <select
                            value={known ? current : ""}
                            onChange={(e) => setLineOption(p.id, group.name, e.target.value)}
                            aria-label={`${group.name} of ${p.name}`}
                            className={cn(
                              "h-8 rounded-md border bg-background px-2 text-sm text-foreground",
                              !known && "border-destructive",
                            )}>
                            <option value="" disabled>
                              Choose…
                            </option>
                            {group.values.map((v) => (
                              <option key={v.value} value={v.value} disabled={!v.available}>
                                {v.value}
                                {v.priceModifier ? ` (+${v.priceModifier.toFixed(2)})` : ""}
                                {v.available ? "" : " — unavailable"}
                              </option>
                            ))}
                          </select>
                        </label>
                      );
                    })}
                    {variantProblem && <span className="text-xs text-destructive">{variantProblem}</span>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ─── Category placement picker ────────────────────────────────────────────────

/**
 * Used for BOTH category relations, which are deliberately separate things:
 * merchandising placement (where a campaign is promoted) and dynamic
 * eligibility (which products a rule accepts). Same control, different field.
 */
function CategoryMultiPicker({ selectedIds, onChange }: { selectedIds: string[]; onChange: (ids: string[]) => void }) {
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    trpc.category.view
      .query()
      .then((res) => {
        if (res.success && res.result) setCategories(res.result.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })));
      })
      .catch(() => {});
  }, []);
  if (categories.length === 0) return <p className="text-xs text-muted-foreground">No categories yet.</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {categories.map((c) => {
        const checked = selectedIds.includes(c.id);
        return (
          <label key={c.id} className={cn("flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm", checked && "border-primary bg-muted")}>
            <Checkbox checked={checked} onCheckedChange={(v) => onChange(v ? [...selectedIds, c.id] : selectedIds.filter((id) => id !== c.id))} />
            {c.name}
          </label>
        );
      })}
    </div>
  );
}

// ─── Campaign form ────────────────────────────────────────────────────────────

export interface CampaignFormState {
  type: BundleCampaignType;
  internalName: string;
  title: string;
  slug: string;
  /** Once the admin edits the slug by hand we stop deriving it from the title. */
  slugTouched: boolean;
  subtitle: string;
  description: string;
  badgeText: string;
  imageId: string | null;
  imageUrl: string | null;
  isActive: boolean;
  /**
   * Build Your Stack pricing tiers. Strings so a half-typed row does not fight
   * the input; parsed and validated in `buildCampaignPayload`.
   */
  tiers: { quantity: string; price: string }[];
  /** Legacy single-quantity field, still used by the curated form. */
  requiredQuantity: string;
  /** Curated stacks: THE price. Build Your Stack derives it from the lowest tier. */
  fixedBundlePrice: string;
  allowDuplicates: boolean;
  maxPerProduct: string;
  isRepeatable: boolean;
  offerStacking: "exclusive" | "stackable";
  sortOrder: string;
  startsAt: string;
  endsAt: string;
  /** Build-your-stack pool. */
  eligibleProducts: EligibleProductOption[];
  /** Curated composition (with quantities). */
  composition: EligibleProductOption[];
  /** Merchandising placement — never eligibility. */
  categoryIds: string[];
  /** Build Your Stack eligibility (Phase 4). Curated stacks force `manual`. */
  eligibilityMode: BundleEligibilityMode;
  /** Dynamic rule: eligible categories (OR'd with each other). */
  eligibilityCategoryIds: string[];
  /** Dynamic rule: inclusive effective-price bounds, AND'd with the categories. */
  eligibilityMinPrice: string;
  eligibilityMaxPrice: string;
}

export const emptyCampaignForm: CampaignFormState = {
  type: "build_your_stack",
  internalName: "",
  title: "",
  slug: "",
  slugTouched: false,
  subtitle: "",
  description: "",
  badgeText: "",
  imageId: null,
  imageUrl: null,
  isActive: false,
  tiers: [{ quantity: "6", price: "" }],
  requiredQuantity: "6",
  fixedBundlePrice: "",
  allowDuplicates: false,
  maxPerProduct: "",
  isRepeatable: false,
  offerStacking: "exclusive",
  sortOrder: "0",
  startsAt: "",
  endsAt: "",
  eligibleProducts: [],
  composition: [],
  categoryIds: [],
  eligibilityMode: "manual",
  eligibilityCategoryIds: [],
  eligibilityMinPrice: "",
  eligibilityMaxPrice: "",
};

export function campaignToForm(c: BundleCampaign): CampaignFormState {
  const products: EligibleProductOption[] = c.eligibleProducts.map((p) => ({
    id: p.productId,
    name: p.name,
    price: p.price,
    discountPrice: p.discountPrice,
    stock: p.stock,
    hidden: p.hidden,
    deleted: p.deleted,
    imageUrl: p.imageUrl,
    quantity: p.quantity,
    optionGroups: p.optionGroups,
    selectedOptions: p.selectedOptions,
  }));
  const isCurated = c.type === "curated_stack";
  return {
    type: c.type,
    internalName: c.internalName,
    title: c.title,
    slug: c.slug,
    slugTouched: true,
    subtitle: c.subtitle ?? "",
    description: c.description ?? "",
    badgeText: c.badgeText ?? "",
    imageId: c.imageId,
    imageUrl: c.imageUrl,
    isActive: c.isActive,
    // Tiers come back ascending from the service. A campaign that predates
    // Phase 5 was backfilled with exactly one tier, so its form looks the same
    // as it always did — one quantity, one price.
    tiers:
      isCurated || c.tiers.length === 0
        ? [{ quantity: String(c.requiredQuantity || 6), price: c.fixedBundlePrice === null ? "" : String(c.fixedBundlePrice) }]
        : c.tiers.map((tier) => ({ quantity: String(tier.quantity), price: String(tier.price) })),
    requiredQuantity: String(c.requiredQuantity || 6),
    fixedBundlePrice: c.fixedBundlePrice === null ? "" : String(c.fixedBundlePrice),
    allowDuplicates: isCurated ? false : c.allowDuplicates,
    maxPerProduct: c.maxPerProduct === null ? "" : String(c.maxPerProduct),
    isRepeatable: c.isRepeatable,
    offerStacking: c.offerStacking,
    sortOrder: String(c.sortOrder),
    startsAt: toLocalInputValue(c.startsAt),
    endsAt: toLocalInputValue(c.endsAt),
    eligibleProducts: isCurated ? [] : products.map((p) => ({ ...p, quantity: 1 })),
    composition: isCurated ? products : [],
    categoryIds: c.categoryIds,
    eligibilityMode: isCurated ? "manual" : c.eligibilityMode,
    eligibilityCategoryIds: c.eligibilityCategoryIds,
    eligibilityMinPrice: c.eligibilityMinPrice === null ? "" : String(c.eligibilityMinPrice),
    eligibilityMaxPrice: c.eligibilityMaxPrice === null ? "" : String(c.eligibilityMaxPrice),
  };
}

export type CampaignPayload = {
  type: BundleCampaignType;
  internalName: string;
  title: string;
  slug: string;
  subtitle?: string;
  description?: string;
  badgeText?: string;
  imageId: string | null;
  isActive: boolean;
  requiredQuantity?: number;
  tiers: { quantity: number; price: number }[];
  fixedBundlePrice?: number;
  allowDuplicates: boolean;
  maxPerProduct: number | null;
  isRepeatable: boolean;
  offerStacking: "exclusive" | "stackable";
  sortOrder: number;
  startsAt: Date | null;
  endsAt: Date | null;
  eligibleProductIds: string[];
  composition: { productId: string; quantity: number; selectedOptions?: SelectedOptions | null }[];
  categoryIds: string[];
  eligibilityMode: BundleEligibilityMode;
  eligibilityCategoryIds: string[];
  eligibilityMinPrice: number | null;
  eligibilityMaxPrice: number | null;
};

/**
 * Turns the form into the tRPC payload, or returns the first problem. Runs the
 * same domain invariants the server enforces so the admin sees the reason
 * before a round-trip — the server remains the authority.
 */
export function buildCampaignPayload(form: CampaignFormState): { payload: CampaignPayload } | { error: string } {
  const isCurated = form.type === "curated_stack";
  const internalName = form.internalName.trim();
  const title = form.title.trim();
  const slug = form.slug.trim();
  if (!internalName) return { error: "Internal name is required." };
  if (!title) return { error: "Customer-facing title is required." };
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return { error: "Slug may only contain lowercase letters, numbers and single hyphens." };
  }

  // Curated: every line with option groups must fix a variant that resolves
  // against the product's CURRENT options. Same check the server repeats.
  if (isCurated) {
    for (const p of form.composition) {
      const problem = compositionLineProblem(p);
      if (problem) return { error: problem };
    }
  }
  const composition = form.composition.map((p) => ({
    productId: p.id,
    quantity: p.quantity,
    selectedOptions: requiresOptionSelection(p.optionGroups) ? (p.selectedOptions ?? null) : null,
  }));
  const maxPerProduct = !isCurated && form.allowDuplicates && form.maxPerProduct.trim() !== "" ? Number(form.maxPerProduct) : null;
  const sortOrder = Number(form.sortOrder || 0);
  if (!Number.isInteger(sortOrder) || sortOrder < 0) return { error: "Sort order must be a whole number ≥ 0." };

  // ── Pricing ─────────────────────────────────────────────────────────────
  // Curated: one quantity (from the composition) at one price.
  // Build Your Stack: the tier rows. Every row must parse before anything is
  // sent, and the tier invariants are the SAME domain function the server
  // enforces, so the admin sees the real message without a round trip.
  const tiers: { quantity: number; price: number }[] = [];
  if (!isCurated) {
    for (const row of form.tiers) {
      if (row.quantity.trim() === "" && row.price.trim() === "") continue;
      const quantity = Number(row.quantity);
      const price = Number(row.price);
      if (!Number.isFinite(quantity)) return { error: "Every tier needs a quantity." };
      if (!Number.isFinite(price)) return { error: "Every tier needs a price." };
      tiers.push({ quantity, price });
    }
    const tierError = validateBundleTiers(
      tiers.map((tier) => ({ id: null, ...tier })),
      { requireAtLeastOne: form.isActive },
    );
    if (tierError) return { error: tierError };
    if (tiers.length === 0 && form.isActive) {
      return { error: "Add at least one pricing tier before activating the campaign." };
    }
  }

  const sortedTiers = [...tiers].sort((a, b) => a.quantity - b.quantity);
  const lowest = sortedTiers[0] ?? null;
  const requiredQuantity = isCurated ? curatedUnitCount(composition) : (lowest?.quantity ?? Number(form.requiredQuantity));
  const curatedPrice = Number(form.fixedBundlePrice);
  if (isCurated) {
    if (!Number.isFinite(curatedPrice)) return { error: "Bundle price must be a number." };
    if (Math.round(curatedPrice * 100) !== curatedPrice * 100) {
      return { error: "Bundle price can have at most two decimals." };
    }
    if (!(curatedPrice > 0)) return { error: "A curated stack needs a price greater than 0." };
  }
  // The legacy mirror the server also derives — sent so an older payload shape
  // stays valid, never authored independently.
  const fixedBundlePrice = isCurated ? curatedPrice : lowest?.price;

  const startsAt = fromLocalInputValue(form.startsAt);
  const endsAt = fromLocalInputValue(form.endsAt);
  const scheduleError = validateBundleCampaignSchedule(startsAt, endsAt);
  if (scheduleError) return { error: scheduleError };

  const eligibilityMode: BundleEligibilityMode = isCurated ? "manual" : form.eligibilityMode;
  const parseBound = (raw: string): number | null | "invalid" => {
    if (raw.trim() === "") return null;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return "invalid";
    return Math.round(n * 100) !== n * 100 ? "invalid" : n;
  };
  const minPrice = isCurated ? null : parseBound(form.eligibilityMinPrice);
  const maxPrice = isCurated ? null : parseBound(form.eligibilityMaxPrice);
  if (minPrice === "invalid") return { error: "Minimum price must be a number ≥ 0 with at most two decimals." };
  if (maxPrice === "invalid") return { error: "Maximum price must be a number ≥ 0 with at most two decimals." };
  const eligibilityCategoryIds = isCurated ? [] : form.eligibilityCategoryIds;
  const ruleError = isCurated
    ? null
    : validateEligibilityRules(eligibilityMode, {
        categoryIds: eligibilityCategoryIds,
        minPrice,
        maxPrice,
      });
  if (ruleError) return { error: ruleError };

  const eligibleProductIds = isCurated ? composition.map((c) => c.productId) : form.eligibleProducts.map((p) => p.id);
  // Completability is judged by the SERVER against the effective pool (the
  // manual list plus whatever the rules currently match), so the form only
  // pre-checks it when the pool is entirely manual — otherwise it would refuse
  // a perfectly valid dynamic campaign whose products it cannot see.
  const requireCompletablePool = form.isActive && !modeUsesDynamic(eligibilityMode);
  const configError = validateBundleCampaignConfig(
    {
      type: form.type,
      requiredQuantity,
      pricingType: "fixed_total",
      fixedBundlePrice: fixedBundlePrice ?? null,
      tiers: isCurated ? [] : sortedTiers.map((tier) => ({ id: null, ...tier })),
      allowDuplicates: isCurated ? true : form.allowDuplicates,
      maxPerProduct,
      isRepeatable: form.isRepeatable,
      eligibleProductIds,
      composition: isCurated ? composition : undefined,
    },
    { requireCompletablePool },
  );
  if (configError) return { error: configError };

  return {
    payload: {
      type: form.type,
      internalName,
      title,
      slug,
      subtitle: form.subtitle.trim() || undefined,
      description: form.description.trim() || undefined,
      badgeText: form.badgeText.trim() || undefined,
      imageId: form.imageId,
      isActive: form.isActive,
      requiredQuantity: isCurated ? undefined : requiredQuantity,
      tiers: isCurated ? [] : sortedTiers,
      fixedBundlePrice,
      allowDuplicates: isCurated ? true : form.allowDuplicates,
      maxPerProduct,
      isRepeatable: form.isRepeatable,
      offerStacking: form.offerStacking,
      sortOrder,
      startsAt,
      endsAt,
      // A purely dynamic campaign has no manual pool: persisting one would
      // leave orphan rows that the resolver ignores but the CMS would show.
      eligibleProductIds: isCurated || eligibilityMode === "dynamic" ? [] : eligibleProductIds,
      composition: isCurated ? composition : [],
      categoryIds: form.categoryIds,
      eligibilityMode,
      eligibilityCategoryIds,
      eligibilityMinPrice: minPrice,
      eligibilityMaxPrice: maxPrice,
    },
  };
}

// ─── Pricing tiers (Build Your Stack, Phase 5) ────────────────────────────────

/**
 * Quantity -> price rows for a Build Your Stack campaign.
 *
 * Rows are kept in author order while typing (so a half-entered quantity does
 * not make the row jump around under the cursor) and sorted ascending by
 * quantity on save, which is how they are stored, priced and displayed. The
 * live preview under the table sorts too, so the merchant sees the real
 * ladder.
 *
 * Validation is the shared domain function, so this panel and the server
 * refuse exactly the same configurations with exactly the same words.
 *
 * Curated stacks never render this — their composition is one quantity at one
 * price and the CMS offers a single price field instead.
 */
function PricingTierEditor({
  tiers,
  onChange,
  isActive,
}: {
  tiers: { quantity: string; price: string }[];
  onChange: (next: { quantity: string; price: string }[]) => void;
  isActive: boolean;
}) {
  const update = (index: number, patch: Partial<{ quantity: string; price: string }>) => {
    onChange(tiers.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };
  const remove = (index: number) => onChange(tiers.filter((_, i) => i !== index));
  const add = () => onChange([...tiers, { quantity: "", price: "" }]);

  // Same invariants the server enforces, reported while typing.
  const parsed: BundleTier[] = tiers
    .filter((row) => row.quantity.trim() !== "" || row.price.trim() !== "")
    .map((row) => ({ id: null, quantity: Number(row.quantity), price: Number(row.price) }));
  const anyUnparseable = parsed.some((t) => !Number.isFinite(t.quantity) || !Number.isFinite(t.price));
  const error = anyUnparseable
    ? "Every tier needs a numeric quantity and price."
    : validateBundleTiers(parsed, { requireAtLeastOne: isActive });
  const preview = sortTiers(parsed.filter((t) => Number.isFinite(t.quantity) && Number.isFinite(t.price)));

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Pricing tiers</h3>
        <Button type="button" variant="outline" size="sm" onClick={add}>
          + Add tier
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Each tier is an exact number of pieces at a total price. A shopper who picks a quantity you have not listed
        cannot complete a stack — nothing is rounded down to the tier below.
      </p>

      <div className="space-y-2">
        {tiers.length === 0 && <p className="text-xs text-muted-foreground">No tiers yet. Add one to price this campaign.</p>}
        {tiers.map((row, index) => (
          // Index key: rows are positional and freely reordered on save, and
          // there is no stable id while a row is still being typed.
          // biome-ignore lint/suspicious/noArrayIndexKey: positional rows
          <div key={index} className="flex items-end gap-2">
            <div className="flex-1 space-y-1">
              <Label className="text-xs">Pieces</Label>
              <Input
                type="number"
                min={1}
                max={100}
                value={row.quantity}
                placeholder="6"
                onChange={(e) => update(index, { quantity: e.target.value })}
              />
            </div>
            <div className="flex-1 space-y-1">
              <Label className="text-xs">Total ({STORE_CURRENCY})</Label>
              <Input
                type="number"
                min={0.01}
                step={0.01}
                value={row.price}
                placeholder="480.00"
                onChange={(e) => update(index, { price: e.target.value })}
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mb-0.5 text-muted-foreground hover:text-destructive"
              onClick={() => remove(index)}
              aria-label={`Remove tier ${index + 1}`}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      {error && <p className="rounded bg-red-50 px-2 py-1.5 text-xs text-red-700">{error}</p>}
      {!error && preview.length > 0 && (
        <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          Shoppers will see:{" "}
          <span className="font-medium text-foreground">
            {preview.map((t) => `${t.quantity} for ${t.price.toFixed(2)} ${STORE_CURRENCY}`).join(" · ")}
          </span>
        </p>
      )}
    </section>
  );
}

// ─── Eligibility (Build Your Stack, Phase 4) ──────────────────────────────────

type EligibilityPreview = {
  eligibleProductCount: number;
  manualProductCount: number;
  dynamicProductCount: number;
  purchasableProductCount: number;
  availableCapacity: number;
  canCompleteStack: boolean;
  configError: string | null;
  unusableManualProducts: { productId: string; name: string; reason: "deleted" | "hidden" }[];
  tiers: {
    quantity: number;
    price: number;
    availability: "available" | "sold_out";
    valueRange: { min: number; max: number } | null;
  }[];
};

/**
 * Eligibility controls plus a LIVE, server-computed preview of the effective
 * pool.
 *
 * The counts are never derived in the browser: the form posts the
 * configuration it currently holds to `bundle.previewEligibility`, which runs
 * the same resolver the storefront uses and the same Phase 3 availability
 * rules. That is the whole point — one eligibility implementation, on the
 * server, with the CMS as just another consumer.
 */
function EligibilitySection({
  form,
  update,
  setForm,
}: {
  form: CampaignFormState;
  update: <K extends keyof CampaignFormState>(key: K, value: CampaignFormState[K]) => void;
  setForm: React.Dispatch<React.SetStateAction<CampaignFormState>>;
}) {
  const [preview, setPreview] = useState<EligibilityPreview | null>(null);
  const [loading, setLoading] = useState(false);

  // Only fully-typed rows are previewed, so a half-entered tier never makes
  // the panel flash an error the merchant has not finished causing.
  const previewTiers = useMemo(
    () =>
      form.tiers
        .map((row) => ({ quantity: Number(row.quantity), price: Number(row.price) }))
        .filter((t) => Number.isInteger(t.quantity) && t.quantity >= 1 && Number.isFinite(t.price) && t.price > 0)
        .sort((a, b) => a.quantity - b.quantity),
    [form.tiers],
  );
  const requiredQuantity = previewTiers[0]?.quantity ?? Number(form.requiredQuantity);
  const maxPerProduct = form.allowDuplicates && form.maxPerProduct.trim() !== "" ? Number(form.maxPerProduct) : null;
  const manualIds = form.eligibleProducts.map((p) => p.id).join(",");
  const ruleCategoryIds = form.eligibilityCategoryIds.join(",");

  useEffect(() => {
    if (!Number.isInteger(requiredQuantity) || requiredQuantity < 1) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const handle = window.setTimeout(() => {
      trpc.bundle.previewEligibility
        .query({
          type: "build_your_stack",
          eligibilityMode: form.eligibilityMode,
          eligibilityCategoryIds: form.eligibilityCategoryIds,
          eligibilityMinPrice: form.eligibilityMinPrice.trim() === "" ? null : Number(form.eligibilityMinPrice),
          eligibilityMaxPrice: form.eligibilityMaxPrice.trim() === "" ? null : Number(form.eligibilityMaxPrice),
          manualProductIds: modeUsesManual(form.eligibilityMode) ? form.eligibleProducts.map((p) => p.id) : [],
          tiers: previewTiers,
          requiredQuantity,
          allowDuplicates: form.allowDuplicates,
          maxPerProduct,
        })
        .then((res) => {
          if (cancelled) return;
          setPreview(res.success && res.result ? (res.result as EligibilityPreview) : null);
        })
        .catch(() => {
          if (!cancelled) setPreview(null);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
    // Rules are compared by value so typing a price re-previews, but reordering
    // the manual pool (which cannot change the counts) does not.
  }, [
    form.eligibilityMode,
    ruleCategoryIds,
    form.eligibilityMinPrice,
    form.eligibilityMaxPrice,
    manualIds,
    requiredQuantity,
    form.allowDuplicates,
    maxPerProduct,
    // Re-preview when the ladder itself changes.
    JSON.stringify(previewTiers),
  ]);

  const usesManual = modeUsesManual(form.eligibilityMode);
  const usesDynamic = modeUsesDynamic(form.eligibilityMode);

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">Eligibility</h3>

      <div className="space-y-1">
        <Label>Mode</Label>
        <Select
          value={form.eligibilityMode}
          onValueChange={(v) => update("eligibilityMode", v as BundleEligibilityMode)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="manual">Manual products — only what you pick</SelectItem>
            <SelectItem value="dynamic">Dynamic rules — whatever currently matches</SelectItem>
            <SelectItem value="hybrid">Manual + Dynamic — both, deduplicated</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Dynamic rules are re-evaluated on every request, so a new matching product joins this campaign without
          anyone editing it — and leaves again if its category or price changes.
        </p>
      </div>

      {usesManual && (
        <div className="space-y-2">
          <Label>Manual products</Label>
          <EligibleProductPicker selected={form.eligibleProducts} onChange={(next) => update("eligibleProducts", next)} />
        </div>
      )}

      {usesDynamic && (
        <div className="space-y-3 rounded-md border p-3">
          <div className="space-y-1">
            <Label>Categories</Label>
            <CategoryMultiPicker
              selectedIds={form.eligibilityCategoryIds}
              onChange={(ids) => update("eligibilityCategoryIds", ids)}
            />
            <p className="text-xs text-muted-foreground">
              A product qualifies if it is in <span className="font-medium">any</span> of these. Leave empty for no
              category filter. Separate from “Category placement” above, which only decides where the campaign is shown.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Min price ({STORE_CURRENCY})</Label>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={form.eligibilityMinPrice}
                onChange={(e) => update("eligibilityMinPrice", e.target.value)}
                placeholder="No minimum"
              />
            </div>
            <div className="space-y-1">
              <Label>Max price ({STORE_CURRENCY})</Label>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={form.eligibilityMaxPrice}
                onChange={(e) => update("eligibilityMaxPrice", e.target.value)}
                placeholder="No maximum"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Inclusive, compared against the price a shopper would pay (the discount price when there is one). Filters
            are combined with <span className="font-medium">and</span>.
          </p>
        </div>
      )}

      <EligibilityPreviewPanel
        preview={preview}
        loading={loading}
        requiredQuantity={requiredQuantity}
        allowDuplicates={form.allowDuplicates}
        isActive={form.isActive}
        onDeactivate={() => setForm((f) => ({ ...f, isActive: false }))}
      />
    </section>
  );
}

/**
 * The merchant-facing read-out. Deliberately separates the two failure modes
 * the prompt for this phase calls out:
 *
 *   • a CONFIGURATION problem (pool too small, rules match nothing) — the
 *     campaign cannot be activated until it is fixed;
 *   • a STOCK problem (valid campaign, nothing buyable right now) — the
 *     campaign stays live and simply reads as sold out.
 */
function EligibilityPreviewPanel({
  preview,
  loading,
  requiredQuantity,
  allowDuplicates,
  isActive,
  onDeactivate,
}: {
  preview: EligibilityPreview | null;
  loading: boolean;
  requiredQuantity: number;
  allowDuplicates: boolean;
  isActive: boolean;
  onDeactivate: () => void;
}) {
  if (!preview) {
    return (
      <div className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
        {loading ? "Checking eligible products…" : "Set a required quantity to preview the eligible pool."}
      </div>
    );
  }
  return (
    <div className="rounded-md bg-muted px-3 py-2 text-sm space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="font-medium">
          {preview.eligibleProductCount} eligible product{preview.eligibleProductCount === 1 ? "" : "s"}
        </span>
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>
      <p className="text-xs text-muted-foreground">
        {preview.manualProductCount} manual · {preview.dynamicProductCount} from rules ·{" "}
        {preview.purchasableProductCount} currently in stock
      </p>
      {/* Per-tier economics straight from the DTO — the CMS never recomputes
          availability or value ranges itself. */}
      {preview.tiers.length > 1 && (
        <ul className="space-y-0.5 text-xs">
          {preview.tiers.map((tier) => (
            <li key={tier.quantity} className="flex items-center gap-1.5">
              <span className="font-medium">
                {tier.quantity} pieces · {tier.price.toFixed(2)} {STORE_CURRENCY}
              </span>
              <span className={tier.availability === "available" ? "text-green-700" : "text-amber-700"}>
                · {tier.availability === "available" ? "available" : "sold out"}
              </span>
              {tier.valueRange && (
                <span className="text-muted-foreground">
                  · separately {tier.valueRange.min.toFixed(2)}–{tier.valueRange.max.toFixed(2)} {STORE_CURRENCY}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs">
        Can complete this {requiredQuantity}-piece stack:{" "}
        <span className={preview.canCompleteStack ? "font-medium text-green-700" : "font-medium text-amber-700"}>
          {preview.canCompleteStack ? "Yes" : "No"}
        </span>
        {!preview.canCompleteStack && (
          <span className="text-muted-foreground">
            {" "}
            — {preview.availableCapacity} unit{preview.availableCapacity === 1 ? "" : "s"} available
            {allowDuplicates ? "" : " (duplicates off, so one unit per product)"}
          </span>
        )}
      </p>

      {preview.configError && (
        <p className="rounded bg-red-50 px-2 py-1.5 text-xs text-red-700">
          <span className="font-semibold">Cannot activate: </span>
          {preview.configError}
        </p>
      )}
      {!preview.configError && !preview.canCompleteStack && (
        <p className="rounded bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
          The configuration is valid but nothing is buyable right now — the campaign will show as{" "}
          <span className="font-medium">sold out</span> rather than switching itself off.
        </p>
      )}
      {preview.configError && isActive && (
        <Button variant="outline" size="sm" onClick={onDeactivate}>
          Save as draft instead
        </Button>
      )}
      {preview.unusableManualProducts.length > 0 && (
        <p className="text-xs text-amber-800">
          Not offered to shoppers:{" "}
          {preview.unusableManualProducts.map((p) => `${p.name} (${p.reason})`).join(", ")}
        </p>
      )}
    </div>
  );
}

// ─── Curated summary ──────────────────────────────────────────────────────────

function CuratedSummary({ composition, priceInput }: { composition: EligibleProductOption[]; priceInput: string }) {
  const price = Number(priceInput);
  const validPrice = Number.isFinite(price) && price > 0;
  const normalMinor = composition.filter((p) => !p.deleted).reduce((s, p) => s + Math.round(lineUnitPrice(p) * 100) * p.quantity, 0);
  const normal = normalMinor / 100;
  const saving = validPrice ? (normalMinor - Math.round(price * 100)) / 100 : null;
  const pct = saving !== null && normal > 0 ? Math.round((saving / normal) * 100) : null;
  const units = curatedUnitCount(composition.map((p) => ({ productId: p.id, quantity: p.quantity })));
  const issues = composition.filter((p) => p.deleted || p.hidden || p.stock < p.quantity || compositionLineProblem(p) !== null);
  return (
    <div className="rounded-md bg-muted px-3 py-2 text-sm space-y-1">
      <div className="flex justify-between">
        <span className="text-muted-foreground">
          {composition.length} product{composition.length === 1 ? "" : "s"} · {units} unit{units === 1 ? "" : "s"}
        </span>
      </div>
      <div className="flex justify-between">
        <span>Normal value (current prices)</span>
        <span className="tabular-nums">
          {normal.toFixed(2)} {STORE_CURRENCY}
        </span>
      </div>
      <div className="flex justify-between">
        <span>Stack price</span>
        <span className="tabular-nums">{validPrice ? `${price.toFixed(2)} ${STORE_CURRENCY}` : "—"}</span>
      </div>
      {saving !== null && (
        <div className={cn("flex justify-between font-medium", saving > 0 ? "text-emerald-700" : "text-destructive")}>
          <span>{saving > 0 ? "Saving" : saving === 0 ? "No saving" : "Costs MORE than buying separately"}</span>
          <span className="tabular-nums">
            {saving.toFixed(2)} {STORE_CURRENCY}
            {pct !== null && ` (${pct}%)`}
          </span>
        </div>
      )}
      {issues.length > 0 && (
        <p className="text-xs text-destructive">
          {issues.length} product{issues.length > 1 ? "s are" : " is"} deleted, hidden or short on stock — the stack will show as sold out.
        </p>
      )}
    </div>
  );
}

export function CampaignFormDialog({
  open,
  onOpenChange,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: BundleCampaign | null;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<CampaignFormState>(emptyCampaignForm);
  const [saving, setSaving] = useState(false);
  const [slugStatus, setSlugStatus] = useState<"idle" | "checking" | "free" | "taken">("idle");
  const isCurated = form.type === "curated_stack";

  useEffect(() => {
    if (!open) return;
    setForm(editing ? campaignToForm(editing) : emptyCampaignForm);
    setSlugStatus("idle");
  }, [open, editing]);

  const update = <K extends keyof CampaignFormState>(key: K, value: CampaignFormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  // Debounced live slug availability check.
  useEffect(() => {
    const slug = form.slug.trim();
    if (!open || !slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      setSlugStatus("idle");
      return;
    }
    if (editing && slug === editing.slug) {
      setSlugStatus("free");
      return;
    }
    let cancelled = false;
    setSlugStatus("checking");
    const handle = window.setTimeout(() => {
      trpc.bundle.slugAvailable
        .query({ slug, excludeId: editing?.id })
        .then((res) => {
          if (cancelled) return;
          setSlugStatus(res.success && res.result.available ? "free" : "taken");
        })
        .catch(() => {
          if (!cancelled) setSlugStatus("idle");
        });
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [form.slug, open, editing]);

  const preview = useMemo(() => {
    const requiredQuantity = isCurated
      ? curatedUnitCount(form.composition.map((p) => ({ productId: p.id, quantity: p.quantity })))
      : Number(form.requiredQuantity);
    const fixedBundlePrice = Number(form.fixedBundlePrice);
    if (!isCurated && (!Number.isInteger(requiredQuantity) || requiredQuantity < 1)) return null;
    return describeBundleCampaign(
      {
        type: form.type,
        requiredQuantity,
        pricingType: "fixed_total",
        fixedBundlePrice: Number.isFinite(fixedBundlePrice) && fixedBundlePrice > 0 ? fixedBundlePrice : null,
        allowDuplicates: form.allowDuplicates,
        isRepeatable: form.isRepeatable,
      },
      isCurated ? form.composition.length : form.eligibleProducts.length,
      STORE_CURRENCY,
    );
  }, [form.type, form.requiredQuantity, form.fixedBundlePrice, form.allowDuplicates, form.isRepeatable, form.eligibleProducts.length, form.composition, isCurated]);

  // Regular price of the pool's cheapest / dearest possible stack — a quick
  // sanity check that the fixed total is actually a saving.
  const regularRange = useMemo(() => {
    if (isCurated) return null;
    const requiredQuantity = Number(form.requiredQuantity);
    if (!Number.isInteger(requiredQuantity) || requiredQuantity < 1) return null;
    const prices = form.eligibleProducts
      .filter((p) => !p.deleted)
      .map((p) => effectiveUnitPrice(p))
      .sort((a, b) => a - b);
    if (prices.length === 0) return null;
    const perProductCap = form.allowDuplicates
      ? form.maxPerProduct.trim() !== "" && Number(form.maxPerProduct) >= 1
        ? Number(form.maxPerProduct)
        : requiredQuantity
      : 1;
    // Greedy: walk the sorted prices taking up to `perProductCap` units each.
    const pickTotal = (sorted: number[]) => {
      let remaining = requiredQuantity;
      let total = 0;
      for (const price of sorted) {
        const take = Math.min(perProductCap, remaining);
        total += price * take;
        remaining -= take;
        if (remaining === 0) return total;
      }
      return null; // pool can't fill the stack
    };
    const min = pickTotal(prices);
    const max = pickTotal([...prices].reverse());
    if (min === null || max === null) return null;
    return { min, max };
  }, [form.eligibleProducts, form.requiredQuantity, form.allowDuplicates, form.maxPerProduct, isCurated]);

  async function handleSave() {
    const built = buildCampaignPayload(form);
    if ("error" in built) {
      toast.error(built.error);
      return;
    }
    if (slugStatus === "taken") {
      toast.error("That slug is already used by another campaign.");
      return;
    }
    setSaving(true);
    try {
      const result = editing
        ? await trpc.bundle.update.mutate({ id: editing.id, ...built.payload })
        : await trpc.bundle.create.mutate(built.payload);
      if (result.success) {
        toast.success(editing ? "Campaign updated" : "Campaign created");
        onOpenChange(false);
        onSaved();
      } else {
        toast.error(result.error);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save campaign");
    } finally {
      setSaving(false);
    }
  }

  const TypeOption = ({ value, icon: Icon, title, body }: { value: BundleCampaignType; icon: typeof Layers; title: string; body: string }) => (
    <button
      type="button"
      onClick={() => update("type", value)}
      aria-pressed={form.type === value}
      className={cn(
        "flex flex-1 items-start gap-3 rounded-md border p-3 text-left transition-colors",
        form.type === value ? "border-primary bg-muted" : "hover:bg-muted/50",
      )}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">{body}</span>
      </span>
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit bundle campaign" : "New bundle campaign"}</DialogTitle>
          <DialogDescription>
            {isCurated
              ? "Curated stack — you fix the exact products and units; the shopper buys the whole set for one price."
              : "Build Your Stack — the shopper picks a set number of units from the eligible pool for a fixed total."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* Type */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Campaign type</h3>
            <div className="flex flex-col gap-2 sm:flex-row">
              <TypeOption value="build_your_stack" icon={Layers} title="Build Your Stack" body="Customer chooses N products from an eligible pool." />
              <TypeOption value="curated_stack" icon={Sparkles} title="Curated Stack" body="You define the exact products and quantities." />
            </div>
            {editing && editing.type !== form.type && (
              <p className="text-xs text-amber-600">Changing the type re-shapes the product list below — review it before saving.</p>
            )}
          </section>

          {/* Identity */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Identity</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Internal name *</Label>
                <Input value={form.internalName} onChange={(e) => update("internalName", e.target.value)} placeholder="e.g. Autumn stack promo" />
                <p className="text-xs text-muted-foreground">Only shown in the dashboard.</p>
              </div>
              <div className="space-y-1">
                <Label>Customer-facing title *</Label>
                <Input
                  value={form.title}
                  onChange={(e) => {
                    const title = e.target.value;
                    setForm((f) => ({ ...f, title, slug: f.slugTouched ? f.slug : slugify(title) }));
                  }}
                  placeholder={isCurated ? "e.g. Golden Ear Stack" : "e.g. Build Your Stack"}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Slug *</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">/bundles/</span>
                <Input value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value, slugTouched: true }))} placeholder="build-your-stack" className="font-mono" />
                {slugStatus === "checking" && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                {slugStatus === "free" && <Check className="h-4 w-4 text-emerald-600" />}
                {slugStatus === "taken" && <Badge variant="destructive">Taken</Badge>}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Subtitle</Label>
                <Input value={form.subtitle} onChange={(e) => update("subtitle", e.target.value)} placeholder="e.g. Mix it your way" maxLength={160} />
                <p className="text-xs text-muted-foreground">One line under the title on cards and the campaign page.</p>
              </div>
              <div className="space-y-1">
                <Label>Badge text</Label>
                <Input value={form.badgeText} onChange={(e) => update("badgeText", e.target.value)} placeholder="e.g. Limited time" maxLength={60} />
                <p className="text-xs text-muted-foreground">Optional merchandising label.</p>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => update("description", e.target.value)} placeholder="Shown on the campaign page." rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Display order</Label>
                <Input type="number" min={0} value={form.sortOrder} onChange={(e) => update("sortOrder", e.target.value)} />
                <p className="text-xs text-muted-foreground">Lower shows first on /bundles and the homepage rail.</p>
              </div>
              <div className="space-y-1">
                <Label>Category placement</Label>
                <CategoryMultiPicker selectedIds={form.categoryIds} onChange={(ids) => update("categoryIds", ids)} />
                <p className="text-xs text-muted-foreground">Merchandising only — shows the campaign on these category pages. Never affects pricing.</p>
              </div>
            </div>
            <CategoryImageUpload
              label="Campaign image (optional)"
              inputId="bundle-campaign-image"
              value={form.imageId}
              previewUrl={form.imageUrl ? `/uploads/${form.imageUrl}` : null}
              onChange={(fileId) => setForm((f) => ({ ...f, imageId: fileId, imageUrl: fileId ? f.imageUrl : null }))}
            />
          </section>

          {/* Products / rules */}
          {isCurated ? (
            <section className="space-y-3">
              <h3 className="text-sm font-semibold">Stack composition</h3>
              <EligibleProductPicker selected={form.composition} onChange={(next) => update("composition", next)} withQuantities />
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Fixed stack price ({STORE_CURRENCY}) *</Label>
                  <Input type="number" min={0.01} step={0.01} value={form.fixedBundlePrice} onChange={(e) => update("fixedBundlePrice", e.target.value)} placeholder="450.00" />
                </div>
                <div className="flex items-start justify-between gap-3 rounded-md border p-3">
                  <div>
                    <Label>Repeatable</Label>
                    <p className="text-xs text-muted-foreground">Let one cart hold this stack more than once.</p>
                  </div>
                  <Switch checked={form.isRepeatable} onCheckedChange={(v) => update("isRepeatable", v)} />
                </div>
              </div>
              <CuratedSummary composition={form.composition} priceInput={form.fixedBundlePrice} />
              <div className="space-y-1">
                <Label>Other offers &amp; promo codes</Label>
                <Select value={form.offerStacking} onValueChange={(v) => update("offerStacking", v as CampaignFormState["offerStacking"])}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="exclusive">Exclusive — stack price only</SelectItem>
                    <SelectItem value="stackable">Stackable — offers/codes may apply on top</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </section>
          ) : (
            <>
              <section className="space-y-3">
                <h3 className="text-sm font-semibold">Bundle rules</h3>
                <PricingTierEditor
                  tiers={form.tiers}
                  onChange={(next) => update("tiers", next)}
                  isActive={form.isActive}
                />
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-start justify-between gap-3 rounded-md border p-3">
                    <div>
                      <Label>Allow duplicates</Label>
                      <p className="text-xs text-muted-foreground">Off: each product fills at most one slot. On: quantity &gt; 1 of one product counts several units.</p>
                    </div>
                    <Switch checked={form.allowDuplicates} onCheckedChange={(v) => setForm((f) => ({ ...f, allowDuplicates: v, maxPerProduct: v ? f.maxPerProduct : "" }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Max per product</Label>
                    <Input type="number" min={1} value={form.maxPerProduct} disabled={!form.allowDuplicates} onChange={(e) => update("maxPerProduct", e.target.value)} placeholder="No limit" />
                    <p className="text-xs text-muted-foreground">Only when duplicates are allowed.</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-start justify-between gap-3 rounded-md border p-3">
                    <div>
                      <Label>Repeatable</Label>
                      <p className="text-xs text-muted-foreground">Let one cart hold several complete bundles from this campaign.</p>
                    </div>
                    <Switch checked={form.isRepeatable} onCheckedChange={(v) => update("isRepeatable", v)} />
                  </div>
                  <div className="space-y-1">
                    <Label>Other offers &amp; promo codes</Label>
                    <Select value={form.offerStacking} onValueChange={(v) => update("offerStacking", v as CampaignFormState["offerStacking"])}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="exclusive">Exclusive — bundle price only</SelectItem>
                        <SelectItem value="stackable">Stackable — offers/codes may apply on top</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">Exclusive is the safe default.</p>
                  </div>
                </div>
              </section>

              <section className="space-y-3">
                <EligibilitySection form={form} update={update} setForm={setForm} />
                {regularRange && modeUsesManual(form.eligibilityMode) && (
                  <p className="text-xs text-muted-foreground">
                    Bought separately, a stack of {form.requiredQuantity} from the manual pool costs between{" "}
                    <span className="tabular-nums">{regularRange.min.toFixed(2)}</span> and <span className="tabular-nums">{regularRange.max.toFixed(2)}</span> {STORE_CURRENCY}.
                    {modeUsesDynamic(form.eligibilityMode) && " Rule-matched products widen this range — the storefront shows the range for the full effective pool."}
                  </p>
                )}
              </section>
            </>
          )}

          {/* Schedule & status */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Schedule &amp; status</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Starts at</Label>
                <Input type="datetime-local" value={form.startsAt} onChange={(e) => update("startsAt", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Ends at</Label>
                <Input type="datetime-local" value={form.endsAt} onChange={(e) => update("endsAt", e.target.value)} />
              </div>
            </div>
            <div className="flex items-start justify-between gap-3 rounded-md border p-3">
              <div>
                <Label>Active</Label>
                <p className="text-xs text-muted-foreground">
                  Off = draft. When on, the campaign is live inside its schedule window (or always, with no window).
                  {isCurated ? " Activation requires at least one product in the stack." : " Activation requires a pool that can complete a bundle."}
                </p>
              </div>
              <Switch checked={form.isActive} onCheckedChange={(v) => update("isActive", v)} />
            </div>
          </section>

          {preview && (
            <div className="rounded-md bg-muted px-3 py-2 text-sm">
              <span className="font-medium">Summary: </span>
              {preview}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {editing ? "Save changes" : "Create campaign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
