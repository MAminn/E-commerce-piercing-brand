/**
 * Order lines for the admin order detail, grouped by bundle instance.
 *
 * Renders standalone products exactly as before and wraps each purchased
 * bundle in a header + its child SKUs. Two things this component must get
 * right, both enforced by the shared `groupOrderLines` domain helper:
 *
 *   • Everything about a bundle comes from the ORDER SNAPSHOT. The live
 *     campaign is never consulted, so editing or deleting a campaign leaves
 *     historical orders exactly as they were sold.
 *   • The bundle's charged price is shown once, on the group. Child rows keep
 *     their regular prices because that is what fulfilment and refunds need,
 *     but they are labelled "regular" so nobody reads them as money taken.
 *     The order's authoritative subtotal/discount/total are rendered elsewhere
 *     from the order row and are not recomputed here.
 *
 * Both layouts (the desktop table and the mobile list) share one grouping pass
 * so they can never disagree about what belongs to which stack.
 */

import { Fragment } from "react";
import { Layers } from "lucide-react";
import { Badge } from "#root/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#root/components/ui/table";
import { STORE_CURRENCY } from "#root/shared/config/branding";
import {
  type BundleGroup,
  type GroupableOrderItem,
  type OrderBundleSnapshot,
  bundleTierLabel,
  bundleTypeLabel,
  groupOrderLines,
  orderLineDisplay,
  standaloneLineTotal,
} from "#root/shared/bundles/order-grouping";
import { formatMoney } from "#root/shared/pricing/format-money";

export interface AdminOrderItem extends GroupableOrderItem {
  productId: string;
  productImage?: string | null;
  /** Phase 7 snapshot of the bought options; null on simple and pre-Phase-7 lines. */
  selectedOptions?: Record<string, string> | null;
  /**
   * Merchant-only internal code as it stood when the line was placed. Null on
   * legacy lines and on products that had no code at purchase time — the
   * label is omitted entirely in that case rather than showing a blank.
   *
   * This is the line's OWN snapshot; it is never looked up from the live
   * product, so it keeps reading PC001 after the product becomes PC101.
   */
  internalCode?: string | null;
}

/**
 * The line's internal code, for picking and supplier reference. Merchant-only
 * — this panel renders inside /dashboard, and the field is stripped from
 * every customer-facing order payload on the server.
 */
function LineCode({ item }: { item: AdminOrderItem }) {
  if (!item.internalCode) return null;
  return (
    <span className='block text-[11px] font-mono text-muted-foreground'>
      Code: {item.internalCode}
    </span>
  );
}

/** Name + options from the line's own snapshot (never the live product). */
function LineName({ item, campaignTitle }: { item: AdminOrderItem; campaignTitle?: string }) {
  const display = orderLineDisplay(item.name, item.selectedOptions, campaignTitle);
  return (
    <span className='min-w-0'>
      <span className='block'>{display.name}</span>
      {display.options && <span className='block text-xs text-muted-foreground'>{display.options}</span>}
      <LineCode item={item} />
    </span>
  );
}

const money = (value: number) => formatMoney(value, { currency: STORE_CURRENCY, alwaysShowFraction: true });

function Thumb({ item, size }: { item: AdminOrderItem; size: "sm" | "lg" }) {
  const box = size === "lg" ? "h-14 w-14" : "h-12 w-12";
  return (
    <div
      className={`${box} rounded-md overflow-hidden bg-stone-100 flex items-center justify-center text-sm font-medium text-stone-600 shrink-0`}>
      {item.productImage ? (
        <img src={item.productImage} alt={item.name} className='h-full w-full object-cover' />
      ) : (
        <span>{(item.name || "?").charAt(0).toUpperCase()}</span>
      )}
    </div>
  );
}

/** Snapshot facts shared by both layouts. Never reads the live campaign. */
function BundleHeading({ group }: { group: BundleGroup<AdminOrderItem> }) {
  const { bundle } = group;
  return (
    <div className='space-y-1'>
      <div className='flex flex-wrap items-center gap-2'>
        <Layers className='h-4 w-4 text-muted-foreground shrink-0' />
        <span className='font-semibold uppercase tracking-wide text-sm'>{bundle.campaignTitle}</span>
        <Badge variant='outline' className='text-[10px]'>
          {bundleTypeLabel(bundle.campaignType)}
        </Badge>
        {/* Which tier was sold, straight from the order snapshot. */}
        {bundleTierLabel(bundle) && (
          <Badge variant='outline' className='text-[10px]'>
            {bundleTierLabel(bundle)}
          </Badge>
        )}
        {bundle.offerStacking === "stackable" && (
          <Badge variant='outline' className='text-[10px]'>
            Stackable
          </Badge>
        )}
      </div>
      <div className='text-sm'>
        <span className='font-medium'>Bundle price: {money(group.bundleTotal)}</span>
        <span className='text-muted-foreground'>
          {" · "}
          {group.unitCount} unit{group.unitCount === 1 ? "" : "s"}
          {" · regular "}
          {money(group.regularTotal)}
          {group.savings > 0 ? ` · saved ${money(group.savings)}` : ""}
        </span>
      </div>
      {/* Secondary admin identity: which instance, and which campaign it came
          from — a reference only, and absent once the campaign is deleted. */}
      <p className='text-[11px] text-muted-foreground font-mono'>
        instance {bundle.instanceId}
        {bundle.campaignId ? ` · campaign ${bundle.campaignSlug}` : " · campaign deleted"}
      </p>
    </div>
  );
}

