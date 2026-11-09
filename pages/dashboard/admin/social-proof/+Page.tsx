import { useEffect, useMemo, useState } from "react";
import { trpc } from "#root/shared/trpc/client";
import { toast } from "sonner";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "#root/components/ui/card";
import { Button } from "#root/components/ui/button";
import { Input } from "#root/components/ui/input";
import { Label } from "#root/components/ui/label";
import { Switch } from "#root/components/ui/switch";
import { Checkbox } from "#root/components/ui/checkbox";
import { ScrollArea } from "#root/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#root/components/ui/select";
import { Loader2, Save, X } from "lucide-react";
import { SocialProofCard } from "#root/components/storefront/social-proof/SocialProofCard";
import { translations } from "#root/lib/i18n/translations";

type OrderStatusOption = "processing" | "shipped" | "delivered";

interface SocialProofConfigForm {
  enabled: boolean;
  firstDelaySeconds: number;
  displayDurationSeconds: number;
  intervalSeconds: number;
  maxPerSession: number;
  lookbackDays: number;
  showLocation: boolean;
  locationSource: "city" | "governorate";
  showRelativeTime: boolean;
  allowedProductIds: string[];
  eligibleStatuses: OrderStatusOption[];
}

interface ProductOption {
  id: string;
  name: string;
}

/**
 * Mirrors the Zod bounds in backend/social-proof/trpc.ts. Kept as data so the
 * inputs, the clamping and the helper text can't drift apart from each other
 * — the server still enforces them either way.
 */
const BOUNDS = {
  firstDelaySeconds: { min: 0, max: 60 },
  displayDurationSeconds: { min: 2, max: 20 },
  intervalSeconds: { min: 5, max: 120 },
  maxPerSession: { min: 1, max: 20 },
  lookbackDays: { min: 1, max: 365 },
} as const;

const STATUS_OPTIONS: Array<{ value: OrderStatusOption; label: string; hint: string }> = [
  {
    value: "processing",
    label: "Processing",
    hint: "Confirmed and being prepared.",
  },
  { value: "shipped", label: "Shipped", hint: "Handed to the courier." },
  { value: "delivered", label: "Delivered", hint: "Received by the customer." },
];

