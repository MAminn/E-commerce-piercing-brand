import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import { toast } from "sonner";
import { Badge } from "#root/components/ui/badge";
import { Button } from "#root/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#root/components/ui/card";
import { Input } from "#root/components/ui/input";
import { Textarea } from "#root/components/ui/textarea";
import { trpc } from "#root/shared/trpc/client";
import type { AppRouter } from "#root/shared/trpc/router";
import {
  absStatusLabel,
  ago,
  AUDIT_LABELS,
  candidateReasonLabel,
  FILTER_LABELS,
  fpReasonLabel,
  missReasonLabel,
  money,
  pct,
  reasonLabel,
  shortDate,
  websiteStatusLabel,
} from "./labels";

/**
 * ABS tracking — Shadow review screen. Reads ABS shipments mirrored by the
 * poller and lets an admin confirm / reject / link matches and acknowledge
 * alerts. Every action writes ABS tracking tables only: NO button here
 * changes a website order (Shadow mode).
 */

type Out = inferRouterOutputs<AppRouter>["absTracking"];
type Overview = Out["overview"];
type OnOverview = Extract<Overview, { on: true }>;
type Groups = Out["actionGroups"];
type ReviewItem = Out["reviewQueue"][number];
type DecisionItem = Groups["absProblems"][number];
type MissingItem = Out["missingAwb"][number];
type Validation = Out["validation"];
type ShipmentItem = Out["shipments"]["items"][number];
type Run = Out["runs"][number];
type AuditItem = Out["audit"][number];

const FILTERS = ["all", "needs_review", "unmatched", "alerts", "would_change", "delivered_not_on_website", "returned_to_us"] as const;
type Filter = (typeof FILTERS)[number];

function errorText(err: unknown): string {
  return (err as { message?: string })?.message ?? "Something went wrong";
}

// ─── Small building blocks ──────────────────────────────────────────────────

