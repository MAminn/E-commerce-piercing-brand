import { useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "#root/shared/trpc/client";
import { toast } from "sonner";
import { relevantTokenKeysFor, tokenDefsFor, type EmailTokenDef } from "#root/shared/email-tokens";
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
import { Badge } from "#root/components/ui/badge";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "#root/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#root/components/ui/select";
import {
  Loader2,
  Send,
  RefreshCw,
  Save,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

// ─── Types (mirrors backend/email-automations/templates) ──────────────────

type AutomationType =
  | "welcome"
  | "review_check"
  | "abandoned_cart"
  | "abandoned_browse"
  | "win_back"
  | "new_drops"
  | "flash_offer"
  | "retention";

interface TemplateContent {
  headlineEn: string;
  headlineAr: string;
  bodyEn: string;
  bodyAr: string;
  ctaLabelEn: string;
  ctaLabelAr: string;
  ctaHref: string;
  showFeaturedItem: boolean;
  showReviewStars: boolean;
  showDiscountCode: boolean;
  discountBadgeTextEn: string;
  discountBadgeTextAr: string;
}

interface AttachedPromoCode {
  id: string;
  code: string;
  discountType: "percentage" | "fixed_amount";
  discountValue: number;
}

interface EffectiveTemplate {
  automationType: AutomationType;
  stepKey: string;
  enabled: boolean;
  delayMinutes: number;
  subjectEn: string;
  subjectAr: string;
  preheaderEn: string;
  preheaderAr: string;
  content: TemplateContent;
  promoCode: AttachedPromoCode | null;
  isCustomized: boolean;
}

interface PromoCodeOption {
  id: string;
  code: string;
  discountType: "percentage" | "fixed_amount";
  discountValue: number;
}

interface EmailAutomationSettings {
  workerEnabled: boolean;
  testModeEnabled: boolean;
  testModeEmail: string;
  emailLogoUrl: string;
}

interface ScheduledEmailRow {
  id: string;
  automationType: AutomationType;
  recipientEmail: string;
  status: "pending" | "sending" | "sent" | "failed" | "cancelled";
  scheduledFor: Date;
  sentAt: Date | null;
  lastError: string | null;
  attempts: number;
  updatedAt: Date;
}

const AUTOMATION_LABELS: Record<AutomationType, string> = {
  welcome: "Welcome Email",
  review_check: "Review Request",
  abandoned_cart: "Abandoned Cart",
  abandoned_browse: "Abandoned Browse",
  win_back: "Win Back",
  new_drops: "New Drops",
  flash_offer: "Flash Offer",
  retention: "Retention",
};

const AUTOMATION_ORDER: AutomationType[] = [
  "welcome",
  "review_check",
  "abandoned_cart",
  "abandoned_browse",
  "win_back",
  "new_drops",
  "flash_offer",
  "retention",
];

const ABANDONED_CART_STEPS = [
  { key: "step1", label: "Email 1 (1h)" },
  { key: "step2", label: "Email 2 (24h)" },
  { key: "step3", label: "Email 3 (60h + code)" },
];

/**
 * A text field with a row of clickable token chips beneath it. Clicking a
 * chip inserts that token's bracketed label — e.g. `[Customer Name]` — at
 * the cursor position, so an admin never has to type or remember any
 * syntax. Falls back to appending at the end if the cursor position isn't
 * available for some reason.
 */
function TokenizedField({
  label,
  value,
  onChange,
  tokens,
  locale,
  multiline = false,
  dir,
  placeholder,
  rows,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  tokens: EmailTokenDef[];
  locale: "en" | "ar";
  multiline?: boolean;
  dir?: "rtl" | "ltr";
  placeholder?: string;
  rows?: number;
}) {
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  const insertToken = (tokenLabel: string) => {
    const el = ref.current;
    const tokenText = `[${tokenLabel}]`;
    if (!el || el.selectionStart == null || el.selectionEnd == null) {
      onChange(value + tokenText);
      return;
    }
    const { selectionStart: start, selectionEnd: end } = el;
    const next = value.slice(0, start) + tokenText + value.slice(end);
    onChange(next);
    const cursorPos = start + tokenText.length;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(cursorPos, cursorPos);
    });
  };

  return (
    <div>
      <Label className={multiline ? undefined : "text-xs"}>{label}</Label>
      {multiline ? (
        <Textarea
          ref={ref as React.RefObject<HTMLTextAreaElement>}
          dir={dir}
          rows={rows}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className='mt-1'
        />
      ) : (
        <Input
          ref={ref as React.RefObject<HTMLInputElement>}
          dir={dir}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className='mt-1'
        />
      )}
      {tokens.length > 0 && (
        <div className='flex flex-wrap gap-1 mt-1.5'>
          {tokens.map((t) => (
            <button
              key={t.key}
              type='button'
              onClick={() => insertToken(locale === "ar" ? t.labelAr : t.labelEn)}
              title={locale === "ar" ? t.descriptionAr : t.descriptionEn}
              className='text-[10px] font-medium px-2 py-0.5 rounded-full border border-gray-300 bg-gray-50 text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors'>
              + {locale === "ar" ? t.labelAr : t.labelEn}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function formatDelay(minutes: number): string {
  if (minutes === 0) return "Sent on demand (broadcast)";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} after trigger`;
  if (minutes < 1440) {
    const hours = Math.round((minutes / 60) * 10) / 10;
    return `${hours} hour${hours === 1 ? "" : "s"} after trigger`;
  }
  const days = Math.round((minutes / 1440) * 10) / 10;
  return `${days} day${days === 1 ? "" : "s"} after trigger`;
}

function AutomationSettingsCard({
  settings,
  saving,
  onSave,
}: {
  settings: EmailAutomationSettings;
  saving: boolean;
  onSave: (next: EmailAutomationSettings) => void;
}) {
  const [emailDraft, setEmailDraft] = useState(settings.testModeEmail);

  useEffect(() => {
    setEmailDraft(settings.testModeEmail);
  }, [settings.testModeEmail]);

  const commitEmail = () => {
    const trimmed = emailDraft.trim();
    if (trimmed !== settings.testModeEmail) {
      onSave({ ...settings, testModeEmail: trimmed });
    }
  };

  const [uploadingLogo, setUploadingLogo] = useState(false);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("File too large. Maximum size is 2MB.");
      return;
    }
    setUploadingLogo(true);
    try {
      const buffer = new Uint8Array(await file.arrayBuffer());
      const result = await trpc.layout.uploadImage.mutate({
        file: { name: file.name, type: file.type, buffer },
        prefix: "email-logo",
      });
      if (result.success && result.data) {
        onSave({ ...settings, emailLogoUrl: result.data.url });
        toast.success("Email logo uploaded");
      } else {
        toast.error(result.success ? "Upload failed" : result.error);
      }
    } catch {
      toast.error("Failed to upload logo");
    } finally {
      setUploadingLogo(false);
    }
  };

  return (
    <Card className='border-amber-200 bg-amber-50/40'>
      <CardHeader>
        <CardTitle className='flex items-center gap-2 text-base'>
          <ShieldAlert className='w-4 h-4 text-amber-600' />
          Automation Sending
        </CardTitle>
        <CardDescription>
          Controls whether the background worker actually sends welcome,
          abandoned-cart, win-back, and broadcast emails to real customers.
          Takes effect within a minute — no redeploy needed.
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        <div className='flex items-center justify-between gap-4'>
          <div>
            <p className='text-sm font-medium'>Automations enabled</p>
            <p className='text-xs text-muted-foreground'>
              Off by default. While off, nothing is sent and no new
              abandoned-cart/browse/win-back emails are even scheduled.
            </p>
          </div>
          <Switch
            checked={settings.workerEnabled}
            disabled={saving}
            onCheckedChange={(checked) =>
              onSave({ ...settings, workerEnabled: checked })
            }
          />
        </div>

        <Separator />

        <div className='flex items-center justify-between gap-4'>
          <div>
            <p className='text-sm font-medium'>Test mode</p>
            <p className='text-xs text-muted-foreground'>
              While on, the worker still runs but only ever delivers to the
              test email below — every other recipient is skipped (marked
              cancelled), not sent to. Recommended while automations are
              enabled but you're still verifying things.
            </p>
          </div>
          <Switch
            checked={settings.testModeEnabled}
            disabled={saving}
            onCheckedChange={(checked) =>
              onSave({ ...settings, testModeEnabled: checked })
            }
          />
        </div>

        {settings.testModeEnabled && (
          <div>
            <Label htmlFor='automation-test-email' className='text-xs'>
              Test email address
            </Label>
            <Input
              id='automation-test-email'
              type='email'
              placeholder='you@syntperfumes.com'
              value={emailDraft}
              disabled={saving}
              onChange={(e) => setEmailDraft(e.target.value)}
              onBlur={commitEmail}
              className='mt-1'
            />
            {settings.workerEnabled && !settings.testModeEmail && (
              <p className='text-xs text-amber-700 mt-1'>
                No test email set yet — automations are enabled with test
                mode on, so nothing will send to anyone until you add one.
              </p>
            )}
          </div>
        )}

        {settings.workerEnabled && !settings.testModeEnabled && (
          <p className='text-xs font-medium text-red-600'>
            Live: real customers will receive these emails.
          </p>
        )}

        <Separator />

        <div>
          <p className='text-sm font-medium'>Email logo</p>
          <p className='text-xs text-muted-foreground mb-2'>
            Optional — overrides the site header logo just for marketing
            emails. Leave unset to keep using the site's header logo.
          </p>
          <div className='flex items-center gap-3'>
            {settings.emailLogoUrl && (
              <img
                src={settings.emailLogoUrl}
                alt='Email logo'
                className='h-10 max-w-[140px] object-contain border rounded bg-white p-1'
              />
            )}
            <label>
              <input
                type='file'
                accept='image/png,image/jpeg,image/webp,image/svg+xml'
                className='hidden'
                disabled={uploadingLogo}
                onChange={handleLogoUpload}
              />
              <span className='inline-flex items-center gap-1.5 text-xs font-medium border rounded-md px-3 py-1.5 cursor-pointer hover:bg-muted transition-colors'>
                {uploadingLogo ? (
                  <Loader2 className='w-3.5 h-3.5 animate-spin' />
                ) : null}
                {settings.emailLogoUrl ? "Replace" : "Upload"}
              </span>
            </label>
            {settings.emailLogoUrl && (
              <button
                type='button'
                disabled={saving}
                onClick={() => onSave({ ...settings, emailLogoUrl: "" })}
                className='text-xs text-muted-foreground hover:text-red-600 transition-colors'>
                Remove
              </button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const QUEUE_STATUS_VARIANT: Record<
  ScheduledEmailRow["status"],
  "default" | "secondary" | "destructive" | "outline"
> = {
  pending: "outline",
  sending: "secondary",
  sent: "default",
  failed: "destructive",
  cancelled: "secondary",
};

function formatQueueTime(date: Date | null): string {
  if (!date) return "—";
  return new Date(date).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const QUEUE_PAGE_SIZE = 10;

function RecentQueueActivity({
  rows,
  loading,
  onRefresh,
}: {
  rows: ScheduledEmailRow[];
  loading: boolean;
  onRefresh: () => void;
}) {
  const [page, setPage] = useState(0);
  const totalPages = Math.ceil(rows.length / QUEUE_PAGE_SIZE);

  // Rows come from a fresh fetch each time (refresh, or initial load) —
  // stay on page 1 rather than stranding the admin on a now-out-of-range page.
  useEffect(() => {
    setPage(0);
  }, [rows]);

  const pageRows = rows.slice(page * QUEUE_PAGE_SIZE, page * QUEUE_PAGE_SIZE + QUEUE_PAGE_SIZE);

  return (
    <Card>
      <CardHeader className='flex flex-row items-center justify-between gap-4 space-y-0'>
        <div>
          <CardTitle className='text-base'>Recent Queue Activity</CardTitle>
          <CardDescription>
            The last 50 scheduled sends across every automation — use this to
            confirm a test actually went out (or see why it didn't).
          </CardDescription>
        </div>
        <Button
          type='button'
          variant='outline'
          size='sm'
          onClick={onRefresh}
          disabled={loading}>
          {loading ? (
            <Loader2 className='w-4 h-4 animate-spin' />
          ) : (
            <RefreshCw className='w-4 h-4' />
          )}
        </Button>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className='text-sm text-muted-foreground'>
            {loading ? "Loading..." : "Nothing has been scheduled yet."}
          </p>
        ) : (
          <>
            <div className='overflow-x-auto'>
              <table className='w-full text-sm'>
                <thead>
                  <tr className='border-b text-left text-xs text-muted-foreground'>
                    <th className='py-2 pe-3 font-medium'>Recipient</th>
                    <th className='py-2 px-3 font-medium'>Automation</th>
                    <th className='py-2 px-3 font-medium'>Status</th>
                    <th className='py-2 px-3 font-medium'>Scheduled For</th>
                    <th className='py-2 ps-3 font-medium'>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row) => (
                    <tr key={row.id} className='border-b last:border-0 align-top'>
                      <td className='py-2 pe-3 whitespace-nowrap'>{row.recipientEmail}</td>
                      <td className='py-2 px-3 whitespace-nowrap'>
                        {AUTOMATION_LABELS[row.automationType] ?? row.automationType}
                      </td>
                      <td className='py-2 px-3'>
                        <Badge variant={QUEUE_STATUS_VARIANT[row.status]}>{row.status}</Badge>
                      </td>
                      <td className='py-2 px-3 whitespace-nowrap text-muted-foreground'>
                        {formatQueueTime(row.status === "sent" ? row.sentAt : row.scheduledFor)}
                      </td>
                      <td className='py-2 ps-3 text-muted-foreground max-w-[240px] truncate'>
                        {row.lastError || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className='flex items-center justify-between mt-4'>
                <p className='text-sm text-muted-foreground'>
                  Page {page + 1} of {totalPages}
                </p>
                <div className='flex gap-2'>
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    disabled={page === 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}>
                    <ChevronLeft className='w-4 h-4' />
                  </Button>
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    disabled={page >= totalPages - 1}
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}>
                    <ChevronRight className='w-4 h-4' />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

interface TemplateFormState {
  automationType: AutomationType;
  stepKey: string;
  enabled: boolean;
  delayMinutes: number;
  subjectEn: string;
  subjectAr: string;
  preheaderEn: string;
  preheaderAr: string;
  content: TemplateContent;
  /** Real promo code id from the Promo Codes page — never a typed/invented value. */
  promoCodeId: string | null;
}

export default function MarketingEmailsPage() {
  const [templates, setTemplates] = useState<EffectiveTemplate[]>([]);
  const [promoCodeOptions, setPromoCodeOptions] = useState<PromoCodeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);

  const [activeAutomation, setActiveAutomation] = useState<AutomationType>("welcome");
  const [activeStep, setActiveStep] = useState<string>("step1");

  const [form, setForm] = useState<TemplateFormState | null>(null);
  const [previewLocale, setPreviewLocale] = useState<"en" | "ar">("en");
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [testEmail, setTestEmail] = useState("");

  const [broadcastSegment, setBroadcastSegment] = useState<
    "all_subscribers" | "customers" | "inactive_customers"
  >("all_subscribers");
  const [inactiveDays, setInactiveDays] = useState(90);
  const [recipientCount, setRecipientCount] = useState<number | null>(null);
  const [countLoading, setCountLoading] = useState(false);
  const [sendingBroadcast, setSendingBroadcast] = useState(false);

  const [automationSettings, setAutomationSettings] =
    useState<EmailAutomationSettings | null>(null);
  const [savingAutomationSettings, setSavingAutomationSettings] = useState(false);

  const [queueRows, setQueueRows] = useState<ScheduledEmailRow[]>([]);
  const [queueLoading, setQueueLoading] = useState(false);

  const fetchQueue = async () => {
    setQueueLoading(true);
    try {
      const result = await trpc.emailQueue.listRecent.query({ limit: 50 });
      if (result.success) {
        setQueueRows(result.result as ScheduledEmailRow[]);
      }
    } catch {
      /* Table just stays empty/stale — not critical enough to toast. */
    } finally {
      setQueueLoading(false);
    }
  };

  const stepKey = activeAutomation === "abandoned_cart" ? activeStep : "default";

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const result = await trpc.emailTemplates.list.query();
      if (result.success) {
        setTemplates(result.result as EffectiveTemplate[]);
      } else {
        toast.error("Failed to load email templates");
      }
    } catch {
      toast.error("Failed to load email templates");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
    trpc.promoCode.list
      .query({ page: 1, limit: 100, status: "active", sortBy: "code", sortOrder: "asc" })
      .then((result) => {
        if (result.success && result.result) {
          setPromoCodeOptions(
            result.result.items.map((pc: PromoCodeOption) => ({
              id: pc.id,
              code: pc.code,
              discountType: pc.discountType,
              discountValue: pc.discountValue,
            })),
          );
        }
      })
      .catch(() => {
        /* Picker just shows no options — the "no active promo codes" empty state covers this. */
      });
    trpc.emailAutomationSettings.get
      .query()
      .then((result) => {
        if (result.success && result.result) {
          setAutomationSettings(result.result as EmailAutomationSettings);
        }
      })
      .catch(() => {
        /* Card just won't render its current values — save still works from defaults. */
      });
    fetchQueue();
  }, []);

  const saveAutomationSettings = async (next: EmailAutomationSettings) => {
    const previous = automationSettings;
    setAutomationSettings(next); // optimistic — toggles should feel instant
    setSavingAutomationSettings(true);
    try {
      const result = await trpc.emailAutomationSettings.update.mutate(next);
      if (!result.success) {
        setAutomationSettings(previous);
        toast.error(result.error || "Failed to save automation settings");
      }
    } catch {
      setAutomationSettings(previous);
      toast.error("Failed to save automation settings");
    } finally {
      setSavingAutomationSettings(false);
    }
  };

  const selected = useMemo(
    () =>
      templates.find(
        (t) => t.automationType === activeAutomation && t.stepKey === stepKey,
      ) ?? null,
    [templates, activeAutomation, stepKey],
  );

  const relevantTokens = useMemo(
    () =>
      tokenDefsFor(
        relevantTokenKeysFor(activeAutomation, form?.content.showDiscountCode ?? false),
      ),
    [activeAutomation, form?.content.showDiscountCode],
  );

  useEffect(() => {
    if (selected) {
      const { isCustomized: _isCustomized, promoCode, ...rest } = selected;
      setForm({ ...rest, promoCodeId: promoCode?.id ?? null });
      setPreviewHtml(null);
    }
  }, [selected]);

  const updateContent = <K extends keyof TemplateContent>(
    key: K,
    value: TemplateContent[K],
  ) => {
    setForm((f) => (f ? { ...f, content: { ...f.content, [key]: value } } : f));
  };

  const handleSave = async () => {
    if (!form) return;
    if (form.content.showDiscountCode && !form.promoCodeId) {
      toast.error(
        "Pick a promo code below, or turn off \"Show discount code badge\" — there's nothing real to show otherwise.",
      );
      return;
    }
    setSaving(true);
    try {
      const result = await trpc.emailTemplates.update.mutate(form);
      if (result.success) {
        toast.success("Template saved");
        await fetchTemplates();
      } else {
        toast.error("Failed to save template");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save template");
    } finally {
      setSaving(false);
    }
  };

  const handlePreview = async () => {
    setPreviewLoading(true);
    try {
      const result = await trpc.emailTemplates.preview.query({
        automationType: activeAutomation,
        stepKey,
        locale: previewLocale,
      });
      if (result.success) {
        setPreviewHtml(result.result.html);
      } else {
        toast.error("Failed to generate preview");
      }
    } catch {
      toast.error("Failed to generate preview — save the template first");
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleSendTest = async () => {
    if (!testEmail) {
      toast.error("Enter an email address to send the test to");
      return;
    }
    setSendingTest(true);
    try {
      const result = await trpc.emailTemplates.sendTest.mutate({
        automationType: activeAutomation,
        stepKey,
        locale: previewLocale,
        toEmail: testEmail,
      });
      if (result.success) {
        toast.success(`Test email sent to ${testEmail}`);
      } else {
        toast.error(result.error ?? "Failed to send test email");
      }
    } catch {
      toast.error("Failed to send test email");
    } finally {
      setSendingTest(false);
    }
  };

  const isBroadcastType =
    activeAutomation === "new_drops" ||
    activeAutomation === "flash_offer" ||
    activeAutomation === "retention";

  useEffect(() => {
    if (!isBroadcastType) return;
    setCountLoading(true);
    trpc.broadcast.previewRecipientCount
      .query({
        segment: broadcastSegment,
        inactiveDays: broadcastSegment === "inactive_customers" ? inactiveDays : undefined,
      })
      .then((result) => {
        if (result.success) setRecipientCount(result.result.count);
      })
      .catch(() => setRecipientCount(null))
      .finally(() => setCountLoading(false));
  }, [isBroadcastType, broadcastSegment, inactiveDays]);

  const handleSendBroadcast = async () => {
    if (
      !window.confirm(
        `Send "${AUTOMATION_LABELS[activeAutomation]}" to ${recipientCount ?? "?"} recipient(s) right now? This cannot be undone.`,
      )
    ) {
      return;
    }
    setSendingBroadcast(true);
    try {
      const result = await trpc.broadcast.send.mutate({
        automationType: activeAutomation as "new_drops" | "flash_offer" | "retention",
        segment: broadcastSegment,
        inactiveDays: broadcastSegment === "inactive_customers" ? inactiveDays : undefined,
      });
      if (result.success) {
        toast.success(`Queued for ${result.result.recipientCount} recipient(s)`);
      } else {
        toast.error(result.error ?? "Failed to send broadcast");
      }
    } catch {
      toast.error("Failed to send broadcast");
    } finally {
      setSendingBroadcast(false);
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
    <div className='max-w-6xl mx-auto p-4 md:p-6 space-y-6'>
      <div>
        <h1 className='text-2xl font-semibold'>Marketing Emails</h1>
        <p className='text-sm text-muted-foreground'>
          Configure the automated emails sent to your customers. Every
          automation ships with working defaults — edit only what you want
          to change.
        </p>
      </div>

      {automationSettings && (
        <AutomationSettingsCard
          settings={automationSettings}
          saving={savingAutomationSettings}
          onSave={saveAutomationSettings}
        />
      )}

      <RecentQueueActivity rows={queueRows} loading={queueLoading} onRefresh={fetchQueue} />

      <Tabs
        value={activeAutomation}
        onValueChange={(v) => {
          setActiveAutomation(v as AutomationType);
          setActiveStep("step1");
        }}>
        <TabsList className='flex-wrap h-auto'>
          {AUTOMATION_ORDER.map((type) => (
            <TabsTrigger key={type} value={type}>
              {AUTOMATION_LABELS[type]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {activeAutomation === "abandoned_cart" && (
        <div className='flex gap-2'>
          {ABANDONED_CART_STEPS.map((step) => (
            <Button
              key={step.key}
              size='sm'
              variant={activeStep === step.key ? "primary" : "outline"}
              onClick={() => setActiveStep(step.key)}>
              {step.label}
            </Button>
          ))}
        </div>
      )}

      <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
        {/* Editor */}
        <Card>
          <CardHeader>
            <div className='flex items-center justify-between'>
              <div>
                <CardTitle className='text-base'>
                  {AUTOMATION_LABELS[activeAutomation]}
                </CardTitle>
                <CardDescription>{formatDelay(form.delayMinutes)}</CardDescription>
              </div>
              <div className='flex items-center gap-2'>
                {selected?.isCustomized && (
                  <Badge variant='outline'>Customized</Badge>
                )}
                <Switch
                  checked={form.enabled}
                  onCheckedChange={(v) => setForm((f) => (f ? { ...f, enabled: v } : f))}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className='space-y-5'>
            <div>
              <Label>Send timing (minutes after trigger)</Label>
              <Input
                type='number'
                min={0}
                value={form.delayMinutes}
                onChange={(e) =>
                  setForm((f) =>
                    f ? { ...f, delayMinutes: Number(e.target.value) || 0 } : f,
                  )
                }
                className='mt-1'
              />
              <p className='text-xs text-muted-foreground mt-1'>
                0 = sent immediately on demand (used for New Drops, Flash
                Offer, Retention broadcasts).
              </p>
            </div>

            <Separator />

            <div className='grid grid-cols-2 gap-3'>
              <TokenizedField
                label='Subject (English)'
                locale='en'
                tokens={relevantTokens}
                value={form.subjectEn}
                onChange={(v) => setForm((f) => (f ? { ...f, subjectEn: v } : f))}
              />
              <TokenizedField
                label='Subject (Arabic)'
                locale='ar'
                dir='rtl'
                tokens={relevantTokens}
                value={form.subjectAr}
                onChange={(v) => setForm((f) => (f ? { ...f, subjectAr: v } : f))}
              />
            </div>

            <div className='grid grid-cols-2 gap-3'>
              <TokenizedField
                label='Preheader (English)'
                locale='en'
                tokens={relevantTokens}
                value={form.preheaderEn}
                onChange={(v) => setForm((f) => (f ? { ...f, preheaderEn: v } : f))}
              />
              <TokenizedField
                label='Preheader (Arabic)'
                locale='ar'
                dir='rtl'
                tokens={relevantTokens}
                value={form.preheaderAr}
                onChange={(v) => setForm((f) => (f ? { ...f, preheaderAr: v } : f))}
              />
            </div>

            <div className='grid grid-cols-2 gap-3'>
              <TokenizedField
                label='Headline (English)'
                locale='en'
                tokens={relevantTokens}
                value={form.content.headlineEn}
                onChange={(v) => updateContent("headlineEn", v)}
              />
              <TokenizedField
                label='Headline (Arabic)'
                locale='ar'
                dir='rtl'
                tokens={relevantTokens}
                value={form.content.headlineAr}
                onChange={(v) => updateContent("headlineAr", v)}
              />
            </div>

            <div className='grid grid-cols-2 gap-3'>
              <TokenizedField
                label='Body (English)'
                locale='en'
                multiline
                rows={4}
                tokens={relevantTokens}
                value={form.content.bodyEn}
                onChange={(v) => updateContent("bodyEn", v)}
              />
              <TokenizedField
                label='Body (Arabic)'
                locale='ar'
                dir='rtl'
                multiline
                rows={4}
                tokens={relevantTokens}
                value={form.content.bodyAr}
                onChange={(v) => updateContent("bodyAr", v)}
              />
            </div>

            <Separator />

            <div className='grid grid-cols-2 gap-3'>
              <TokenizedField
                label='Button label (English)'
                locale='en'
                tokens={[]}
                value={form.content.ctaLabelEn}
                onChange={(v) => updateContent("ctaLabelEn", v)}
              />
              <TokenizedField
                label='Button label (Arabic)'
                locale='ar'
                dir='rtl'
                tokens={[]}
                value={form.content.ctaLabelAr}
                onChange={(v) => updateContent("ctaLabelAr", v)}
              />
            </div>
            <div>
              <Label>Button link</Label>
              <Input
                value={form.content.ctaHref}
                onChange={(e) => updateContent("ctaHref", e.target.value)}
                placeholder='/shop'
                className='mt-1'
              />
              <p className='text-xs text-muted-foreground mt-1'>
                A path on your store (e.g. /shop, /cart) or a full URL.
              </p>
            </div>

            <Separator />

            <div className='space-y-3'>
              <div className='flex items-center justify-between'>
                <Label>Show featured product</Label>
                <Switch
                  checked={form.content.showFeaturedItem}
                  onCheckedChange={(v) => updateContent("showFeaturedItem", v)}
                />
              </div>
              <div className='flex items-center justify-between'>
                <Label>Show review stars</Label>
                <Switch
                  checked={form.content.showReviewStars}
                  onCheckedChange={(v) => updateContent("showReviewStars", v)}
                />
              </div>
              <div className='flex items-center justify-between'>
                <Label>Show discount code badge</Label>
                <Switch
                  checked={form.content.showDiscountCode}
                  onCheckedChange={(v) => updateContent("showDiscountCode", v)}
                />
              </div>
            </div>

            {form.content.showDiscountCode && (
              <div className='space-y-3'>
                <div>
                  <Label className='text-xs'>Discount code</Label>
                  <Select
                    value={form.promoCodeId ?? undefined}
                    onValueChange={(v) =>
                      setForm((f) => (f ? { ...f, promoCodeId: v } : f))
                    }>
                    <SelectTrigger className='mt-1'>
                      <SelectValue placeholder='Pick a promo code from the Promo Codes page' />
                    </SelectTrigger>
                    <SelectContent>
                      {promoCodeOptions.length === 0 ? (
                        <div className='px-2 py-1.5 text-xs text-muted-foreground'>
                          No active promo codes — create one on the Promo Codes page first.
                        </div>
                      ) : (
                        promoCodeOptions.map((pc) => (
                          <SelectItem key={pc.id} value={pc.id}>
                            {pc.code} —{" "}
                            {pc.discountType === "percentage"
                              ? `${pc.discountValue}% off`
                              : `${pc.discountValue.toFixed(2)} off`}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <p className='text-xs text-muted-foreground mt-1'>
                    This email will always send whatever code is picked here —
                    it's pulled live from the Promo Codes page, never made up.
                  </p>
                </div>
                <div className='grid grid-cols-2 gap-3'>
                  <TokenizedField
                    label='Discount badge text (English)'
                    locale='en'
                    tokens={tokenDefsFor(["discountCode"])}
                    value={form.content.discountBadgeTextEn}
                    onChange={(v) => updateContent("discountBadgeTextEn", v)}
                    placeholder='Use code [Discount Code] at checkout'
                  />
                  <TokenizedField
                    label='Discount badge text (Arabic)'
                    locale='ar'
                    dir='rtl'
                    tokens={tokenDefsFor(["discountCode"])}
                    value={form.content.discountBadgeTextAr}
                    onChange={(v) => updateContent("discountBadgeTextAr", v)}
                  />
                </div>
              </div>
            )}

            <Button onClick={handleSave} disabled={saving} className='w-full'>
              {saving ? (
                <Loader2 className='w-4 h-4 mr-2 animate-spin' />
              ) : (
                <Save className='w-4 h-4 mr-2' />
              )}
              Save Template
            </Button>
          </CardContent>
        </Card>

        {/* Preview */}
        <Card>
          <CardHeader>
            <div className='flex items-center justify-between'>
              <CardTitle className='text-base'>Preview</CardTitle>
              <Select
                value={previewLocale}
                onValueChange={(v) => setPreviewLocale(v as "en" | "ar")}>
                <SelectTrigger className='w-28'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='en'>English</SelectItem>
                  <SelectItem value='ar'>Arabic</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <CardDescription>
              Uses sample placeholder data — save your changes first to preview them.
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <Button
              variant='outline'
              onClick={handlePreview}
              disabled={previewLoading}
              className='w-full'>
              {previewLoading ? (
                <Loader2 className='w-4 h-4 mr-2 animate-spin' />
              ) : (
                <RefreshCw className='w-4 h-4 mr-2' />
              )}
              Refresh Preview
            </Button>

            <div className='border rounded-md overflow-hidden bg-muted/30' style={{ height: 480 }}>
              {previewHtml ? (
                <iframe
                  title='Email preview'
                  srcDoc={previewHtml}
                  className='w-full h-full bg-white'
                  sandbox=''
                />
              ) : (
                <div className='flex items-center justify-center h-full text-sm text-muted-foreground'>
                  Click "Refresh Preview" to see this email
                </div>
              )}
            </div>

            <Separator />

            <div>
              <Label>Send a test email</Label>
              <div className='flex gap-2 mt-1'>
                <Input
                  type='email'
                  placeholder='you@example.com'
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                />
                <Button onClick={handleSendTest} disabled={sendingTest}>
                  {sendingTest ? (
                    <Loader2 className='w-4 h-4 animate-spin' />
                  ) : (
                    <Send className='w-4 h-4' />
                  )}
                </Button>
              </div>
              <p className='text-xs text-muted-foreground mt-1'>
                Sends immediately with sample data — bypasses the schedule
                and unsubscribe list, so it's safe to test with any address.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {isBroadcastType && (
        <Card>
          <CardHeader>
            <CardTitle className='text-base'>Send Broadcast</CardTitle>
            <CardDescription>
              Sends "{AUTOMATION_LABELS[activeAutomation]}" immediately to
              everyone matching the segment below. Save your changes above
              first — this sends whatever is currently saved, not unsaved
              edits.
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div>
              <Label>Recipients</Label>
              <Select
                value={broadcastSegment}
                onValueChange={(v) =>
                  setBroadcastSegment(v as typeof broadcastSegment)
                }>
                <SelectTrigger className='mt-1'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all_subscribers'>
                    All subscribers (not unsubscribed)
                  </SelectItem>
                  <SelectItem value='customers'>
                    Everyone who has ever ordered
                  </SelectItem>
                  <SelectItem value='inactive_customers'>
                    Customers with no recent order
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {broadcastSegment === "inactive_customers" && (
              <div>
                <Label>No order in the last (days)</Label>
                <Input
                  type='number'
                  min={1}
                  value={inactiveDays}
                  onChange={(e) => setInactiveDays(Number(e.target.value) || 90)}
                  className='mt-1 max-w-[160px]'
                />
              </div>
            )}

            <p className='text-sm text-muted-foreground'>
              {countLoading ? (
                <Loader2 className='w-4 h-4 animate-spin inline' />
              ) : (
                <>
                  Will send to{" "}
                  <strong>{recipientCount ?? "?"}</strong> recipient(s).
                </>
              )}
            </p>

            <Button
              onClick={handleSendBroadcast}
              disabled={sendingBroadcast || countLoading || !recipientCount}
              variant='destructive'
              className='w-full'>
              {sendingBroadcast ? (
                <Loader2 className='w-4 h-4 mr-2 animate-spin' />
              ) : (
                <Send className='w-4 h-4 mr-2' />
              )}
              Send Now
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
