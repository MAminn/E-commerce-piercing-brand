import { useMemo } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { cn } from "#root/lib/utils";
import { Button } from "#root/components/ui/button";
import { Badge } from "#root/components/ui/badge";
import { Label } from "#root/components/ui/label";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "#root/components/ui/popover";
import { buildCategoryTree } from "#root/shared/categories/tree";

export interface CategoryOption {
  id: string;
  name: string;
  parentId?: string | null;
  sortOrder?: number;
  hidden?: boolean;
  createdAt?: string | Date | null;
}

/**
 * Category → Subcategory picker for the product form.
 *
 * `value` is the form's `categoryIds`, whose FIRST entry is the product's
 * primary category (the form's existing contract). The picker keeps that
 * entry stable unless the admin changes the main category, so re-saving a
 * product never silently re-points its primary category.
 *
 * Only subcategories of the chosen main category are offered, so an invalid
 * main/sub combination cannot be built here (the server enforces the same by
 * always filing a subcategory's products in its main category). Categories
 * outside the chosen one are kept as optional cross-listings.
 */
export function CategoryPicker({
  categories,
  value,
  onChange,
}: {
  categories: CategoryOption[];
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const tree = useMemo(
    () =>
      buildCategoryTree(
        categories.map((c) => ({
          ...c,
          slug: "",
          parentId: c.parentId ?? null,
          sortOrder: c.sortOrder ?? 0,
          hidden: c.hidden ?? false,
        })),
      ),
    [categories],
  );
  const byId = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const primary = value[0];
  const main = tree.find(
    (m) => m.id === primary || m.children.some((c) => c.id === primary),
  );
  const groupIds = new Set(main ? [main.id, ...main.children.map((c) => c.id)] : []);
  const selectedSubs = new Set(value.filter((id) => main?.children.some((c) => c.id === id)));
  // Kept even when the category no longer exists, so saving the form never
  // drops a link the admin did not remove.
  const extras = value.filter((id) => !groupIds.has(id));

  const emit = (first: string, subs: Iterable<string>, others: string[], mainId: string) => {
    onChange([...new Set([first, mainId, ...subs, ...others].filter(Boolean))]);
  };

  const treeGroup = (mainId: string) => {
    const m = tree.find((t) => t.id === mainId);
    return new Set(m ? [m.id, ...m.children.map((c) => c.id)] : []);
  };

  const chooseMain = (mainId: string) => {
    if (mainId === main?.id) return;
    // Subcategories of the previous main category do not carry over.
    emit(mainId, [], extras.filter((id) => !treeGroup(mainId).has(id)), mainId);
  };

  const toggleSub = (subId: string) => {
    if (!main) return;
    const subs = new Set(selectedSubs);
    if (subs.has(subId)) subs.delete(subId);
    else subs.add(subId);
    const first = primary && groupIds.has(primary) && (primary === main.id || subs.has(primary))
      ? primary
      : main.id;
    emit(first, subs, extras, main.id);
  };

  const toggleExtra = (id: string) => {
    if (!main) return;
    const others = extras.includes(id) ? extras.filter((e) => e !== id) : [...extras, id];
    emit(primary as string, selectedSubs, others, main.id);
  };

  const label = (id: string) => {
    const row = byId.get(id);
    if (!row) return "Deleted category";
    const parent = row.parentId ? byId.get(row.parentId) : undefined;
    return parent ? `${parent.name} › ${row.name}` : row.name;
  };

  return (
    <div className='space-y-4'>
      <div className='space-y-2'>
        <Label htmlFor='product-main-category'>Category</Label>
        <Select value={main?.id ?? ""} onValueChange={chooseMain}>
          <SelectTrigger id='product-main-category' className='w-full'>
            <SelectValue placeholder='Choose a category' />
          </SelectTrigger>
          <SelectContent>
            {tree.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
                {m.hidden ? " (hidden)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {main && (
        <fieldset className='space-y-2'>
          <legend className='text-sm font-medium'>
            Subcategory{" "}
            <span className='font-normal text-muted-foreground'>
              (optional — tick every one that fits)
            </span>
          </legend>
          {main.children.length === 0 ? (
            <p className='text-sm text-muted-foreground'>
              {main.name} has no subcategories yet. You can add them under
              Dashboard → Categories.
            </p>
          ) : (
            <div className='flex flex-wrap gap-2'>
              {main.children.map((sub) => {
                const on = selectedSubs.has(sub.id);
                return (
                  <Button
                    key={sub.id}
                    type='button'
                    size='sm'
                    variant={on ? "primary" : "outline"}
                    aria-pressed={on}
                    onClick={() => toggleSub(sub.id)}>
                    {on && <Check className='mr-1 h-3.5 w-3.5' />}
                    {sub.name}
                    {sub.hidden ? " (hidden)" : ""}
                  </Button>
                );
              })}
            </div>
          )}
          <p className='text-xs text-muted-foreground'>
            The product always appears under “All {main.name}”, with or without
            a subcategory.
          </p>
        </fieldset>
      )}

      {main && (
        <div className='space-y-2'>
          <Label>
            Also show in{" "}
            <span className='font-normal text-muted-foreground'>(optional)</span>
          </Label>
          {extras.length > 0 && (
            <div className='flex flex-wrap gap-2'>
              {extras.map((id) => (
                <Badge key={id} variant='secondary' className='gap-1 py-1'>
                  {label(id)}
                  <button
                    type='button'
                    aria-label={`Remove ${label(id)}`}
                    className='ml-1 rounded-sm opacity-70 hover:opacity-100'
                    onClick={() => toggleExtra(id)}>
                    <X className='h-3 w-3' />
                  </button>
                </Badge>
              ))}
            </div>
          )}
          <Popover>
            <PopoverTrigger asChild>
              <Button type='button' variant='outline' className='w-full justify-between font-normal'>
                Add another category
                <ChevronsUpDown className='ml-2 h-4 w-4 shrink-0 opacity-50' />
              </Button>
            </PopoverTrigger>
            <PopoverContent className='w-[var(--radix-popover-trigger-width)] p-0'>
              <Command>
                <CommandInput placeholder='Search categories...' />
                <CommandList>
                  <CommandEmpty>No categories found.</CommandEmpty>
                  {tree
                    .filter((m) => m.id !== main.id)
                    .map((m) => (
                      <CommandGroup key={m.id} heading={m.name}>
                        {[m, ...m.children].map((c) => (
                          <CommandItem
                            key={c.id}
                            value={label(c.id)}
                            onSelect={() => toggleExtra(c.id)}>
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                extras.includes(c.id) ? "opacity-100" : "opacity-0",
                              )}
                            />
                            {c.id === m.id ? `All ${m.name}` : c.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    ))}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
      )}
    </div>
  );
}
