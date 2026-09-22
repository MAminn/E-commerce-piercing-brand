"use client";

import { useEffect, useMemo, useState } from "react";
import { trpc } from "#root/shared/trpc/client";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#root/components/ui/card";
import { Button } from "#root/components/ui/button";
import { Input } from "#root/components/ui/input";
import { Label } from "#root/components/ui/label";
import { Checkbox } from "#root/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "#root/components/ui/radio-group";
import { Loader2, Save, Truck } from "lucide-react";
import { STORE_CURRENCY } from "#root/shared/config/branding";
import {
  EGYPT_GOVERNORATES,
  type GovernorateCode,
} from "#root/shared/shipping/egypt-governorates";
import {
  DEFAULT_SHIPPING_RULES,
  MAX_SHIPPING_FEE,
  validateShippingRules,
  type ShippingMode,
  type ShippingRulesConfig,
} from "#root/shared/shipping/rules";

/** One editable row. `fee` is the raw input string so partial typing survives re-renders. */
interface RateDraft {
  fee: string;
  unavailable: boolean;
}

type RatesDraft = Record<GovernorateCode, RateDraft>;

function emptyDraft(): RatesDraft {
  const draft = {} as RatesDraft;
  for (const g of EGYPT_GOVERNORATES) draft[g.code] = { fee: "", unavailable: false };
  return draft;
}

function draftFromRules(rules: ShippingRulesConfig): { rates: RatesDraft; fallback: RateDraft } {
  const rates = emptyDraft();
  for (const g of EGYPT_GOVERNORATES) {
    const entry = rules.rates[g.code];
    if (entry === null) rates[g.code] = { fee: "", unavailable: true };
    else if (typeof entry === "number") rates[g.code] = { fee: String(entry), unavailable: false };
  }
  const fallback: RateDraft =
    rules.fallbackFee === null
      ? { fee: "", unavailable: true }
      : { fee: String(rules.fallbackFee), unavailable: false };
  return { rates, fallback };
}

/** Parses a fee input. `undefined` = blank, `null` = unavailable, `"invalid"` = not a usable number. */
function parseFeeInput(draft: RateDraft): number | null | undefined | "invalid" {
  if (draft.unavailable) return null;
  const raw = draft.fee.trim();
  if (raw === "") return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > MAX_SHIPPING_FEE) return "invalid";
  if (Math.round(n * 100) !== n * 100) return "invalid";
  return n;
}

/**
 * Turns the form into a rules config. Returns a problem message instead when
 * a value cannot be saved. Exported for the admin-validation tests.
 */
export function buildRulesFromDraft(input: {
  mode: ShippingMode;
  rates: RatesDraft;
  fallback: RateDraft;
}): { rules: ShippingRulesConfig } | { error: string } {
  const rates: ShippingRulesConfig["rates"] = {};
  for (const g of EGYPT_GOVERNORATES) {
    const parsed = parseFeeInput(input.rates[g.code]);
    if (parsed === "invalid") {
      return { error: `${g.nameEn}: enter a fee between 0 and ${MAX_SHIPPING_FEE} ${STORE_CURRENCY} (two decimals at most).` };
    }
    if (parsed !== undefined) rates[g.code] = parsed;
  }
  const fallbackParsed = parseFeeInput(input.fallback);
  if (fallbackParsed === "invalid") {
    return { error: `Other governorates: enter a fee between 0 and ${MAX_SHIPPING_FEE} ${STORE_CURRENCY} (two decimals at most).` };
  }
  const rules: ShippingRulesConfig = {
    version: 1,
    mode: input.mode,
    currency: "EGP",
    rates,
    // A blank "other governorates" fee is the same as unavailable: there is
    // nothing to charge, so an unlisted destination cannot be served.
    fallbackFee: fallbackParsed === undefined ? null : fallbackParsed,
  };
  const problem = validateShippingRules(rules);
  if (problem) return { error: problem };
  return { rules };
}

