"use client";

import { Link } from "#root/components/utils/Link";
import {
  CheckCircle,
  Package,
  Home,
  ShoppingBag,
  XCircle,
  Clock,
  AlertTriangle,
  Loader2,
  HelpCircle,
} from "lucide-react";
import { Button } from "#root/components/ui/button";
import { formatMoney } from "#root/shared/pricing/format-money";
import type { ConfirmationView } from "./confirmation-state";

export interface OrderConfirmationCardProps {
  view: ConfirmationView;
  /** Short display id, derived from a *verified* order id only. */
  shortId?: string;
  /** Raw `?total=` value. Shown only once the order is known to exist. */
  orderTotal?: string;
  /** Raw `?email=` value. Shown only once the order is known to exist. */
  customerEmail?: string;
}

/**
 * Presentational half of /order-confirmation.
 *
 * Every sentence below is limited to something the page actually knows:
 * whether the order row came back from the server, and what the payment
 * gateway (or the absence of one) reported. Nothing here states a delivery
 * date, a courier, a confirmation call or a shipping window — Percé has set
 * none of those.
 */
export function OrderConfirmationCard({
  view,
  shortId,
  orderTotal,
  customerEmail,
}: OrderConfirmationCardProps) {
  const showDetails =
    view.kind === "placed" || view.kind === "pending" || view.kind === "failed";

  return (
    <div className='perce-header-offset flex min-h-screen items-center justify-center bg-perce-bg px-4 py-12 sm:py-16'>
      <div className='flex w-full max-w-2xl flex-col border border-perce-line bg-perce-surface-raised px-6 pb-12 pt-8 text-center sm:px-8'>
        {/* Icon */}
        <div className='mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-perce-surface'>
          {view.kind === "loading" && (
            <Loader2
              aria-hidden
              className='h-7 w-7 animate-spin text-perce-ink-secondary'
            />
          )}
          {view.kind === "not-found" && (
            <HelpCircle aria-hidden className='h-7 w-7 text-perce-ink-secondary' />
          )}
          {view.kind === "placed" && (
            <CheckCircle aria-hidden className='h-7 w-7 text-perce-success' />
          )}
          {view.kind === "pending" && (
            <Clock aria-hidden className='h-7 w-7 text-perce-ink-secondary' />
          )}
          {view.kind === "failed" && (
            <XCircle aria-hidden className='h-7 w-7 text-perce-sale' />
          )}
        </div>

        {/* Heading */}
        {view.kind === "loading" && (
          <>
            <h1 className='perce-section-title'>Checking your order</h1>
            <p className='mt-2 text-[length:var(--perce-text-body)] text-perce-ink-muted'>
              One moment.
            </p>
          </>
        )}
        {view.kind === "not-found" && (
          <>
            <h1 className='perce-section-title'>Order not found</h1>
            <p className='mt-2 text-[length:var(--perce-text-body)] text-perce-ink-muted'>
              This page shows the status of an order you have already placed.
              We could not find one for this link.
            </p>
          </>
        )}
        {view.kind === "placed" && (
          <>
            <h1 className='perce-section-title'>Order placed</h1>
            <p className='mt-2 text-[length:var(--perce-text-body)] text-perce-ink-muted'>
              Your order has been received.
              {view.paid && " Payment received."}
            </p>
          </>
        )}
        {view.kind === "pending" && (
          <>
            <h1 className='perce-section-title'>Payment pending</h1>
            <p className='mt-2 text-[length:var(--perce-text-body)] text-perce-ink-muted'>
              Your order has been created. The payment provider has not
              confirmed the payment yet.
            </p>
          </>
        )}
        {view.kind === "failed" && (
          <>
            <h1 className='perce-section-title'>
              Payment {view.reason === "cancelled" ? "cancelled" : "failed"}
            </h1>
            <p className='mt-2 text-[length:var(--perce-text-body)] text-perce-ink-muted'>
              {view.reason === "cancelled"
                ? "The payment was cancelled. Your order has been saved and is unpaid."
                : "The payment did not go through. Your order has been saved and is unpaid."}
            </p>
          </>
        )}

        {/* Order Details Card — only for an order the server confirmed. */}
        {showDetails && (
          <div className='mt-8 mb-8 space-y-3 overflow-x-auto bg-perce-surface p-6 text-start'>
            {shortId && (
              <div className='flex justify-between items-center flex-wrap gap-2'>
                <span className='text-sm text-perce-ink-muted'>Order number</span>
                <span className='font-mono text-sm font-medium text-perce-ink'>
                  #{shortId}
                </span>
              </div>
            )}
            {orderTotal && (
              <div className='flex justify-between items-center flex-wrap gap-2'>
                <span className='text-sm text-perce-ink-muted'>Total</span>
                <span className='text-sm font-semibold text-perce-ink'>
                  {formatMoney(Number.parseFloat(orderTotal))}
                </span>
              </div>
            )}
            {customerEmail && (
              <div className='flex justify-between items-center flex-wrap gap-2'>
                <span className='text-sm text-perce-ink-muted'>Order email</span>
                <span className='whitespace-nowrap text-sm text-perce-ink'>
                  {customerEmail}
                </span>
              </div>
            )}
            <div className='flex justify-between items-center flex-wrap gap-2'>
              <span className='text-sm text-perce-ink-muted'>Status</span>
              {view.kind === "placed" && (
                <span className='inline-flex items-center gap-1.5 rounded-full bg-perce-surface px-2.5 py-0.5 text-sm font-medium text-perce-ink-secondary'>
                  <Package aria-hidden className='h-3.5 w-3.5' />
                  Processing
                </span>
              )}
              {view.kind === "pending" && (
                <span className='inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-perce-surface px-2.5 py-0.5 text-sm font-medium text-perce-ink-secondary'>
                  <Clock aria-hidden className='h-3.5 w-3.5' />
                  Awaiting payment
                </span>
              )}
              {view.kind === "failed" && (
                <span className='inline-flex items-center gap-1.5 rounded-full bg-perce-surface px-2.5 py-0.5 text-sm font-medium text-perce-sale'>
                  <AlertTriangle aria-hidden className='h-3.5 w-3.5' />
                  Payment {view.reason === "cancelled" ? "cancelled" : "failed"}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Info text */}
        {/* "We've sent a confirmation email … You'll receive shipping
            updates as your order progresses" was asserted unconditionally.
            The email only goes out when SMTP is configured, and there is no
            shipping-update pipeline at all — so the page promised two things
            an unconfigured store does not do. "Don't worry — no charges were
            made" was likewise asserted for a *failed* payment, which this
            page cannot know. */}
        {view.kind === "pending" && (
          <p className='mb-8 text-sm text-perce-ink-muted'>
            A completed payment can take a few minutes to show here.
          </p>
        )}
        {view.kind === "failed" && (
          <p className='mb-8 text-sm text-perce-ink-muted'>
            Any amount the provider authorised is released by the provider, not
            by this store.
          </p>
        )}
        {view.kind === "not-found" && (
          <p className='mb-8 mt-6 text-sm text-perce-ink-muted'>
            If you have just placed an order, open the confirmation link from
            your order history instead of this page.
          </p>
        )}

        {/* Actions */}
        {view.kind !== "loading" && (
          <div className='mt-6 flex flex-col justify-center gap-3 sm:flex-row'>
            <Button asChild variant='outline' className='min-h-11 gap-2'>
              <Link href='/'>
                <Home aria-hidden className='h-4 w-4' />
                <span className='text-xs md:text-sm'>Back to home</span>
              </Link>
            </Button>
            <Button asChild className='min-h-11 gap-2'>
              <Link href='/shop'>
                <ShoppingBag aria-hidden className='h-4 w-4' />
                <span className='text-xs md:text-sm'>Continue shopping</span>
              </Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
