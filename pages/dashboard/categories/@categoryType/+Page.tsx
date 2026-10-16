import { useEffect, useState, type DragEvent } from "react";
import { Link } from "#root/components/utils/Link";
import { Card, CardContent } from "#root/components/ui/card";
import { Button } from "#root/components/ui/button";
import { Badge } from "#root/components/ui/badge";
import { Switch } from "#root/components/ui/switch";
import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ExternalLink,
  GripVertical,
  ImageIcon,
  Info,
  Package,
  Pencil,
  PlusCircle,
  Trash2,
} from "lucide-react";
import { useData } from "vike-react/useData";
import { toast } from "sonner";
import { trpc } from "#root/shared/trpc/client";
import type { Data } from "./+data";
import {
  DeleteSubcategoryDialog,
  SubcategoryDialog,
  type AdminTree,
  type SubNode,
} from "./components";

/**
 * Dashboard → Categories → <main category>: its subcategories, in shop order.
 *
 * Everything an admin does to a subcategory starts here: add, edit, reorder
 * (drag the handle, or the arrow buttons — keyboard and touch friendly),
 * show/hide in the shop, feature on the homepage, delete, and "Manage
 * products" for bulk assignment.
 */
export default function CategoryDetail() {
  const initial = useData<Data>();
  const [tree, setTree] = useState<AdminTree | null>(initial.success ? initial.tree : null);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<SubNode | undefined>();
  const [deleting, setDeleting] = useState<SubNode | undefined>();
  const [dragId, setDragId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (initial.success) setTree(initial.tree);
  }, [initial]);

  const refresh = async () => {
    try {
      const res = await trpc.category.adminTree.query();
      if (res.success) setTree(res.result);
      else toast.error(res.error);
    } catch {
      toast.error("Could not refresh. Please reload the page.");
    }
  };

  const main = initial.success ? tree?.find((m) => m.id === initial.mainId) : undefined;

  if (!initial.success || !tree || !main) {
    return (
      <div className='p-6 w-full h-full mx-auto'>
        <Button variant='ghost' asChild className='mb-6'>
          <Link href='/dashboard/categories'>
            <ArrowLeft className='h-4 w-4 mr-2' />
            Back to Categories
          </Link>
        </Button>
        <div className='text-center py-12'>
          <h2 className='text-2xl font-bold mb-2'>Category Not Found</h2>
          <p className='text-slate-500 mb-6'>
            The category you're looking for doesn't exist. It may have been deleted.
          </p>
          <Button asChild>
            <Link href='/dashboard/categories'>Return to Categories</Link>
          </Button>
        </div>
      </div>
    );
  }

  const subs = main.children;
  const genericSubs = subs.filter((s) => s.generic);

  /** Optimistically shows the new order, then saves it. */
  const saveOrder = async (orderedIds: string[]) => {
    const byId = new Map(subs.map((s) => [s.id, s]));
    setTree((t) =>
      t?.map((m) =>
        m.id === main.id
          ? { ...m, children: orderedIds.map((id) => byId.get(id) as SubNode) }
          : m,
      ) ?? t,
    );
    const res = await trpc.category.reorder.mutate({ parentId: main.id, orderedIds });
    if (!res.success) {
      toast.error(res.error);
      await refresh();
    }
  };

  const move = (index: number, direction: -1 | 1) => {
    const ids = subs.map((s) => s.id);
    const target = index + direction;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target] as string, ids[index] as string];
    saveOrder(ids);
  };

  const dropOn = (targetId: string) => (e: DragEvent) => {
    e.preventDefault();
    if (!dragId || dragId === targetId) return;
    const ids = subs.map((s) => s.id).filter((id) => id !== dragId);
    ids.splice(ids.indexOf(targetId), 0, dragId);
    setDragId(null);
    saveOrder(ids);
  };

  const setVisible = async (sub: SubNode, visible: boolean) => {
    setBusyId(sub.id);
    const res = await trpc.category.setVisibility.mutate({ id: sub.id, hidden: !visible });
    setBusyId(null);
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    toast.success(visible ? `“${sub.name}” is visible in the shop.` : `“${sub.name}” is hidden from the shop. Its products stay in ${main.name}.`);
    await refresh();
  };

  const setOnHomepage = async (sub: SubNode, on: boolean) => {
    setBusyId(sub.id);
    const res = await trpc.category.toggleLanding.mutate({ id: sub.id, showOnLanding: on });
    setBusyId(null);
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    toast.success(on ? `“${sub.name}” is featured on the homepage.` : `“${sub.name}” is no longer on the homepage.`);
    await refresh();
  };

  return (
    <div className='p-4 md:p-6 w-full h-full mx-auto max-w-6xl'>
      <Button variant='ghost' asChild className='mb-4 -ml-2'>
        <Link href='/dashboard/categories'>
          <ArrowLeft className='h-4 w-4 mr-2' />
          All categories
        </Link>
      </Button>

      <div className='flex flex-col gap-4 md:flex-row md:items-end md:justify-between mb-6'>
        <div>
          <h1 className='text-2xl font-bold'>{main.name}</h1>
          <p className='text-slate-500'>
            {main.productCount} product{main.productCount === 1 ? "" : "s"} ·{" "}
            {subs.length} subcategor{subs.length === 1 ? "y" : "ies"}
          </p>
        </div>
        <div className='flex flex-wrap gap-2'>
          <Button variant='outline' size='sm' asChild>
            <a href={`/categories/${encodeURIComponent(main.slug)}`} target='_blank' rel='noreferrer'>
              <ExternalLink className='h-4 w-4' />
              View in shop
            </a>
          </Button>
          <Button variant='primary' size='sm' onClick={() => setAddOpen(true)}>
            <PlusCircle className='h-4 w-4' />
            Add subcategory
          </Button>
        </div>
      </div>

      {main.unclassifiedCount > 0 && (
        <div className='mb-4 flex flex-col gap-3 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm sm:flex-row sm:items-center sm:justify-between'>
          <p className='flex gap-2 text-amber-900'>
            <AlertCircle className='mt-0.5 h-4 w-4 shrink-0' />
            <span>
              <strong>{main.unclassifiedCount}</strong> product
              {main.unclassifiedCount === 1 ? " is" : "s are"} not in a subcategory yet.
              Shoppers still find {main.unclassifiedCount === 1 ? "it" : "them"} under “All{" "}
              {main.name}”.
            </span>
          </p>
          <Button variant='secondary' size='sm' asChild>
            <Link href={`/dashboard/categories/${main.id}/unclassified`}>Sort them now</Link>
          </Button>
        </div>
      )}

      {genericSubs.length > 0 && (
        <div className='mb-4 flex gap-2 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700'>
          <Info className='mt-0.5 h-4 w-4 shrink-0' />
          <p>
            {genericSubs.map((g) => `“${g.name}”`).join(", ")}{" "}
            {genericSubs.length === 1 ? "has" : "have"} the same name as {main.name}. It's
            an older catch-all, so it is not shown as a tab in the shop. When its products
            are in specific subcategories, you can delete it. Nothing is moved
            automatically.
          </p>
        </div>
      )}

      {subs.length === 0 ? (
        <Card className='text-center py-12'>
          <CardContent>
            <h2 className='text-lg font-semibold mb-1'>No subcategories yet</h2>
            <p className='text-slate-500 mb-6 max-w-md mx-auto'>
              Subcategories help shoppers narrow down {main.name}, for example by
              placement (Helix, Lobe, Daith) or by style (Hoops, Studs).
            </p>
            <Button variant='primary' onClick={() => setAddOpen(true)}>
              <PlusCircle className='h-4 w-4' />
              Add your first subcategory
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className='p-0'>
            <div className='hidden md:grid grid-cols-[88px_56px_minmax(0,1fr)_96px_80px_88px_300px] gap-3 border-b px-4 py-3 text-xs font-medium uppercase tracking-wide text-slate-500'>
              <span>Order</span>
              <span />
              <span>Subcategory</span>
              <span>Products</span>
              <span>In shop</span>
              <span>Homepage</span>
              <span className='text-right'>Actions</span>
            </div>
            <ul aria-label={`Subcategories of ${main.name}`}>
              {subs.map((sub, index) => (
                <li
                  key={sub.id}
                  onDragOver={(e) => dragId && e.preventDefault()}
                  onDrop={dropOn(sub.id)}
                  className={`grid grid-cols-[auto_1fr] gap-3 border-b px-4 py-3 last:border-b-0 md:grid-cols-[88px_56px_minmax(0,1fr)_96px_80px_88px_300px] md:items-center ${
                    dragId === sub.id ? "opacity-40" : ""
                  }`}>
                  <div className='row-span-2 flex items-center gap-1 md:row-span-1'>
                    <span
                      draggable
                      onDragStart={() => setDragId(sub.id)}
                      onDragEnd={() => setDragId(null)}
                      title='Drag to reorder'
                      className='hidden cursor-grab text-slate-400 md:inline-flex'>
                      <GripVertical className='h-4 w-4' />
                    </span>
                    <div className='flex flex-col md:flex-row'>
                      <Button
                        type='button'
                        variant='ghost'
                        size='icon'
                        className='size-8'
                        disabled={index === 0}
                        aria-label={`Move ${sub.name} up`}
                        onClick={() => move(index, -1)}>
                        <ArrowUp className='h-4 w-4' />
                      </Button>
                      <Button
                        type='button'
                        variant='ghost'
                        size='icon'
                        className='size-8'
                        disabled={index === subs.length - 1}
                        aria-label={`Move ${sub.name} down`}
                        onClick={() => move(index, 1)}>
                        <ArrowDown className='h-4 w-4' />
                      </Button>
                    </div>
                  </div>

                  <div className='hidden md:block'>
                    {sub.filename ? (
                      <img
                        src={`/uploads/${sub.filename}`}
                        alt=''
                        className='h-12 w-12 rounded object-cover'
                      />
                    ) : (
                      <div className='flex h-12 w-12 items-center justify-center rounded bg-slate-100 text-slate-400'>
                        <ImageIcon className='h-4 w-4' />
                      </div>
                    )}
                  </div>

                  <div className='min-w-0'>
                    <div className='flex flex-wrap items-center gap-2'>
                      <span className='font-medium'>{sub.name}</span>
                      {sub.hidden && <Badge variant='secondary'>Hidden</Badge>}
                      {sub.generic && <Badge variant='outline'>Same name as category</Badge>}
                    </div>
                    <a
                      href={`/categories/${encodeURIComponent(sub.slug)}`}
                      target='_blank'
                      rel='noreferrer'
                      className='block truncate font-mono text-xs text-slate-500 hover:underline'>
                      /categories/{sub.slug}
                    </a>
                    <p className='mt-1 text-sm text-slate-600 md:hidden'>
                      {sub.productCount} product{sub.productCount === 1 ? "" : "s"}
                    </p>
                  </div>

                  <div className='hidden text-sm md:block'>
                    {sub.productCount}
                    {sub.productCount !== sub.visibleProductCount && (
                      <span className='block text-xs text-slate-500'>
                        {sub.productCount - sub.visibleProductCount} hidden
                      </span>
                    )}
                  </div>

                  <div className='col-span-2 flex flex-wrap items-center gap-x-6 gap-y-2 md:contents'>
                    <label htmlFor={`visible-${sub.id}`} className='flex items-center gap-2 text-sm'>
                      <Switch
                        id={`visible-${sub.id}`}
                        checked={!sub.hidden}
                        disabled={busyId === sub.id}
                        onCheckedChange={(v) => setVisible(sub, v)}
                        aria-label={`Show ${sub.name} in the shop`}
                      />
                      <span className='md:hidden'>In shop</span>
                    </label>
                    <label htmlFor={`homepage-${sub.id}`} className='flex items-center gap-2 text-sm'>
                      <Switch
                        id={`homepage-${sub.id}`}
                        checked={sub.showOnLanding}
                        disabled={busyId === sub.id}
                        onCheckedChange={(v) => setOnHomepage(sub, v)}
                        aria-label={`Feature ${sub.name} on the homepage`}
                      />
                      <span className='md:hidden'>Homepage</span>
                    </label>

                    <div className='flex flex-wrap gap-2 md:justify-end'>
                      <Button variant='outline' size='sm' asChild>
                        <Link href={`/dashboard/categories/${main.id}/${sub.id}`}>
                          <Package className='h-4 w-4' />
                          Manage products
                        </Link>
                      </Button>
                      <Button
                        variant='outline'
                        size='icon'
                        className='size-9'
                        aria-label={`Edit ${sub.name}`}
                        onClick={() => setEditing(sub)}>
                        <Pencil className='h-4 w-4' />
                      </Button>
                      <Button
                        variant='outline'
                        size='icon'
                        className='size-9 text-red-700 hover:border-red-700'
                        aria-label={`Delete ${sub.name}`}
                        onClick={() => setDeleting(sub)}>
                        <Trash2 className='h-4 w-4' />
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <p className='mt-4 text-xs text-slate-500'>
        The order here is the order of the tabs in the shop. Drag a row by its handle,
        or use the arrows.
      </p>

      <SubcategoryDialog
        open={addOpen || !!editing}
        onOpenChange={(open) => {
          if (!open) {
            setAddOpen(false);
            setEditing(undefined);
          }
        }}
        mains={tree}
        parent={main}
        editing={editing}
        onSaved={refresh}
      />

      <DeleteSubcategoryDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(undefined)}
        parent={main}
        target={deleting}
        onDeleted={refresh}
        onHideInstead={(sub) => setVisible(sub, false)}
      />
    </div>
  );
}