/** Desktop: the existing 4-column table, with bundle header/child rows woven in. */
export function OrderItemsTable({
  items,
  bundles,
}: {
  items: AdminOrderItem[] | undefined;
  bundles: OrderBundleSnapshot[] | undefined;
}) {
  const groups = groupOrderLines(items ?? [], bundles ?? []);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Product</TableHead>
          <TableHead>Quantity</TableHead>
          <TableHead>Price</TableHead>
          <TableHead>Total</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {groups.length === 0 ? (
          <TableRow>
            <TableCell colSpan={4} className='text-center text-muted-foreground'>
              No items found for this order.
            </TableCell>
          </TableRow>
        ) : (
          groups.map((group) => {
            if (group.kind === "item") {
              const item = group.item;
              const price = Number.parseFloat(item.price);
              const discount = item.discountPrice ? Number.parseFloat(item.discountPrice) : null;
              return (
                <TableRow key={item.id}>
                  <TableCell>
                    <div className='flex items-center gap-3'>
                      <Thumb item={item} size='sm' />
                      <LineName item={item} />
                    </div>
                  </TableCell>
                  <TableCell>{item.quantity}</TableCell>
                  <TableCell>
                    {discount !== null ? (
                      <>
                        <span className='line-through text-gray-500'>{price.toFixed(2)} {STORE_CURRENCY}</span>
                        <span className='text-red-600 block'>{discount.toFixed(2)} {STORE_CURRENCY}</span>
                      </>
                    ) : (
                      <>{price.toFixed(2)} {STORE_CURRENCY}</>
                    )}
                  </TableCell>
                  <TableCell>{money(standaloneLineTotal(item))}</TableCell>
                </TableRow>
              );
            }

            return (
              <Fragment key={group.bundle.id}>
                <TableRow className='bg-muted/50 hover:bg-muted/50'>
                  <TableCell colSpan={4} className='py-3'>
                    <BundleHeading group={group} />
                  </TableCell>
                </TableRow>
                {group.items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className='pl-10 text-sm text-muted-foreground'>
                      This bundle's items were removed from the order.
                    </TableCell>
                  </TableRow>
                ) : (
                  group.items.map((item) => {
                    const price = Number.parseFloat(item.price);
                    const discount = item.discountPrice ? Number.parseFloat(item.discountPrice) : null;
                    const unit = discount !== null && discount < price ? discount : price;
                    return (
                      <TableRow key={item.id} className='border-l-2 border-l-muted-foreground/30'>
                        <TableCell className='pl-8'>
                          <div className='flex items-center gap-3'>
                            <Thumb item={item} size='sm' />
                            <LineName item={item} campaignTitle={group.bundle.campaignTitle} />
                          </div>
                        </TableCell>
                        <TableCell>{item.quantity}</TableCell>
                        {/* Regular prices, kept for picking, returns and history —
                            NOT what was charged. The bundle price above is. */}
                        <TableCell className='text-muted-foreground'>
                          {unit.toFixed(2)} {STORE_CURRENCY}
                          <span className='block text-[10px] uppercase tracking-wide'>regular</span>
                        </TableCell>
                        <TableCell className='text-muted-foreground'>
                          <span className='text-xs'>in bundle</span>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </Fragment>
            );
          })
        )}
      </TableBody>
    </Table>
  );
}

/** Mobile: the compact stacked list, same grouping. */
export function OrderItemsList({
  items,
  bundles,
}: {
  items: AdminOrderItem[] | undefined;
  bundles: OrderBundleSnapshot[] | undefined;
}) {
  const groups = groupOrderLines(items ?? [], bundles ?? []);
  if (groups.length === 0) {
    return <p className='text-sm text-muted-foreground text-center'>No items found for this order.</p>;
  }

  return (
    <div className='space-y-3'>
      {groups.map((group) => {
        if (group.kind === "item") {
          const item = group.item;
          const price = Number.parseFloat(item.price);
          const discount = item.discountPrice ? Number.parseFloat(item.discountPrice) : null;
          const unit = discount !== null && discount < price ? discount : price;
          return (
            <div key={item.id} className='flex items-center gap-3'>
              <Thumb item={item} size='lg' />
              <div className='min-w-0 flex-1'>
                <p className='text-sm font-medium truncate'>{item.name}</p>
                <LineCode item={item} />
                <p className='text-xs text-muted-foreground'>
                  {item.quantity} × {unit.toFixed(2)} = {money(standaloneLineTotal(item))}
                </p>
              </div>
            </div>
          );
        }

        return (
          <div key={group.bundle.id} className='rounded-md border bg-muted/30 p-3 space-y-3'>
            <BundleHeading group={group} />
            {group.items.length === 0 ? (
              <p className='text-xs text-muted-foreground'>This bundle's items were removed from the order.</p>
            ) : (
              <div className='space-y-2'>
                {group.items.map((item) => {
                  const price = Number.parseFloat(item.price);
                  const discount = item.discountPrice ? Number.parseFloat(item.discountPrice) : null;
                  const unit = discount !== null && discount < price ? discount : price;
                  return (
                    <div key={item.id} className='flex items-center gap-3'>
                      <Thumb item={item} size='sm' />
                      <div className='min-w-0 flex-1'>
                        <p className='text-sm truncate'>
                          {orderLineDisplay(item.name, item.selectedOptions, group.bundle.campaignTitle).name} ×{item.quantity}
                        </p>
                        {orderLineDisplay(item.name, item.selectedOptions, group.bundle.campaignTitle).options && (
                          <p className='text-[11px] text-muted-foreground'>
                            {orderLineDisplay(item.name, item.selectedOptions, group.bundle.campaignTitle).options}
                          </p>
                        )}
                        <LineCode item={item} />
                        <p className='text-[11px] text-muted-foreground'>
                          regular {unit.toFixed(2)} {STORE_CURRENCY} each
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
