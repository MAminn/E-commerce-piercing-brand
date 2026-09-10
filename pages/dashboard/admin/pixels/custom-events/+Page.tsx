import { useState, useEffect } from "react";
import { trpc } from "#root/shared/trpc/client";
import { toast } from "sonner";
import type { CustomEventTriggerType } from "#root/shared/types/pixel-tracking";

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
  MousePointerClick,
  Globe,
  Clock,
  Wrench,
  TestTube,
  ArrowLeft,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface CustomEventRow {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
  triggerType: CustomEventTriggerType;
  triggerConfig: Record<string, unknown>;
  eventData: Record<string, unknown>;
  platformMapping: Record<string, string>;
  isActive: boolean;
  createdAt: string | Date;
  updatedAt: string | Date | null;
}

interface EventFormState {
  name: string;
  displayName: string;
  description: string;
  triggerType: CustomEventTriggerType;
  triggerConfig: Record<string, unknown>;
  eventDataEntries: Array<{ key: string; value: string }>;
  platformMapping: Record<string, string>;
  isActive: boolean;
}

const EMPTY_FORM: EventFormState = {
  name: "",
  displayName: "",
  description: "",
  triggerType: "manual",
  triggerConfig: {},
  eventDataEntries: [],
  platformMapping: {},
  isActive: true,
};

const TRIGGER_TYPE_LABELS: Record<CustomEventTriggerType, string> = {
  manual: "Manual (Code Only)",
  css_selector: "CSS Selector Click",
  url_match: "URL Pattern Match",
  time_on_page: "Time on Page",
};

const TRIGGER_TYPE_ICONS: Record<
  CustomEventTriggerType,
  typeof Wrench
> = {
  manual: Wrench,
  css_selector: MousePointerClick,
  url_match: Globe,
  time_on_page: Clock,
};

const TRIGGER_TYPE_DESCRIPTIONS: Record<CustomEventTriggerType, string> = {
  manual: "Only fires when triggered programmatically via trackEvent()",
  css_selector: "Fires when a user clicks an element matching the CSS selector",
  url_match:
    "Fires on page load when the URL matches the given regex pattern",
  time_on_page: "Fires after the user spends N seconds on a page",
};

const PLATFORM_LABELS: Record<string, string> = {
  meta: "Meta (Facebook)",
  google_ga4: "Google GA4",
  tiktok: "TikTok",
  snapchat: "Snapchat",
  pinterest: "Pinterest",
};

// ─── Page Component ─────────────────────────────────────────────────────────