function Section({ title, count, description, children, testId }: { title: string; count?: number; description?: string; children: ReactNode; testId: string }) {
  return (
    <Card data-testid={testId}>
      <CardHeader className="p-4 md:p-6">
        <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
          {title}
          {count !== undefined && <Badge variant={count > 0 ? "default" : "secondary"}>{count}</Badge>}
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-3 p-4 pt-0 md:p-6 md:pt-0">{children}</CardContent>
    </Card>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">{children}</p>;
}

function Mismatch({ absStatus, websiteStatus }: { absStatus: string; websiteStatus: string | null }) {
  return (
    <span className="text-sm">
      ABS: <strong>{absStatusLabel(absStatus)}</strong> · Website: <strong>{websiteStatusLabel(websiteStatus)}</strong>
    </span>
  );
}

/** Inline "write a note, then confirm" form (no modal: works on a phone). */
function NoteAction({
  label,
  confirmLabel,
  placeholder,
  onSubmit,
  variant = "outline",
  testId,
}: {
  label: string;
  confirmLabel: string;
  placeholder: string;
  onSubmit: (note: string) => Promise<unknown>;
  variant?: "outline" | "destructive" | "secondary";
  testId: string;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  if (!open) {
    return (
      <Button size="sm" variant={variant} className="w-fit self-start" onClick={() => setOpen(true)} data-testid={`${testId}-open`}>
        {label}
      </Button>
    );
  }
  const ok = note.trim().length >= 3;
  return (
    <div className="w-full space-y-2 rounded-md border bg-muted/30 p-3">
      <Textarea aria-label={`${label} note`} placeholder={placeholder} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} data-testid={`${testId}-note`} />
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={variant === "destructive" ? "destructive" : "primary"}
          disabled={!ok || busy}
          data-testid={`${testId}-submit`}
          onClick={async () => {
            setBusy(true);
            try {
              await onSubmit(note.trim());
              setOpen(false);
              setNote("");
            } finally {
              setBusy(false);
            }
          }}
        >
          {confirmLabel}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        {!ok && <span className="self-center text-xs text-muted-foreground">A short note is required.</span>}
      </div>
    </div>
  );
}

// ─── 1. Status bar ──────────────────────────────────────────────────────────

function StatusBar({ overview, onPoll, polling }: { overview: Overview | null; onPoll: () => void; polling: boolean }) {
  const on = overview?.on === true;
  const o = on ? (overview as OnOverview) : null;
  const next = o?.pollNow.nextAllowedAt ? new Date(o.pollNow.nextAllowedAt) : null;
  const waitS = next ? Math.max(0, Math.ceil((next.getTime() - Date.now()) / 1000)) : 0;
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4 md:flex-row md:items-center md:justify-between" data-testid="abs-status-bar">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={on ? "bg-amber-100 text-amber-800 hover:bg-amber-100" : "bg-slate-200 text-slate-700 hover:bg-slate-200"} data-testid="abs-mode">
            {on ? "Shadow" : "Off"}
          </Badge>
          {o ? (
            <span className="text-sm">
              Last check {ago(o.lastRun?.startedAt ?? null)} · {o.lastRun?.outcome ?? "not run yet"}
              {o.lastRun?.error ? <span className="text-muted-foreground"> — {o.lastRun.error}</span> : null}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">ABS tracking is off{overview?.boot?.reason ? ` (${overview.boot.reason})` : ""}.</span>
          )}
        </div>
        {o?.backoffUntil && <p className="text-xs text-amber-700">ABS failed; automatic checks pause until {new Date(o.backoffUntil).toLocaleTimeString()}.</p>}
        {o?.resume && <p className="text-xs text-muted-foreground">Catching up: a large window is being read in parts.</p>}
        {o && o.counts.unknownStatuses > 0 && (
          <p className="text-xs text-red-700">
            ABS sent {o.counts.unknownStatuses} shipment(s) with a status we do not know: {o.unknownStatusLabels.map((u) => u.label).join(", ")}.
          </p>
        )}
      </div>
      <div className="flex flex-col items-start gap-1 md:items-end">
        <Button onClick={onPoll} disabled={!on || polling || !o?.pollNow.allowed} data-testid="abs-poll-now">
          {polling ? "Checking…" : "Check ABS now"}
        </Button>
        {on && !o?.pollNow.allowed && <span className="text-xs text-muted-foreground">You can check again in {waitS} s.</span>}
      </div>
    </div>
  );
}

// ─── 2. Would mark Delivered ────────────────────────────────────────────────

