# ABS courier tracking — Phase 1 (shadow, read-only)

## Purpose

Percé ships through ABS (Egyptian courier). ABS staff key our shipments into
ABS by hand, and today the **Reference field is empty**, so ABS does not know
our order numbers. Phase 1 builds the foundation for following those
shipments from the website:

- poll ABS's read-only Client API for shipments that changed;
- keep a local mirror of each shipment and its status history;
- link each airway bill (AWB) to a website order (Reference when ABS starts
  filling it, otherwise phone + COD amount + date window);
- record what the website **would** do (mark shipped, mark delivered, ask for
  a return confirmation, raise an alert) in an audit table.

**Nothing in Phase 1 changes an order, its stock, `order_log`, emails or the
ERP sync.** Decisions are recorded with `applied = false` and are never
applied. All writes go to new `abs_*` tables.

Code: `backend/shipping-tracking/abs/`, config `shared/config/abs-tracking.ts`,
migration `shared/database/migrations/0070_abs_tracking.sql`, scripts
`scripts/abs-tracking/`.

## Modes

| `ABS_TRACKING_MODE` | Behaviour |
|---|---|
| `off` (default, unset, or any unknown value) | Nothing starts. No ABS request, no query against `abs_*`. One boot line: `[ABS tracking] off (…)`. |
| `shadow` | Poller runs; writes `abs_*` only; decisions recorded, never applied. |
| `live` | **Not implemented in this build.** Treated as `shadow`, with one boot warning: `live requested but not available in this build; running shadow`. |

The effective mode stays `off` unless, at boot, `ABS_API_BASE_URL` is a valid
`https://` URL, `ABS_API_KEY` is set, **and** the readiness check finds all six
`abs_*` tables and the two unique indexes the poller relies on
(`backend/shipping-tracking/abs/readiness.ts`). The worker is started from
`server/server.ts` next to the GA4 purchase worker; any boot error is caught
and logged, the server still starts.

## Environment variables (names only)

| Name | Default | Notes |
|---|---|---|
| `ABS_TRACKING_MODE` | `off` | `off` \| `shadow` \| `live` (= shadow in this build) |
| `ABS_API_BASE_URL` | — (required) | `https://` only; no credentials, query or fragment. **No default** — production base URL not yet confirmed by ABS. |
| `ABS_API_KEY` | — (required) | Read-scope key (Shipments: Read, Tracking: Read, Wallet: Read). Env only; never logged, redacted as `***`. |
| `ABS_POLL_INTERVAL_MS` | `600000` | Floor `300000` (a lower value uses the floor + a warning). |
| `ABS_POLL_OVERLAP_MS` | `1800000` | Each window starts this far before the watermark. |
| `ABS_BACKFILL_FROM` | `2026-11-01` | First run. `YYYY-MM-DD` = Cairo midnight; or ISO with offset. |
| `ABS_MATCH_WINDOW_DAYS` | `10` | Orders created in [shipment created − N days, + 1 day]. |
| `ABS_COD_TOLERANCE_EGP` | `1` | Allowed \|expected COD − ABS COD\|. |

## How a tick works (`worker.ts`)

1. `pg_try_advisory_lock(7310420001)` on a dedicated pooled connection
   (rolling deploys can briefly run two containers). Not acquired →
   `abs_sync_run` row `skipped_locked`, stop.
2. Window: `from = (watermark ?? ABS_BACKFILL_FROM) − overlap`, `to = now`.
3. `POST /api/v1/shipments/list` with `lastChangeDateFrom/To` (Cairo offset),
   `timezone: "Africa/Cairo"`, `limit: 100`, `isExport: false`, the column list,
   and `cursor` (or `page` when ABS returns no cursor). At most 50 pages.
4. Per shipment: upsert `abs_shipment`; insert a `poll` history row (deduped);
   if the AWB has no link, or its link is `unmatched` / `needs_review`, run the
   matcher and upsert the link (`confirmed` / `rejected` are never touched);
   read the linked order's status (SELECT only); record the decision by
   `dedupe_key` (a repeat only bumps `seen_count` / `last_seen_at`).
5. Watermark advances to `to` **only** after a fully successful run. Page cap,
   a failed page after page 1, a per-shipment error or shutdown → `partial`;
   a failure on page 1 → `failed`. Either way the watermark is kept and the
   next tick re-reads the same window.

A tick never throws into the server: errors are redacted (key → `***`, digit
runs → last 4) and stored in `abs_sync_run.error` (≤ 500 chars). Ticks never
overlap in-process. On SIGTERM/SIGINT the worker stops between shipments
(waits ≤ 5 s) and then lets the signal take its normal effect.

## ABS client (`client.ts`)

Read-only allow-list — any other method/path throws **before** fetch is
called, and there is no generic request function:

| Method | Path |
|---|---|
| POST | `/api/v1/shipments/list` |
| GET | `/api/v1/tracking/:awb` |
| GET | `/api/v1/tracking/:awb/history` |
| POST | `/api/v1/tracking/bulk` (chunks of ≤ 100) |

