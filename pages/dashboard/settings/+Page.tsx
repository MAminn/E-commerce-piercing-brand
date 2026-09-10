"use client";

import { useState, useEffect } from "react";
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
import { Loader2, Save, Truck, Plus, Trash2, Tags, Globe, PackageX, Mail, Send, Users, FileText } from "lucide-react";
import { Textarea } from "#root/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#root/components/ui/dialog";
import { STORE_CURRENCY } from "#root/shared/config/branding";
import { v7 } from "uuid";

export default function SettingsPage() {
  const [shippingFee, setShippingFee] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Variant presets state
  interface PresetValue {
    value: string;
    priceModifier?: number;
  }
  interface VariantPreset {
    id: string;
    name: string;
    values: PresetValue[];
    defaultValue?: string;
    strikethroughValues?: string[];
  }
  const [variantPresets, setVariantPresets] = useState<VariantPreset[]>([]);
  const [isSavingPresets, setIsSavingPresets] = useState(false);
  const [applyingPresetId, setApplyingPresetId] = useState<string | null>(null);
  const [newValueInputs, setNewValueInputs] = useState<Record<string, string>>({});
  const [newPriceInputs, setNewPriceInputs] = useState<Record<string, string>>({});
  // Track names of presets removed during this editing session so we can clean up products on save
  const [removedPresetNames, setRemovedPresetNames] = useState<string[]>([]);

  // Delete preset dialog
  const [deleteDialog, setDeleteDialog] = useState<{ preset: VariantPreset } | null>(null);
  const [isDeletingPreset, setIsDeletingPreset] = useState<"settings-only" | "with-products" | null>(null);

  // Coming-soon mode state
  const [comingSoonMode, setComingSoonModeState] = useState(false);
  const [isTogglingComingSoon, setIsTogglingComingSoon] = useState(false);

  // Coming-soon subscribers state
  interface Subscriber { id: string; email: string; phone?: string | null; subscribedAt: Date | null; notifiedAt: Date | null }
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [isLoadingSubscribers, setIsLoadingSubscribers] = useState(false);
  const [goLiveSubject, setGoLiveSubject] = useState("");
  const [goLiveBody, setGoLiveBody] = useState("");
  const [isSendingGoLive, setIsSendingGoLive] = useState(false);

  // Broadcast target: null = coming-soon subscribers, string[] = all registered users
  const [allUserEmails, setAllUserEmails] = useState<string[] | null>(null);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);

  // Product page content: Shipping / Returns / FAQs
  interface Faq {
    question: string;
    questionAr?: string;
    answer: string;
    answerAr?: string;
  }
  const [shippingText, setShippingText] = useState("");
  const [shippingTextAr, setShippingTextAr] = useState("");
  const [returnsText, setReturnsText] = useState("");
  const [returnsTextAr, setReturnsTextAr] = useState("");
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [isSavingPageContent, setIsSavingPageContent] = useState(false);

  // Fetch current shipping fee on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [feeResult, presetsResult] = await Promise.all([
          trpc.settings.getShippingFee.query(),
          trpc.settings.getVariantPresets.query(),
          trpc.settings.getComingSoonMode.query().then((r) => {
            if (r.success) setComingSoonModeState(r.result);
          }).catch(() => {}),
          trpc.settings.getComingSoonSubscribers.query().then((r) => {
            if (r.success) setSubscribers(r.result as Subscriber[]);
          }).catch(() => {}),
          trpc.settings.getProductPageContent.query().then((r) => {
            if (r.success) {
              setShippingText(r.result.shippingText ?? "");
              setShippingTextAr(r.result.shippingTextAr ?? "");
              setReturnsText(r.result.returnsText ?? "");
              setReturnsTextAr(r.result.returnsTextAr ?? "");
              setFaqs(r.result.faqs ?? []);
            }
          }).catch(() => {}),
        ]);
        if (cancelled) return;
        if (feeResult.success) {
          setShippingFee(String(feeResult.result));
        }
        if (presetsResult.success) {
          setVariantPresets(presetsResult.result as VariantPreset[]);
        }
      } catch (err) {
        console.error("Failed to fetch settings:", err);
        toast.error("Failed to load settings");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = async () => {
    const fee = Number.parseFloat(shippingFee);
    if (Number.isNaN(fee) || fee < 0) {
      toast.error("Please enter a valid shipping fee (0 or more)");
      return;
    }

    setIsSaving(true);
    try {
      const result = await trpc.settings.updateShippingFee.mutate({ fee });
      if (result.success) {
        toast.success("Shipping fee updated successfully");
        setShippingFee(String(result.result.shippingFee));
      } else {
        toast.error(result.error || "Failed to update shipping fee");
      }
    } catch (err) {
      console.error("Failed to update shipping fee:", err);
      toast.error("Failed to update shipping fee");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSavePageContent = async () => {
    setIsSavingPageContent(true);
    try {
      const result = await trpc.settings.updateProductPageContent.mutate({
        content: {
          shippingText: shippingText || undefined,
          shippingTextAr: shippingTextAr || undefined,
          returnsText: returnsText || undefined,
          returnsTextAr: returnsTextAr || undefined,
          faqs: faqs.filter((f) => f.question.trim() && f.answer.trim()),
        },
      });
      if (result.success) {
        toast.success("Product page content updated successfully");
      } else {
        toast.error(result.error || "Failed to update product page content");
      }
    } catch (err) {
      console.error("Failed to update product page content:", err);
      toast.error("Failed to update product page content");
    } finally {
      setIsSavingPageContent(false);
    }
  };

  const addFaq = () => {
    setFaqs((prev) => [...prev, { question: "", questionAr: "", answer: "", answerAr: "" }]);
  };

  const updateFaq = (index: number, field: keyof Faq, value: string) => {
    setFaqs((prev) =>
      prev.map((faq, i) => (i === index ? { ...faq, [field]: value } : faq)),
    );
  };

  const removeFaq = (index: number) => {
    setFaqs((prev) => prev.filter((_, i) => i !== index));
  };

  const addPreset = () => {
    setVariantPresets((prev) => [
      ...prev,
      { id: v7(), name: "", values: [], defaultValue: undefined, strikethroughValues: [] },
    ]);
  };

  /** Immediately removes preset from DB. If withProducts=true also deletes the variant from all products. */
  const deletePresetNow = async (preset: VariantPreset, withProducts: boolean) => {
    setIsDeletingPreset(withProducts ? "with-products" : "settings-only");
    try {
      const remaining = variantPresets.filter((p) => p.id !== preset.id);
      const valid = remaining.filter((p) => p.name.trim() && p.values.length > 0);
      const saveResult = await trpc.settings.updateVariantPresets.mutate({ presets: valid });
      if (!saveResult.success) throw new Error("Failed to update presets");

      if (withProducts && preset.name.trim()) {
        await trpc.product.removeVariantFromAllProducts.mutate({ name: preset.name });
      }

      // Re-fetch authoritative state
      const fresh = await trpc.settings.getVariantPresets.query();
      if (fresh.success) setVariantPresets(fresh.result as VariantPreset[]);

      // Also remove from the tracked removedPresetNames if it was there
      setRemovedPresetNames((prev) => prev.filter((n) => n !== preset.name));

      toast.success(
        withProducts
          ? `"${preset.name}" deleted from settings and removed from all products`
          : `"${preset.name}" removed from presets`,
      );
      setDeleteDialog(null);
    } catch (err) {
      console.error("Failed to delete preset:", err);
      toast.error("Failed to delete preset");
    } finally {
      setIsDeletingPreset(null);
    }
  };

  const updatePresetName = (id: string, name: string) => {
    setVariantPresets((prev) =>
      prev.map((p) => (p.id === id ? { ...p, name } : p)),
    );
  };

  const addPresetValue = (presetId: string) => {
    const val = (newValueInputs[presetId] ?? "").trim();
    if (!val) return;
    const rawPrice = newPriceInputs[presetId]?.trim();
    const priceModifier =
      rawPrice ? (Number.isNaN(Number(rawPrice)) ? undefined : Number(rawPrice)) : undefined;
    setVariantPresets((prev) =>
      prev.map((p) =>
        p.id === presetId && !p.values.some((v) => v.value === val)
          ? { ...p, values: [...p.values, { value: val, priceModifier }] }
          : p,
      ),
    );
    setNewValueInputs((prev) => ({ ...prev, [presetId]: "" }));
    setNewPriceInputs((prev) => ({ ...prev, [presetId]: "" }));
  };

  const removePresetValue = (presetId: string, valueStr: string) => {
    setVariantPresets((prev) =>
      prev.map((p) =>
        p.id === presetId
          ? {
              ...p,
              values: p.values.filter((v) => v.value !== valueStr),
              defaultValue: p.defaultValue === valueStr ? undefined : p.defaultValue,
              strikethroughValues: (p.strikethroughValues || []).filter((v) => v !== valueStr),
            }
          : p,
      ),
    );
  };

  const toggleDefaultValue = (presetId: string, valueStr: string) => {
    setVariantPresets((prev) =>
      prev.map((p) =>
        p.id === presetId
          ? { ...p, defaultValue: p.defaultValue === valueStr ? undefined : valueStr }
          : p,
      ),
    );
  };

  const toggleStrikethrough = (presetId: string, valueStr: string) => {
    setVariantPresets((prev) =>
      prev.map((p) => {
        if (p.id !== presetId) return p;
        const current = p.strikethroughValues || [];
        const has = current.includes(valueStr);
        return {
          ...p,
          strikethroughValues: has
            ? current.filter((v) => v !== valueStr)
            : [...current, valueStr],
        };
      }),
    );
  };

  /** Shared: saves valid presets to DB, removes deleted preset names from all products, then re-fetches to sync state */
  const savePresetsAndCleanup = async (toRemoveNames: string[] = removedPresetNames) => {
    const valid = variantPresets.filter((p) => p.name.trim() && p.values.length > 0);
    const saveResult = await trpc.settings.updateVariantPresets.mutate({ presets: valid });
    if (!saveResult.success) {
      throw new Error("Failed to save variant presets");
    }

    // Remove deleted preset variants from all products
    for (const name of toRemoveNames) {
      try {
        await trpc.product.removeVariantFromAllProducts.mutate({ name });
      } catch (err) {
        console.error(`Failed to remove variant "${name}" from products:`, err);
      }
    }
    setRemovedPresetNames([]);

    // Re-fetch from DB to get normalised, authoritative state
    const fresh = await trpc.settings.getVariantPresets.query();
    if (fresh.success) {
      setVariantPresets(fresh.result as VariantPreset[]);
    }
  };

  const handleSavePresets = async () => {
    setIsSavingPresets(true);
    try {
      await savePresetsAndCleanup();
      toast.success("Variant presets saved");
    } catch (err) {
      console.error("Failed to save variant presets:", err);
      toast.error("Failed to save variant presets");
    } finally {
      setIsSavingPresets(false);
    }
  };

  const handleApplyPresetToAll = async (presetId: string) => {
    const preset = variantPresets.find((p) => p.id === presetId);
    if (!preset || !preset.name.trim() || preset.values.length === 0) {
      toast.error("Add a name and at least one value before applying");
      return;
    }
    setApplyingPresetId(presetId);
    try {
      // Save + cleanup first so the preset persists in DB
      await savePresetsAndCleanup([]);

      // Apply this specific preset to all products
      const result = await trpc.product.applyPresetToAll.mutate({
        name: preset.name,
        values: preset.values,
      });
      if (result.success) {
        toast.success(`Saved & applied "${preset.name}" to ${result.result.updatedCount} products`);
      } else {
        toast.error("Failed to apply preset to products");
      }
    } catch (err) {
      console.error("Failed to apply preset to all products:", err);
      toast.error("Failed to apply preset to products");
    } finally {
      setApplyingPresetId(null);
    }
  };

  if (isLoading) {
    return (
      <div className='flex items-center justify-center min-h-[400px]'>
        <Loader2 className='h-8 w-8 animate-spin text-gray-400' />
      </div>
    );
  }

  return (
    <div className='p-4 md:p-6 lg:p-8 max-w-2xl mx-auto space-y-6'>
      <div>
        <h1 className='text-2xl font-semibold tracking-tight'>
          Store Settings
        </h1>
        <p className='text-sm text-muted-foreground mt-1'>
          Configure your store&apos;s shipping and delivery settings.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <Truck className='h-5 w-5' />
            Shipping Fee
          </CardTitle>
          <CardDescription>
            Set a flat shipping fee applied to every order. Set to 0 for free
            shipping.
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='space-y-2'>
            <Label htmlFor='shippingFee'>Shipping Fee ({STORE_CURRENCY})</Label>
            <div className='flex items-center gap-3'>
              <Input
                id='shippingFee'
                type='number'
                min='0'
                step='0.01'
                value={shippingFee}
                onChange={(e) => setShippingFee(e.target.value)}
                placeholder='0.00'
                className='max-w-[200px]'
              />
              <span className='text-sm text-muted-foreground'>
                {STORE_CURRENCY}
              </span>
            </div>
            <p className='text-xs text-muted-foreground'>
              This fee is added to every order at checkout. Enter 0 to offer
              free shipping.
            </p>
          </div>

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

      {/* Product Page Content Card */}
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <FileText className='h-5 w-5' />
            Product Page Content
          </CardTitle>
          <CardDescription>
            Control the Shipping, Returns and FAQs text shown in the
            accordion on every product page. Leave blank to use the
            defaults.
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-6'>
          <div className='space-y-2'>
            <Label htmlFor='shippingText'>Shipping text (English)</Label>
            <Textarea
              id='shippingText'
              value={shippingText}
              onChange={(e) => setShippingText(e.target.value)}
              placeholder='Free shipping with 2+ items.'
              maxLength={2000}
              rows={2}
            />
            <Label htmlFor='shippingTextAr'>Shipping text (Arabic)</Label>
            <Textarea
              id='shippingTextAr'
              dir='rtl'
              value={shippingTextAr}
              onChange={(e) => setShippingTextAr(e.target.value)}
              placeholder='شحن مجاني عند طلب قطعتين أو أكثر.'
              maxLength={2000}
              rows={2}
            />
          </div>

          <div className='space-y-2'>
            <Label htmlFor='returnsText'>Returns text (English)</Label>
            <Textarea
              id='returnsText'
              value={returnsText}
              onChange={(e) => setReturnsText(e.target.value)}
              placeholder='Free exchanges for all orders.'
              maxLength={2000}
              rows={4}
            />
            <p className='text-xs text-muted-foreground text-right'>
              {returnsText.length}/2000
            </p>
            <Label htmlFor='returnsTextAr'>Returns text (Arabic)</Label>
            <Textarea
              id='returnsTextAr'
              dir='rtl'
              value={returnsTextAr}
              onChange={(e) => setReturnsTextAr(e.target.value)}
              placeholder='استبدال مجاني لجميع الطلبات.'
              maxLength={2000}
              rows={4}
            />
            <p className='text-xs text-muted-foreground text-right'>
              {returnsTextAr.length}/2000
            </p>
          </div>

          <div className='space-y-3'>
            <div className='flex items-center justify-between'>
              <Label>FAQs</Label>
              <Button type='button' variant='outline' size='sm' onClick={addFaq}>
                <Plus className='h-4 w-4 mr-1' />
                Add FAQ
              </Button>
            </div>
            {faqs.length === 0 && (
              <p className='text-xs text-muted-foreground'>
                No custom FAQs yet — the product page falls back to a
                built-in default.
              </p>
            )}
            {faqs.map((faq, idx) => (
              <div key={idx} className='space-y-2 border rounded-md p-3 relative'>
                <Button
                  type='button'
                  variant='ghost'
                  size='sm'
                  className='absolute top-2 end-2 h-7 w-7 p-0'
                  onClick={() => removeFaq(idx)}>
                  <Trash2 className='h-4 w-4 text-red-500' />
                </Button>
                <Input
                  placeholder='Question (English)'
                  value={faq.question}
                  onChange={(e) => updateFaq(idx, "question", e.target.value)}
                  className='max-w-md'
                />
                <Input
                  placeholder='السؤال (Arabic, optional)'
                  dir='rtl'
                  value={faq.questionAr ?? ""}
                  onChange={(e) => updateFaq(idx, "questionAr", e.target.value)}
                  className='max-w-md'
                />
                <Textarea
                  placeholder='Answer (English)'
                  value={faq.answer}
                  onChange={(e) => updateFaq(idx, "answer", e.target.value)}
                  rows={2}
                />
                <Textarea
                  placeholder='الإجابة (Arabic, optional)'
                  dir='rtl'
                  value={faq.answerAr ?? ""}
                  onChange={(e) => updateFaq(idx, "answerAr", e.target.value)}
                  rows={2}
                />
              </div>
            ))}
          </div>

          <Button onClick={handleSavePageContent} disabled={isSavingPageContent}>
            {isSavingPageContent ? (
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

      {/* Variant Presets Card */}
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <Tags className='h-5 w-5' />
            Variant Presets
          </CardTitle>
          <CardDescription>
            Define reusable variant templates (e.g. &quot;Size: S, M, L,
            XL&quot;) that can be quickly applied when creating products.
            Use ★ to set a default value (auto-selected for customers) and S̶ to
            add a strikethrough effect on a value.
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          {variantPresets.map((preset) => (
            <div
              key={preset.id}
              className='border rounded-lg p-3 space-y-2'>
              <div className='flex items-center gap-2'>
                <Input
                  placeholder='Variant name (e.g. Size, Color, Volume)'
                  value={preset.name}
                  onChange={(e) => updatePresetName(preset.id, e.target.value)}
                  className='flex-1'
                />
                <Button
                  variant='outline'
                  size='sm'
                  title='Apply this preset to ALL products (adds or updates this variant on every product)'
                  disabled={applyingPresetId === preset.id}
                  onClick={() => handleApplyPresetToAll(preset.id)}
                  className='h-8 text-xs'>
                  {applyingPresetId === preset.id ? (
                    <Loader2 className='h-3 w-3 animate-spin' />
                  ) : (
                    "Apply to All"
                  )}
                </Button>
                <Button
                  variant='ghost'
                  size='icon'
                  title='Delete preset'
                  onClick={() => setDeleteDialog({ preset })}
                  className='text-destructive hover:text-destructive h-8 w-8'>
                  <Trash2 className='h-4 w-4' />
                </Button>
              </div>
              <div className='flex flex-wrap gap-1.5'>
                {preset.values.map((val) => {
                  const isDefault = preset.defaultValue === val.value;
                  const isStrikethrough = (preset.strikethroughValues || []).includes(val.value);
                  return (
                    <span
                      key={val.value}
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium border ${
                        isDefault
                          ? 'bg-primary text-primary-foreground border-primary'
                          : isStrikethrough
                            ? 'bg-secondary text-muted-foreground border-secondary line-through'
                            : 'bg-secondary border-secondary'
                      }`}>
                      {val.value}{val.priceModifier ? ` +${val.priceModifier}` : ""}
                      <button
                        type='button'
                        onClick={() => toggleDefaultValue(preset.id, val.value)}
                        title={isDefault ? 'Remove as default' : 'Set as default (auto-selected)'}
                        className={`ml-0.5 text-[10px] ${isDefault ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                        {isDefault ? '★' : '☆'}
                      </button>
                      <button
                        type='button'
                        onClick={() => toggleStrikethrough(preset.id, val.value)}
                        title={isStrikethrough ? 'Remove strikethrough' : 'Add strikethrough'}
                        className={`text-[10px] ${isStrikethrough ? 'text-destructive' : 'text-muted-foreground hover:text-foreground'}`}>
                        S̶
                      </button>
                      <button
                        type='button'
                        onClick={() => removePresetValue(preset.id, val.value)}
                        className='hover:text-destructive ml-0.5'>
                        ×
                      </button>
                    </span>
                  );
                })}
              </div>
              <div className='flex gap-2'>
                <Input
                  placeholder='Value (e.g. Small)'
                  value={newValueInputs[preset.id] ?? ""}
                  onChange={(e) =>
                    setNewValueInputs((prev) => ({
                      ...prev,
                      [preset.id]: e.target.value,
                    }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addPresetValue(preset.id);
                    }
                  }}
                  className='flex-1 h-8 text-sm'
                />
                <Input
                  placeholder='+price'
                  type='number'
                  value={newPriceInputs[preset.id] ?? ""}
                  onChange={(e) =>
                    setNewPriceInputs((prev) => ({
                      ...prev,
                      [preset.id]: e.target.value,
                    }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addPresetValue(preset.id);
                    }
                  }}
                  className='w-24 h-8 text-sm'
                />
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => addPresetValue(preset.id)}
                  className='h-8'>
                  <Plus className='h-3 w-3' />
                </Button>
              </div>
            </div>
          ))}

          <div className='flex items-center gap-3'>
            <Button variant='outline' size='sm' onClick={addPreset}>
              <Plus className='mr-1 h-4 w-4' />
              Add Preset
            </Button>
            <Button
              onClick={handleSavePresets}
              disabled={isSavingPresets}
              size='sm'>
              {isSavingPresets ? (
                <>
                  <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                  Saving...
                </>
              ) : (
                <>
                  <Save className='mr-2 h-4 w-4' />
                  Save Presets
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Delete Preset Dialog */}
      <Dialog open={!!deleteDialog} onOpenChange={(open) => { if (!open && !isDeletingPreset) setDeleteDialog(null); }}>
        <DialogContent className='max-w-md'>
          <DialogHeader>
            <DialogTitle>Delete &quot;{deleteDialog?.preset.name}&quot;</DialogTitle>
            <DialogDescription>
              Choose how you want to delete this preset. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-3 py-2'>
            <button
              type='button'
              disabled={!!isDeletingPreset}
              onClick={() => deleteDialog && deletePresetNow(deleteDialog.preset, false)}
              className='w-full text-left border rounded-lg p-4 hover:bg-muted transition-colors disabled:opacity-50'>
              <div className='flex items-start gap-3'>
                <Trash2 className='h-5 w-5 mt-0.5 text-muted-foreground shrink-0' />
                <div>
                  <p className='text-sm font-medium'>Remove from presets only</p>
                  <p className='text-xs text-muted-foreground mt-0.5'>
                    Deletes the preset from your settings. Products that already have this variant are unchanged.
                  </p>
                </div>
                {isDeletingPreset === "settings-only" && <Loader2 className='h-4 w-4 animate-spin ml-auto shrink-0' />}
              </div>
            </button>
            <button
              type='button'
              disabled={!!isDeletingPreset}
              onClick={() => deleteDialog && deletePresetNow(deleteDialog.preset, true)}
              className='w-full text-left border border-destructive/30 rounded-lg p-4 hover:bg-destructive/5 transition-colors disabled:opacity-50'>
              <div className='flex items-start gap-3'>
                <PackageX className='h-5 w-5 mt-0.5 text-destructive shrink-0' />
                <div>
                  <p className='text-sm font-medium text-destructive'>Remove from presets + all products</p>
                  <p className='text-xs text-muted-foreground mt-0.5'>
                    Also deletes the &quot;{deleteDialog?.preset.name}&quot; variant from every product it was applied to.
                  </p>
                </div>
                {isDeletingPreset === "with-products" && <Loader2 className='h-4 w-4 animate-spin ml-auto shrink-0 text-destructive' />}
              </div>
            </button>
          </div>
          <DialogFooter>
            <Button variant='outline' disabled={!!isDeletingPreset} onClick={() => setDeleteDialog(null)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Coming-Soon Mode */}
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2 text-base'>
            <Globe className='h-4 w-4' />
            Coming Soon Mode
          </CardTitle>
          <CardDescription>
            When enabled, visitors see a "coming soon" registration page instead of your store. Admins can still browse normally.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className='flex items-center justify-between'>
            <div>
              <p className='text-sm font-medium'>
                Status:{" "}
                <span className={comingSoonMode ? "text-amber-600" : "text-green-600"}>
                  {comingSoonMode ? "Active — store hidden from public" : "Inactive — store is live"}
                </span>
              </p>
            </div>
            <Button
              variant={comingSoonMode ? "destructive" : "primary"}
              disabled={isTogglingComingSoon}
              onClick={async () => {
                setIsTogglingComingSoon(true);
                try {
                  const newVal = !comingSoonMode;
                  await trpc.settings.setComingSoonMode.mutate({ enabled: newVal });
                  setComingSoonModeState(newVal);
                  toast.success(newVal ? "Coming soon mode activated" : "Store is now live");
                } catch {
                  toast.error("Failed to update coming soon mode");
                } finally {
                  setIsTogglingComingSoon(false);
                }
              }}>
              {isTogglingComingSoon && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
              {comingSoonMode ? "Deactivate — Go Live" : "Activate Coming Soon"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Coming-Soon Subscribers */}
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2 text-base'>
            <Users className='h-4 w-4' />
            Coming Soon Subscribers
          </CardTitle>
          <CardDescription>
            Emails collected during coming-soon mode. Send a broadcast when you go live.
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-6'>
          {/* Subscriber list */}
          <div className='space-y-2'>
            <div className='flex items-center justify-between mb-1'>
              <p className='text-sm font-medium'>{subscribers.length} subscriber{subscribers.length !== 1 ? "s" : ""}</p>
              <div className='flex items-center gap-2'>
                <Button
                  variant='outline'
                  size='sm'
                  disabled={isLoadingSubscribers}
                  onClick={async () => {
                    setIsLoadingSubscribers(true);
                    try {
                      const r = await trpc.settings.getComingSoonSubscribers.query();
                      if (r.success) setSubscribers(r.result as Subscriber[]);
                    } catch {
                      toast.error("Failed to reload subscribers");
                    } finally {
                      setIsLoadingSubscribers(false);
                    }
                  }}>
                  {isLoadingSubscribers ? <Loader2 className='h-3.5 w-3.5 animate-spin' /> : "Refresh"}
                </Button>
                <Button
                  variant={allUserEmails ? "primary" : "outline"}
                  size='sm'
                  disabled={isLoadingUsers}
                  onClick={async () => {
                    if (allUserEmails) {
                      // Toggle off — go back to subscribers mode
                      setAllUserEmails(null);
                      return;
                    }
                    setIsLoadingUsers(true);
                    try {
                      const r = await trpc.users.getAllEmails.query();
                      if (r.success) {
                        setAllUserEmails(r.result.emails);
                        toast.success(`Loaded ${r.result.emails.length} registered user email(s)`);
                      }
                    } catch {
                      toast.error("Failed to load users");
                    } finally {
                      setIsLoadingUsers(false);
                    }
                  }}>
                  {isLoadingUsers ? (
                    <Loader2 className='h-3.5 w-3.5 animate-spin' />
                  ) : allUserEmails ? (
                    <><Users className='h-3.5 w-3.5 mr-1' />{allUserEmails.length} users loaded ✕</>
                  ) : (
                    <><Users className='h-3.5 w-3.5 mr-1' />Load All Users</>
                  )}
                </Button>
              </div>
            </div>
            {subscribers.length > 0 ? (
              <div className='border rounded-md divide-y max-h-48 overflow-y-auto text-sm'>
                {subscribers.map((s) => (
                  <div key={s.id} className='flex items-center justify-between px-3 py-2 gap-2'>
                    <div className='flex flex-col min-w-0'>
                      <span className='text-stone-700 truncate'>{s.email}</span>
                      {s.phone && <span className='text-xs text-stone-400'>{s.phone}</span>}
                    </div>
                    <div className='flex items-center gap-2 shrink-0'>
                      <span className='text-xs text-stone-400'>
                        {s.notifiedAt ? (
                          <span className='text-green-600'>Notified</span>
                        ) : (
                          <span className='text-stone-400'>{s.subscribedAt ? new Date(s.subscribedAt).toLocaleDateString() : "—"}</span>
                        )}
                      </span>
                      <button
                        type='button'
                        title='Remove subscriber'
                        onClick={async () => {
                          try {
                            const r = await trpc.settings.deleteComingSoonSubscriber.mutate({ id: s.id });
                            if (r.success) {
                              setSubscribers((prev) => prev.filter((x) => x.id !== s.id));
                              toast.success("Subscriber removed");
                            }
                          } catch {
                            toast.error("Failed to remove subscriber");
                          }
                        }}
                        className='p-1 text-stone-400 hover:text-red-500 transition-colors'
                      >
                        <Trash2 className='h-3.5 w-3.5' />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className='text-sm text-stone-400'>No subscribers yet.</p>
            )}

            {/* All-users preview overlay */}
            {allUserEmails && (
              <div className='border border-stone-900 rounded-md divide-y max-h-48 overflow-y-auto text-sm mt-2'>
                <div className='px-3 py-2 bg-stone-50 text-xs font-medium text-stone-500 sticky top-0 border-b'>
                  All registered users ({allUserEmails.length})
                </div>
                {allUserEmails.map((email) => (
                  <div key={email} className='px-3 py-2 text-stone-700'>{email}</div>
                ))}
              </div>
            )}
          </div>

          {/* Go-live broadcast */}
          <div className='space-y-3 border-t pt-4'>
            <p className='text-sm font-medium flex items-center gap-1.5'>
              <Mail className='h-4 w-4' />
              {allUserEmails
                ? <>Broadcast to all registered users <span className='ml-1 text-xs font-normal text-stone-500'>({allUserEmails.length})</span></>
                : "Broadcast to un-notified subscribers"}
            </p>
            <div className='space-y-2'>
              <Label className='text-xs uppercase tracking-widest text-stone-400'>Subject</Label>
              <Input
                value={goLiveSubject}
                onChange={(e) => setGoLiveSubject(e.target.value)}
                placeholder="We're live! Here's your 15% off code"
                disabled={isSendingGoLive}
              />
            </div>
            <div className='space-y-2'>
              <Label className='text-xs uppercase tracking-widest text-stone-400'>Email body (HTML or plain text)</Label>
              <textarea
                value={goLiveBody}
                onChange={(e) => setGoLiveBody(e.target.value)}
                placeholder="Paste your HTML or write your message here..."
                disabled={isSendingGoLive}
                rows={5}
                className='w-full text-sm border border-stone-200 rounded-md px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-stone-900 resize-y'
              />
            </div>
            <Button
              disabled={isSendingGoLive || !goLiveSubject.trim() || !goLiveBody.trim()}
              onClick={async () => {
                setIsSendingGoLive(true);
                try {
                  if (allUserEmails) {
                    // Filter out any malformed DB emails before sending
                    const validEmails = allUserEmails.filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
                    const skipped = allUserEmails.length - validEmails.length;
                    if (validEmails.length === 0) {
                      toast.error("No valid email addresses to send to");
                      return;
                    }
                    // Send to all registered users
                    const r = await trpc.settings.sendBroadcast.mutate({
                      emails: validEmails,
                      subject: goLiveSubject,
                      htmlContent: goLiveBody,
                    });
                    if (r.success) {
                      toast.success(`Sent to ${r.result.sent} of ${r.result.total} user(s)${skipped > 0 ? ` (${skipped} invalid address${skipped > 1 ? "es" : ""} skipped)` : ""}`);
                    }
                  } else {
                    // Send to un-notified coming-soon subscribers
                    const r = await trpc.settings.notifySubscribersGoLive.mutate({
                      subject: goLiveSubject,
                      htmlContent: goLiveBody,
                    });
                    if (r.success) {
                      toast.success(`Sent to ${r.result.sent} of ${r.result.total} subscriber(s)`);
                      // Refresh list to show notifiedAt timestamps
                      const updated = await trpc.settings.getComingSoonSubscribers.query();
                      if (updated.success) setSubscribers(updated.result as Subscriber[]);
                    }
                  }
                } catch {
                  toast.error("Failed to send broadcast");
                } finally {
                  setIsSendingGoLive(false);
                }
              }}>
              {isSendingGoLive ? (
                <><Loader2 className='mr-2 h-4 w-4 animate-spin' />Sending…</>
              ) : (
                <><Send className='mr-2 h-4 w-4' />Send Broadcast</>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
