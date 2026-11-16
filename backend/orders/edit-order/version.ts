import { createHash } from "node:crypto";
import { selectedOptionsKey } from "#root/shared/products/options";

/**
 * A short fingerprint of everything an order edit is computed from: the
 * order's status, payment state, courier hand-off, money columns and every
 * line. The editor receives it when it opens (order.editContext) and sends it
 * back with the preview and the save; the server recomputes it under the
 * order's row lock and refuses the write when they differ, so an admin can
 * never confirm a summary that was computed against a different order (a
 * status change, a courier hand-off or another admin's edit in between).
 *
 * `updated_at` cannot do this job — several write paths (status changes,
 * courier webhooks) do not maintain it.
 */
export interface VersionedOrder {
  status: string;
  paymentMethod: string;
  paymentStatus: string;
  subtotal: string | number;
  shipping: string | number;
  tax: string | number;
  discount: string | number | null;
  total: string | number;
  stockRestored: boolean;
  bostaDeliveryId: string | null;
  fincartTrackingNumber: string | null;
}

export interface VersionedLine {
  id: string;
  productId: string;
  quantity: number;
  price: string | number;
  discountPrice: string | number | null;
  orderBundleId: string | null;
  selectedOptions: Record<string, string> | null;
}

const money = (v: string | number | null): string | null =>
  v === null ? null : Number(v).toFixed(2);

export function computeOrderEditVersion(
  o: VersionedOrder,
  lines: readonly VersionedLine[],
): string {
  const payload = {
    s: o.status,
    pm: o.paymentMethod,
    ps: o.paymentStatus,
    m: [money(o.subtotal), money(o.shipping), money(o.tax), money(o.discount), money(o.total)],
    sr: o.stockRestored,
    c: [o.bostaDeliveryId, o.fincartTrackingNumber],
    l: [...lines]
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map((l) => [
        l.id,
        l.productId,
        l.quantity,
        money(l.price),
        money(l.discountPrice),
        l.orderBundleId,
        selectedOptionsKey(l.selectedOptions),
      ]),
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 24);
}