AWBs must match `[A-Za-z0-9_-]{1,64}`. Requests are sequential and ≥ 300 ms
apart; network errors, timeouts (15 s), 5xx and 429 are retried (3 attempts
total, exponential backoff with jitter, `Retry-After` honoured, capped at
60 s); other 4xx are not retried. Every response is validated with zod
(`parse.ts`): extra fields pass, numbers may be strings; a row that does not
validate is skipped and logged once per distinct problem. If ABS answers
400/422 naming exactly one requested column, that column is dropped and the
request repeated (logged once). Phase 1's poller only calls
`/shipments/list`; the three tracking calls exist for Phase 2.

## Data model (migration 0070, all new tables)

| Table | What |
|---|---|
| `abs_shipment` | One row per AWB: reference, service, raw + canonical status, event code, reason, cash / collected / fees, paid flag + dates, ABS created date, normalised phone + last 4, pieces, origin AWB, validated raw row, first/last seen, status changed at. |
| `abs_shipment_status_history` | Distinct statuses per AWB. Unique on (awb, status, coalesce(occurred_at, epoch)). Poll rows carry `occurred_at` = delivery date for delivered-family statuses, else NULL. |
| `abs_order_link` | One link per AWB → `order(id)` (FK **ON DELETE SET NULL**, on this table only). `link_role` primary/reverse/exchange/other, `state` auto/needs_review/confirmed/rejected/unmatched, `method`, `reason_code`, `confidence`, ranked `candidates` (order id + number + reasons; no PII). Partial unique: one `primary` link in `auto|confirmed` per order. |
| `abs_tracking_decision` | Shadow audit trail. `dedupe_key = awb|shipment status|order status|decision` (unique). `mode = shadow`, `applied = false`. |
| `abs_sync_run` | One row per tick incl. skipped ones: trigger, outcome, window, pages, counters, redacted error. `outcome` NULL = running / interrupted. |
| `abs_sync_state` | Single row (`id = 1`, CHECK): watermark. |

Status, state, role and decision are `text` (no new enum types), so later
phases never need an enum migration.

## Normalisation (`normalize.ts`)

- Phone → national 10-digit mobile without the leading 0
  (`+20 100 123 4567`, `01001234567`, `201001234567`, `0020…`, Arabic-Indic
  digits → `1001234567`), else NULL. The operator digit is not checked so a
  mistyped second digit can still be fuzzy-matched.
- Status: enum (`OUT_FOR_DELIVERY`), display text (`Out for Delivery`) and
  event codes (`SHP_DLVD`, `SHP_DLVD_RVRT`, `SHP_PRTL_DLVD`, `SHP_RTN_SHPR`,
  `SHP_HOLD`, `SHP_UNDLVD`) map to one canonical status.
  `SHP_PRTL_DLVD` → `PARTIALLY_DELIVERED` and `SHP_DLVD_RVRT` →
  `DELIVERY_REVERTED` override the status column; other codes only fill in
  when the status is unrecognised. Anything else → `UNKNOWN` (never acted on).
- Dates with an offset are taken as given; naive ones as Cairo wall time.

## Matching (`matcher.ts`)

Candidates: orders created in [ABS created − `ABS_MATCH_WINDOW_DAYS`, + 1 day]
(phones normalised in JS because `order.customer_phone` is free text), plus
any order whose number appears in the Reference (5–8 digit runs, `#` optional).
**Expected COD** = order total, or 0 for an online order already `paid`.

| # | Condition | Result |
|---|---|---|
| 1 | Reference names an order **and** its phone equals the shipment's | `auto`, method `reference` (100). Referenced but phone differs → `needs_review` `reference_phone_mismatch`. Order already primary-linked elsewhere → `needs_review` `order_already_linked`. |
| 2 | `cmp_service` REVERSE / EXCHANGE / CASH_COLLECTION | Never `auto`. `needs_review` with role reverse/exchange/other; exact-phone orders in the window listed. |
| 3 | Exactly one order: exact phone, \|expected COD − cash\| ≤ tolerance, in window, not cancelled, not primary-linked to another AWB | `auto`, method `phone_amount` (90). |
| 4 | Several pass rule 3 | `needs_review` `multiple_candidates`, all listed, none picked. |
| 5 | No exact phone; fuzzy phone (same length, ≤ 2 differing digits — covers one adjacent transposition) with amount + window | `needs_review`, method `phone_amount_fuzzy`. Never auto. |
| 6 | Phone matches, amount differs | `needs_review` `cod_mismatch` (e.g. order 320, ABS COD 350). Only cancelled orders fit → `cancelled_order_match`. No COD amount → `no_cod_amount`. |
| 7 | Nothing | `unmatched` (`no_candidate` / `no_phone`). |

Links in `confirmed` or `rejected` are never overwritten. A unique-index race
on the primary slot falls back to `needs_review` `order_already_linked`.

## Rule engine (`rules.ts`) — recorded only, never applied