export default function CustomEventsPage() {
  const [events, setEvents] = useState<CustomEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<EventFormState>(EMPTY_FORM);
  const [testingId, setTestingId] = useState<string | null>(null);

  // ── Load events ─────────────────────────────────────────────────────────

  const fetchEvents = async () => {
    try {
      const result = await trpc.pixelTracking.customEvents.list.query();
      if (result.success) {
        setEvents(result.result as CustomEventRow[]);
      }
    } catch {
      toast.error("Failed to load custom events");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  // ── Open add/edit dialog ────────────────────────────────────────────────

  const openAddDialog = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEditDialog = (event: CustomEventRow) => {
    setEditingId(event.id);
    setForm({
      name: event.name,
      displayName: event.displayName,
      description: event.description ?? "",
      triggerType: event.triggerType,
      triggerConfig: event.triggerConfig,
      eventDataEntries: Object.entries(event.eventData).map(([key, value]) => ({
        key,
        value: String(value),
      })),
      platformMapping: event.platformMapping,
      isActive: event.isActive,
    });
    setDialogOpen(true);
  };

  // ── Save (create or update) ─────────────────────────────────────────────

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error("Event name is required");
      return;
    }
    if (!form.displayName.trim()) {
      toast.error("Display name is required");
      return;
    }

    // Convert eventDataEntries to object
    const eventData: Record<string, unknown> = {};
    for (const entry of form.eventDataEntries) {
      if (entry.key.trim()) {
        eventData[entry.key.trim()] = entry.value;
      }
    }

    setSaving(true);
    try {
      if (editingId) {
        const result = await trpc.pixelTracking.customEvents.update.mutate({
          id: editingId,
          name: form.name.trim(),
          displayName: form.displayName.trim(),
          description: form.description.trim() || null,
          triggerType: form.triggerType,
          triggerConfig: form.triggerConfig,
          eventData,
          platformMapping: form.platformMapping,
          isActive: form.isActive,
        });
        if (result.success) {
          toast.success("Custom event updated");
        } else {
          toast.error("Failed to update custom event");
        }
      } else {
        const result = await trpc.pixelTracking.customEvents.create.mutate({
          name: form.name.trim(),
          displayName: form.displayName.trim(),
          description: form.description.trim() || undefined,
          triggerType: form.triggerType,
          triggerConfig: form.triggerConfig,
          eventData,
          platformMapping: form.platformMapping,
          isActive: form.isActive,
        });
        if (result.success) {
          toast.success("Custom event created");
        } else {
          toast.error("Failed to create custom event");
        }
      }
      setDialogOpen(false);
      fetchEvents();
    } catch {
      toast.error("Failed to save custom event");
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ──────────────────────────────────────────────────────────────

  const handleDelete = async (id: string) => {
    try {
      const result = await trpc.pixelTracking.customEvents.delete.mutate({
        id,
      });
      if (result.success) {
        toast.success("Custom event deleted");
        fetchEvents();
      } else {
        toast.error("Failed to delete custom event");
      }
    } catch {
      toast.error("Failed to delete custom event");
    }
  };

  // ── Test Fire ───────────────────────────────────────────────────────────

  const handleTestFire = async (event: CustomEventRow) => {
    setTestingId(event.id);
    try {
      // Fire through the tracking system by broadcasting
      if (typeof window !== "undefined" && typeof CustomEvent !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("tracking:custom-event-test", {
            detail: { eventName: event.name, eventData: event.eventData },
          }),
        );
      }
      toast.success(`Test event "${event.displayName}" fired`);
    } finally {
      setTimeout(() => setTestingId(null), 1000);
    }
  };

  // ── Trigger Config UI ──────────────────────────────────────────────────

  const renderTriggerConfig = () => {
    switch (form.triggerType) {
      case "css_selector":
        return (
          <div className="space-y-2">
            <Label>CSS Selector</Label>
            <Input
              placeholder=".size-guide-btn, #loyalty-signup"
              value={(form.triggerConfig.selector as string) ?? ""}
              onChange={(e) =>
                setForm({
                  ...form,
                  triggerConfig: { selector: e.target.value },
                })
              }
            />
            <p className="text-xs text-muted-foreground">
              Event fires when a user clicks any element matching this selector
            </p>
          </div>
        );
      case "url_match":
        return (
          <div className="space-y-2">
            <Label>URL Pattern (Regex)</Label>
            <Input
              placeholder="\/products\/.*\/size-guide"
              value={(form.triggerConfig.pattern as string) ?? ""}
              onChange={(e) =>
                setForm({
                  ...form,
                  triggerConfig: { pattern: e.target.value },
                })
              }
            />
            <p className="text-xs text-muted-foreground">
              Event fires on page load when the URL matches this pattern
            </p>
          </div>
        );
      case "time_on_page":
        return (
          <div className="space-y-2">
            <Label>Time Threshold (seconds)</Label>
            <Input
              type="number"
              min={1}
              placeholder="30"
              value={(form.triggerConfig.seconds as number) ?? ""}
              onChange={(e) =>
                setForm({
                  ...form,
                  triggerConfig: { seconds: Number(e.target.value) },
                })
              }
            />
            <p className="text-xs text-muted-foreground">
              Event fires after the user spends this many seconds on a page
            </p>
          </div>
        );
      case "manual":
        return (
          <p className="text-sm text-muted-foreground">
            Manual events are triggered programmatically. Use{" "}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">
              trackEvent("{form.name || "event_name"}")
            </code>{" "}
            in your code.
          </p>
        );
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <a href="/dashboard/admin/pixels">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Pixels
            </Button>
          </a>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Custom Events
            </h1>
            <p className="text-muted-foreground text-sm">
              Define custom tracking events with automated triggers
            </p>
          </div>
        </div>
        <Button onClick={openAddDialog}>
          <PlusCircle className="h-4 w-4 mr-2" />
          Create Event
        </Button>
      </div>

      {/* Event List */}
      {events.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <MousePointerClick className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">No custom events yet</h3>
            <p className="text-sm text-muted-foreground mt-1 mb-4">
              Create your first custom event to start tracking beyond standard
              e-commerce events
            </p>
            <Button onClick={openAddDialog}>
              <PlusCircle className="h-4 w-4 mr-2" />
              Create Event
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {events.map((event) => {
            const TriggerIcon = TRIGGER_TYPE_ICONS[event.triggerType];
            return (
              <Card key={event.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-md bg-muted">
                        <TriggerIcon className="h-4 w-4" />
                      </div>
                      <div>
                        <CardTitle className="text-base">
                          {event.displayName}
                        </CardTitle>
                        <CardDescription className="font-mono text-xs">
                          {event.name}
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={event.isActive ? "default" : "secondary"}>
                        {event.isActive ? "Active" : "Inactive"}
                      </Badge>
                      <Badge variant="outline">
                        {TRIGGER_TYPE_LABELS[event.triggerType]}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      {event.description && (
                        <p className="text-sm text-muted-foreground">
                          {event.description}
                        </p>
                      )}
                      {Object.keys(event.platformMapping).length > 0 && (
                        <div className="flex gap-1 flex-wrap">
                          {Object.entries(event.platformMapping).map(
                            ([platform, name]) => (
                              <Badge
                                key={platform}
                                variant="outline"
                                className="text-xs"
                              >
                                {PLATFORM_LABELS[platform] ?? platform}: {name}
                              </Badge>
                            ),
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleTestFire(event)}
                        disabled={testingId === event.id}
                      >
                        {testingId === event.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <TestTube className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditDialog(event)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(event.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Edit Custom Event" : "Create Custom Event"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6 mt-4">
            {/* Basic Info */}
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="eventName">Event Name</Label>
                  <Input
                    id="eventName"
                    placeholder="loyalty_signup"
                    value={form.name}
                    onChange={(e) =>
                      setForm({ ...form, name: e.target.value })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Lowercase snake_case (e.g. size_guide_opened)
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="displayName">Display Name</Label>
                  <Input
                    id="displayName"
                    placeholder="Loyalty Signup"
                    value={form.displayName}
                    onChange={(e) =>
                      setForm({ ...form, displayName: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  placeholder="Fired when a user signs up for the loyalty program"
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                />
              </div>
            </div>

            {/* Trigger Type */}
            <div className="space-y-4">
              <Label>Trigger Type</Label>
              <Select
                value={form.triggerType}
                onValueChange={(v) =>
                  setForm({
                    ...form,
                    triggerType: v as CustomEventTriggerType,
                    triggerConfig: {},
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(
                    Object.entries(TRIGGER_TYPE_LABELS) as [
                      CustomEventTriggerType,
                      string,
                    ][]
                  ).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {TRIGGER_TYPE_DESCRIPTIONS[form.triggerType]}
              </p>

              {/* Trigger Config */}
              {renderTriggerConfig()}
            </div>

            {/* Custom Data Fields */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Custom Data Fields</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setForm({
                      ...form,
                      eventDataEntries: [
                        ...form.eventDataEntries,
                        { key: "", value: "" },
                      ],
                    })
                  }
                >
                  <PlusCircle className="h-3 w-3 mr-1" />
                  Add Field
                </Button>
              </div>
              {form.eventDataEntries.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No custom data fields. Add key-value pairs to attach to every
                  event firing.
                </p>
              )}
              {form.eventDataEntries.map((entry, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <Input
                    placeholder="key"
                    value={entry.key}
                    onChange={(e) => {
                      const updated = [...form.eventDataEntries];
                      updated[idx] = { key: e.target.value, value: entry.value };
                      setForm({ ...form, eventDataEntries: updated });
                    }}
                    className="flex-1"
                  />
                  <Input
                    placeholder="value"
                    value={entry.value}
                    onChange={(e) => {
                      const updated = [...form.eventDataEntries];
                      updated[idx] = { key: entry.key, value: e.target.value };
                      setForm({ ...form, eventDataEntries: updated });
                    }}
                    className="flex-1"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const updated = form.eventDataEntries.filter(
                        (_, i) => i !== idx,
                      );
                      setForm({ ...form, eventDataEntries: updated });
                    }}
                  >
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>

            {/* Platform Name Overrides */}
            <div className="space-y-3">
              <Label>Platform Name Overrides (Optional)</Label>
              <p className="text-xs text-muted-foreground">
                Override the event name sent to specific platforms. Leave blank
                to use the default event name.
              </p>
              <div className="grid gap-2">
                {Object.entries(PLATFORM_LABELS).map(([platform, label]) => (
                  <div key={platform} className="flex items-center gap-3">
                    <Label className="w-32 text-sm">{label}</Label>
                    <Input
                      placeholder={`e.g. CustomEvent_${form.name || "event"}`}
                      className="flex-1"
                      value={form.platformMapping[platform] ?? ""}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          platformMapping: {
                            ...form.platformMapping,
                            [platform]: e.target.value,
                          },
                        })
                      }
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Active Toggle */}
            <div className="flex items-center justify-between">
              <div>
                <Label>Active</Label>
                <p className="text-xs text-muted-foreground">
                  Inactive events won't fire triggers
                </p>
              </div>
              <Switch
                checked={form.isActive}
                onCheckedChange={(checked) =>
                  setForm({ ...form, isActive: checked })
                }
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : editingId ? (
                  "Update Event"
                ) : (
                  "Create Event"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
