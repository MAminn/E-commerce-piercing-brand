import { useEffect, useState } from "react";
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
import { Textarea } from "#root/components/ui/textarea";
import { Switch } from "#root/components/ui/switch";
import { Separator } from "#root/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#root/components/ui/select";
import { Loader2, Save, ImageIcon } from "lucide-react";

interface PopupConfigForm {
  enabled: boolean;
  imageUrl: string;
  titleEn: string;
  titleAr: string;
  descriptionEn: string;
  descriptionAr: string;
  submitLabelEn: string;
  submitLabelAr: string;
  successMessageEn: string;
  successMessageAr: string;
  dismissLabelEn: string;
  dismissLabelAr: string;
  dismissHref: string;
  collectPhone: boolean;
  phoneRequired: boolean;
  triggerDelaySeconds: number;
  triggerScrollPercent: number;
  triggerExitIntent: boolean;
  reshowAfterDays: number;
}

interface PromoCodeOption {
  id: string;
  code: string;
  discountType: string;
  discountValue: number;
}

export default function PopupSettingsPage() {
  const [form, setForm] = useState<PopupConfigForm | null>(null);
  const [promoCodeId, setPromoCodeId] = useState<string | null>(null);
  const [codeMode, setCodeMode] = useState<"existing" | "generate">("existing");
  const [promoCodes, setPromoCodes] = useState<PromoCodeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [configResult, discountResult, codesResult] = await Promise.all([
          trpc.popup.getConfig.query(),
          trpc.popup.getDiscountConfig.query(),
          trpc.promoCode.list.query({ page: 1, limit: 100 }),
        ]);
        if (configResult.success) setForm(configResult.result as PopupConfigForm);
        if (discountResult.success) {
          setPromoCodeId(discountResult.result.promoCodeId);
          setCodeMode(discountResult.result.codeMode);
        }
        if (codesResult.success) {
          setPromoCodes(
            (codesResult.result.items as PromoCodeOption[]) ?? [],
          );
        }
      } catch {
        toast.error("Failed to load popup settings");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !form) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("File too large. Maximum size is 2MB.");
      return;
    }
    setUploading(true);
    try {
      const buffer = new Uint8Array(await file.arrayBuffer());
      const result = await trpc.layout.uploadImage.mutate({
        file: { name: file.name, type: file.type, buffer },
        prefix: "popup",
      });
      if (result.success && result.data) {
        setForm((f) => (f ? { ...f, imageUrl: result.data!.url } : f));
        toast.success("Image uploaded");
      } else {
        toast.error(result.success ? "Upload failed" : result.error);
      }
    } catch {
      toast.error("Failed to upload image");
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!form) return;
    setSaving(true);
    try {
      const [configResult, discountResult] = await Promise.all([
        trpc.popup.updateConfig.mutate(form),
        trpc.popup.updateDiscountConfig.mutate({ promoCodeId, codeMode }),
      ]);
      if (configResult.success && discountResult.success) {
        toast.success("Popup settings saved");
      } else {
        toast.error("Failed to save some settings");
      }
    } catch {
      toast.error("Failed to save popup settings");
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

  return (
    <div className='max-w-4xl mx-auto p-4 md:p-6 space-y-6'>
      <div>
        <h1 className='text-2xl font-semibold'>Entry Popup</h1>
        <p className='text-sm text-muted-foreground'>
          A first-visit popup collecting email (and optionally phone) in
          exchange for a discount code on the visitor's first order.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className='flex items-center justify-between'>
            <CardTitle className='text-base'>Enabled</CardTitle>
            <Switch
              checked={form.enabled}
              onCheckedChange={(v) => setForm((f) => (f ? { ...f, enabled: v } : f))}
            />
          </div>
          <CardDescription>
            When on, the popup appears to first-time visitors according to
            the trigger rules below.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className='text-base'>Image</CardTitle>
        </CardHeader>
        <CardContent className='space-y-3'>
          {form.imageUrl ? (
            <div className='flex items-center gap-4'>
              <img
                src={form.imageUrl}
                alt='Popup preview'
                className='h-32 w-32 object-cover rounded-md border'
              />
              <Button
                variant='outline'
                size='sm'
                onClick={() => setForm((f) => (f ? { ...f, imageUrl: "" } : f))}>
                Remove
              </Button>
            </div>
          ) : (
            <div className='flex items-center gap-2 text-sm text-muted-foreground'>
              <ImageIcon className='w-4 h-4' />
              No image uploaded
            </div>
          )}
          <div>
            <Label htmlFor='popup-image-upload' className='text-sm'>
              Upload image (JPG, PNG, or WebP — max 2MB)
            </Label>
            <Input
              id='popup-image-upload'
              type='file'
              accept='image/png,image/jpeg,image/webp'
              disabled={uploading}
              onChange={handleImageUpload}
              className='mt-1'
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className='text-base'>Content</CardTitle>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='grid grid-cols-2 gap-3'>
            <div>
              <Label>Title (English)</Label>
              <Input
                value={form.titleEn}
                onChange={(e) => setForm((f) => (f ? { ...f, titleEn: e.target.value } : f))}
                className='mt-1'
              />
            </div>
            <div>
              <Label>Title (Arabic)</Label>
              <Input
                dir='rtl'
                value={form.titleAr}
                onChange={(e) => setForm((f) => (f ? { ...f, titleAr: e.target.value } : f))}
                className='mt-1'
              />
            </div>
          </div>

          <div className='grid grid-cols-2 gap-3'>
            <div>
              <Label>Description (English)</Label>
              <Textarea
                rows={3}
                value={form.descriptionEn}
                onChange={(e) =>
                  setForm((f) => (f ? { ...f, descriptionEn: e.target.value } : f))
                }
                className='mt-1'
              />
            </div>
            <div>
              <Label>Description (Arabic)</Label>
              <Textarea
                dir='rtl'
                rows={3}
                value={form.descriptionAr}
                onChange={(e) =>
                  setForm((f) => (f ? { ...f, descriptionAr: e.target.value } : f))
                }
                className='mt-1'
              />
            </div>
          </div>

          <div className='grid grid-cols-2 gap-3'>
            <div>
              <Label>Submit button (English)</Label>
              <Input
                value={form.submitLabelEn}
                onChange={(e) =>
                  setForm((f) => (f ? { ...f, submitLabelEn: e.target.value } : f))
                }
                className='mt-1'
              />
            </div>
            <div>
              <Label>Submit button (Arabic)</Label>
              <Input
                dir='rtl'
                value={form.submitLabelAr}
                onChange={(e) =>
                  setForm((f) => (f ? { ...f, submitLabelAr: e.target.value } : f))
                }
                className='mt-1'
              />
            </div>
          </div>

          <div className='grid grid-cols-2 gap-3'>
            <div>
              <Label>Success message (English)</Label>
              <Input
                value={form.successMessageEn}
                onChange={(e) =>
                  setForm((f) => (f ? { ...f, successMessageEn: e.target.value } : f))
                }
                placeholder="You're in! Use code {{code}} for 5% off"
                className='mt-1'
              />
            </div>
            <div>
              <Label>Success message (Arabic)</Label>
              <Input
                dir='rtl'
                value={form.successMessageAr}
                onChange={(e) =>
                  setForm((f) => (f ? { ...f, successMessageAr: e.target.value } : f))
                }
                className='mt-1'
              />
            </div>
          </div>
          <p className='text-xs text-muted-foreground'>
            Use <code>{"{{code}}"}</code> in the success message to show the
            issued discount code.
          </p>

          <Separator />

          <div className='grid grid-cols-2 gap-3'>
            <div>
              <Label>Secondary button label (English, optional)</Label>
              <Input
                value={form.dismissLabelEn}
                onChange={(e) =>
                  setForm((f) => (f ? { ...f, dismissLabelEn: e.target.value } : f))
                }
                placeholder='No thanks'
                className='mt-1'
              />
            </div>
            <div>
              <Label>Secondary button label (Arabic, optional)</Label>
              <Input
                dir='rtl'
                value={form.dismissLabelAr}
                onChange={(e) =>
                  setForm((f) => (f ? { ...f, dismissLabelAr: e.target.value } : f))
                }
                className='mt-1'
              />
            </div>
          </div>
          <div>
            <Label>Secondary button link (optional)</Label>
            <Input
              value={form.dismissHref}
              onChange={(e) => setForm((f) => (f ? { ...f, dismissHref: e.target.value } : f))}
              placeholder='Leave blank to just close the popup'
              className='mt-1'
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className='text-base'>Fields</CardTitle>
        </CardHeader>
        <CardContent className='space-y-3'>
          <div className='flex items-center justify-between'>
            <Label>Collect phone number</Label>
            <Switch
              checked={form.collectPhone}
              onCheckedChange={(v) => setForm((f) => (f ? { ...f, collectPhone: v } : f))}
            />
          </div>
          {form.collectPhone && (
            <div className='flex items-center justify-between pl-4'>
              <Label className='text-sm'>Phone required</Label>
              <Switch
                checked={form.phoneRequired}
                onCheckedChange={(v) => setForm((f) => (f ? { ...f, phoneRequired: v } : f))}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className='text-base'>Discount code</CardTitle>
          <CardDescription>
            Which promo code the popup issues, and how.
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div>
            <Label>Promo code</Label>
            <Select
              value={promoCodeId ?? ""}
              onValueChange={(v) => setPromoCodeId(v || null)}>
              <SelectTrigger className='mt-1'>
                <SelectValue placeholder='Select a promo code' />
              </SelectTrigger>
              <SelectContent>
                {promoCodes.map((pc) => (
                  <SelectItem key={pc.id} value={pc.id}>
                    {pc.code} (
                    {pc.discountType === "percentage"
                      ? `${pc.discountValue}%`
                      : `$${pc.discountValue}`}
                    )
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {promoCodes.length === 0 && (
              <p className='text-xs text-muted-foreground mt-1'>
                No promo codes exist yet — create one in Dashboard → Promo
                Codes first.
              </p>
            )}
          </div>

          <div>
            <Label>How the code is issued</Label>
            <Select
              value={codeMode}
              onValueChange={(v) => setCodeMode(v as "existing" | "generate")}>
              <SelectTrigger className='mt-1'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='existing'>
                  Shared code — everyone gets the same code above
                </SelectItem>
                <SelectItem value='generate'>
                  Unique code per person — a one-time code is generated for
                  each subscriber, using the terms of the code above
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <p className='text-xs text-muted-foreground'>
            Either way, each email address (and phone number, if collected)
            can only ever claim one discount — this is enforced on our
            servers, not just in the browser, so it can't be bypassed by
            clearing cookies or using a private window.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className='text-base'>When it appears</CardTitle>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='grid grid-cols-2 gap-3'>
            <div>
              <Label>Delay before showing (seconds)</Label>
              <Input
                type='number'
                min={0}
                value={form.triggerDelaySeconds}
                onChange={(e) =>
                  setForm((f) =>
                    f ? { ...f, triggerDelaySeconds: Number(e.target.value) || 0 } : f,
                  )
                }
                className='mt-1'
              />
            </div>
            <div>
              <Label>Or after scrolling (%, 0 = disabled)</Label>
              <Input
                type='number'
                min={0}
                max={100}
                value={form.triggerScrollPercent}
                onChange={(e) =>
                  setForm((f) =>
                    f
                      ? { ...f, triggerScrollPercent: Number(e.target.value) || 0 }
                      : f,
                  )
                }
                className='mt-1'
              />
            </div>
          </div>
          <div className='flex items-center justify-between'>
            <Label>Also show on exit intent (desktop only)</Label>
            <Switch
              checked={form.triggerExitIntent}
              onCheckedChange={(v) => setForm((f) => (f ? { ...f, triggerExitIntent: v } : f))}
            />
          </div>
          <div>
            <Label>Don't show again for (days after dismissal)</Label>
            <Input
              type='number'
              min={0}
              value={form.reshowAfterDays}
              onChange={(e) =>
                setForm((f) =>
                  f ? { ...f, reshowAfterDays: Number(e.target.value) || 0 } : f,
                )
              }
              className='mt-1 max-w-[200px]'
            />
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving} className='w-full'>
        {saving ? (
          <Loader2 className='w-4 h-4 mr-2 animate-spin' />
        ) : (
          <Save className='w-4 h-4 mr-2' />
        )}
        Save Popup Settings
      </Button>
    </div>
  );
}
