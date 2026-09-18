import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BarChart3, Edit, Layers, Loader2, PlusCircle, Sparkles, Trash2 } from "lucide-react";
import { trpc } from "#root/shared/trpc/client";
import { STORE_CURRENCY } from "#root/shared/config/branding";
import { type BundleCampaignState } from "#root/shared/bundles/evaluate";
import { Card, CardContent } from "#root/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#root/components/ui/table";
import { Button } from "#root/components/ui/button";
import { Badge } from "#root/components/ui/badge";
import { Switch } from "#root/components/ui/switch";
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
import { CampaignFormDialog, type BundleCampaign } from "./components";

const STATE_LABEL: Record<BundleCampaignState, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  inactive: { label: "Draft", variant: "outline" },
  scheduled: { label: "Scheduled", variant: "secondary" },
  active: { label: "Active", variant: "default" },
  expired: { label: "Expired", variant: "destructive" },
};

const money = (n: number) => `${n.toFixed(2)} ${STORE_CURRENCY}`;

/**
 * "Choose 6 from 10 · 480.00 EGP" / "3·4·6 pieces from 10 · from 270.00 EGP"
 * / "4 products · 5 units · 450.00 EGP"
 *
 * A multi-tier campaign names its rungs rather than pretending one quantity
 * and one price describe it.
 */
function ruleSummary(c: BundleCampaign): string {
  const price = c.fixedBundlePrice === null ? "—" : money(c.fixedBundlePrice);
  if (c.type === "curated_stack") {
    return `${c.eligibleProductCount} product${c.eligibleProductCount === 1 ? "" : "s"} · ${c.unitCount} unit${c.unitCount === 1 ? "" : "s"} · ${price}`;
  }
  if (c.tiers.length > 1) {
    const sizes = c.tiers.map((t) => t.quantity).join("·");
    const cheapest = Math.min(...c.tiers.map((t) => t.price));
    return `${sizes} pieces from ${c.eligibleProductCount} · from ${money(cheapest)}`;
  }
  return `Choose ${c.requiredQuantity} from ${c.eligibleProductCount} · ${price}`;
}

/** Savings status against CURRENT product prices — never a stored figure. */
function valueSummary(c: BundleCampaign): { text: string; tone: "ok" | "warn" | "muted" } {
  const price = c.fixedBundlePrice ?? 0;
  if (c.type === "curated_stack") {
    if (c.regularValue === null || c.eligibleProductCount === 0) return { text: "No products yet", tone: "muted" };
    const saving = c.savings ?? c.regularValue - price;
    if (saving > 0) {
      const pct = c.regularValue > 0 ? Math.round((saving / c.regularValue) * 100) : 0;
      return { text: `Worth ${money(c.regularValue)} · saves ${money(saving)} (${pct}%)`, tone: "ok" };
    }
    if (saving === 0) return { text: `Worth ${money(c.regularValue)} · no saving`, tone: "warn" };
    return { text: `Worth ${money(c.regularValue)} · costs ${money(-saving)} MORE`, tone: "warn" };
  }
  // Multi-tier: report each rung's own availability rather than collapsing
  // them into one figure that would describe none of them.
  if (c.tiers.length > 1) {
    const sellable = c.tiers.filter((t) => t.availability === "available");
    if (sellable.length === 0) return { text: "No tier can be completed right now", tone: "warn" };
    const detail = c.tiers
      .map((t) => `${t.quantity}: ${t.availability === "available" ? money(t.price) : "sold out"}`)
      .join(" · ");
    return {
      text: detail,
      tone: sellable.length === c.tiers.length ? "ok" : "warn",
    };
  }
  if (!c.valueRange) return { text: "Pool can't complete a stack", tone: "warn" };
  const { min, max } = c.valueRange;
  if (min <= price) return { text: `Separately ${money(min)}–${money(max)} · cheapest pick saves nothing`, tone: "warn" };
  return { text: `Separately ${money(min)}–${money(max)} · saves ${money(min - price)}–${money(max - price)}`, tone: "ok" };
}

