import { useEffect, useState } from "react";
import { Loader2, ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "#root/components/ui/button";
import { Input } from "#root/components/ui/input";
import { Label } from "#root/components/ui/label";
import { Textarea } from "#root/components/ui/textarea";
import { Switch } from "#root/components/ui/switch";
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
import { RadioGroup, RadioGroupItem } from "#root/components/ui/radio-group";
import { CategoryImageUpload } from "#root/components/file-uploads/CategoryImageUpload";
import { trpc } from "#root/shared/trpc/client";
import type { Data } from "./+data";

export type AdminTree = Extract<Data, { success: true }>["tree"];
export type MainNode = AdminTree[number];
export type SubNode = MainNode["children"][number];

/** Close to what the server's slug() produces; the server has the final say. */
export function previewSlug(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ─── Create / edit ──────────────────────────────────────────────────────────

export function SubcategoryDialog({
  open,
  onOpenChange,
  mains,
  parent,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mains: MainNode[];
  /** Pre-selected main category. */
  parent: MainNode;
  /** The subcategory being edited; omit to create one. */
  editing?: SubNode;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState(parent.id);
  const [description, setDescription] = useState("");
  const [imageId, setImageId] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [visible, setVisible] = useState(true);
  const [onHomepage, setOnHomepage] = useState(false);
  const [customSlug, setCustomSlug] = useState("");
  const [editSlug, setEditSlug] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Reset every time the dialog opens, so an edit never shows the previous
  // subcategory's values.
  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? "");
    setParentId(editing?.parentId ?? parent.id);
    setDescription(editing?.description ?? "");
    setImageId(editing?.imageId ?? null);
    setImagePreview(editing?.filename ? `/uploads/${editing.filename}` : null);
    setVisible(editing ? !editing.hidden : true);
    setOnHomepage(editing?.showOnLanding ?? false);
    setCustomSlug(editing?.slug ?? "");
    setEditSlug(false);
    setPickerOpen(false);
  }, [open, editing, parent.id]);

  const autoSlug = previewSlug(name);
  const linkShown = editing ? (editSlug ? customSlug : editing.slug) : editSlug ? customSlug : autoSlug;

  const save = async () => {
    if (!name.trim()) {
      toast.error("Please enter a name.");
      return;
    }
    setSaving(true);
    try {
      const common = {
        name: name.trim(),
        description: description.trim() || null,
        imageId,
        hidden: !visible,
        showOnLanding: onHomepage,
        slug: editSlug ? customSlug.trim() || null : undefined,
      };
      const res = editing
        ? await trpc.category.edit.mutate({ id: editing.id, parentId, ...common })
        : await trpc.category.create.mutate({ parentId, ...common });
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success(editing ? `Saved “${name.trim()}”.` : `Created “${name.trim()}”.`);
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[90vh] overflow-y-auto sm:max-w-[560px]'>
        <DialogHeader>
          <DialogTitle>{editing ? `Edit “${editing.name}”` : "Add subcategory"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Changes appear in the shop straight away. Products stay assigned."
              : `A smaller group inside ${parent.name}, e.g. Helix or Lobe. It is added at the end of the list.`}
          </DialogDescription>
        </DialogHeader>

        <form
          className='grid gap-5 py-2'
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}>
          <div className='grid gap-2'>
            <Label htmlFor='sub-name'>Name</Label>
            <Input
              id='sub-name'
              autoFocus
              required
              maxLength={80}
              placeholder='e.g. Helix'
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <p className='text-xs text-muted-foreground'>
              Link:{" "}
              <span className='font-mono'>/categories/{linkShown || "…"}</span>
              {!editSlug && (
                <>
                  {" "}
                  <button
                    type='button'
                    className='underline underline-offset-2'
                    onClick={() => {
                      setCustomSlug(editing?.slug ?? autoSlug);
                      setEditSlug(true);
                    }}>
                    Change
                  </button>
                </>
              )}
            </p>
            {editSlug && (
              <div className='grid gap-1'>
                <Label htmlFor='sub-slug' className='text-xs'>
                  Custom link
                </Label>
                <Input
                  id='sub-slug'
                  value={customSlug}
                  onChange={(e) => setCustomSlug(e.target.value)}
                  placeholder={autoSlug}
                />
                {editing && (
                  <p className='text-xs text-amber-700'>
                    Old links to this subcategory will stop working.
                  </p>
                )}
              </div>
            )}
          </div>

          <div className='grid gap-2'>
            <Label htmlFor='sub-parent'>Belongs to</Label>
            <Select value={parentId} onValueChange={setParentId}>
              <SelectTrigger id='sub-parent'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {mains.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {editing && parentId !== editing.parentId && (
              <p className='text-xs text-amber-700'>
                Its products will also be listed under the new category.
              </p>
            )}
          </div>

          <div className='grid gap-2'>
            <CategoryImageUpload
              key={`${open}-${editing?.id ?? "new"}-${imagePreview ?? ""}`}
              value={imageId}
              previewUrl={imagePreview}
              onChange={(id) => {
                setImageId(id);
                if (!id) setImagePreview(null);
              }}
              label='Image (optional)'
              inputId='subcategory-image'
            />
            <button
              type='button'
              className='flex w-fit items-center gap-1.5 text-xs underline underline-offset-2'
              onClick={() => setPickerOpen((v) => !v)}>
              <ImageIcon className='h-3.5 w-3.5' />
              {pickerOpen ? "Hide product photos" : "Or use a product photo"}
            </button>
            {pickerOpen && (
              <ProductPhotoPicker
                mainCategoryId={parentId}
                subcategoryId={editing && editing.parentId === parentId ? editing.id : undefined}
                onPick={(fileId, diskname) => {
                  setImageId(fileId);
                  setImagePreview(`/uploads/${diskname}`);
                  setPickerOpen(false);
                }}
              />
            )}
          </div>

          <div className='grid gap-2'>
            <Label htmlFor='sub-description'>
              Short description <span className='font-normal text-muted-foreground'>(optional)</span>
            </Label>
            <Textarea
              id='sub-description'
              maxLength={300}
              rows={2}
              placeholder='Shown under the heading on the shop page.'
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className='grid gap-3 rounded-md border p-3'>
            <label htmlFor='sub-visible' className='flex items-center justify-between gap-4 text-sm'>
              <span>
                <span className='font-medium'>Show in shop</span>
                <span className='block text-xs text-muted-foreground'>
                  When off, the tab is hidden. Products stay in {parent.name}.
                </span>
              </span>
              <Switch id='sub-visible' checked={visible} onCheckedChange={setVisible} />
            </label>
            <label htmlFor='sub-homepage' className='flex items-center justify-between gap-4 text-sm'>
              <span>
                <span className='font-medium'>Feature on homepage</span>
                <span className='block text-xs text-muted-foreground'>
                  Adds a tile to “Shop by placement”.
                </span>
              </span>
              <Switch id='sub-homepage' checked={onHomepage} onCheckedChange={setOnHomepage} />
            </label>
          </div>

          <DialogFooter>
            <Button type='button' variant='outline' onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type='submit' variant='primary' disabled={saving}>
              {saving && <Loader2 className='h-4 w-4 animate-spin' />}
              {editing ? "Save changes" : "Create subcategory"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Thumbnails of products in this subcategory, to reuse one as the image.
 * A subcategory usually gets its image right after it is created — while it
 * is still empty — so an empty subcategory shows the main category's photos.
 */
function ProductPhotoPicker({
  mainCategoryId,
  subcategoryId,
  onPick,
}: {
  mainCategoryId: string;
  subcategoryId?: string;
  onPick: (fileId: string, diskname: string) => void;
}) {
  const [items, setItems] = useState<{ id: string; name: string; imageId: string; imageUrl: string | null }[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    const load = (view: "in_subcategory" | "in_category") =>
      trpc.category.products
        .query({ mainCategoryId, subcategoryId, view, page: 1, pageSize: 24 })
        .then((res) => (res.success ? res.result.items : []));
    (async () => {
      let rows = subcategoryId ? await load("in_subcategory") : [];
      if (rows.length === 0) rows = await load("in_category");
      if (!cancelled) setItems(rows);
    })().catch(() => !cancelled && setItems([]));
    return () => {
      cancelled = true;
    };
  }, [mainCategoryId, subcategoryId]);

  if (items === null) {
    return <p className='text-xs text-muted-foreground'>Loading photos…</p>;
  }
  const withPhoto = items.filter((i) => i.imageUrl);
  if (withPhoto.length === 0) {
    return <p className='text-xs text-muted-foreground'>No product photos here yet.</p>;
  }
  return (
    <div className='grid grid-cols-4 gap-2 sm:grid-cols-6'>
      {withPhoto.map((p) => (
        <button
          key={p.id}
          type='button'
          title={p.name}
          aria-label={`Use the photo of ${p.name}`}
          className='aspect-square overflow-hidden rounded border hover:ring-2 hover:ring-stone-900 focus-visible:ring-2 focus-visible:ring-stone-900'
          onClick={() => onPick(p.imageId, p.imageUrl as string)}>
          <img src={`/uploads/${p.imageUrl}`} alt='' className='h-full w-full object-cover' loading='lazy' />
        </button>
      ))}
    </div>
  );
}

// ─── Delete ─────────────────────────────────────────────────────────────────

export function DeleteSubcategoryDialog({
  open,
  onOpenChange,
  parent,
  target,
  onDeleted,
  onHideInstead,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parent: MainNode;
  target?: SubNode;
  onDeleted: () => void;
  onHideInstead: (sub: SubNode) => void;
}) {
  const [destination, setDestination] = useState<string>("parent");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setDestination("parent");
  }, [open]);

  if (!target) return null;
  const siblings = parent.children.filter((c) => c.id !== target.id);
  const count = target.productCount;

  const confirm = async () => {
    setBusy(true);
    try {
      const res = await trpc.category.delete.mutate({
        id: target.id,
        moveProductsTo: count > 0 ? destination : undefined,
      });
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success(
        count > 0
          ? `Deleted “${target.name}”. Its ${count} product${count === 1 ? "" : "s"} ${
              destination === "parent"
                ? `stay in ${parent.name}`
                : `moved to ${siblings.find((s) => s.id === destination)?.name}`
            }.`
          : `Deleted “${target.name}”.`,
      );
      onOpenChange(false);
      onDeleted();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-[520px]'>
        <DialogHeader>
          <DialogTitle>Delete “{target.name}”?</DialogTitle>
          <DialogDescription>
            No products are deleted. {count === 0 && "This subcategory is empty."}
          </DialogDescription>
        </DialogHeader>

        {count > 0 && (
          <div className='grid gap-3 py-2'>
            <p className='text-sm'>
              {count} product{count === 1 ? " is" : "s are"} in this subcategory. What
              should happen to {count === 1 ? "it" : "them"}?
            </p>
            <RadioGroup value={destination} onValueChange={setDestination} className='grid gap-2'>
              <label htmlFor='dest-parent' className='flex items-start gap-3 rounded-md border p-3 text-sm'>
                <RadioGroupItem id='dest-parent' value='parent' className='mt-0.5' />
                <span>
                  Keep {count === 1 ? "it" : "them"} in {parent.name} only
                  <span className='block text-xs text-muted-foreground'>
                    Still in the shop under “All {parent.name}”.
                  </span>
                </span>
              </label>
              {siblings.map((s) => (
                <label key={s.id} htmlFor={`dest-${s.id}`} className='flex items-start gap-3 rounded-md border p-3 text-sm'>
                  <RadioGroupItem id={`dest-${s.id}`} value={s.id} className='mt-0.5' />
                  <span>Move {count === 1 ? "it" : "them"} to {s.name}</span>
                </label>
              ))}
            </RadioGroup>
            <p className='text-xs text-muted-foreground'>
              Only need it gone for a while?{" "}
              <button
                type='button'
                className='underline underline-offset-2'
                onClick={() => {
                  onOpenChange(false);
                  onHideInstead(target);
                }}>
                Hide it from the shop instead
              </button>
              .
            </p>
          </div>
        )}

        <DialogFooter>
          <Button type='button' variant='outline' onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type='button' variant='destructive' disabled={busy} onClick={confirm}>
            {busy && <Loader2 className='h-4 w-4 animate-spin' />}
            Delete subcategory
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
