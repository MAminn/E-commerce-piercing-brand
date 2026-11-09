"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Save, Sparkles } from "lucide-react";
import { trpc } from "#root/shared/trpc/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#root/components/ui/card";
import { Button } from "#root/components/ui/button";
import { Label } from "#root/components/ui/label";
import { Switch } from "#root/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#root/components/ui/select";
import {
  DEFAULT_UPSELL_SETTINGS,
  UPSELL_MAX_ITEMS,
  UPSELL_MIN_ITEMS,
  type UpsellRandomPool,
  type UpsellSettings,
} from "#root/shared/upsell/config";

/**
 * Store-wide upsell switches. Ported from the Mach template.
 *
 * Per-product behaviour (global default / manual products / disabled) is set
 * on each product; this card only holds what applies to every product that
 * follows the global default, plus where upsells appear at all.
 */

const POOL_LABELS: Record<UpsellRandomPool, string> = {
  any: "Any in-stock product",
  "other-categories": "Only products from other categories",
  "same-category": "Only products from the same category",
};

function ToggleRow({
  id,
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className='flex items-center justify-between gap-4 rounded-md border p-3'>
      <div className='space-y-0.5'>
        <Label htmlFor={id}>{label}</Label>
        <p className='text-xs text-muted-foreground'>{hint}</p>
      </div>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
      />
    </div>
  );
}

export function UpsellSettingsCard() {
  const [settings, setSettings] = useState<UpsellSettings>(
    DEFAULT_UPSELL_SETTINGS,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  // What the storefront is doing right now — the last loaded/saved value, not
  // the unsaved toggle — so the status line never claims a change is live.
  const [savedEnabled, setSavedEnabled] = useState(
    DEFAULT_UPSELL_SETTINGS.enabled,
  );

  useEffect(() => {
    let cancelled = false;
    trpc.upsell.getSettings
      .query()
      .then((r) => {
        if (!cancelled && r.success) {
          setSettings(r.result);
          setSavedEnabled(r.result.enabled);
        }
      })
      .catch(() => {
        if (!cancelled) toast.error("Failed to load upsell settings");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const patch = (p: Partial<UpsellSettings>) =>
    setSettings((s) => ({ ...s, ...p }));

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const r = await trpc.upsell.updateSettings.mutate(settings);
      if (r.success) {
        setSettings(r.result);
        setSavedEnabled(r.result.enabled);
        toast.success("Upsell settings saved");
      } else {
        toast.error(r.error || "Failed to save upsell settings");
      }
    } catch {
      toast.error("Failed to save upsell settings");
    } finally {
      setIsSaving(false);
    }
  };

  const off = !settings.enabled;

  return (
    <Card id='upsells'>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <Sparkles className='h-5 w-5' />
          Upsells
          {!isLoading && (
            <span
              data-testid='upsell-status-badge'
              className={
                savedEnabled
                  ? "rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800"
                  : "rounded-full bg-gray-200 px-2 py-0.5 text-xs font-semibold text-gray-700"
              }>
              {savedEnabled ? "On" : "Off"}
            </span>
          )}
        </CardTitle>
        <CardDescription>
          Product recommendations on the product page and after a product is
          added to the bag. Each product follows the global default unless you
          set it to Manual products or Disabled when editing it. Recommendations
          never change prices or discounts.
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        {isLoading ? (
          <div className='flex justify-center py-6'>
            <Loader2 className='h-6 w-6 animate-spin text-muted-foreground' />
          </div>
        ) : (
          <>
            {!savedEnabled && (
              <p
                data-testid='upsell-off-notice'
                className='rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900'>
                Upsells are currently <strong>off</strong> — shoppers see no
                recommendations and product pages look exactly as they do today.
                Turn on &ldquo;Enable upsells&rdquo; and save to start.
              </p>
            )}
            <ToggleRow
              id='upsellEnabled'
              label='Enable upsells'
              hint='Off hides every upsell; product pages look exactly as they do today.'
              checked={settings.enabled}
              onChange={(v) => patch({ enabled: v })}
            />
            <ToggleRow
              id='upsellProductPage'
              label='Product page block'
              hint='Compact list under the Add to bag button.'
              checked={settings.productPageEnabled}
              disabled={off}
              onChange={(v) => patch({ productPageEnabled: v })}
            />
            <ToggleRow
              id='upsellPostAdd'
              label='After add-to-bag popup'
              hint='Modal on desktop, bottom sheet on mobile, shown after the product is added.'
              checked={settings.postAddEnabled}
              disabled={off}
              onChange={(v) => patch({ postAddEnabled: v })}
            />

            <div className='grid gap-4 sm:grid-cols-2'>
              <div className='space-y-2'>
                <Label htmlFor='upsellMaxItems'>Recommendations shown</Label>
                <Select
                  value={String(settings.maxItems)}
                  disabled={off}
                  onValueChange={(v) => patch({ maxItems: Number(v) })}>
                  <SelectTrigger id='upsellMaxItems' className='w-full'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from(
                      { length: UPSELL_MAX_ITEMS - UPSELL_MIN_ITEMS + 1 },
                      (_, i) => UPSELL_MIN_ITEMS + i,
                    ).map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className='space-y-2'>
                <Label htmlFor='upsellRandomPool'>
                  Global default: random from
                </Label>
                <Select
                  value={settings.randomPool}
                  disabled={off}
                  onValueChange={(v) =>
                    patch({ randomPool: v as UpsellRandomPool })
                  }>
                  <SelectTrigger id='upsellRandomPool' className='w-full'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(POOL_LABELS) as UpsellRandomPool[]).map(
                      (k) => (
                        <SelectItem key={k} value={k}>
                          {POOL_LABELS[k]}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className='text-xs text-muted-foreground'>
              Random picks always skip the product being viewed, anything out of
              stock or hidden, and anything already in the shopper&apos;s bag.
              They stay the same for a shopper during their visit.
            </p>

            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                  Saving...
                </>
              ) : (
                <>
                  <Save className='mr-2 h-4 w-4' />
                  Save Upsell Settings
                </>
              )}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