function clamp(value: number, key: keyof typeof BOUNDS): number {
  const { min, max } = BOUNDS[key];
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

/**
 * Demo content for the preview card.
 *
 * Deliberately not a real order and deliberately not plausible as one: the
 * preview exists to show the admin what the card looks like, and a preview
 * that borrowed a genuine customer's name would both leak that name into the
 * dashboard and make it impossible to tell preview from live data.
 */
const PREVIEW = {
  displayName: "Sample C.",
  location: "Cairo",
  productName: "Sample Hoop — 8mm",
  relativeTime: "5 min ago",
};

export default function SocialProofSettingsPage() {
  const [form, setForm] = useState<SocialProofConfigForm | null>(null);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [productFilter, setProductFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [configResult, productsResult] = await Promise.all([
          trpc.socialProof.getConfig.query(),
          // Reuses the dashboard's own product listing rather than adding a
          // second product endpoint for one picker.
          trpc.product.view.query({ limit: 100, includeHidden: true }),
        ]);
        if (configResult.success) {
          setForm(configResult.result as SocialProofConfigForm);
        } else {
          toast.error("Failed to load social proof settings");
        }
        if (productsResult.success && productsResult.result) {
          setProducts(
            (productsResult.result.products ?? []).map((row: any) => ({
              id: row.product.id as string,
              name: row.product.name as string,
            })),
          );
        }
      } catch {
        toast.error("Failed to load social proof settings");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const update = <K extends keyof SocialProofConfigForm>(
    key: K,
    value: SocialProofConfigForm[K],
  ) => setForm((f) => (f ? { ...f, [key]: value } : f));

  const toggleStatus = (status: OrderStatusOption, checked: boolean) => {
    setForm((f) => {
      if (!f) return f;
      const next = checked
        ? [...new Set([...f.eligibleStatuses, status])]
        : f.eligibleStatuses.filter((s) => s !== status);
      // At least one status has to stay on — an empty set means the feed can
      // never return anything, which reads as "broken" rather than "off".
      if (next.length === 0) {
        toast.error("Keep at least one order status selected");
        return f;
      }
      return { ...f, eligibleStatuses: next };
    });
  };

  const toggleProduct = (productId: string, checked: boolean) => {
    setForm((f) => {
      if (!f) return f;
      const next = checked
        ? [...new Set([...f.allowedProductIds, productId])]
        : f.allowedProductIds.filter((id) => id !== productId);
      return { ...f, allowedProductIds: next };
    });
  };

  const visibleProducts = useMemo(() => {
    const needle = productFilter.trim().toLowerCase();
    if (!needle) return products;
    return products.filter((p) => p.name.toLowerCase().includes(needle));
  }, [products, productFilter]);

  const handleSave = async () => {
    if (!form) return;
    setSaving(true);
    try {
      const payload: SocialProofConfigForm = {
        ...form,
        firstDelaySeconds: clamp(form.firstDelaySeconds, "firstDelaySeconds"),
        displayDurationSeconds: clamp(
          form.displayDurationSeconds,
          "displayDurationSeconds",
        ),
        intervalSeconds: clamp(form.intervalSeconds, "intervalSeconds"),
        maxPerSession: clamp(form.maxPerSession, "maxPerSession"),
        lookbackDays: clamp(form.lookbackDays, "lookbackDays"),
      };
      const result = await trpc.socialProof.updateConfig.mutate(payload);
      if (result.success) {
        setForm(payload);
        toast.success("Social proof settings saved");
      } else {
        toast.error(result.error ?? "Failed to save social proof settings");
      }
    } catch {
      toast.error("Failed to save social proof settings");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !form) {
    return (
      <div className='flex items-center justify-center h-64'>
        <Loader2 className='w-6 h-6 animate-spin text-muted-foreground' />
      </div>
    );
  }

  const numberField = (
    key: keyof typeof BOUNDS,
    label: string,
    help: string,
  ) => (
    <div>
      <Label>{label}</Label>
      <Input
        type='number'
        min={BOUNDS[key].min}
        max={BOUNDS[key].max}
        value={form[key]}
        onChange={(e) =>
          update(key, (Number(e.target.value) || 0) as never)
        }
        onBlur={(e) => update(key, clamp(Number(e.target.value), key) as never)}
        className='mt-1'
      />
      <p className='text-xs text-muted-foreground mt-1'>{help}</p>
    </div>
  );

  return (
    <div className='max-w-4xl mx-auto p-4 md:p-6 space-y-6'>
      <div>
        <h1 className='text-2xl font-semibold'>Social Proof</h1>
        <p className='text-sm text-muted-foreground'>
          A small notification in the corner of the storefront showing a real
          recent order — who ordered (first name and one initial), roughly
          where, and what. Separate from the Entry Popup; the two never affect
          each other.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className='flex items-center justify-between'>
            <CardTitle className='text-base'>Enabled</CardTitle>
            <Switch
              checked={form.enabled}
              onCheckedChange={(v) => update("enabled", v)}
            />
          </div>
          <CardDescription>
            When off, the storefront requests nothing and shows nothing. When
            on, the notification appears on the homepage, shop, category and
            product pages — never during checkout, in the cart, or on account
            and sign-in pages.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className='text-base'>Timing</CardTitle>
          <CardDescription>
            How often a visitor sees a notification during one browsing
            session. The count carries across pages, so browsing the shop does
            not restart it.
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
            {numberField(
              "firstDelaySeconds",
              "First appearance delay (seconds)",
              `How long after the page opens the first one appears. ${BOUNDS.firstDelaySeconds.min}–${BOUNDS.firstDelaySeconds.max}.`,
            )}
            {numberField(
              "displayDurationSeconds",
              "Visible duration (seconds)",
              `How long each notification stays on screen. ${BOUNDS.displayDurationSeconds.min}–${BOUNDS.displayDurationSeconds.max}.`,
            )}
            {numberField(
              "intervalSeconds",
              "Interval between notifications (seconds)",
              `The gap after one disappears before the next appears. ${BOUNDS.intervalSeconds.min}–${BOUNDS.intervalSeconds.max}.`,
            )}
            {numberField(
              "maxPerSession",
              "Maximum per session",
              `Never more than this many per browser tab. ${BOUNDS.maxPerSession.min}–${BOUNDS.maxPerSession.max}.`,
            )}
            {numberField(
              "lookbackDays",
              "Lookback (days)",
              `Only orders placed this recently are used. ${BOUNDS.lookbackDays.min}–${BOUNDS.lookbackDays.max}.`,
            )}
          </div>
          <p className='text-xs text-muted-foreground'>
            If fewer real orders are available than the session maximum, only
            those are shown — the same order is never repeated to pad the
            count.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className='text-base'>Privacy &amp; content</CardTitle>
          <CardDescription>
            The storefront only ever receives a shortened name, a broad
            location, the product, and when the order was placed. Full names,
            email addresses, phone numbers, street addresses, order numbers and
            payment details are removed on our servers and are never sent to
            the browser.
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='flex items-center justify-between gap-4'>
            <div>
              <Label>Show location</Label>
              <p className='text-xs text-muted-foreground mt-1'>
                Adds “in Cairo” to the notification. Off means the notification
                names no place at all.
              </p>
            </div>
            <Switch
              checked={form.showLocation}
              onCheckedChange={(v) => update("showLocation", v)}
            />
          </div>

          {form.showLocation && (
            <div>
              <Label>Location detail</Label>
              <Select
                value={form.locationSource}
                onValueChange={(v) =>
                  update("locationSource", v as "city" | "governorate")
                }>
                <SelectTrigger className='mt-1 max-w-[320px]'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='city'>City — e.g. “in Cairo”</SelectItem>
                  <SelectItem value='governorate'>
                    Governorate — the wider region
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className='text-xs text-muted-foreground mt-1'>
                Both are area-level. The street address, building and apartment
                are never read.
              </p>
            </div>
          )}

          <div className='flex items-center justify-between gap-4'>
            <div>
              <Label>Show relative time</Label>
              <p className='text-xs text-muted-foreground mt-1'>
                Adds “5 min ago”. Never an exact timestamp.
              </p>
            </div>
            <Switch
              checked={form.showRelativeTime}
              onCheckedChange={(v) => update("showRelativeTime", v)}
            />
          </div>

          <div>
            <Label>Order statuses used</Label>
            <p className='text-xs text-muted-foreground mt-1'>
              Pending and cancelled orders are never eligible — a pending order
              is unconfirmed, and a cancelled one did not happen.
            </p>
            <div className='mt-2 space-y-2'>
              {STATUS_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className='flex items-start gap-3 rounded-md border p-3 cursor-pointer'>
                  <Checkbox
                    checked={form.eligibleStatuses.includes(option.value)}
                    onCheckedChange={(checked) =>
                      toggleStatus(option.value, checked === true)
                    }
                  />
                  <span>
                    <span className='text-sm font-medium block'>
                      {option.label}
                    </span>
                    <span className='text-xs text-muted-foreground'>
                      {option.hint}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className='text-base'>Products</CardTitle>
          <CardDescription>
            By default every product a real order contains is eligible. Select
            specific products to restrict the notification to those — orders
            still have to be real; this only narrows which of them are used.
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-3'>
          <div className='flex items-center justify-between gap-4'>
            <div className='text-sm'>
              {form.allowedProductIds.length === 0 ? (
                <span className='text-muted-foreground'>
                  All products (no restriction)
                </span>
              ) : (
                <span>
                  {form.allowedProductIds.length} product
                  {form.allowedProductIds.length === 1 ? "" : "s"} selected
                </span>
              )}
            </div>
            {form.allowedProductIds.length > 0 && (
              <Button
                variant='outline'
                size='sm'
                onClick={() => update("allowedProductIds", [])}>
                <X className='w-4 h-4 mr-1' />
                Clear selection
              </Button>
            )}
          </div>

          <Input
            placeholder='Filter products…'
            value={productFilter}
            onChange={(e) => setProductFilter(e.target.value)}
          />

          {products.length === 0 ? (
            <p className='text-xs text-muted-foreground'>
              No products loaded.
            </p>
          ) : (
            <ScrollArea className='h-56 rounded-md border'>
              <div className='p-2 space-y-1'>
                {visibleProducts.map((product) => (
                  <label
                    key={product.id}
                    className='flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted cursor-pointer'>
                    <Checkbox
                      checked={form.allowedProductIds.includes(product.id)}
                      onCheckedChange={(checked) =>
                        toggleProduct(product.id, checked === true)
                      }
                    />
                    <span className='text-sm'>{product.name}</span>
                  </label>
                ))}
                {visibleProducts.length === 0 && (
                  <p className='text-xs text-muted-foreground px-2 py-1.5'>
                    No products match “{productFilter}”.
                  </p>
                )}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className='text-base'>Preview</CardTitle>
          <CardDescription>
            Demo placeholder content — not a real order. This is how the card
            looks on a desktop storefront, in the bottom-right corner of the viewport
            (bottom-left for Arabic visitors).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* The real storefront card, mounted with demo copy. It is pure
              presentation — no fetch, no timers, no session state — so the
              admin sees exactly what a visitor sees without the dashboard
              running a social-proof session against live orders. Omitting
              `href`/`onDismiss` is what makes it inert here. */}
          <div className='flex justify-center rounded-md border bg-bg px-6 py-10'>
            <SocialProofCard
              eyebrow={translations.en["social_proof.eyebrow"] ?? "Recent order"}
              displayName={PREVIEW.displayName}
              location={form.showLocation ? PREVIEW.location : null}
              orderedTemplate={translations.en["social_proof.ordered"] ?? "{name} just ordered"}
              orderedInTemplate={
                translations.en["social_proof.ordered_in"] ??
                "{name} in {location} just ordered"
              }
              productName={PREVIEW.productName}
              productImageUrl={null}
              relativeTime={form.showRelativeTime ? PREVIEW.relativeTime : ""}
            />
          </div>
          <p className='text-xs text-muted-foreground mt-3'>
            Shown at the storefront's desktop width. The product image is blank
            here because this is placeholder content — on the storefront the
            real product photo fills that stage. On phones the card spans the
            viewport width with a 12px inset and sits above the product page's
            Add to bag bar; on desktop it stays above the bag bar. Arabic
            visitors see the same card with Arabic copy.
          </p>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving} className='w-full'>
        {saving ? (
          <Loader2 className='w-4 h-4 mr-2 animate-spin' />
        ) : (
          <Save className='w-4 h-4 mr-2' />
        )}
        Save Social Proof Settings
      </Button>
    </div>
  );
}
