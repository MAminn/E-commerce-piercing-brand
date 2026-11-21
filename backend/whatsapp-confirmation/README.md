# WhatsApp order confirmation

Automatic confirmation of new COD orders over the WhatsApp Cloud API, sent from the
dedicated confirmation number (+20 150 311 3922). The customer-support number
(+20 10 35790911, WABA `1576999750297285`, phone id `1287052047834595`) is never
used: boot refuses pilot/live if it is configured as the sender, and webhook events
for any other phone number id are ignored.

## Flow

1. Order committed (COD) → `queueWhatsAppConfirmation` (create-order service, after the
   order-email queue). Writes `wa_order_confirmation` + `wa_outbox` once
   (unique `order_id` / `dedupe_key`). Never throws, never calls Meta.
2. Worker (`worker.ts`, every 15 s) claims due outbox rows with `FOR UPDATE SKIP LOCKED`,
   re-checks the order is still `pending`, the row's checkout consent and that the
   current mode may message the number, respects pause + daily cap, sends the
   `order_confirmation_ar` template with three quick replies whose payloads are
   `wa1:<c|m|x>:<token>`.
3. Webhook `POST /api/webhooks/whatsapp` (HMAC `X-Hub-Signature-256`) stores every event
   once in `wa_inbound_event`, answers 200, then processes it:
   - **confirm** → `pending → processing` through `applyOrderStatusChange` (system actor,
     note `[WA auto] …`) — only if still pending, not archived, no ABS link/decision,
     the mode may act on that number, and the row carries checkout consent;
   - **modify / cancel** → staff review item only (no order or stock change);
   - free text / unmatched / failed delivery → staff review item.
4. Scheduler (every 10 min): one reminder after 24 h, follow-up item after 48 h,
   `superseded` once staff moved the order themselves.

## Modes (`WHATSAPP_CONFIRM_MODE`)

| Mode | Checkout opt-in box | Recorded | Sends | Changes orders |
|---|---|---|---|---|
| `off` (default) | hidden | nothing (no query at all) | no | no |
| `shadow` | hidden | every eligible COD order, without asking (`consent_source = 'shadow_not_asked'`), payload stored as `shadow_skipped` | no | no (records `would_apply`) |
| `pilot` | shown only once the shopper types an allow-listed mobile number | allow-listed + ticked → queued; allow-listed + not ticked → `ineligible: no_consent`; any other number → shadow record | only to allow-listed numbers that **ticked** the box | only for those |
| `live` | shown to everyone, never pre-ticked | ticked → queued; not ticked → `ineligible: no_consent` | only to orders whose box was **ticked** | yes (confirm only) |

**Consent:** only the shopper's own tick at checkout (`consent_source = 'checkout'`,
`consent_at` set) allows a real send. The pilot allow-list decides who *may* be
messaged; it is never consent. The rule is enforced three times: at enqueue, by the
worker right before sending, and when a reply arrives (a confirm on a row without
consent is recorded with `status_skip_reason = 'no_consent'` and never changes the
order). In pilot the worker also re-checks the allow-list, so a row queued under live
is deferred, not sent, while the app runs pilot. Rules: `eligibility.ts`.

Shadow records made without asking open no staff item (an invalid or opted-out number
is just listed); those items are opened only when the shopper ticked the box.

Effective mode is `off` without migration 0073; pilot/live fall back to `shadow` when
any credential is missing. `wa_settings.paused` turns pilot/live into shadow at runtime
(the checkout box follows the effective mode, not the pause).

## Isolation guarantees

- No foreign keys from `wa_*` to `order` (no locks on website tables).
- No new `order_log` actions — the ERP export ships `order_log` events, so the only
  thing the ERP ever sees from this feature is the normal `status_changed` row of a
  confirmation.
- ABS live counts non-`[ABS auto]` status changes as human changes; confirmation never
  touches an order that has an ABS link or decision.
- Order emails are untouched (separate queue, separate code path).

## Failure handling

| Outcome | Action |
|---|---|
| 2xx + message id | `sent` |
| HTTP 429, throttling codes (4, 80007, 130429, 131056), DNS / connection refused before send | retry with backoff (1 m, 5 m, 30 m, 2 h), max 5 |
| permanent (e.g. 131026, template/auth errors) | `failed` + staff item |
| timeout / no response, any other 5xx, 2xx without a message id | `failed:ambiguous` + staff item; **never re-sent** (could duplicate). `biz_opaque_callback_data` lets a later status webhook recover the wamid |

## Tests

- `__tests__/unit.test.ts` — config, phone, payload, signature, webhook parsing, Graph client, decision matrix.
- `__tests__/whatsapp-confirmation.integration.test.ts` — real Postgres (`TEST_DATABASE_URL`).

## Admin

`/dashboard/whatsapp-confirmations`: KPIs, staff queue (take / done / dismiss with note),
confirmation list by state, pause/resume, and (shadow only, superadmin) simulated replies.