function WouldDeliver({ rows }: { rows: Groups["wouldDeliver"] }) {
  return (
    <Section
      title="Would mark Delivered"
      count={rows.filter((r) => r.stillProposed && r.websiteStatus !== "delivered").length}
      description="ABS delivered these and collected the right amount. In live mode the website would mark them Delivered; today it only shows whether you already did."
      testId="abs-would-deliver"
    >
      {rows.length === 0 ? (
        <Empty>Nothing in the last 14 days.</Empty>
      ) : (
        <ul className="divide-y">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-col gap-1 py-2 md:flex-row md:items-center md:justify-between">
              <div>
                <strong>#{r.orderNumber ?? "—"}</strong> <span className="text-xs text-muted-foreground">AWB {r.awb}</span>
                <div className="text-sm text-muted-foreground">
                  Collected {money(r.collectedCash ?? r.cash)} · seen {ago(r.firstSeenAt)}
                </div>
              </div>
              {r.websiteStatus === "delivered" ? (
                <Badge className="w-fit bg-emerald-100 text-emerald-800 hover:bg-emerald-100">already Delivered on website ✓</Badge>
              ) : !r.stillProposed ? (
                <Badge variant="secondary" className="w-fit">
                  no longer proposed: {absStatusLabel(r.absStatusNow)}
                </Badge>
              ) : (
                <Badge className="w-fit bg-sky-100 text-sky-800 hover:bg-sky-100">still {websiteStatusLabel(r.websiteStatus)} on website</Badge>
              )}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

// ─── 3. Needs your decision ─────────────────────────────────────────────────

function ManualLinkForm({ item, onDone }: { item: ReviewItem; onDone: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [orderNumber, setOrderNumber] = useState("");
  const [role, setRole] = useState<"primary" | "reverse" | "exchange" | "other">(item.role === "primary" ? "primary" : (item.role as "reverse"));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const tid = `abs-manual-${item.awb}`;
  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} data-testid={`${tid}-open`}>
        Link to another order
      </Button>
    );
  }
  const n = Number(orderNumber.replace(/^#/, ""));
  const ok = Number.isInteger(n) && n > 0 && note.trim().length >= 3;
  return (
    <div className="w-full space-y-2 rounded-md border bg-muted/30 p-3">
      <div className="flex flex-wrap gap-2">
        <Input aria-label="Order number" placeholder="Order number, e.g. 10180" inputMode="numeric" className="w-44" value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} data-testid={`${tid}-order`} />
        <select aria-label="Shipment role" className="h-9 rounded-md border bg-background px-2 text-sm" value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
          <option value="primary">Delivery of this order</option>
          <option value="reverse">Return of this order</option>
          <option value="exchange">Exchange for this order</option>
          <option value="other">Other</option>
        </select>
      </div>
      <Textarea aria-label="Manual link note" placeholder="Why this order? (required)" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} data-testid={`${tid}-note`} />
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={!ok || busy}
          data-testid={`${tid}-submit`}
          onClick={async () => {
            setBusy(true);
            try {
              await trpc.absTracking.manualLink.mutate({ awb: item.awb, orderNumber: n, role, note: note.trim() });
              toast.success(`Shipment ${item.awb} linked to #${n}`);
              setOpen(false);
              await onDone();
            } catch (err) {
              toast.error(errorText(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          Link
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function ReviewCard({ item, onDone }: { item: ReviewItem; onDone: () => Promise<void> }) {
  const confirm = async (orderId: string, orderNumber: number) => {
    try {
      await trpc.absTracking.confirmLink.mutate({ awb: item.awb, orderId });
      toast.success(`Shipment ${item.awb} confirmed for #${orderNumber}`);
      await onDone();
    } catch (err) {
      toast.error(errorText(err));
    }
  };
  return (
    <div className="space-y-3 rounded-lg border p-3" data-testid={`abs-review-${item.awb}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-medium">
            AWB {item.awb} {item.role !== "primary" && <Badge variant="outline">{item.role === "reverse" ? "Return" : item.role === "exchange" ? "Exchange" : "Other"}</Badge>}
          </div>
          <div className="text-sm text-muted-foreground">
            {absStatusLabel(item.absStatus)} · COD {money(item.cash)} · phone …{item.phoneLast4 ?? "????"} · {shortDate(item.absCreatedAt)}
          </div>
          <div className="text-sm">{reasonLabel(item.reasonCode)}</div>
        </div>
      </div>
      {item.candidates.length === 0 ? (
        <Empty>No suggested order. Use “Link to another order”, or “Not this one” if it is not ours.</Empty>
      ) : (
        <ul className="space-y-2">
          {item.candidates.map((c) => (
            <li key={c.orderId} className="flex flex-col gap-2 rounded-md bg-muted/40 p-2 md:flex-row md:items-center md:justify-between">
              <div className="text-sm">
                <strong>#{c.orderNumber}</strong> · {shortDate(c.createdAt)} · {money(c.total)} · {websiteStatusLabel(c.websiteStatus)} · phone …{c.phoneLast4 ?? "????"}
                <div className="text-xs text-muted-foreground">{c.reasons.map(candidateReasonLabel).join(" · ")}</div>
                {c.linkedToAwb && <div className="text-xs text-amber-700">Already linked to shipment {c.linkedToAwb}</div>}
              </div>
              <Button size="sm" onClick={() => confirm(c.orderId, c.orderNumber)} data-testid={`abs-confirm-${item.awb}-${c.orderNumber}`}>
                Confirm
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <NoteAction
          label="Not this one"
          confirmLabel="Reject match"
          placeholder="Why is this not the right order? (required)"
          variant="destructive"
          testId={`abs-reject-${item.awb}`}
          onSubmit={async (note) => {
            try {
              await trpc.absTracking.rejectLink.mutate({ awb: item.awb, note });
              toast.success(`Match for ${item.awb} rejected`);
              await onDone();
            } catch (err) {
              toast.error(errorText(err));
              throw err;
            }
          }}
        />
        <ManualLinkForm item={item} onDone={onDone} />
      </div>
    </div>
  );
}

// ─── 4 + 5. Problems and returns ────────────────────────────────────────────

function DecisionList({ rows, onDone, emptyText, ackLabel = "Acknowledge" }: { rows: DecisionItem[]; onDone: () => Promise<void>; emptyText: string; ackLabel?: string }) {
  if (rows.length === 0) return <Empty>{emptyText}</Empty>;
  return (
    <ul className="divide-y">
      {rows.map((r) => (
        <li key={r.id} className="flex flex-col gap-2 py-2" data-testid={`abs-decision-${r.id}`}>
          <div>
            <strong>{r.orderNumber ? `#${r.orderNumber}` : "No order"}</strong> <span className="text-xs text-muted-foreground">AWB {r.awb}</span>
            <div className="text-sm">{reasonLabel(r.reasonCode ?? r.decision)}</div>
            <div className="text-sm text-muted-foreground">
              <Mismatch absStatus={r.absStatus} websiteStatus={r.websiteStatus} />
              {r.cash !== null && ` · ABS COD ${money(r.cash)}`}
              {r.orderTotal !== null && ` · order ${money(r.orderTotal)}`}
              {` · seen ${r.seenCount}×, first ${ago(r.firstSeenAt)}`}
            </div>
          </div>
          <NoteAction
            label={ackLabel}
            confirmLabel="Save"
            placeholder="What did you check or do? (required)"
            testId={`abs-ack-${r.id}`}
            onSubmit={async (note) => {
              try {
                await trpc.absTracking.acknowledgeDecision.mutate({ decisionId: r.id, note });
                toast.success("Acknowledged");
                await onDone();
              } catch (err) {
                toast.error(errorText(err));
                throw err;
              }
            }}
          />
        </li>
      ))}
    </ul>
  );
}

// ─── 6. Orders with no ABS shipment ─────────────────────────────────────────

function MissingAwb({ rows, overview }: { rows: MissingItem[]; overview: OnOverview }) {
  return (
    <Section
      title="Orders with no ABS shipment"
      count={rows.length}
      description={`ABS is our only courier for orders placed since ${shortDate(overview.settings.absOnlySince)}. These are Processing or Shipped for more than ${overview.settings.missingAwbAlertDays} days with no linked ABS shipment. Older orders (private courier) are not listed.`}
      testId="abs-missing-awb"
    >
      {rows.length === 0 ? (
        <Empty>Every recent order has an ABS shipment.</Empty>
      ) : (
        <ul className="divide-y">
          {rows.map((r) => (
            <li key={r.orderId} className="py-2 text-sm">
              <strong>#{r.orderNumber}</strong> · {websiteStatusLabel(r.status)} · placed {shortDate(r.createdAt)} ({r.ageDays} days) · {money(r.total)} · phone …{r.phoneLast4 ?? "????"}
              {r.possibleAwbs.length > 0 && <div className="text-xs text-amber-700">Possible ABS shipment waiting for your decision: {r.possibleAwbs.join(", ")}</div>}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

// ─── 7. Shadow accuracy ─────────────────────────────────────────────────────

function Accuracy({ v }: { v: Validation }) {
  const d = v.delivered;
  return (
    <Section title="Shadow accuracy" description={`Compared with what admins actually did on the website since ${shortDate(v.from)} (${v.shadowDays} days of Shadow).`} testId="abs-accuracy">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat label="Delivered: right" value={pct(d.precision)} hint={`${d.agreed} agreed, ${d.falsePositives} wrong`} />
        <Stat label="Delivered: caught" value={pct(d.recall)} hint={`${d.misses} missed`} />
        <Stat label="Typical lead time" value={d.medianLeadHours === null ? "n/a" : `${d.medianLeadHours} h`} hint="before an admin marked it" />
        <Stat label="Auto-matches right" value={pct(v.matching.autoPrecision)} hint={`${v.matching.autoOverruled} of ${v.matching.autoLinks} overruled`} />
      </div>
      <div>
        <h4 className="mb-1 text-sm font-semibold">Before live mode can be proposed</h4>
        <ul className="space-y-1 text-sm">
          {v.targets.map((t) => (
            <li key={t.name}>
              {t.met ? "✓" : "○"} {t.name} — <span className="text-muted-foreground">{t.value}</span>
            </li>
          ))}
        </ul>
      </div>
      {d.proposals.some((p) => p.outcome === "false_positive") && (
        <div>
          <h4 className="mb-1 text-sm font-semibold text-red-700">Wrong “would mark Delivered”</h4>
          <ul className="text-sm">
            {d.proposals
              .filter((p) => p.outcome === "false_positive")
              .map((p) => (
                <li key={p.orderId}>
                  #{p.orderNumber} (AWB {p.awb}) — {fpReasonLabel(p.reason)}
                </li>
              ))}
          </ul>
        </div>
      )}
      {d.missList.length > 0 && (
        <div>
          <h4 className="mb-1 text-sm font-semibold">Delivered on the website, not proposed by Shadow</h4>
          <ul className="text-sm">
            {d.missList.map((m) => (
              <li key={m.orderId}>
                #{m.orderNumber} (AWB {m.awb}) — {missReasonLabel(m.reason)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-md border p-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
      <div className="text-xs text-muted-foreground">{hint}</div>
    </div>
  );
}

// ─── 8. All shipments ───────────────────────────────────────────────────────

function Shipments({ refreshKey, onDone }: { refreshKey: number; onDone: () => Promise<void> }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<ShipmentItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (append: string | null) => {
      setLoading(true);
      try {
        const res = await trpc.absTracking.shipments.query({ filter, search: search.trim() || null, cursor: append });
        setItems((prev) => (append ? [...prev, ...res.items] : res.items));
        setCursor(res.nextCursor);
      } catch (err) {
        toast.error(errorText(err));
      } finally {
        setLoading(false);
      }
    },
    [filter, search],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshKey reloads after an action
  useEffect(() => {
    void load(null);
  }, [load, refreshKey]);

  return (
    <Section title="All shipments" description="Every ABS shipment we have seen, newest change first." testId="abs-shipments">
      <div className="flex flex-col gap-2 md:flex-row">
        <select aria-label="Filter shipments" className="h-9 rounded-md border bg-background px-2 text-sm" value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
          {FILTERS.map((f) => (
            <option key={f} value={f}>
              {FILTER_LABELS[f]}
            </option>
          ))}
        </select>
        <Input aria-label="Search shipments" placeholder="AWB, order number or phone last 4" value={search} onChange={(e) => setSearch(e.target.value)} className="md:w-72" />
      </div>
      {items.length === 0 && !loading ? (
        <Empty>No shipments for this filter.</Empty>
      ) : (
        <ul className="divide-y">
          {items.map((s) => (
            <li key={s.awb} className="flex flex-col gap-1 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <strong>AWB {s.awb}</strong>
                {s.orderNumber ? <span>→ #{s.orderNumber}</span> : <span className="text-muted-foreground">not linked</span>}
                {s.linkState && <Badge variant="outline">{s.linkState.replace("_", " ")}</Badge>}
              </div>
              <div className="text-sm text-muted-foreground">
                <Mismatch absStatus={s.absStatus} websiteStatus={s.websiteStatus} /> · COD {money(s.cash)} · collected {money(s.collectedCash)} · fees {money(s.totalFees ?? s.absFees)} · changed {ago(s.lastChangeAt)}
              </div>
              {s.decision && s.decision !== "no_action" && <div className="text-xs">{reasonLabel(s.decisionReason ?? s.decision)}</div>}
              {(s.linkState === "auto" || s.linkState === "confirmed" || s.linkState === "rejected") && (
                <NoteAction
                  label="Unlink"
                  confirmLabel="Unlink"
                  placeholder="Why unlink? It goes back to “Needs your decision”. (required)"
                  testId={`abs-unlink-${s.awb}`}
                  onSubmit={async (note) => {
                    try {
                      await trpc.absTracking.unlink.mutate({ awb: s.awb, note });
                      toast.success(`Shipment ${s.awb} unlinked`);
                      await onDone();
                    } catch (err) {
                      toast.error(errorText(err));
                      throw err;
                    }
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      )}
      {cursor && (
        <Button variant="outline" size="sm" disabled={loading} onClick={() => load(cursor)}>
          Load more
        </Button>
      )}
    </Section>
  );
}

// ─── 9. History ─────────────────────────────────────────────────────────────

function History({ runs, audit }: { runs: Run[]; audit: AuditItem[] }) {
  return (
    <Section title="History" description="ABS checks and every action taken on this screen." testId="abs-history">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <h4 className="mb-1 text-sm font-semibold">ABS checks</h4>
          {runs.length === 0 ? (
            <Empty>No checks yet.</Empty>
          ) : (
            <ul className="max-h-72 space-y-1 overflow-y-auto text-xs">
              {runs.map((r) => (
                <li key={r.id}>
                  {new Date(r.startedAt).toLocaleString()} · {r.trigger} · <strong>{r.outcome ?? "running"}</strong> · {r.shipmentsSeen} seen, {r.decisionsNew} new
                  {r.error ? <span className="text-muted-foreground"> — {r.error}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h4 className="mb-1 text-sm font-semibold">Actions</h4>
          {audit.length === 0 ? (
            <Empty>No actions yet.</Empty>
          ) : (
            <ul className="max-h-72 space-y-1 overflow-y-auto text-xs">
              {audit.map((a) => (
                <li key={a.id}>
                  {new Date(a.at).toLocaleString()} · {a.actor} · <strong>{AUDIT_LABELS[a.action] ?? a.action}</strong>
                  {a.awb ? ` · AWB ${a.awb}` : ""}
                  {a.note ? <span className="text-muted-foreground"> — “{a.note}”</span> : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Section>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

interface Data {
  groups: Groups;
  review: ReviewItem[];
  missing: MissingItem[];
  validation: Validation | null;
  runs: Run[];
  audit: AuditItem[];
}

export default function AbsTrackingPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async () => {
    try {
      const ov = await trpc.absTracking.overview.query();
      setOverview(ov);
      if (!ov.on) {
        setData(null);
        return;
      }
      const [groups, review, missing, validation, runs, audit] = await Promise.all([
        trpc.absTracking.actionGroups.query(),
        trpc.absTracking.reviewQueue.query(),
        trpc.absTracking.missingAwb.query(),
        trpc.absTracking.validation.query().catch(() => null),
        trpc.absTracking.runs.query(),
        trpc.absTracking.audit.query(),
      ]);
      setData({ groups, review, missing, validation, runs, audit });
      setError(null);
    } catch (err) {
      setError(errorText(err));
    }
  }, []);

  const reload = useCallback(async () => {
    await load();
    setRefreshKey((k) => k + 1);
  }, [load]);

  useEffect(() => {
    void load();
  }, [load]);

  const pollNow = async () => {
    setPolling(true);
    try {
      const r = await trpc.absTracking.pollNow.mutate();
      toast.success(`ABS checked: ${r.outcome}, ${r.shipmentsSeen} shipment(s), ${r.decisionsNew} new decision(s)`);
      await reload();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setPolling(false);
    }
  };

  const on = overview?.on === true ? (overview as OnOverview) : null;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-4 md:p-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">ABS tracking</h1>
        <p className="text-sm text-muted-foreground">Follows our ABS shipments and shows what the website would do with each order.</p>
        <p className="text-sm font-medium text-amber-800" data-testid="abs-shadow-note">
          Shadow mode: nothing on the website changes.
        </p>
      </div>

      <StatusBar overview={overview} onPoll={pollNow} polling={polling} />
      {error && <p className="text-sm text-red-700">{error}</p>}

      {overview && !on && (
        <Card data-testid="abs-off">
          <CardContent className="p-6 text-center">
            <p className="font-medium">ABS tracking is off</p>
            <p className="text-sm text-muted-foreground">Nothing is read from ABS and nothing is shown here until ABS_TRACKING_MODE is set to shadow.</p>
          </CardContent>
        </Card>
      )}

      {on && data && (
        <>
          <div className="flex flex-wrap gap-2 text-sm" data-testid="abs-counts">
            <Badge variant="outline">{on.counts.reviewQueue} need your decision</Badge>
            <Badge variant="outline">{on.counts.wouldMarkDelivered} would mark Delivered</Badge>
            <Badge variant="outline">{on.counts.openAlerts} problem(s)</Badge>
            <Badge variant="outline">{on.counts.missingAwb} without ABS shipment</Badge>
          </div>

          <WouldDeliver rows={data.groups.wouldDeliver} />

          <Section title="Needs your decision" count={data.review.length} description="Shipments we could not match to one order with certainty. Confirm the right order, or say it is not this one." testId="abs-review">
            {data.review.length === 0 ? <Empty>Nothing is waiting for you.</Empty> : data.review.map((item) => <ReviewCard key={item.awb} item={item} onDone={reload} />)}
          </Section>

          <Section
            title="Problems"
            count={data.groups.amountDiffers.length + data.groups.absProblems.length + data.groups.notLinked.length}
            description="Things to check. Acknowledge one with a note once you have dealt with it."
            testId="abs-problems"
          >
            <h4 className="text-sm font-semibold">Amount differs</h4>
            <DecisionList rows={data.groups.amountDiffers} onDone={reload} emptyText="No amount differences." />
            <h4 className="text-sm font-semibold">Problems at ABS (hold, not delivered, lost…)</h4>
            <DecisionList rows={data.groups.absProblems} onDone={reload} emptyText="No problems reported by ABS." />
            <h4 className="text-sm font-semibold">Delivered or returned, but not linked</h4>
            <DecisionList rows={data.groups.notLinked} onDone={reload} emptyText="Every finished shipment is linked." />
          </Section>

          <Section
            title="Returned to us — confirm when the parcel is in your hands"
            count={data.groups.returnedToUs.length}
            description="ABS says these came back. Nothing changes on the website; check the parcel physically. (Confirming a return on the website comes in a later phase.)"
            testId="abs-returned"
          >
            <DecisionList rows={data.groups.returnedToUs} onDone={reload} emptyText="No returns waiting." ackLabel="Acknowledge (seen)" />
          </Section>

          <MissingAwb rows={data.missing} overview={on} />

          {data.validation && <Accuracy v={data.validation} />}

          <Shipments refreshKey={refreshKey} onDone={reload} />

          <History runs={data.runs} audit={data.audit} />
        </>
      )}
    </div>
  );
}
