"use client";

import { useState, useEffect, useCallback } from "react";
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
import { Switch } from "#root/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#root/components/ui/select";
import {
  Loader2,
  Save,
  Link2,
  Plus,
  Trash2,
  GripVertical,
  ExternalLink,
  Eye,
} from "lucide-react";
import type {
  LinkTreeConfig,
  LinkTreeItem,
} from "#root/shared/types/link-tree";
import {
  DEFAULT_LINK_TREE_CONFIG,
  LINK_ICON_OPTIONS,
} from "#root/shared/types/link-tree";

export default function LinkTreeSettingsPage() {
  const [config, setConfig] = useState<LinkTreeConfig>(
    DEFAULT_LINK_TREE_CONFIG,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Fetch current config on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await trpc.settings.getLinkTreeConfig.query();
        if (cancelled) return;
        if (result.success) {
          setConfig(result.result);
        }
      } catch (err) {
        console.error("Failed to fetch link tree config:", err);
        toast.error("Failed to load link tree settings");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = async () => {
    // Validate all enabled links have valid URLs
    for (const link of config.links) {
      if (link.enabled && !link.href) {
        toast.error(
          `Please enter a URL for "${link.label || "untitled link"}"`,
        );
        return;
      }
      if (link.href && !isValidUrl(link.href)) {
        toast.error(`Invalid URL for "${link.label}"`);
        return;
      }
    }

    setIsSaving(true);
    try {
      const result = await trpc.settings.updateLinkTreeConfig.mutate({
        config,
      });
      if (result.success) {
        toast.success("Links page updated successfully");
      } else {
        toast.error(
          (result as { success: false; error: string }).error ||
            "Failed to update links page",
        );
      }
    } catch (err) {
      console.error("Failed to update link tree config:", err);
      toast.error("Failed to update links page");
    } finally {
      setIsSaving(false);
    }
  };

  const addLink = () => {
    setConfig((prev) => ({
      ...prev,
      links: [
        ...prev.links,
        { label: "", href: "", icon: "link", enabled: true },
      ],
    }));
  };

  const removeLink = (index: number) => {
    setConfig((prev) => ({
      ...prev,
      links: prev.links.filter((_, i) => i !== index),
    }));
  };

  const updateLink = (index: number, updates: Partial<LinkTreeItem>) => {
    setConfig((prev) => ({
      ...prev,
      links: prev.links.map((link, i) =>
        i === index ? { ...link, ...updates } : link,
      ),
    }));
  };

  const moveLink = (index: number, direction: "up" | "down") => {
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= config.links.length) return;

    setConfig((prev) => {
      const links = [...prev.links];
      const [moved] = links.splice(index, 1);
      links.splice(newIndex, 0, moved!);
      return { ...prev, links };
    });
  };

  if (isLoading) {
    return (
      <div className='flex items-center justify-center min-h-100'>
        <Loader2 className='h-8 w-8 animate-spin text-gray-400' />
      </div>
    );
  }

  return (
    <div className='p-4 md:p-6 lg:p-8 max-w-2xl mx-auto space-y-6'>
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-2xl font-semibold tracking-tight'>Links Page</h1>
          <p className='text-sm text-muted-foreground mt-1'>
            Manage the links shown on your QR code landing page.
          </p>
        </div>
        <a
          href='/links'
          target='_blank'
          rel='noopener noreferrer'
          className='inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors'>
          <Eye className='h-4 w-4' />
          Preview
          <ExternalLink className='h-3 w-3' />
        </a>
      </div>

      {/* Branding */}
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <Link2 className='h-5 w-5' />
            Branding
          </CardTitle>
          <CardDescription>
            Configure the brand name and subtitle displayed at the top of your
            links page.
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='space-y-2'>
            <Label htmlFor='brandName'>Brand Name</Label>
            <Input
              id='brandName'
              value={config.brandName}
              onChange={(e) =>
                setConfig((prev) => ({ ...prev, brandName: e.target.value }))
              }
              placeholder='e.g. Percée'
              maxLength={100}
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='subtitle'>Subtitle</Label>
            <Input
              id='subtitle'
              value={config.subtitle}
              onChange={(e) =>
                setConfig((prev) => ({ ...prev, subtitle: e.target.value }))
              }
              placeholder='e.g. Shop, follow, and connect'
              maxLength={200}
            />
          </div>
        </CardContent>
      </Card>

      {/* Links */}
      <Card>
        <CardHeader>
          <CardTitle>Links</CardTitle>
          <CardDescription>
            Add, remove, and reorder the links on your page. Disabled links
            won&apos;t appear on the public page.
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          {config.links.length === 0 && (
            <p className='text-sm text-muted-foreground text-center py-6'>
              No links added yet. Click &ldquo;Add Link&rdquo; below to get
              started.
            </p>
          )}

          {config.links.map((link, index) => (
            <div
              key={index}
              className='border rounded-lg p-4 space-y-3 bg-muted/30'>
              <div className='flex items-center justify-between'>
                <div className='flex items-center gap-2'>
                  {/* Reorder buttons */}
                  <div className='flex flex-col -space-y-1'>
                    <button
                      type='button'
                      onClick={() => moveLink(index, "up")}
                      disabled={index === 0}
                      className='p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors'
                      aria-label='Move up'>
                      <svg
                        xmlns='http://www.w3.org/2000/svg'
                        viewBox='0 0 24 24'
                        fill='none'
                        stroke='currentColor'
                        strokeWidth='2'
                        strokeLinecap='round'
                        strokeLinejoin='round'
                        className='h-3.5 w-3.5'>
                        <path d='m18 15-6-6-6 6' />
                      </svg>
                    </button>
                    <button
                      type='button'
                      onClick={() => moveLink(index, "down")}
                      disabled={index === config.links.length - 1}
                      className='p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors'
                      aria-label='Move down'>
                      <svg
                        xmlns='http://www.w3.org/2000/svg'
                        viewBox='0 0 24 24'
                        fill='none'
                        stroke='currentColor'
                        strokeWidth='2'
                        strokeLinecap='round'
                        strokeLinejoin='round'
                        className='h-3.5 w-3.5'>
                        <path d='m6 9 6 6 6-6' />
                      </svg>
                    </button>
                  </div>

                  <span className='text-sm font-medium text-muted-foreground'>
                    #{index + 1}
                  </span>
                </div>

                <div className='flex items-center gap-3'>
                  <div className='flex items-center gap-2'>
                    <Label
                      htmlFor={`enabled-${index}`}
                      className='text-xs text-muted-foreground'>
                      {link.enabled ? "Visible" : "Hidden"}
                    </Label>
                    <Switch
                      id={`enabled-${index}`}
                      checked={link.enabled}
                      onCheckedChange={(checked) =>
                        updateLink(index, { enabled: checked })
                      }
                    />
                  </div>
                  <button
                    type='button'
                    onClick={() => removeLink(index)}
                    className='p-1.5 text-muted-foreground hover:text-destructive transition-colors rounded-md hover:bg-destructive/10'
                    aria-label={`Remove ${link.label || "link"}`}>
                    <Trash2 className='h-4 w-4' />
                  </button>
                </div>
              </div>

              <div className='grid gap-3 sm:grid-cols-2'>
                <div className='space-y-1.5'>
                  <Label htmlFor={`label-${index}`} className='text-xs'>
                    Label
                  </Label>
                  <Input
                    id={`label-${index}`}
                    value={link.label}
                    onChange={(e) =>
                      updateLink(index, { label: e.target.value })
                    }
                    placeholder='e.g. Instagram'
                    maxLength={100}
                  />
                </div>
                <div className='space-y-1.5'>
                  <Label htmlFor={`icon-${index}`} className='text-xs'>
                    Icon
                  </Label>
                  <Select
                    value={link.icon}
                    onValueChange={(value) =>
                      updateLink(index, { icon: value })
                    }>
                    <SelectTrigger id={`icon-${index}`}>
                      <SelectValue placeholder='Select icon' />
                    </SelectTrigger>
                    <SelectContent>
                      {LINK_ICON_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className='space-y-1.5'>
                <Label htmlFor={`href-${index}`} className='text-xs'>
                  URL
                </Label>
                <Input
                  id={`href-${index}`}
                  value={link.href}
                  onChange={(e) => updateLink(index, { href: e.target.value })}
                  placeholder='https://...'
                  type='url'
                  maxLength={500}
                />
              </div>
            </div>
          ))}

          <Button
            type='button'
            variant='outline'
            onClick={addLink}
            className='w-full'>
            <Plus className='mr-2 h-4 w-4' />
            Add Link
          </Button>
        </CardContent>
      </Card>

      {/* Save */}
      <div className='flex justify-end'>
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
      </div>
    </div>
  );
}

function isValidUrl(str: string): boolean {
  try {
    new URL(str);
    return true;
  } catch {
    return false;
  }
}
