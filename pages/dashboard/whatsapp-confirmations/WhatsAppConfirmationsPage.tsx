import { useCallback, useEffect, useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import { toast } from "sonner";
import { Badge } from "#root/components/ui/badge";
import { Button } from "#root/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#root/components/ui/card";
import { Textarea } from "#root/components/ui/textarea";
import { trpc } from "#root/shared/trpc/client";
import type { AppRouter } from "#root/shared/trpc/router";

/**
 * WhatsApp Confirmations screen. Shows what the automatic confirmation did
 * and the staff queue (modify / cancel requests, failed sends, no reply,
 * free-text replies). Nothing here changes an order: staff open the order in
 * the Orders screen and act there. The only writes are review-item status,
 * pause/resume and (superadmin) the daily cap and shadow simulations.
 */

type Out = inferRouterOutputs<AppRouter>["whatsappConfirmation"];
type Overview = Out["overview"];
type Confirmation = Out["confirmations"][number];
type ReviewItem = Out["reviewItems"][number];

const FILTERS = [
  ["awaiting", "Awaiting reply"],
  ["requests", "Modify / cancel"],
  ["follow_up", "No reply (48h)"],
  ["failed", "Failed"],
  ["confirmed", "Confirmed"],
  ["ineligible", "Not sent"],
  ["shadow", "Shadow"],
  ["all", "All"],
] as const;
type Filter = (typeof FILTERS)[number][0];

export const REVIEW_LABELS: Record<string, string> = {
  modify: "Wants to modify",
  cancel: "Wants to cancel",
  free_text: "Wrote a message",
  unmatched: "Unmatched reply",
  failed_send: "Message failed",
  no_reply_48h: "No reply 48h",
  late_reply: "Late reply",
  ineligible: "Confirm manually",
};

export const STATE_LABELS: Record<string, string> = {
  queued: "Queued",
  shadow: "Shadow (not sent)",
  sent: "Sent",
  delivered: "Delivered",
  read: "Read",
  reminder_sent: "Reminder sent",
  confirmed: "Confirmed",
  modify_requested: "Modify requested",
  cancel_requested: "Cancel requested",
  follow_up: "Follow up",
  failed: "Failed",
  ineligible: "Not sent",
  superseded: "Handled by staff",
};

export function modeBadge(o: Overview | null): { label: string; className: string; note: string } {
  if (!o || o.mode === "off") return { label: "Off", className: "bg-slate-200 text-slate-700 hover:bg-slate-200", note: "WhatsApp confirmation is off. Nothing is recorded or sent." };
  if (o.mode === "shadow") return { label: "Shadow", className: "bg-amber-100 text-amber-800 hover:bg-amber-100", note: "Shadow: messages are prepared but never sent; no order changes." };
  if (o.paused) return { label: "Paused", className: "bg-red-100 text-red-800 hover:bg-red-100", note: "Paused: nothing is sent and replies change no order until you resume." };
  if (o.mode === "pilot") return { label: "Pilot", className: "bg-sky-100 text-sky-800 hover:bg-sky-100", note: "Pilot: messages go only to the approved test numbers." };
  return { label: "Live", className: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100", note: "Live: every eligible COD order gets a WhatsApp confirmation." };
}

const fmt = (d: Date | string | null | undefined) => (d ? new Date(d).toLocaleString("en-GB", { timeZone: "Africa/Cairo", dateStyle: "short", timeStyle: "short" }) : "—");

export default function WhatsAppConfirmationsPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [filter, setFilter] = useState<Filter>("awaiting");
  const [rows, setRows] = useState<Confirmation[]>([]);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const o = await trpc.whatsappConfirmation.overview.query();
      setOverview(o);
      if (o.mode === "off") return;
      const [c, r] = await Promise.all([
        trpc.whatsappConfirmation.confirmations.query({ filter }),
        trpc.whatsappConfirmation.reviewItems.query({ includeClosed: false }),
      ]);
      setRows(c);
      setReviews(r);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load WhatsApp confirmations");
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const resolve = async (id: string, status: "in_progress" | "done" | "dismissed") => {
    setBusy(true);
    try {
      await trpc.whatsappConfirmation.resolveReview.mutate({ id, status, note: notes[id] || null });
      toast.success(status === "in_progress" ? "Assigned to you" : "Closed");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update");
    } finally {
      setBusy(false);
    }
  };

  const togglePause = async () => {
    if (!overview) return;
    setBusy(true);
    try {
      await trpc.whatsappConfirmation.setPaused.mutate({ paused: !overview.paused });
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not change pause");
    } finally {
      setBusy(false);
    }
  };

  const simulate = async (orderId: string, action: "confirm" | "modify" | "cancel") => {
    setBusy(true);
    try {
      const r = await trpc.whatsappConfirmation.simulateReply.mutate({ orderId, action });
      toast.success(`Simulated: ${r.result}`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Simulation failed");
    } finally {
      setBusy(false);
    }
  };

  const mode = modeBadge(overview);

  return (
    <div className='space-y-6 p-4 md:p-6'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div>
          <h1 className='text-2xl font-semibold'>WhatsApp Confirmations</h1>
          <p className='text-sm text-muted-foreground'>{mode.note}</p>
        </div>
        <div className='flex items-center gap-2'>
          <Badge className={mode.className}>{mode.label}</Badge>
          {overview && (overview.mode === "pilot" || overview.mode === "live") && (
            <Button size='sm' variant={overview.paused ? "primary" : "destructive"} disabled={busy} onClick={togglePause}>
              {overview.paused ? "Resume" : "Pause"}
            </Button>
          )}
        </div>
      </div>

      {overview && overview.problems.length > 0 && (
        <Card className='border-amber-300'>
          <CardContent className='pt-6 text-sm'>Setup: {overview.problems.join(" · ")}</CardContent>
        </Card>
      )}

      {overview && overview.mode !== "off" && (
        <>
          <div className='grid grid-cols-2 gap-3 md:grid-cols-5'>
            <Stat label='Sent today' value={`${overview.sentToday} / ${overview.dailySendCap}`} />
            <Stat label='Awaiting reply' value={sum(overview.byState, ["queued", "sent", "delivered", "read", "reminder_sent"])} />
            <Stat label='Confirmed (30d)' value={overview.byState.confirmed ?? 0} />
            <Stat label='Modify / cancel (30d)' value={sum(overview.byState, ["modify_requested", "cancel_requested"])} />
            <Stat label='Needs action' value={Object.values(overview.openReview).reduce((a, b) => a + b, 0)} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Needs action</CardTitle>
              <CardDescription>Change the order in the Orders screen, then close the item here.</CardDescription>
            </CardHeader>
            <CardContent className='space-y-3'>
              {reviews.length === 0 && <p className='text-sm text-muted-foreground'>Nothing waiting.</p>}
              {reviews.map((r) => (
                <div key={r.id} className='rounded-md border p-3 text-sm'>
                  <div className='flex flex-wrap items-center justify-between gap-2'>
                    <div className='flex items-center gap-2'>
                      <Badge variant='outline'>{REVIEW_LABELS[r.type] ?? r.type}</Badge>
                      <span className='font-medium'>{r.orderNumber ? `#${r.orderNumber}` : "No order"}</span>
                      <span>{r.customerName ?? ""}</span>
                      {r.orderStatus && <Badge variant='secondary'>{r.orderStatus}</Badge>}
                    </div>
                    <span className='text-muted-foreground'>{fmt(r.createdAt)}</span>
                  </div>
                  <p className='mt-1'>{r.detail}</p>
                  {r.customerText && <p className='mt-1 rounded bg-muted p-2'>“{r.customerText}”</p>}
                  <div className='mt-2 flex flex-wrap items-center gap-2'>
                    {r.customerPhone && (
                      <a className='underline' href={`https://wa.me/${r.customerPhone.replace(/\D/g, "").replace(/^0/, "20")}`} target='_blank' rel='noreferrer'>
                        Open chat
                      </a>
                    )}
                    {r.orderId && (
                      <a className='underline' href='/dashboard/orders' target='_blank' rel='noreferrer'>
                        Orders (search {r.orderNumber ? `#${r.orderNumber}` : "the order"})
                      </a>
                    )}
                    {r.status === "in_progress" && <span className='text-muted-foreground'>Taken by {r.assignedTo}</span>}
                  </div>
                  <Textarea
                    className='mt-2'
                    rows={2}
                    placeholder='Note (what you did)'
                    value={notes[r.id] ?? ""}
                    onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                  />
                  <div className='mt-2 flex gap-2'>
                    {r.status === "open" && (
                      <Button size='sm' variant='outline' disabled={busy} onClick={() => resolve(r.id, "in_progress")}>
                        Take
                      </Button>
                    )}
                    <Button size='sm' disabled={busy} onClick={() => resolve(r.id, "done")}>
                      Done
                    </Button>
                    <Button size='sm' variant='ghost' disabled={busy} onClick={() => resolve(r.id, "dismissed")}>
                      Dismiss
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Confirmations</CardTitle>
              <div className='flex flex-wrap gap-2 pt-2'>
                {FILTERS.map(([key, label]) => (
                  <Button key={key} size='sm' variant={filter === key ? "primary" : "outline"} onClick={() => setFilter(key)}>
                    {label}
                  </Button>
                ))}
              </div>
            </CardHeader>
            <CardContent className='overflow-x-auto'>
              <table className='w-full text-sm'>
                <thead className='text-left text-muted-foreground'>
                  <tr>
                    <th className='p-2'>Order</th>
                    <th className='p-2'>Customer</th>
                    <th className='p-2'>WhatsApp</th>
                    <th className='p-2'>Answer</th>
                    <th className='p-2'>Order status</th>
                    <th className='p-2'>Sent</th>
                    <th className='p-2' />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => (
                    <tr key={c.id} className='border-t align-top'>
                      <td className='p-2 font-medium'>{c.orderNumber ? `#${c.orderNumber}` : "—"}</td>
                      <td className='p-2'>{c.customerName ?? "—"}</td>
                      <td className='p-2'>
                        {STATE_LABELS[c.state] ?? c.state}
                        {c.ineligibleReason && <div className='text-xs text-muted-foreground'>{c.ineligibleReason}</div>}
                        {c.lastError && <div className='text-xs text-red-700'>{c.lastError}</div>}
                      </td>
                      <td className='p-2'>
                        {c.response ?? "—"}
                        {c.statusApplied && <div className='text-xs text-emerald-700'>→ Processing</div>}
                        {c.statusSkipReason && <div className='text-xs text-muted-foreground'>not applied: {c.statusSkipReason}</div>}
                        {c.wouldApply && <div className='text-xs text-amber-700'>shadow: would {c.wouldApply}</div>}
                      </td>
                      <td className='p-2'>{c.orderStatus ?? "—"}</td>
                      <td className='p-2'>{fmt(c.sentAt)}</td>
                      <td className='p-2'>
                        {overview.mode === "shadow" && c.state === "shadow" && (
                          <div className='flex gap-1'>
                            {(["confirm", "modify", "cancel"] as const).map((a) => (
                              <Button key={a} size='sm' variant='outline' disabled={busy} onClick={() => simulate(c.orderId, a)}>
                                Sim {a}
                              </Button>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td className='p-2 text-muted-foreground' colSpan={7}>
                        Nothing here.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function sum(map: Record<string, number>, keys: string[]): number {
  return keys.reduce((a, k) => a + (map[k] ?? 0), 0);
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className='pt-6'>
        <div className='text-xs text-muted-foreground'>{label}</div>
        <div className='text-xl font-semibold'>{value}</div>
      </CardContent>
    </Card>
  );
}
