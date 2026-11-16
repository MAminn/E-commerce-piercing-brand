/**
 * The confirmation step of Edit Order. Shows the SERVER's dry run of the
 * edit (order.previewEdit) — every added product, where it landed, all other
 * changes and the money before → after — and saves only when the admin
 * confirms. The figures come from the same transaction code the save runs,
 * so what is confirmed is what is written.
 */

import { Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "#root/components/ui/alert-dialog";
import { Button } from "#root/components/ui/button";
import type { OrderEditSummary } from "#root/backend/orders/edit-order/service";
import { STORE_CURRENCY } from "#root/shared/config/branding";
import { formatSelectedOptions } from "#root/shared/products/options";

const money = (v: number) => `${v.toFixed(2)} ${STORE_CURRENCY}`;
const toMinor = (v: number) => Math.round(v * 100);

function MoneyRow({
  label,
  before,
  after,
  negative,
  strong,
}: {
  label: string;
  before: number;
  after: number;
  negative?: boolean;
  strong?: boolean;
}) {
  const changed = toMinor(before) !== toMinor(after);
  const sign = negative ? "−" : "";
  return (
    <tr className={strong ? "font-semibold" : ""}>
      <td className='py-1 pr-2'>{label}</td>
      <td className={`py-1 px-2 text-right ${changed ? "text-muted-foreground line-through" : "text-muted-foreground"}`}>
        {sign}
        {money(before)}
      </td>
      <td className={`py-1 pl-2 text-right ${changed ? "text-foreground" : ""}`}>
        {sign}
        {money(after)}
      </td>
    </tr>
  );
}

export function OrderEditReviewDialog({
  summary,
  detailChanges,
  saving,
  onConfirm,
  onCancel,
}: {
  summary: OrderEditSummary | null;
  detailChanges: string[];
  saving: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const otherLineChanges = summary ? summary.changes.filter((c) => !c.startsWith("Added ")) : [];
  const imageFor = (productId: string) => summary?.lines.find((l) => l.productId === productId)?.productImage ?? null;
  const showTax = summary ? summary.before.tax !== 0 || summary.after.tax !== 0 : false;

  return (
    <AlertDialog
      open={summary !== null}
      onOpenChange={(open) => {
        if (!open && !saving) onCancel();
      }}>
      {/* z-[10002]: above the mobile order Sheet (z-[10001]), which hosts the editor there. */}
      <AlertDialogContent
        className='z-[10002] grid-cols-[minmax(0,1fr)] sm:max-w-xl max-h-[90dvh] overflow-y-auto'
        overlayClassName='z-[10002]'
        data-testid='order-edit-review'>
        <AlertDialogHeader>
          <AlertDialogTitle>Review order changes</AlertDialogTitle>
          <AlertDialogDescription>
            Nothing has been saved yet. Check the updated order below, then confirm to save it.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {summary && (
          <div className='space-y-4 text-sm'>
            {summary.additions.length > 0 && (
              <section>
                <h4 className='mb-2 font-medium'>Products added</h4>
                <ul className='space-y-2'>
                  {summary.additions.map((a, i) => {
                    const img = imageFor(a.productId);
                    return (
                      <li key={`${a.productId}-${i}`} className='flex items-center gap-3 rounded-md border p-2'>
                        <div className='h-12 w-12 rounded-md overflow-hidden bg-stone-100 flex items-center justify-center text-xs font-medium text-stone-600 shrink-0'>
                          {img ? <img src={img} alt={a.name} className='h-full w-full object-cover' /> : a.name.charAt(0).toUpperCase()}
                        </div>
                        <div className='min-w-0 flex-1'>
                          <p className='truncate font-medium'>{a.name}</p>
                          {a.selectedOptions && (
                            <p className='text-xs text-muted-foreground'>{formatSelectedOptions(a.selectedOptions)}</p>
                          )}
                          <p className='text-xs text-muted-foreground'>
                            {a.quantity} × {money(a.unitPrice)}
                            {a.mergedIntoLineId
                              ? ` · added to the existing line (qty ${a.previousLineQuantity} → ${a.newLineQuantity})`
                              : " · new line"}
                          </p>
                        </div>
                        <span className='shrink-0 font-medium'>{money((toMinor(a.unitPrice) * a.quantity) / 100)}</span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {(otherLineChanges.length > 0 || detailChanges.length > 0) && (
              <section>
                <h4 className='mb-2 font-medium'>Other changes</h4>
                <ul className='list-disc space-y-0.5 pl-5 text-muted-foreground'>
                  {otherLineChanges.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                  {detailChanges.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              </section>
            )}

            <section>
              <h4 className='mb-2 font-medium'>Order summary</h4>
              <table className='w-full'>
                <thead>
                  <tr className='text-xs text-muted-foreground'>
                    <th className='pb-1 text-left font-normal' />
                    <th className='pb-1 px-2 text-right font-normal'>Before</th>
                    <th className='pb-1 pl-2 text-right font-normal'>After</th>
                  </tr>
                </thead>
                <tbody>
                  <MoneyRow label='Subtotal' before={summary.before.subtotal} after={summary.after.subtotal} />
                  {(summary.before.discount !== 0 || summary.after.discount !== 0) && (
                    <MoneyRow label='Discount' before={summary.before.discount} after={summary.after.discount} negative />
                  )}
                  <MoneyRow label='Shipping' before={summary.before.shipping} after={summary.after.shipping} />
                  {showTax && <MoneyRow label='Tax' before={summary.before.tax} after={summary.after.tax} />}
                  <MoneyRow label='Total' before={summary.before.total} after={summary.after.total} strong />
                </tbody>
              </table>
              {summary.additions.length > 0 && summary.before.discount !== 0 && (
                <p className='mt-2 text-xs text-muted-foreground'>
                  The order's existing discount is kept as it was. It is not recalculated or applied to the added products.
                </p>
              )}
              {summary.paymentMethod === "cod" && (
                <p className='mt-2 rounded-md bg-muted/50 p-2 text-sm' data-testid='cod-amount'>
                  Cash to collect on delivery: <span className='font-semibold'>{money(summary.after.total)}</span>
                </p>
              )}
            </section>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={saving}>Back to editing</AlertDialogCancel>
          {/* A plain Button (not AlertDialogAction) so the dialog stays open
              while the save runs and on failure. */}
          <Button onClick={onConfirm} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className='h-4 w-4 animate-spin mr-1' />
                Saving...
              </>
            ) : (
              "Confirm & save"
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
