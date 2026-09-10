import { useState, useEffect } from "react";
import { trpc } from "#root/shared/trpc/client";
import { toast } from "sonner";
import { PixelPlatform } from "#root/shared/types/pixel-tracking";

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "#root/components/ui/card";
import { Button } from "#root/components/ui/button";
import { Badge } from "#root/components/ui/badge";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "#root/components/ui/dialog";
import {
  PlusCircle,
  Edit,
  Trash2,
  Loader2,
  Radio,
  TestTube,
  Eye,
  EyeOff,
  Activity,
  MousePointerClick,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  Server,
  Monitor,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface PixelConfigRow {
  id: string;
  platform: string;
  pixelId: string;
  accessToken: string | null;
  enabled: boolean;
  enableClientSide: boolean;
  enableServerSide: boolean;
  consentRequired: boolean;
  consentCategory: string | null;
  settings: Record<string, unknown> | null;
  createdAt: string | Date;
  updatedAt: string | Date | null;
}

interface PixelFormState {
  platform: string;
  pixelId: string;
  accessToken: string;
  enabled: boolean;
  enableClientSide: boolean;
  enableServerSide: boolean;
  consentRequired: boolean;
  consentCategory: string;
}

const EMPTY_FORM: PixelFormState = {
  platform: "meta",
  pixelId: "",
  accessToken: "",
  enabled: true,
  enableClientSide: true,
  enableServerSide: false,
  consentRequired: false,
  consentCategory: "",
};

const PLATFORM_LABELS: Record<string, string> = {
  meta: "Meta (Facebook/Instagram)",
  google_ga4: "Google Analytics 4",
  tiktok: "TikTok",
  snapchat: "Snapchat",
  pinterest: "Pinterest",
  custom: "Custom",
  clarity: "Microsoft Clarity",
};

const PIXEL_ID_PLACEHOLDERS: Record<string, string> = {
  meta: "e.g. 123456789012345",
  google_ga4: "e.g. G-XXXXXXXXXX",
  tiktok: "e.g. CXXXXXXXXXXXXXXXXX",
  snapchat: "e.g. xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  pinterest: "e.g. 1234567890123",
  custom: "Your pixel/tracking ID",
  clarity: "e.g. abcdefghij (from your Clarity project's install snippet)",
};

// Clarity is a session-recording/heatmap tool: it has no server-side
// Conversions API and no access-token concept, unlike the ad pixels above.
const PLATFORMS_WITHOUT_SERVER_SIDE = new Set(["clarity"]);

// ─── Helpers ────────────────────────────────────────────────────────────────

function maskPixelId(pixelId: string): string {
  const trimmed = pixelId.trim();
  if (trimmed.length <= 12) return trimmed;
  return `${trimmed.slice(0, 6)}••••${trimmed.slice(-4)}`;
}

// ─── Readiness Status Types ─────────────────────────────────────────────────

interface PlatformHealthRow {
  platform: string;
  enabled: boolean;
  successRate: number;
  successCount: number;
  failedCount: number;
  lastEventAt: string | null;
  status: "healthy" | "degraded" | "down" | "no_data";
}

interface CommerceEventSeen {
  eventName: string;
  total: number;
}

// ─── Page Component ─────────────────────────────────────────────────────────

export default function AdminPixelsPage() {
  const [configs, setConfigs] = useState<PixelConfigRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PixelFormState>(EMPTY_FORM);
  const [testingId, setTestingId] = useState<string | null>(null);

  // ── Readiness status state ──────────────────────────────────────────────
  const [platformHealth, setPlatformHealth] = useState<PlatformHealthRow[]>([]);
  const [commerceEventsSeen, setCommerceEventsSeen] = useState<
    CommerceEventSeen[]
  >([]);
  const [readinessLoading, setReadinessLoading] = useState(true);

  // ── Load configs ────────────────────────────────────────────────────────

  const fetchConfigs = async () => {
    try {
      const result = await trpc.pixelTracking.config.list.query();
      if (result.success) {
        setConfigs(result.result as PixelConfigRow[]);
      }
    } catch {
      toast.error("Failed to load pixel configurations");
    } finally {
      setLoading(false);
    }
  };

  // ── Load readiness data ─────────────────────────────────────────────────

  const fetchReadinessData = async () => {
    try {
      const [healthResult, breakdownResult] = await Promise.all([
        trpc.analytics.platformHealth.query(),
        trpc.analytics.eventBreakdown.query(),
      ]);
      if (healthResult.success) {
        setPlatformHealth(healthResult.result as PlatformHealthRow[]);
      }
      if (breakdownResult.success) {
        const breakdown = breakdownResult.result as {
          events: CommerceEventSeen[];
        };
        // Filter to commerce-critical events only
        const commerceEvents = [
          "page_viewed",
          "product_viewed",
          "product_added_to_cart",
          "checkout_started",
          "checkout_completed",
        ];
        setCommerceEventsSeen(
          (breakdown.events ?? []).filter((e) =>
            commerceEvents.includes(e.eventName),
          ),
        );
      }
    } catch {
      // Non-critical — readiness panel gracefully degrades
    } finally {
      setReadinessLoading(false);
    }
  };

  useEffect(() => {
    fetchConfigs();
    fetchReadinessData();
  }, []);

  // ── Open add/edit dialog ────────────────────────────────────────────────

  const openAddDialog = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEditDialog = (config: PixelConfigRow) => {
    setEditingId(config.id);
    setForm({
      platform: config.platform,
      pixelId: config.pixelId,
      accessToken: config.accessToken ?? "",
      enabled: config.enabled,
      enableClientSide: config.enableClientSide,
      enableServerSide: config.enableServerSide,
      consentRequired: config.consentRequired,
      consentCategory: config.consentCategory ?? "",
    });
    setDialogOpen(true);
  };

  // ── Save (create or update) ─────────────────────────────────────────────

  const handleSave = async () => {
    if (!form.pixelId.trim()) {
      toast.error("Pixel ID is required");
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        const result = await trpc.pixelTracking.config.update.mutate({
          id: editingId,
          platform: form.platform as PixelPlatform,
          pixelId: form.pixelId.trim(),
          accessToken: form.accessToken.trim() || null,
          enabled: form.enabled,
          enableClientSide: form.enableClientSide,
          enableServerSide: form.enableServerSide,
          consentRequired: form.consentRequired,
          consentCategory: (form.consentCategory || null) as
            | "analytics"
            | "marketing"
            | "custom"
            | null,
        });
        if (result.success) {
          toast.success("Pixel configuration updated");
        } else {
          toast.error("Failed to update pixel configuration");
        }
      } else {
        const result = await trpc.pixelTracking.config.create.mutate({
          platform: form.platform as PixelPlatform,
          pixelId: form.pixelId.trim(),
          accessToken: form.accessToken.trim() || undefined,
          enabled: form.enabled,
          enableClientSide: form.enableClientSide,
          enableServerSide: form.enableServerSide,
          consentRequired: form.consentRequired,
          consentCategory: form.consentCategory
            ? (form.consentCategory as "analytics" | "marketing" | "custom")
            : undefined,
        });
        if (result.success) {
          toast.success("Pixel configuration created");
        } else {
          toast.error("Failed to create pixel configuration");
        }
      }
      setDialogOpen(false);
      await fetchConfigs();
    } catch {
      toast.error("An error occurred while saving");
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ──────────────────────────────────────────────────────────────

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this pixel configuration?"))
      return;

    try {
      const result = await trpc.pixelTracking.config.delete.mutate({ id });
      if (result.success) {
        toast.success("Pixel configuration deleted");
        await Promise.all([fetchConfigs(), fetchReadinessData()]);
      } else {
        toast.error("Failed to delete pixel configuration");
      }
    } catch {
      toast.error("An error occurred while deleting");
    }
  };

  // ── Test pixel ──────────────────────────────────────────────────────────

  const handleTestPixel = async (config: PixelConfigRow) => {
    setTestingId(config.id);
    try {
      const { v7 } = await import("uuid");
      const { trackingEventBus } =
        await import("#root/shared/utils/tracking-event-bus");

      const testEvent = {
        eventId: v7(),
        eventName: "page_viewed",
        timestamp: Date.now(),
        pageUrl: window.location.href,
        sessionId: "test-session",
      };

      trackingEventBus.emit(testEvent);
      toast.success(
        `Test event fired! Check your ${PLATFORM_LABELS[config.platform] ?? config.platform} dashboard for the event.`,
      );
    } catch {
      toast.error("Failed to fire test event");
    } finally {
      setTestingId(null);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className='flex items-center justify-center p-12'>
        <Loader2 className='w-6 h-6 animate-spin text-muted-foreground' />
      </div>
    );
  }

  return (
    <div className='p-6 space-y-6 max-w-4xl mx-auto w-full min-w-0 overflow-x-hidden'>
      {/* Header */}
      <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between min-w-0'>
        <div className='min-w-0'>
          <h1 className='text-2xl font-bold'>Pixels & Tracking</h1>
          <p className='text-muted-foreground text-sm mt-1'>
            Connect your ad platform pixels to track conversions and build
            audiences.
          </p>
        </div>
        <div className='flex flex-wrap items-center gap-2 shrink-0'>
          <a href='/dashboard/admin/pixels/custom-events'>
            <Button variant='outline' size='sm'>
              <MousePointerClick className='w-4 h-4 mr-2' />
              Custom Events
            </Button>
          </a>
          <a href='/dashboard/admin/pixels/events'>
            <Button variant='outline' size='sm'>
              <Activity className='w-4 h-4 mr-2' />
              Event Log
            </Button>
          </a>
          <Button onClick={openAddDialog}>
            <PlusCircle className='w-4 h-4 mr-2' />
            Add Pixel
          </Button>
        </div>
      </div>

      {/* ── Pixel Readiness Status ────────────────────────────────────── */}
      {configs.length > 0 && (
        <Card className='min-w-0 overflow-hidden'>
          <CardHeader className='pb-3'>
            <CardTitle className='text-base flex items-center gap-2'>
              <Info className='w-4 h-4' />
              Pixel Readiness
            </CardTitle>
            <CardDescription className='text-xs'>
              Quick overview of your tracking setup. Commerce events flow
              automatically — client-side pixels fire instantly, server-side
              Conversions API delivery happens when an access token is
              configured and server-side is enabled.
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            {readinessLoading ? (
              <div className='flex items-center justify-center py-4'>
                <Loader2 className='w-4 h-4 animate-spin text-muted-foreground' />
              </div>
            ) : (
              <>
                {/* Platform Status */}
                <div>
                  <p className='text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider'>
                    Platform Delivery
                  </p>
                  <div className='grid gap-2'>
                    {configs.map((cfg) => {
                      const health = platformHealth.find(
                        (h) => h.platform === cfg.platform,
                      );
                      const hasToken = !!cfg.accessToken;
                      const hasServerSide = cfg.enableServerSide;
                      const hasClientSide = cfg.enableClientSide;
                      const totalDelivered =
                        (health?.successCount ?? 0) +
                        (health?.failedCount ?? 0);

                      return (
                        <div
                          key={cfg.id}
                          className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-sm border rounded-md px-3 py-2 min-w-0'>
                          <div className='flex min-w-0 flex-1 flex-col gap-0.5 overflow-hidden'>
                            <div className='flex flex-wrap items-center gap-2 min-w-0'>
                              <span className='font-medium shrink-0'>
                                {PLATFORM_LABELS[cfg.platform] ?? cfg.platform}
                              </span>
                              {!cfg.enabled && (
                                <Badge
                                  variant='secondary'
                                  className='text-[10px] px-1.5'>
                                  Disabled
                                </Badge>
                              )}
                            </div>
                            <span
                              className='font-mono text-[11px] text-muted-foreground truncate break-all'
                              title={cfg.pixelId.length > 12 ? cfg.pixelId : undefined}>
                              {maskPixelId(cfg.pixelId)}
                            </span>
                          </div>
                          <div className='flex items-center gap-2 shrink-0 self-end sm:self-auto'>
                            <div className='flex items-center gap-3 text-xs text-muted-foreground'>
                              {/* Client-side status */}
                              <span
                                className='flex items-center gap-1'
                                title='Client-side pixel (browser)'>
                                <Monitor className='w-3 h-3' />
                                {hasClientSide && cfg.enabled ? (
                                  <CheckCircle2 className='w-3 h-3 text-green-600' />
                                ) : (
                                  <XCircle className='w-3 h-3 text-muted-foreground/40' />
                                )}
                              </span>
                              {/* Server-side status */}
                              <span
                                className='flex items-center gap-1'
                                title={
                                  hasServerSide && hasToken
                                    ? "Server-side Conversions API active"
                                    : hasServerSide && !hasToken
                                      ? "Server-side enabled but no access token — delivery will fail"
                                      : "Server-side not enabled"
                                }>
                                <Server className='w-3 h-3' />
                                {hasServerSide && hasToken && cfg.enabled ? (
                                  <CheckCircle2 className='w-3 h-3 text-green-600' />
                                ) : hasServerSide && !hasToken ? (
                                  <AlertTriangle className='w-3 h-3 text-amber-500' />
                                ) : (
                                  <XCircle className='w-3 h-3 text-muted-foreground/40' />
                                )}
                              </span>
                              {/* Delivery count */}
                              {totalDelivered > 0 ? (
                                <Badge
                                  variant='outline'
                                  className={`text-[10px] px-1.5 ${
                                    health?.status === "healthy"
                                      ? "border-green-300 text-green-700"
                                      : health?.status === "degraded"
                                        ? "border-amber-300 text-amber-700"
                                        : "border-red-300 text-red-700"
                                  }`}>
                                  {health?.successCount ?? 0} delivered (7d)
                                </Badge>
                              ) : (
                                <Badge
                                  variant='outline'
                                  className='text-[10px] px-1.5 border-muted text-muted-foreground'>
                                  No deliveries yet
                                </Badge>
                              )}
                            </div>
                            <Button
                              variant='outline'
                              size='icon'
                              className='h-7 w-7'
                              title='Edit pixel'
                              onClick={() => openEditDialog(cfg)}>
                              <Edit className='w-3.5 h-3.5' />
                            </Button>
                            <Button
                              variant='outline'
                              size='icon'
                              className='h-7 w-7 text-destructive hover:text-destructive'
                              title='Delete pixel'
                              onClick={() => handleDelete(cfg.id)}>
                              <Trash2 className='w-3.5 h-3.5' />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Commerce Events Seen */}
                <div>
                  <p className='text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider'>
                    Commerce Events (last 30 days)
                  </p>
                  <div className='flex flex-wrap gap-2'>
                    {[
                      { key: "page_viewed", label: "PageView" },
                      { key: "product_viewed", label: "ViewContent" },
                      { key: "product_added_to_cart", label: "AddToCart" },
                      { key: "checkout_started", label: "InitiateCheckout" },
                      { key: "checkout_completed", label: "Purchase" },
                    ].map(({ key, label }) => {
                      const seen = commerceEventsSeen.find(
                        (e) => e.eventName === key,
                      );
                      return (
                        <Badge
                          key={key}
                          variant='outline'
                          className={`text-xs ${
                            seen && seen.total > 0
                              ? "border-green-300 text-green-700 bg-green-50"
                              : "border-muted text-muted-foreground"
                          }`}>
                          {seen && seen.total > 0 ? (
                            <CheckCircle2 className='w-3 h-3 mr-1' />
                          ) : (
                            <XCircle className='w-3 h-3 mr-1 opacity-40' />
                          )}
                          {label}
                          {seen && seen.total > 0 ? ` (${seen.total})` : ""}
                        </Badge>
                      );
                    })}
                  </div>
                  {commerceEventsSeen.length === 0 && (
                    <p className='text-xs text-muted-foreground mt-2'>
                      No commerce events recorded yet. Events will appear here
                      once customers browse and buy from your store.
                    </p>
                  )}
                </div>

                {/* Honesty note about server-side delivery */}
                {configs.some((c) => c.enableServerSide && !c.accessToken) && (
                  <div className='flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2'>
                    <AlertTriangle className='w-3.5 h-3.5 mt-0.5 shrink-0' />
                    <span>
                      Some platforms have server-side enabled but no access
                      token configured. Server-side delivery (Conversions API)
                      requires a valid access token to actually send events to
                      the platform. Client-side tracking still works.
                    </span>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {configs.length === 0 && !loading && (
        <Card>
          <CardContent className='flex flex-col items-center justify-center py-12'>
            <Radio className='w-12 h-12 text-muted-foreground mb-4' />
            <h3 className='text-lg font-medium mb-2'>No pixels connected</h3>
            <p className='text-muted-foreground text-sm mb-4 text-center max-w-md'>
              Connect your Meta Pixel, Google Analytics, TikTok, or other ad
              platforms to start tracking conversions.
            </p>
            <Button onClick={openAddDialog}>
              <PlusCircle className='w-4 h-4 mr-2' />
              Connect Your First Pixel
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Pixel config cards */}
      <div className='grid gap-4 min-w-0'>
        {configs.map((config) => (
          <Card key={config.id} className='min-w-0 overflow-hidden'>
            <CardHeader className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between space-y-0 pb-2 min-w-0'>
              <div className='space-y-1 min-w-0 flex-1 overflow-hidden'>
                <CardTitle className='text-lg flex flex-wrap items-center gap-2'>
                  {PLATFORM_LABELS[config.platform] ?? config.platform}
                  <Badge variant={config.enabled ? "default" : "secondary"}>
                    {config.enabled ? "Active" : "Disabled"}
                  </Badge>
                </CardTitle>
                <CardDescription
                  className='font-mono text-sm truncate break-all'
                  title={
                    config.pixelId.length > 12 ? config.pixelId : undefined
                  }>
                  {maskPixelId(config.pixelId)}
                </CardDescription>
              </div>
              <div className='flex flex-wrap gap-2 shrink-0'>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => handleTestPixel(config)}
                  disabled={!config.enabled || testingId === config.id}>
                  {testingId === config.id ? (
                    <Loader2 className='w-4 h-4 animate-spin' />
                  ) : (
                    <TestTube className='w-4 h-4' />
                  )}
                  <span className='ml-1'>Test</span>
                </Button>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => openEditDialog(config)}>
                  <Edit className='w-4 h-4' />
                </Button>
                <Button
                  variant='destructive'
                  size='sm'
                  onClick={() => handleDelete(config.id)}>
                  <Trash2 className='w-4 h-4' />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className='flex gap-4 text-sm text-muted-foreground'>
                <span className='flex items-center gap-1'>
                  {config.enableClientSide ? (
                    <Eye className='w-3 h-3' />
                  ) : (
                    <EyeOff className='w-3 h-3' />
                  )}
                  Client-side: {config.enableClientSide ? "On" : "Off"}
                </span>
                <span className='flex items-center gap-1'>
                  {config.enableServerSide ? (
                    <Eye className='w-3 h-3' />
                  ) : (
                    <EyeOff className='w-3 h-3' />
                  )}
                  Server-side: {config.enableServerSide ? "On" : "Off"}
                </span>
                {config.consentRequired && (
                  <Badge variant='outline' className='text-xs'>
                    Consent: {config.consentCategory ?? "required"}
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className='sm:max-w-[500px]'>
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Edit Pixel Configuration" : "Add New Pixel"}
            </DialogTitle>
          </DialogHeader>

          <div className='space-y-4 py-2'>
            {/* Platform */}
            <div className='space-y-2'>
              <Label htmlFor='platform'>Platform</Label>
              <Select
                value={form.platform}
                onValueChange={(v) =>
                  setForm((f) =>
                    PLATFORMS_WITHOUT_SERVER_SIDE.has(v)
                      ? {
                          ...f,
                          platform: v,
                          enableServerSide: false,
                          accessToken: "",
                        }
                      : { ...f, platform: v },
                  )
                }
                disabled={!!editingId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PLATFORM_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Pixel ID */}
            <div className='space-y-2'>
              <Label htmlFor='pixelId'>Pixel / Measurement ID</Label>
              <Input
                id='pixelId'
                value={form.pixelId}
                onChange={(e) =>
                  setForm((f) => ({ ...f, pixelId: e.target.value }))
                }
                placeholder={PIXEL_ID_PLACEHOLDERS[form.platform] ?? ""}
              />
            </div>

            {/* Access Token (optional, for server-side) — not applicable to
                platforms with no server-side Conversions API */}
            {!PLATFORMS_WITHOUT_SERVER_SIDE.has(form.platform) && (
              <div className='space-y-2'>
                <Label htmlFor='accessToken'>
                  Access Token{" "}
                  <span className='text-muted-foreground text-xs'>
                    (optional — for server-side Conversions API)
                  </span>
                </Label>
                <Input
                  id='accessToken'
                  type='password'
                  value={form.accessToken}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, accessToken: e.target.value }))
                  }
                  placeholder='Paste your access token here'
                />
              </div>
            )}

            {/* Toggles */}
            <div className='space-y-3'>
              <div className='flex items-center justify-between'>
                <Label htmlFor='enabled'>Enabled</Label>
                <Switch
                  id='enabled'
                  checked={form.enabled}
                  onCheckedChange={(v) =>
                    setForm((f) => ({ ...f, enabled: v }))
                  }
                />
              </div>

              <div className='flex items-center justify-between'>
                <Label htmlFor='enableClientSide'>Client-Side Tracking</Label>
                <Switch
                  id='enableClientSide'
                  checked={form.enableClientSide}
                  onCheckedChange={(v) =>
                    setForm((f) => ({ ...f, enableClientSide: v }))
                  }
                />
              </div>

              {!PLATFORMS_WITHOUT_SERVER_SIDE.has(form.platform) && (
                <div className='flex items-center justify-between'>
                  <Label htmlFor='enableServerSide'>Server-Side Tracking</Label>
                  <Switch
                    id='enableServerSide'
                    checked={form.enableServerSide}
                    onCheckedChange={(v) =>
                      setForm((f) => ({ ...f, enableServerSide: v }))
                    }
                  />
                </div>
              )}

              <div className='flex items-center justify-between'>
                <Label htmlFor='consentRequired'>Require Consent</Label>
                <Switch
                  id='consentRequired'
                  checked={form.consentRequired}
                  onCheckedChange={(v) =>
                    setForm((f) => ({ ...f, consentRequired: v }))
                  }
                />
              </div>
            </div>

            {/* Consent category */}
            {form.consentRequired && (
              <div className='space-y-2'>
                <Label htmlFor='consentCategory'>Consent Category</Label>
                <Select
                  value={form.consentCategory}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, consentCategory: v }))
                  }>
                  <SelectTrigger>
                    <SelectValue placeholder='Select category' />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='analytics'>Analytics</SelectItem>
                    <SelectItem value='marketing'>Marketing</SelectItem>
                    <SelectItem value='custom'>Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className='flex justify-end gap-2 pt-2'>
            <Button
              variant='outline'
              onClick={() => setDialogOpen(false)}
              disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className='w-4 h-4 mr-2 animate-spin' />}
              {editingId ? "Save Changes" : "Add Pixel"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