function formatDate(value: Date | string | null): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function Page() {
  const [campaigns, setCampaigns] = useState<BundleCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<BundleCampaign | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BundleCampaign | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const result = await trpc.bundle.adminList.query();
      if (result.success && result.result) {
        setCampaigns(result.result);
      } else {
        toast.error("Failed to load bundle campaigns");
      }
    } catch {
      toast.error("Failed to load bundle campaigns");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(campaign: BundleCampaign) {
    setEditing(campaign);
    setDialogOpen(true);
  }

  async function toggleActive(campaign: BundleCampaign, isActive: boolean) {
    setTogglingId(campaign.id);
    try {
      const result = await trpc.bundle.setActive.mutate({ id: campaign.id, isActive });
      if (result.success) {
        toast.success(isActive ? "Campaign activated" : "Campaign deactivated");
        await load();
      } else {
        // The server refuses to activate a campaign whose pool can't complete a bundle.
        toast.error(result.error);
      }
    } catch {
      toast.error("Failed to update campaign");
    } finally {
      setTogglingId(null);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      const result = await trpc.bundle.delete.mutate({ id: deleteTarget.id });
      if (result.success) {
        toast.success("Campaign deleted");
        await load();
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error("Failed to delete campaign");
    } finally {
      setDeleteTarget(null);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Layers className="h-6 w-6" /> Bundles &amp; Stacks
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Build Your Stack (shopper picks N from a pool) and Curated Stacks (you fix the set) sold for one price. Live
            campaigns appear on /bundles, the homepage rail and any category you place them on. Generic cart rules
            (spend X get Y) live under Offers.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" asChild>
            <a href="/dashboard/bundles/analytics">
              <BarChart3 className="mr-2 h-4 w-4" /> Analytics
            </a>
          </Button>
          <Button onClick={openCreate}>
            <PlusCircle className="mr-2 h-4 w-4" /> New Campaign
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center items-center p-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : campaigns.length === 0 ? (
            <div className="text-center p-12 text-muted-foreground">
              No bundle campaigns yet. Click "New Campaign" to create your first Build Your Stack.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Type &amp; rule</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Options</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Schedule</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((c) => {
                  const state = STATE_LABEL[c.state];
                  const unavailable = c.eligibleProducts.filter((p) => p.deleted || p.hidden).length;
                  const isCurated = c.type === "curated_stack";
                  const value = valueSummary(c);
                  return (
                    <TableRow key={c.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          {c.imageUrl ? (
                            <img src={`/uploads/${c.imageUrl}`} alt="" className="h-10 w-10 rounded object-cover" />
                          ) : (
                            <div className="h-10 w-10 rounded bg-muted flex items-center justify-center">
                              <Layers className="h-4 w-4 text-muted-foreground" />
                            </div>
                          )}
                          <div>
                            <div className="font-medium">{c.internalName}</div>
                            <div className="text-xs text-muted-foreground">
                              {c.title} · <span className="font-mono">/bundles/{c.slug}</span>
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={isCurated ? "default" : "secondary"} className="mb-1 gap-1">
                          {isCurated ? <Sparkles className="h-3 w-3" /> : <Layers className="h-3 w-3" />}
                          {isCurated ? "Curated Stack" : "Build Your Stack"}
                        </Badge>
                        <div className="text-sm">{ruleSummary(c)}</div>
                        {unavailable > 0 && (
                          <div className="text-xs text-amber-600 mt-0.5">
                            {unavailable} product{unavailable > 1 ? "s are" : " is"} hidden or deleted
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className={`text-xs ${value.tone === "warn" ? "text-amber-600" : value.tone === "ok" ? "text-emerald-700" : "text-muted-foreground"}`}>
                          {value.text}
                        </div>
                        {c.availability === "sold_out" && c.state === "active" && (
                          <Badge variant="destructive" className="mt-1">
                            Sold out
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {!isCurated && <Badge variant="outline">{c.allowDuplicates ? "Duplicates" : "Distinct"}</Badge>}
                          {!isCurated && c.allowDuplicates && c.maxPerProduct !== null && (
                            <Badge variant="outline">Max {c.maxPerProduct}/product</Badge>
                          )}
                          {c.isRepeatable && <Badge variant="outline">Repeatable</Badge>}
                          {c.categoryIds.length > 0 && (
                            <Badge variant="outline">
                              {c.categoryIds.length} categor{c.categoryIds.length === 1 ? "y" : "ies"}
                            </Badge>
                          )}
                          <Badge variant={c.offerStacking === "exclusive" ? "secondary" : "outline"}>
                            {c.offerStacking === "exclusive" ? "Exclusive" : "Stackable"}
                          </Badge>
                          {c.badgeText && <Badge>{c.badgeText}</Badge>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={c.isActive}
                            disabled={togglingId === c.id}
                            onCheckedChange={(v) => toggleActive(c, v)}
                            aria-label={c.isActive ? "Deactivate" : "Activate"}
                          />
                          <Badge variant={state.variant}>{state.label}</Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        <div>{formatDate(c.startsAt)}</div>
                        <div>→ {c.endsAt ? formatDate(c.endsAt) : "no end"}</div>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(c)} aria-label="Edit">
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setDeleteTarget(c)}
                            aria-label="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <CampaignFormDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} onSaved={load} />

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteTarget?.internalName}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the campaign and its eligible-product list. Shoppers will no longer be able to
              build this bundle. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
