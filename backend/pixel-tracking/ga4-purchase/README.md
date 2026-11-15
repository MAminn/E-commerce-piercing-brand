# GA4 server-owned purchase (`GA4_PURCHASE_OWNER`)

GA4's `purchase` event is sent from the **verified backend order** through a
durable outbox, instead of depending on the shopper's browser reaching
`/order-confirmation`.

Every other GA4 event, the Meta pixel, the `/api/track` beacon and Meta CAPI
work exactly as before in every mode. The legacy every-event mirror
(`GA4_MP_MODE=legacy_all`) is a separate switch. It stays off and is not
used here.

## Modes

| `GA4_PURCHASE_OWNER` | Browser GA4 `purchase` | Server rows written | Requests to GA4 |
|---|---|---|---|
| `browser` (default, also unset or unknown) | sent, as today | none | none |
| `shadow` | sent, as today | context + outbox (`status=shadow`), payload prepared | **none** |
| `server` | **skipped** (only `purchase`) | context + outbox (`status=pending`) | worker sends |

**Requested vs effective mode.** The env value is the *requested* mode. The
*effective* mode stays `browser` until the boot check
(`readiness.ts`) finds three things from migration 0069: both tables, and the
unique index on `order_id`.

The SSR flag the page receives (`trackingFlags.ga4BrowserPurchase`) and every
server path read the effective mode. A missing migration therefore can never
leave a purchase that nobody sends.

**Rollback:** set `GA4_PURCHASE_OWNER=browser` (or remove it) and restart.

## When an order becomes a purchase (`eligibility.ts`)

- **COD:** at persisted creation, in the same transaction as the order insert
  (`order.create`). A later edit of a COD order never enqueues.
- **Online:** at the transition to `paid`, in the same transaction as that
  update. The writers are:
  - `applyOnlinePaymentUpdate`, used by the Paymob webhook and both
    `payment.verify` paths. Now under `SELECT … FOR UPDATE`, so racing
    callbacks are serialised.
  - the Stripe webhook (same row lock).
  - admin `editOrder`, when staff move an online order to `paid`.
- **Never:** pending, processing, failed or refunded payments; cancelled
  orders; any other update.
- **At most one row per order:** `UNIQUE(order_id)` plus
  `ON CONFLICT DO NOTHING`.

Enqueue runs in a savepoint. If it fails, only the GA4 row rolls back, and a
fixed message is logged. The order always commits. The order then shows in
the diagnostics `gapOrders` list and is **not** re-sent automatically.

## Attribution and privacy

`order.create` is the only request in an order's life that carries the
shopper's cookies; payment webhooks carry none. It stores:

- `ga_client_id` from `_ga`
- `ga_session_id` and session number from `_ga_<measurement id>` (both the
  `GS1` and `GS2` formats)
- the `_tracking_consent` decision

A value is stored only if it has exactly the shape gtag.js writes; otherwise
NULL. Nothing is generated. The tRPC context exposes only those cookies.

Payload (`payload.ts`):

- `transaction_id` = order UUID, `value` = `order.total`, `currency` = `EGP`
- items aggregated exactly like the browser purchase (test-enforced parity)
- `client_id`, `session_id`, `engagement_time_msec: 1`
- `timestamp_micros` = the milestone time
- `consent` signals only when the shopper made an explicit marketing choice

The payload contains no name, email, phone, address, IP or user agent. Logs
carry the order UUID, status codes and reason codes only, never the payload
or the URL that holds the API secret.

Policy that needs an owner decision is **held, not decided**:

- no `_ga` cookie → `held / missing_client_id`
- the GA4 row requires consent and it isn't granted →
  `held / consent_not_granted`

## Delivery (`worker.ts`, `transport.ts`)

**Claiming.** The worker claims due rows with `FOR UPDATE SKIP LOCKED` and a
60 s lease. It writes a fresh `claim_token` on each claim; only the holder of
that token can record the outcome. Due rows are:

- `pending` rows whose `next_attempt_at` has passed
- `sending` rows whose lease expired (a crashed worker)

**Outcomes:**

| Result | Next state |
|---|---|
| 2xx | `sent` |
| 429, 5xx, connection refused or DNS failure | retry |
| timeout, connection reset | retry, counted in `ambiguous_attempts` |
| other 4xx | `failed` |
| invalid payload | `failed` (never sent) |
| older than 71 h (GA4 accepts 72 h) | `failed / expired_72h` |

**Retries.** Backoff runs 30 s → 1 h, for at most 10 requests (about 3 h).
The body is frozen on first build, so every retry is identical.

**Missing config.** If the GA4 row is missing, disabled, or has no API secret
(`pixel_config.access_token`), the worker claims nothing, burns no attempts,
and logs why.

**Exactly-once is NOT claimed.** Delivery is at-least-once with bounded
retries. A retry after an ambiguous attempt can reach GA4 twice. Both copies
carry the same `transaction_id`, which GA4 uses to de-duplicate purchases in
processed reports (Realtime and DebugView may still show both). The exposure
is counted per row in `ambiguous_attempts`.

## Diagnostics

`pixelTracking.ga4Purchase.diagnostics` is admin-only and read-only. It
returns:

- counts by status and held reason
- attribution coverage: missing client id, missing session id, consent
  unknown
- age of the oldest pending row
- the number of rows with ambiguous attempts
- `gapOrders`
- shadow coverage: candidates with vs without a browser purchase beacon
- recent problems (order id and number only)

### `gapOrders` baseline and the restart caveat

An order is listed as a gap only if it was placed after the gap baseline and
has no outbox row. The baseline is the earlier of:

- the first outbox row ever written (`min(created_at)`), and
- the moment **this process** started the current shadow/server mode
  (`effectiveGa4PurchaseOwnerSince()`, set by the boot readiness check).

Orders placed before activation are never gaps (no backfill). Before
2026-11-15, an empty outbox made the first term NULL, `GREATEST` ignored it,
and every order in the window was listed.

**Restart caveat.** The second term lives in memory and resets on every boot
or redeploy. It only matters while the outbox is **completely empty**. That
is the case right after activation, or when every enqueue since activation
has failed. Orders placed before the latest restart then drop out of
`gapOrders`; orders placed after it are still listed. Once one outbox row
exists, the first term pins the baseline and restarts change nothing. If
`gapOrders` is empty but orders exist, check `byStatus` too: an outbox with
zero rows while orders are being placed in shadow/server mode is itself the
failure signal.

## Not done here (owner decisions)

- No refund events on cancellation.
- No historical backfill.
- No release of `held` rows.
- No sending of `pending` rows after a rollback to `browser`.
