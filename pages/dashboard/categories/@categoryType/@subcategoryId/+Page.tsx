import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "#root/components/utils/Link";
import { useData } from "vike-react/useData";
import { useDebounce } from "use-debounce";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRightLeft,
  ChevronDown,
  ExternalLink,
  Loader2,
  MinusCircle,
  PlusCircle,
  Search,
  X,
} from "lucide-react";
import { Button } from "#root/components/ui/button";
import { Badge } from "#root/components/ui/badge";
import { Card, CardContent } from "#root/components/ui/card";
import { Checkbox } from "#root/components/ui/checkbox";
import { Input } from "#root/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "#root/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "#root/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "#root/components/ui/alert-dialog";
import { Pagination } from "#root/components/utils/Pagination";
import { trpc } from "#root/shared/trpc/client";
import type { Data } from "./+data";

type Tree = Extract<Data, { success: true }>["tree"];
type View = "in_subcategory" | "unclassified" | "in_category" | "all";

interface Row {
  id: string;
  name: string;
  slug: string | null;
  price: string;
  discountPrice: string | null;
  stock: number;
  hidden: boolean;
  internalCode: string | null;
  imageId: string;
  imageUrl: string | null;
  subcategoryIds: string[];
  inMainCategory: boolean;
  otherCategories: { id: string; name: string }[];
}

const PAGE_SIZE = 50;

/**
 * Bulk product assignment.
 *
 * With a subcategory (e.g. Helix): browse the main category's products, tick
 * any number — across pages — and Add to Helix, Move to another
 * subcategory, or Remove from Helix. With "unclassified": work through the
 * products that are not in a specific subcategory yet and Add them to one.
 *
 * Every action keeps products inside the main category (see
 * backend/categories/hierarchy.ts), so nothing disappears from the shop.
 */
