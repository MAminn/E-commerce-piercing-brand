import { useEffect, useMemo, useState } from "react";
import { trpc } from "#root/shared/trpc/client";
import type { BundleCampaignDto } from "#root/backend/bundles/service";
import { Badge } from "#root/components/ui/badge";
import { Button } from "#root/components/ui/button";
import { Checkbox } from "#root/components/ui/checkbox";
import { ArrowDown, ArrowUp, X } from "lucide-react";

interface HomepageBundlePickerProps {
  /** Chosen campaign ids in display order. Empty = automatic (all live campaigns, CMS sort order). */
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}

const STATE_LABEL: Record<BundleCampaignDto["state"], string> = {
  inactive: "Draft",
  scheduled: "Scheduled",
  active: "Active",
  expired: "Expired",
};

/**
 * Picks which bundle campaigns the homepage rail shows, in order. Lists every
 * campaign (not just live ones) so a scheduled campaign can be placed ahead
 * of time — the storefront still only renders the ones that are live.
 */
export function HomepageBundlePicker({ selectedIds, onChange, disabled }: HomepageBundlePickerProps) {
  const [campaigns, setCampaigns] = useState<BundleCampaignDto[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    trpc.bundle.adminList
      .query()
      .then((result) => {
        if (cancelled) return;
        setCampaigns(result.success && result.result ? result.result : []);
      })
      .catch(() => {
        if (!cancelled) setCampaigns([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const byId = useMemo(() => new Map(campaigns.map((c) => [c.id, c])), [campaigns]);

  const toggle = (id: string) => {
    if (selectedIds.includes(id)) onChange(selectedIds.filter((x) => x !== id));
    else onChange([...selectedIds, id]);
  };

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= selectedIds.length) return;
    const next = [...selectedIds];
    const [id] = next.splice(index, 1);
    if (!id) return;
    next.splice(target, 0, id);
    onChange(next);
  };

  if (loading) return <p className="text-sm text-muted-foreground">Loading campaigns…</p>;
  if (campaigns.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No bundle campaigns yet — create one under Bundles &amp; Stacks. With none selected, every live campaign is shown automatically.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Leave everything unchecked to show all live campaigns automatically (in their merchandising order). Check campaigns to
        hand-pick and order them; drafts and scheduled campaigns can be placed now and appear once live.
      </p>
      <ul className="divide-y rounded-md border">
        {campaigns.map((c) => {
          const checked = selectedIds.includes(c.id);
          return (
            <li key={c.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <Checkbox checked={checked} disabled={disabled} onCheckedChange={() => toggle(c.id)} id={`bundle-pick-${c.id}`} />
              <label htmlFor={`bundle-pick-${c.id}`} className="flex-1 min-w-0 cursor-pointer">
                <span className="block truncate font-medium">{c.internalName}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {c.title} · {c.type === "curated_stack" ? "Ready Set" : "Pick Your Set"}
                </span>
              </label>
              <Badge variant={c.state === "active" ? "default" : "outline"}>{STATE_LABEL[c.state]}</Badge>
              {c.availability === "sold_out" && <Badge variant="destructive">Sold out</Badge>}
            </li>
          );
        })}
      </ul>

      {selectedIds.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium">Display order</p>
          <ol className="divide-y rounded-md border">
            {selectedIds.map((id, index) => (
              <li key={id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                <span className="w-5 text-xs text-muted-foreground">{index + 1}.</span>
                <span className="flex-1 truncate">{byId.get(id)?.internalName ?? `${id.slice(0, 8)}…`}</span>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={disabled || index === 0} onClick={() => move(index, -1)} aria-label="Move up">
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={disabled || index === selectedIds.length - 1} onClick={() => move(index, 1)} aria-label="Move down">
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" disabled={disabled} onClick={() => toggle(id)} aria-label="Remove">
                  <X className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