| Shipment (canonical) | Website order | Decision (reason) |
|---|---|---|
| any, link not auto/confirmed primary | — | `no_action` (`unlinked` / `link_needs_review`); DELIVERED or RETURNED_TO_SHIPPER → `alert unlinked_terminal`; LOST/DAMAGED/… → `alert unlinked_<status>` |
| link role reverse / exchange / other | any | `no_action`, or `alert <role>_shipment_<status>` for problem statuses — never a decision on the order |
| NEW, AWAITING_PICKUP | any | `no_action not_picked_up` |
| PICKED_UP … OUT_FOR_DELIVERY | pending / processing | `would_mark_shipped in_transit` |
| transit | shipped / delivered / cancelled | `no_action` (never backwards) |
| DELIVERED, \|collected (or cash) − expected\| ≤ tol | pending / processing / shipped | `would_mark_delivered` |
| DELIVERED, amount differs or missing | not delivered, not cancelled | `alert cod_mismatch` |
| DELIVERED | delivered | `no_action already_delivered` |
| DELIVERED | cancelled | `alert delivered_but_cancelled` |
| PARTIALLY_DELIVERED / DELIVERY_REVERTED | any | `alert partially_delivered` / `delivery_reverted` |
| UNDELIVERED, HOLD_DECISION, REOPERATE | any | `alert delivery_problem` |
| RETURN_INITIATED … OUT_FOR_RETURN | any | `no_action returning` |
| RETURNED_TO_SHIPPER | not cancelled / not delivered | `needs_return_confirmation` (returns are always confirmed by a person after physical receipt) |
| RETURNED_TO_SHIPPER | delivered | `alert returned_after_delivered` |
| RETURNED_TO_SHIPPER | cancelled | `no_action returned_order_already_cancelled` |
| LOST, DAMAGED, INVESTIGATION, CANCELED, REROUTE_INITIATED, STOCK_IN, UNDER_REVISION, UNKNOWN | any | `alert` (`status_<x>` / `unknown_status`) |

## Admin visibility

`absTracking.summary` (tRPC, `adminProcedure`, query only): effective and
requested mode, readiness, watermark, last 10 runs, link-state counts,
decision counts, latest 50 decisions and up to 50 review items. Phones appear
as last 4 digits; no names, no raw rows. No mutations in Phase 1; no page yet.

## Running locally from fixtures (no ABS, no key)

Synthetic fixtures (fake names, phones `0100000xxxx`, order numbers 9100001+)
live in `backend/shipping-tracking/abs/__tests__/fixtures/`. Against a
**local** Postgres that has the schema (and some orders):

```bash
export DATABASE_URL=postgresql://postgres:test@localhost:55450/abs_demo   # local only
npx tsx scripts/abs-tracking/run-once.ts --input backend/shipping-tracking/abs/__tests__/fixtures/shipments-list.json --dry-run
npx tsx scripts/abs-tracking/run-once.ts --input backend/shipping-tracking/abs/__tests__/fixtures/shipments-list.json
npx tsx scripts/abs-tracking/report.ts
```

- `run-once.ts` — one tick. `--dry-run`: no DB writes, prints what would be
  written. `--input <file>`: reads a saved `/shipments/list`-shaped JSON
  instead of calling ABS; the poll watermark is not moved. Without `--input`
  it calls ABS using `ABS_API_BASE_URL` / `ABS_API_KEY`.
- `report.ts` — counts by link state, decisions by type, latest runs,
  non-trivial decisions and the review queue.
- Both refuse a `DATABASE_URL` whose host is not `localhost`, `127.0.0.1`,
  `::1` or the docker service name `postgres`, unless
  `--i-know-this-is-not-local` is passed. **Do not pass it.**

Tests: `npx vitest run backend/shipping-tracking` (unit) and, with a
disposable Postgres, `TEST_DATABASE_URL=… npx vitest run
backend/shipping-tracking` (adds the integration suite: migration on a fresh
DB and on a DB at 0069, full fixture tick, idempotent re-tick, no-write proof
over every existing table, advisory lock, partial failure, mode off).

## Rollback

- Phase 1 is not deployed. If it ever is: `ABS_TRACKING_MODE=off` (or unset)
  and restart → fully inert (no ABS request, no `abs_*` query).
- The `abs_*` tables can stay (unused) or be dropped with
  `docs/ABS_TRACKING_ROLLBACK.sql` after a backup (documentation only; never
  run by the app).
- No existing row, column, index or enum is altered by this phase, so there is
  no data rollback.

## Not confirmed by ABS (open)

- **Production base URL** — hence no default; must come from env.
- **Permission of a Read-scope key for `POST /shipments/list`** (a POST used
  for querying) and for `/tracking/bulk`.
- **Rate limits** — undocumented; we stay sequential, ≥ 300 ms apart, honour 429.
- **`isPaid` / `paymentDate` semantics** (COD remitted to us vs. collected from
  the customer) — stored, not used by any rule.
- **History retention** — how far back `/shipments/list` and
  `/tracking/:awb/history` go.
- Whether `lastChangeDateFrom/To` are inclusive, and the exact pagination
  contract when `nextCursor` is null (we fall back to `page` + `hasMore`).
- Whether unknown `columns[]` entries are rejected (handled: dropped once).
- Whether ABS will reliably type our order number into Reference.
