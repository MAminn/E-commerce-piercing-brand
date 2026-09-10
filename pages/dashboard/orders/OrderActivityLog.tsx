import { useEffect, useState } from "react";
import { trpc } from "#root/shared/trpc/client";
import { Loader2, ChevronRight } from "lucide-react";

interface OrderLogEntry {
  source: "order_log";
  id: string;
  createdAt: string | Date;
  action: string;
  oldStatus: string | null;
  newStatus: string | null;
  note: string | null;
}

interface WebhookLogEntry {
  source: "webhook_log";
  id: string;
  createdAt: string | Date;
  provider: string;
  webhookType: string;
  status: string;
  errorMessage: string | null;
  payload: unknown;
  processedAt: string | Date | null;
}

type ActivityEntry = OrderLogEntry | WebhookLogEntry;

const ACTION_LABELS: Record<string, { label: string; dot: string }> = {
  created: { label: "Order created", dot: "bg-gray-400" },
  status_changed: { label: "Status changed", dot: "bg-blue-500" },
  cancelled: { label: "Order cancelled", dot: "bg-red-500" },
  refunded: { label: "Refunded", dot: "bg-purple-500" },
  items_edited: { label: "Items edited", dot: "bg-blue-400" },
  payment_confirmed: { label: "Payment confirmed", dot: "bg-green-500" },
  payment_failed: { label: "Payment failed", dot: "bg-red-500" },
  bosta_sent: { label: "Sent to Bosta", dot: "bg-orange-500" },
  bosta_send_failed: { label: "Bosta send failed", dot: "bg-red-500" },
  bosta_skipped: { label: "Bosta deferred", dot: "bg-gray-400" },
  bosta_cancelled: { label: "Bosta delivery cancelled", dot: "bg-gray-500" },
  bosta_status_updated: { label: "Bosta status updated", dot: "bg-orange-400" },
};

function formatTimestamp(value: string | Date) {
  return new Date(value).toLocaleString();
}

function PayloadViewer({ payload }: { payload: unknown }) {
  const [open, setOpen] = useState(false);
  return (
    <div className='mt-1'>
      <button
        type='button'
        onClick={() => setOpen((v) => !v)}
        className='inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors'>
        <ChevronRight
          className={`w-3 h-3 transition-transform ${open ? "rotate-90" : ""}`}
        />
        {open ? "Hide raw payload" : "View raw payload"}
      </button>
      {open && (
        <pre className='mt-1 max-h-64 overflow-auto rounded-md bg-muted/50 border p-2 text-[10px] leading-relaxed whitespace-pre-wrap break-all'>
          {JSON.stringify(payload, null, 2)}
        </pre>
      )}
    </div>
  );
}

/**
 * Full audit trail for one order — order-created / payment-confirmed-or-failed
 * / Bosta-sent-or-failed-or-skipped-or-cancelled / Bosta-status-webhook
 * events, interleaved with the raw Paymob/Bosta webhook payloads that
 * triggered them, oldest first. Cart/checkout is client-side only, so there's
 * nothing to show before the order itself was created.
 */
export function OrderActivityLog({ orderId }: { orderId: string }) {
  const [entries, setEntries] = useState<ActivityEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setEntries(null);
    setError(null);
    trpc.order.activity
      .query({ orderId })
      .then((res) => {
        if (cancelled) return;
        if (res.success) {
          setEntries(res.result as ActivityEntry[]);
        } else {
          setError(res.error || "Failed to load activity log");
        }
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load activity log");
      });
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  if (error) {
    return <p className='text-sm text-red-600'>{error}</p>;
  }

  if (!entries) {
    return (
      <div className='flex items-center gap-2 text-sm text-muted-foreground py-4'>
        <Loader2 className='w-4 h-4 animate-spin' />
        Loading activity log…
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <p className='text-sm text-muted-foreground'>
        No activity recorded for this order yet.
      </p>
    );
  }

  return (
    <div className='space-y-0'>
      {entries.map((entry, idx) => {
        const isLast = idx === entries.length - 1;
        return (
          <div key={`${entry.source}-${entry.id}`} className='flex gap-3'>
            <div className='flex flex-col items-center'>
              <span
                className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${
                  entry.source === "order_log"
                    ? (ACTION_LABELS[entry.action]?.dot ?? "bg-gray-400")
                    : entry.status === "failed"
                      ? "bg-red-500"
                      : entry.status === "processed"
                        ? "bg-teal-500"
                        : "bg-gray-300"
                }`}
              />
              {!isLast && <div className='w-px flex-1 bg-border' />}
            </div>
            <div className='pb-4 min-w-0 flex-1'>
              <div className='flex items-center justify-between gap-2'>
                <p className='text-sm font-medium'>
                  {entry.source === "order_log"
                    ? (ACTION_LABELS[entry.action]?.label ?? entry.action)
                    : `Webhook received — ${entry.provider} (${entry.webhookType})`}
                </p>
                <span className='text-[11px] text-muted-foreground shrink-0'>
                  {formatTimestamp(entry.createdAt)}
                </span>
              </div>

              {entry.source === "order_log" ? (
                <>
                  {entry.oldStatus && entry.newStatus && (
                    <p className='text-xs text-muted-foreground mt-0.5'>
                      {entry.oldStatus} → {entry.newStatus}
                    </p>
                  )}
                  {entry.note && (
                    <p className='text-xs text-muted-foreground mt-0.5 break-words'>
                      {entry.note}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <p className='text-xs text-muted-foreground mt-0.5'>
                    Status: {entry.status}
                    {entry.processedAt &&
                      ` — processed ${formatTimestamp(entry.processedAt)}`}
                  </p>
                  {entry.errorMessage && (
                    <p className='text-xs text-red-600 mt-0.5 break-words'>
                      {entry.errorMessage}
                    </p>
                  )}
                  <PayloadViewer payload={entry.payload} />
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