export default function ManageSubcategoryProducts() {
  const initial = useData<Data>();
  const [tree, setTree] = useState<Tree | null>(initial.success ? initial.tree : null);
  useEffect(() => {
    if (initial.success) setTree(initial.tree);
  }, [initial]);

  const main = initial.success ? tree?.find((m) => m.id === initial.mainId) : undefined;
  const sub =
    initial.success && initial.subcategoryId
      ? main?.children.find((c) => c.id === initial.subcategoryId)
      : undefined;
  const specificSubs = useMemo(() => main?.children.filter((c) => !c.generic) ?? [], [main]);

  const defaultView: View = sub
    ? sub.productCount > 0
      ? "in_subcategory"
      : (main?.unclassifiedCount ?? 0) > 0
        ? "unclassified"
        : "in_category"
    : "unclassified";

  const [view, setView] = useState<View>(defaultView);
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search.trim(), 300);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Map<string, Row>>(new Map());
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [confirmPullIn, setConfirmPullIn] = useState<{ subId: string; ids: string[]; outside: number } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // A different subcategory (client-side navigation) starts fresh.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on route change only
  useEffect(() => {
    setView(defaultView);
    setSelected(new Map());
    setPage(1);
    setSearch("");
  }, [initial]);

  // A new filter or search starts from page one.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset when the filter changes
  useEffect(() => {
    setPage(1);
  }, [view, debouncedSearch]);

  const mainId = main?.id;
  const subId = sub?.id;
  // `reloadKey` is a deliberate trigger: bumping it refetches the same page.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadKey forces a refetch
  useEffect(() => {
    if (!mainId) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    trpc.category.products
      .query({
        mainCategoryId: mainId,
        subcategoryId: subId,
        view,
        search: debouncedSearch || undefined,
        page,
        pageSize: PAGE_SIZE,
      })
      .then((res) => {
        if (cancelled) return;
        if (res.success) {
          setRows(res.result.items);
          setTotal(res.result.total);
        } else {
          setLoadError(res.error);
        }
      })
      .catch(() => !cancelled && setLoadError("Could not load products. Please try again."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [mainId, subId, view, debouncedSearch, page, reloadKey]);

  // The action bar is `fixed` to the bottom of the screen but spans only the
  // content column: `sticky` cannot work here (the dashboard layout's
  // content section is overflow-x-hidden), and a full-width fixed bar would
  // cover the sidebar. Re-measured when the sidebar collapses or expands.
  const pageRef = useRef<HTMLDivElement>(null);
  const [barFrame, setBarFrame] = useState<{ left: number; width: number }>();
  useEffect(() => {
    const host = pageRef.current?.parentElement;
    if (!host) return;
    const measure = () => {
      const r = host.getBoundingClientRect();
      setBarFrame({ left: r.left, width: r.width });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  const refreshAll = useCallback(async () => {
    setSelected(new Map());
    setReloadKey((k) => k + 1);
    const res = await trpc.category.adminTree.query().catch(() => null);
    if (res?.success) setTree(res.result);
  }, []);

  if (!initial.success || !tree || !main || (initial.subcategoryId && !sub)) {
    const backHref =
      !initial.success && "mainId" in initial && initial.mainId
        ? `/dashboard/categories/${initial.mainId}`
        : "/dashboard/categories";
    return (
      <div className='p-6 w-full h-full mx-auto'>
        <Button variant='ghost' asChild className='mb-6'>
          <Link href={backHref}>
            <ArrowLeft className='h-4 w-4 mr-2' />
            Back
          </Link>
        </Button>
        <div className='text-center py-12'>
          <h2 className='text-2xl font-bold mb-2'>Not found</h2>
          <p className='text-slate-500'>This subcategory doesn't exist any more. It may have been deleted.</p>
        </div>
      </div>
    );
  }

  const selectedRows = [...selected.values()];
  const inSub = (r: Row) => !!sub && r.subcategoryIds.includes(sub.id);
  const selectedInSub = selectedRows.filter(inSub);
  const selectedNotInSub = selectedRows.filter((r) => !inSub(r));
  const siblings = specificSubs.filter((s) => s.id !== sub?.id);

  const pageAllSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  const toggle = (row: Row) =>
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(row.id)) next.delete(row.id);
      else next.set(row.id, row);
      return next;
    });

  const togglePage = () =>
    setSelected((prev) => {
      const next = new Map(prev);
      if (pageAllSelected) for (const r of rows) next.delete(r.id);
      else for (const r of rows) next.set(r.id, r);
      return next;
    });

  const subName = (id: string) => main.children.find((c) => c.id === id)?.name ?? "";
  const plural = (n: number) => `${n} product${n === 1 ? "" : "s"}`;

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong. Nothing was changed.");
    } finally {
      setBusy(false);
    }
  };

  const assign = (subId: string, rowsToAdd: Row[]) => {
    const outside = rowsToAdd.filter((r) => !r.inMainCategory).length;
    const ids = rowsToAdd.map((r) => r.id);
    if (outside > 0) {
      setConfirmPullIn({ subId, ids, outside });
      return;
    }
    doAssign(subId, ids);
  };

  const doAssign = (subId: string, ids: string[]) =>
    run(async () => {
      const res = await trpc.category.assignProducts.mutate({ subcategoryId: subId, productIds: ids });
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      const { added, alreadyIn, subcategoryName } = res.result;
      toast.success(
        added > 0
          ? `Added ${plural(added)} to ${subcategoryName}.${alreadyIn ? ` ${alreadyIn} ${alreadyIn === 1 ? "was" : "were"} already there.` : ""}`
          : `Already in ${subcategoryName} — nothing to change.`,
      );
      await refreshAll();
    });

  const moveTo = (toId: string) =>
    run(async () => {
      if (!sub) return;
      const res = await trpc.category.moveProducts.mutate({
        fromSubcategoryId: sub.id,
        toSubcategoryId: toId,
        productIds: selectedInSub.map((r) => r.id),
      });
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success(`Moved ${plural(res.result.moved)} from ${res.result.fromName} to ${res.result.toName}.`);
      await refreshAll();
    });

  const remove = () =>
    run(async () => {
      if (!sub) return;
      const res = await trpc.category.removeProducts.mutate({
        subcategoryId: sub.id,
        productIds: selectedInSub.map((r) => r.id),
      });
      setConfirmRemove(false);
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success(
        `Removed ${plural(res.result.removed)} from ${res.result.subcategoryName}. ${res.result.removed === 1 ? "It stays" : "They stay"} in ${res.result.parentName}.`,
      );
      await refreshAll();
    });

  const tabs: { value: View; label: string }[] = sub
    ? [
        { value: "in_subcategory", label: `In ${sub.name} (${sub.productCount})` },
        ...(specificSubs.length > 0
          ? [{ value: "unclassified" as const, label: `No subcategory yet (${main.unclassifiedCount})` }]
          : []),
        { value: "in_category", label: `All ${main.name} (${main.productCount})` },
        { value: "all", label: "Whole store" },
      ]
    : [
        { value: "unclassified", label: `No subcategory yet (${main.unclassifiedCount})` },
        { value: "in_category", label: `All ${main.name} (${main.productCount})` },
      ];

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div ref={pageRef} className='p-4 md:p-6 pb-28 w-full mx-auto max-w-6xl'>
      <Button variant='ghost' asChild className='mb-4 -ml-2'>
        <Link href={`/dashboard/categories/${main.id}`}>
          <ArrowLeft className='h-4 w-4 mr-2' />
          {main.name}
        </Link>
      </Button>

      <div className='flex flex-col gap-3 md:flex-row md:items-end md:justify-between mb-6'>
        <div>
          <h1 className='text-2xl font-bold'>
            {sub ? `${sub.name} — products` : `Sort ${main.name} into subcategories`}
          </h1>
          <p className='text-slate-500'>
            {sub
              ? `Tick products, then add them to ${sub.name}, move them, or remove them. They always stay in ${main.name}.`
              : `These products are in ${main.name} but not in a subcategory yet. Tick some, then choose “Add to…”.`}
          </p>
        </div>
        {sub && (
          <Button variant='outline' size='sm' asChild>
            <a href={`/categories/${encodeURIComponent(sub.slug)}`} target='_blank' rel='noreferrer'>
              <ExternalLink className='h-4 w-4' />
              View in shop
            </a>
          </Button>
        )}
      </div>

      {!sub && specificSubs.length === 0 && (
        <Card className='mb-4'>
          <CardContent className='py-6 text-sm'>
            {main.name} has no subcategories to sort into yet.{" "}
            <Link href={`/dashboard/categories/${main.id}`} className='underline'>
              Create one first
            </Link>
            .
          </CardContent>
        </Card>
      )}

      <div className='flex flex-col gap-3 mb-4 lg:flex-row lg:items-center lg:justify-between'>
        <div className='overflow-x-auto'>
          <Tabs value={view} onValueChange={(v) => setView(v as View)}>
            <TabsList>
              {tabs.map((t) => (
                <TabsTrigger key={t.value} value={t.value}>
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
        <div className='relative lg:w-80'>
          <Search className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400' />
          <Input
            type='search'
            aria-label='Search products'
            placeholder='Search by name or internal code'
            className='pl-9'
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <Card>
        <CardContent className='p-0'>
          <div className='flex items-center gap-3 border-b px-4 py-3 text-sm'>
            <Checkbox
              id='select-page'
              // Plain on/off: the shared Checkbox draws "indeterminate" as a
              // tick, which read as "everything is selected".
              checked={pageAllSelected}
              onCheckedChange={togglePage}
              disabled={rows.length === 0}
              aria-label='Select all products on this page'
            />
            <label htmlFor='select-page' className='cursor-pointer select-none'>
              Select all on this page
            </label>
            <span className='ml-auto text-slate-500'>
              {loading ? "Loading…" : `${total} product${total === 1 ? "" : "s"}`}
            </span>
          </div>

          {loadError ? (
            <div className='p-8 text-center text-sm'>
              <p className='text-red-700 mb-3'>{loadError}</p>
              <Button variant='outline' size='sm' onClick={() => setReloadKey((k) => k + 1)}>
                Try again
              </Button>
            </div>
          ) : loading && rows.length === 0 ? (
            <ul aria-hidden>
              {[1, 2, 3, 4, 5].map((i) => (
                <li key={i} className='flex items-center gap-3 border-b px-4 py-3'>
                  <div className='h-4 w-4 rounded bg-slate-100' />
                  <div className='h-12 w-12 rounded bg-slate-100 animate-pulse' />
                  <div className='h-4 w-1/3 rounded bg-slate-100 animate-pulse' />
                </li>
              ))}
            </ul>
          ) : rows.length === 0 ? (
            <EmptyList
              view={view}
              search={debouncedSearch}
              subName={sub?.name}
              mainName={main.name}
              onShowUnassigned={() => setView(specificSubs.length > 0 ? "unclassified" : "in_category")}
            />
          ) : (
            <ul className={loading ? "opacity-60" : ""}>
              {rows.map((row) => {
                const checked = selected.has(row.id);
                return (
                  <li key={row.id} className={`border-b last:border-b-0 ${checked ? "bg-slate-50" : ""}`}>
                    <label
                      htmlFor={`pick-${row.id}`}
                      className='flex cursor-pointer items-center gap-3 px-4 py-3'>
                      <Checkbox
                        id={`pick-${row.id}`}
                        checked={checked}
                        onCheckedChange={() => toggle(row)}
                        aria-label={`Select ${row.name}`}
                      />
                      {row.imageUrl ? (
                        <img
                          src={`/uploads/${row.imageUrl}`}
                          alt=''
                          className='h-12 w-12 shrink-0 rounded object-cover'
                          loading='lazy'
                        />
                      ) : (
                        <div className='h-12 w-12 shrink-0 rounded bg-slate-100' />
                      )}
                      <div className='min-w-0 flex-1'>
                        <p className='truncate text-sm font-medium'>{row.name}</p>
                        <p className='text-xs text-slate-500'>
                          {row.internalCode && <span className='font-mono mr-2'>{row.internalCode}</span>}
                          {Number(row.discountPrice ?? row.price).toLocaleString()} EGP
                          {row.stock <= 0 && " · out of stock"}
                        </p>
                        <div className='mt-1 flex flex-wrap gap-1'>
                          {row.hidden && <Badge variant='secondary'>Hidden product</Badge>}
                          {row.subcategoryIds.length === 0 ? (
                            <span className='text-xs text-slate-400'>
                              {row.inMainCategory ? "No subcategory" : `Not in ${main.name}`}
                            </span>
                          ) : (
                            row.subcategoryIds.map((id) => (
                              <Badge key={id} variant={id === sub?.id ? "default" : "outline"}>
                                {subName(id)}
                              </Badge>
                            ))
                          )}
                          {row.otherCategories.length > 0 && (
                            <span className='text-xs text-slate-500'>
                              Also in {row.otherCategories.map((c) => c.name).join(", ")}
                            </span>
                          )}
                        </div>
                      </div>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className='mt-4'>
          <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
        </div>
      )}

      {/* Action bar: stays on screen while scrolling a long list. */}
      {selected.size > 0 && (
        <div
          className='fixed bottom-0 z-40 border-t bg-white/95 backdrop-blur shadow-[0_-4px_16px_rgba(0,0,0,0.06)]'
          style={barFrame ? { left: barFrame.left, width: barFrame.width } : { left: 0, right: 0 }}>
          <div className='mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between md:px-6'>
            <div className='flex items-center gap-3 text-sm' aria-live='polite'>
              <strong>{selected.size} selected</strong>
              <button
                type='button'
                className='inline-flex items-center gap-1 text-slate-500 underline-offset-2 hover:underline'
                onClick={() => setSelected(new Map())}>
                <X className='h-3.5 w-3.5' />
                Clear
              </button>
            </div>
            <div className='flex flex-wrap gap-2'>
              {busy && <Loader2 className='h-5 w-5 animate-spin self-center text-slate-500' />}
              {sub ? (
                <>
                  <Button
                    variant='primary'
                    size='sm'
                    disabled={busy || selectedNotInSub.length === 0}
                    onClick={() => assign(sub.id, selectedNotInSub)}>
                    <PlusCircle className='h-4 w-4' />
                    Add {selectedNotInSub.length || ""} to {sub.name}
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant='outline'
                        size='sm'
                        disabled={busy || selectedInSub.length === 0 || siblings.length === 0}>
                        <ArrowRightLeft className='h-4 w-4' />
                        Move {selectedInSub.length || ""} to…
                        <ChevronDown className='h-4 w-4' />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align='end'>
                      <DropdownMenuLabel>Move from {sub.name} to</DropdownMenuLabel>
                      {siblings.map((s) => (
                        <DropdownMenuItem key={s.id} onClick={() => moveTo(s.id)}>
                          {s.name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button
                    variant='outline'
                    size='sm'
                    disabled={busy || selectedInSub.length === 0}
                    onClick={() => setConfirmRemove(true)}>
                    <MinusCircle className='h-4 w-4' />
                    Remove {selectedInSub.length || ""} from {sub.name}
                  </Button>
                </>
              ) : (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant='primary' size='sm' disabled={busy || specificSubs.length === 0}>
                      <PlusCircle className='h-4 w-4' />
                      Add {selected.size} to…
                      <ChevronDown className='h-4 w-4' />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align='end'>
                    <DropdownMenuLabel>Add to subcategory</DropdownMenuLabel>
                    {specificSubs.map((s) => (
                      <DropdownMenuItem key={s.id} onClick={() => assign(s.id, selectedRows)}>
                        {s.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        </div>
      )}

      <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove {plural(selectedInSub.length)} from {sub?.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {selectedInSub.length === 1 ? "It stays" : "They stay"} in {main.name} and in the
              shop. Only the {sub?.name} label is taken off.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={remove}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmPullIn} onOpenChange={(open) => !open && setConfirmPullIn(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Also list {plural(confirmPullIn?.outside ?? 0)} under {main.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmPullIn?.outside === 1 ? "One selected product is" : `${confirmPullIn?.outside} selected products are`}{" "}
              from another category. {confirmPullIn?.outside === 1 ? "It stays" : "They stay"} there as well, and will
              also appear under {main.name}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmPullIn) doAssign(confirmPullIn.subId, confirmPullIn.ids);
                setConfirmPullIn(null);
              }}>
              Add anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function EmptyList({
  view,
  search,
  subName,
  mainName,
  onShowUnassigned,
}: {
  view: View;
  search: string;
  subName?: string;
  mainName: string;
  onShowUnassigned: () => void;
}) {
  if (search) {
    return <p className='p-8 text-center text-sm text-slate-500'>No products match “{search}”.</p>;
  }
  if (view === "in_subcategory") {
    return (
      <div className='p-8 text-center text-sm'>
        <p className='mb-3 text-slate-500'>No products in {subName} yet.</p>
        <Button variant='primary' size='sm' onClick={onShowUnassigned}>
          <PlusCircle className='h-4 w-4' />
          Add existing products
        </Button>
      </div>
    );
  }
  if (view === "unclassified") {
    return (
      <p className='p-8 text-center text-sm text-slate-500'>
        Every product in {mainName} is in a subcategory. Nice work.
      </p>
    );
  }
  return <p className='p-8 text-center text-sm text-slate-500'>No products here yet.</p>;
}