export function ShippingSettingsCard() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [mode, setMode] = useState<ShippingMode>("flat");
  const [flatFee, setFlatFee] = useState("");
  const [rates, setRates] = useState<RatesDraft>(() => emptyDraft());
  const [fallback, setFallback] = useState<RateDraft>({ fee: "", unavailable: true });
  const [fillValue, setFillValue] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await trpc.shipping.getRules.query();
        if (cancelled) return;
        if (res.success) {
          const rules = res.result.rules ?? DEFAULT_SHIPPING_RULES;
          setMode(rules.mode);
          setFlatFee(String(res.result.flatFee));
          const draft = draftFromRules(rules);
          setRates(draft.rates);
          setFallback(draft.fallback);
        } else {
          toast.error(res.error || "Failed to load shipping settings");
        }
      } catch (err) {
        console.error("Failed to load shipping settings:", err);
        toast.error("Failed to load shipping settings");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const configuredCount = useMemo(
    () => EGYPT_GOVERNORATES.filter((g) => parseFeeInput(rates[g.code]) !== undefined && !rates[g.code].unavailable).length,
    [rates],
  );

  const updateRate = (code: GovernorateCode, patch: Partial<RateDraft>) =>
    setRates((prev) => ({ ...prev, [code]: { ...prev[code], ...patch } }));

  const fillEmpty = () => {
    const n = Number(fillValue);
    if (fillValue.trim() === "" || !Number.isFinite(n) || n < 0) {
      toast.error("Enter a fee to fill the empty rows with");
      return;
    }
    setRates((prev) => {
      const next = { ...prev };
      for (const g of EGYPT_GOVERNORATES) {
        if (!next[g.code].unavailable && next[g.code].fee.trim() === "") {
          next[g.code] = { fee: fillValue.trim(), unavailable: false };
        }
      }
      return next;
    });
  };

  const handleSave = async () => {
    // Flat mode: the flat fee is its own column and stays authoritative there.
    if (mode === "flat") {
      const fee = Number.parseFloat(flatFee);
      if (Number.isNaN(fee) || fee < 0) {
        toast.error("Please enter a valid shipping fee (0 or more)");
        return;
      }
    }
    // The governorate table is saved in BOTH modes so switching to flat and
    // back does not throw the rates away; in flat mode it is simply not read.
    const built = buildRulesFromDraft({ mode, rates, fallback });
    if ("error" in built) {
      toast.error(built.error);
      return;
    }

    setIsSaving(true);
    try {
      if (mode === "flat") {
        const feeResult = await trpc.settings.updateShippingFee.mutate({ fee: Number.parseFloat(flatFee) });
        if (!feeResult.success) {
          toast.error(feeResult.error || "Failed to update shipping fee");
          return;
        }
        setFlatFee(String(feeResult.result.shippingFee));
      }
      const rulesResult = await trpc.shipping.updateRules.mutate({ rules: built.rules });
      if (!rulesResult.success) {
        toast.error(rulesResult.error || "Failed to save shipping rules");
        return;
      }
      toast.success(
        mode === "zones"
          ? "Shipping rates by governorate are now live"
          : "Flat shipping fee saved",
      );
    } catch (err) {
      console.error("Failed to save shipping settings:", err);
      toast.error("Failed to save shipping settings");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className='py-10 flex items-center justify-center text-sm text-muted-foreground'>
          <Loader2 className='mr-2 h-4 w-4 animate-spin' /> Loading shipping settings…
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <Truck className='h-5 w-5' />
          Shipping
        </CardTitle>
        <CardDescription>
          Choose how delivery is charged. Customers see the exact fee at checkout
          once they pick their governorate; the cart says &quot;calculated at
          checkout&quot; until then.
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-6'>
        <RadioGroup
          value={mode}
          onValueChange={(v) => setMode(v === "zones" ? "zones" : "flat")}
          className='grid gap-3'>
          <label htmlFor='shipping-mode-zones' className='flex items-start gap-3 rounded-md border p-3 cursor-pointer has-[[data-state=checked]]:border-foreground'>
            <RadioGroupItem value='zones' id='shipping-mode-zones' className='mt-0.5' />
            <span>
              <span className='block text-sm font-medium'>By governorate</span>
              <span className='block text-xs text-muted-foreground'>
                A fee per governorate, an optional fee for the rest, and destinations you don&apos;t serve.
              </span>
            </span>
          </label>
          <label htmlFor='shipping-mode-flat' className='flex items-start gap-3 rounded-md border p-3 cursor-pointer has-[[data-state=checked]]:border-foreground'>
            <RadioGroupItem value='flat' id='shipping-mode-flat' className='mt-0.5' />
            <span>
              <span className='block text-sm font-medium'>Flat fee for all orders</span>
              <span className='block text-xs text-muted-foreground'>
                One fee whatever the destination. Governorate is optional at checkout.
              </span>
            </span>
          </label>
        </RadioGroup>

        {mode === "flat" ? (
          <div className='space-y-2'>
            <Label htmlFor='shippingFee'>Shipping Fee ({STORE_CURRENCY})</Label>
            <div className='flex items-center gap-3'>
              <Input
                id='shippingFee'
                type='number'
                min='0'
                step='0.01'
                value={flatFee}
                onChange={(e) => setFlatFee(e.target.value)}
                placeholder='0.00'
                className='max-w-[200px]'
              />
              <span className='text-sm text-muted-foreground'>{STORE_CURRENCY}</span>
            </div>
            <p className='text-xs text-muted-foreground'>
              Added to every order at checkout. Enter 0 to offer free shipping.
            </p>
          </div>
        ) : (
          <div className='space-y-4'>
            <div className='flex flex-wrap items-end gap-3 rounded-md bg-muted/40 p-3'>
              <div className='space-y-1'>
                <Label htmlFor='shipping-fill' className='text-xs'>Fill empty rows with</Label>
                <div className='flex items-center gap-2'>
                  <Input
                    id='shipping-fill'
                    type='number'
                    min='0'
                    step='0.01'
                    value={fillValue}
                    onChange={(e) => setFillValue(e.target.value)}
                    placeholder='0.00'
                    className='w-[120px]'
                  />
                  <Button type='button' variant='outline' size='sm' onClick={fillEmpty}>
                    Fill
                  </Button>
                </div>
              </div>
              <p className='text-xs text-muted-foreground'>
                {configuredCount} of {EGYPT_GOVERNORATES.length} governorates have a rate. Blank rows use the
                &quot;other governorates&quot; fee below.
              </p>
            </div>

            <div className='divide-y rounded-md border'>
              <div className='grid grid-cols-[1fr_140px_120px] items-center gap-3 px-3 py-2 text-xs font-medium text-muted-foreground'>
                <span>Governorate</span>
                <span>Fee ({STORE_CURRENCY})</span>
                <span>Not available</span>
              </div>
              {EGYPT_GOVERNORATES.map((g) => {
                const row = rates[g.code];
                return (
                  <div
                    key={g.code}
                    className='grid grid-cols-[1fr_140px_120px] items-center gap-3 px-3 py-2'
                    data-testid={`rate-row-${g.code}`}>
                    <div className='min-w-0'>
                      <Label htmlFor={`rate-${g.code}`} className='block text-sm font-normal'>
                        {g.nameEn}
                      </Label>
                      <span className='block text-xs text-muted-foreground' dir='rtl'>
                        {g.nameAr}
                      </span>
                    </div>
                    <Input
                      id={`rate-${g.code}`}
                      type='number'
                      min='0'
                      step='0.01'
                      inputMode='decimal'
                      value={row.fee}
                      disabled={row.unavailable}
                      onChange={(e) => updateRate(g.code, { fee: e.target.value })}
                      placeholder='—'
                    />
                    <label htmlFor={`unavailable-${g.code}`} className='flex items-center gap-2 text-xs text-muted-foreground'>
                      <Checkbox
                        id={`unavailable-${g.code}`}
                        checked={row.unavailable}
                        onCheckedChange={(checked) =>
                          updateRate(g.code, { unavailable: checked === true, fee: checked === true ? "" : row.fee })
                        }
                        aria-label={`${g.nameEn} not available`}
                      />
                      Not available
                    </label>
                  </div>
                );
              })}
              <div className='grid grid-cols-[1fr_140px_120px] items-center gap-3 bg-muted/30 px-3 py-2'>
                <div>
                  <Label htmlFor='rate-fallback' className='block text-sm font-medium'>
                    Other governorates
                  </Label>
                  <span className='block text-xs text-muted-foreground'>
                    Applies to every governorate left blank above.
                  </span>
                </div>
                <Input
                  id='rate-fallback'
                  type='number'
                  min='0'
                  step='0.01'
                  inputMode='decimal'
                  value={fallback.fee}
                  disabled={fallback.unavailable}
                  onChange={(e) => setFallback((prev) => ({ ...prev, fee: e.target.value }))}
                  placeholder='—'
                />
                <label htmlFor='unavailable-fallback' className='flex items-center gap-2 text-xs text-muted-foreground'>
                  <Checkbox
                    id='unavailable-fallback'
                    checked={fallback.unavailable}
                    onCheckedChange={(checked) =>
                      setFallback((prev) => ({ unavailable: checked === true, fee: checked === true ? "" : prev.fee }))
                    }
                    aria-label='Other governorates not available'
                  />
                  Not available
                </label>
              </div>
            </div>
            <p className='text-xs text-muted-foreground'>
              The flat fee is not used in this mode. Fees are in {STORE_CURRENCY}; a free-shipping
              offer can still reduce the charged amount to 0. Changing rates never alters orders already placed.
            </p>
          </div>
        )}

        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? (
            <>
              <Loader2 className='mr-2 h-4 w-4 animate-spin' />
              Saving...
            </>
          ) : (
            <>
              <Save className='mr-2 h-4 w-4' />
              Save Changes
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
