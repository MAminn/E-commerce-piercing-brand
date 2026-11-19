# ABS courier tracking — Shadow and Live (Delivered only)

## Purpose

Percé ships through **ABS** (Egyptian courier). **Since 18 Nov 2026 ABS is the
only courier** (owner decision); the private courier is retired. This feature
follows our ABS shipments from the website:

- poll ABS's read-only Client API for shipments that changed;
- keep a local mirror of each shipment and its status history;
- link each airway bill (AWB) to a website order (Reference when it holds our
  order number, otherwise phone + COD amount + date window);
- record what the website **would** do (mark shipped, mark delivered, ask for
  a return confirmation, raise an alert) — **Shadow**;
- let an admin review matches and alerts on `/dashboard/abs-tracking`;
- measure Shadow against what admins actually did (the validation report),
  which is the gate before anyone proposes live mode.

**Nothing in Shadow changes an order, its stock, `order_log`, emails or the
ERP sync.** Decisions are recorded with `applied = false`. Every write — the
poller's and every button on the screen — goes to `abs_*` tables only. The
screen says so: *"Shadow mode: nothing on the website changes."*

**Live mode** (Phase 4, `ABS_TRACKING_MODE=live`) adds exactly one automatic
change: when ABS reports a shipment DELIVERED and every rule in
[Live mode](#live-mode-delivered-only) passes, the linked order goes
`pending | processing | shipped → delivered` **through the same code the
admin's status change uses** (`applyOrderStatusChange`). The ERP then records
the sale, COGS, stock-out and courier receivable on its next sync, exactly as
for an admin change. Nothing else is ever automated: no cancel, no restock, no
returns, no totals, items, payment or customer data.

Code: `backend/shipping-tracking/abs/` (live: `live-rules.ts`, `live.ts`,
`live-monitor.ts`), the shared status core
`backend/orders/update-order-status/apply-status-change.ts`, config
`shared/config/abs-tracking.ts`, migrations `0070_abs_tracking.sql`,
`0071_abs_tracking_review.sql`, `0072_abs_live.sql`, scripts
`scripts/abs-tracking/`, page `pages/dashboard/abs-tracking/`. Operations:
[ABS_TRACKING_SHADOW_RUNBOOK.md](ABS_TRACKING_SHADOW_RUNBOOK.md) and
[ABS_TRACKING_LIVE_RUNBOOK.md](ABS_TRACKING_LIVE_RUNBOOK.md).

## Modes

| `ABS_TRACKING_MODE` | Behaviour |
|---|---|
| `off` (default, unset, or any unknown value) | Nothing starts. No ABS request, no query against `abs_*`. One boot line: `[ABS tracking] off (…)`. The screen says "ABS tracking is off"; every procedure except `overview` refuses; `overview` makes no query. |
| `shadow` | Poller runs; writes `abs_*` only; decisions recorded, never applied. The screen works. |
| `live` | Shadow **plus** the live writer (Delivered only). Needs migration 0072 and a valid `ABS_LIVE_TRANSITIONS`; otherwise it runs `shadow` and the boot line / status bar say why. `ABS_LIVE_REQUIRE_APPROVAL=true` (default) = eligible orders wait for the owner's button. A DB pause flag turns it back into shadow at runtime. |

The effective mode stays `off` unless, at boot, `ABS_API_BASE_URL` is a valid
`https://` URL, `ABS_API_KEY` is set, **and** the readiness check finds all
seven `abs_*` tables, the two unique indexes the poller relies on, and every
0071 column (`backend/shipping-tracking/abs/readiness.ts`). A missing or
invalid key/URL gives `off` with a clear boot line — no exception, no crash
loop, no timer. The decision (requested mode, effective mode, reason,
readiness) is shown in the screen's status bar via `absTracking.overview`.

## Environment variables (names only — never values)

| Name | Default | Notes |
|---|---|---|
| `ABS_TRACKING_MODE` | `off` | `off` \| `shadow` \| `live` |
| `ABS_API_BASE_URL` | — (required) | `https://` only; no credentials, query or fragment. No default. |
| `ABS_API_KEY` | — (required) | **Secret.** Read-scope key; set by the owner as a Coolify secret. Never logged (redacted as `***`). |
| `ABS_POLL_INTERVAL_MS` | `600000` | Floor `300000`. |
| `ABS_POLL_OVERLAP_MS` | `1800000` | Each new window starts this far before the watermark. |
| `ABS_BACKFILL_FROM` | `2026-11-01` | First window. `YYYY-MM-DD` = Cairo midnight. |
| `ABS_MAX_PAGES_PER_TICK` | `20` | Pages of 100 per tick (1–50); a bigger window continues on the next tick. |
| `ABS_TICK_TIMEOUT_MS` | `300000` | Total time budget of one tick (≥ 30000); checked between pages. |
| `ABS_MATCH_WINDOW_DAYS` | `10` | Primary shipments: orders created in [ABS created − N days, + 1 day]. |
| `ABS_REVERSE_WINDOW_DAYS` | `45` | REVERSE / EXCHANGE / other shipments: suggestions only, exact phone, never auto. |
| `ABS_COD_TOLERANCE_EGP` | `1` | Allowed \|expected COD − ABS COD\|. |
| `ABS_ONLY_SINCE` | `2026-11-18` | ABS-only policy start (Cairo date). Orders placed before it never raise "no ABS shipment". |
| `ABS_MISSING_AWB_ALERT_DAYS` | `2` | A processing/shipped order with no ABS shipment is listed after this many days. |
| `ABS_LIVE_TRANSITIONS` | `delivered` | Live only. The only valid value; anything else (e.g. `cancelled`, `delivered,cancelled`, a typo) keeps live off → shadow, with a boot warning. |
| `ABS_LIVE_REQUIRE_APPROVAL` | `true` | Live only. `true`: eligible items are listed as "Ready to mark Delivered (N)" and applied only by the button. `false` / `0` / `no` / `off`: applied automatically each tick. |
| `ABS_LIVE_SETTLE_MINUTES` | `30` | Live only. DELIVERED must be stable this long (from the later of ABS's last DELIVERED event and our first sighting). |
| `ABS_LIVE_MAX_AGE_DAYS` | `14` | Live only. Older deliveries go to "Needs your attention" for a one-click approve. |
| `ABS_LIVE_MAX_PER_TICK` | `10` | Live only. Automatic applications per tick. |
| `ABS_LIVE_DAILY_CAP` | `40` | Live only. Applications per Cairo day (automatic + approved). Beyond it: stop and alert. |
| `ABS_ALERT_EMAILS` | — | Live only. Alert + digest recipients (same parser as `ORDER_NOTIFICATION_EMAILS`); unset → `ORDER_NOTIFICATION_EMAILS`; neither → nothing is sent (logged once per alert window). |

## ABS-only policy and the Reference convention

- Every order confirmed or shipped from 18 Nov 2026 should get an ABS AWB.
  **"Orders with no ABS shipment"** lists `processing` / `shipped` orders
  placed on or after `ABS_ONLY_SINCE`, older than `ABS_MISSING_AWB_ALERT_DAYS`,
  with no `auto` / `confirmed` primary link. Legacy private-courier orders
  (placed before the cut-off) are exempt. If a shipment that lists the order
  as a candidate is waiting for review, the row says so.
- **Reference convention:** when creating a shipment at ABS, type the website
  order number (e.g. `10180`) into **Reference**. Matcher rule 1 then links it
  automatically (when the phone also matches). Phone + amount stays the
  fallback. The probe reports how often Reference holds an order number.

## How a tick works (`worker.ts`)

1. **Backoff** (scheduled ticks only): if the latest stored run failed and its
   `backoff_until` is in the future, the tick returns `skipped_backoff` (not
   stored, logged once). "Check ABS now" ignores the backoff.
2. `pg_try_advisory_lock(7310420001)` on a dedicated pooled connection. Not
   acquired → run row `skipped_locked`.
3. **Window:** if `abs_sync_state.resume_*` is set, continue that window from
   the stored page / cursor; else `from = (watermark ?? ABS_BACKFILL_FROM) −
   overlap`, `to = now`.
4. `POST /api/v1/shipments/list` page by page (100 per page; the real response
   envelope is described in [the list contract](#the-real-shipmentslist-contract-verified-18-nov-2026)), at most
   `ABS_MAX_PAGES_PER_TICK` pages and within `ABS_TICK_TIMEOUT_MS` (checked
   between pages; a fetched page is always processed). After every page of a
   multi-page window the resume point is saved, so a cap, the time budget, a
   failure or a restart **continues** instead of starting over. A resumed
   cursor that ABS refuses with a non-retryable 4xx clears the resume point
   (the window restarts next time).
5. Per shipment: upsert `abs_shipment`; insert a `poll` history row (deduped);
   re-run the matcher if the link is missing / `unmatched` / `needs_review`
   (`confirmed` / `rejected` are never touched; an AWB a human has touched is
   never auto-linked again — the matcher may only propose); record the shadow
   decision by `dedupe_key`.
6. **Recompute pass** (up to 200 AWBs, from stored data, even if ABS failed):
   links a human changed on the screen (`recompute_requested_at`), and linked
   AWBs whose latest decision saw a different website status or total than
   the order has now (SELECT on `order`). This is how a confirm/reject/unlink
   or an admin's status change shows up without a change at ABS.
7. **Live mode only** (effective mode `live`, not paused, ABS did not fail this
   tick): the live pass (`live.ts`), on the fresh decisions, still under the
   tick lock — see [Live mode](#live-mode-delivered-only).
8. The watermark advances to `to` (and the resume point clears) **only** when
   the window is complete. A failed run stores `backoff_until = finish +
   min(interval × 2^(n−1), 1 h)` (n = consecutive failed runs; a longer
   429 `Retry-After` wins, still ≤ 1 h).

Each decision row also stores a snapshot for the live writer's
compare-and-set: `order_status_at_decision`, `order_total_at_decision`,
`abs_delivery_date`, refreshed on every sighting. `mode` records the effective
mode the row was written in (`shadow` / `live`).

### The real `/shipments/list` contract (verified 18 Nov 2026)

ABS answers **HTTP 201** with the page object wrapped once more:

```json
{ "success": true, "message": "…", "data": { "data": [ …rows… ], "hasMore": true, "nextCursor": "…" } }
```

The documented flat body `{ data: [], hasMore, nextCursor }` is also accepted
(`parse.ts`, `unwrapListEnvelope`). `success: false` or any other shape throws
(an empty page there must never advance the watermark). `consigneePhone` is an
**array** of 12-digit `20…` strings (an exact match on any of them counts);
money comes as strings; `cmpService` is returned in every row but ABS rejects
it as a requested column, so it is not requested. Extra fields (`subAccountId`,
`isUnderRevision`, `currentBranchId`) are kept in `raw`; live mode reads
`raw.isUnderRevision`.

## The review screen (`/dashboard/abs-tracking`)

Sidebar: **Catalog → ABS Tracking**. Admin only (page guard + `adminProcedure`).
Phone numbers appear as their last 4 digits; no customer names or addresses.
Usable on a phone (stacked cards, inline note forms, no wide tables).

Top of the page, in plain language (Phase 4 layout):

1. **Status bar** — mode badge (**Off / Shadow / Live / Live – approval /
   Paused**), last check, health (consecutive failures, last success),
   "Marked Delivered automatically today: N / cap", **Pause** / **Resume**
   (live only) and **Check ABS now**.
2. **Needs your attention (N)** — one list, grouped: ABS sync failing;
   ambiguous match (needs a decision); amount differs / delivered then
   returned or disputed / problems at ABS; returned, waiting for you to
   receive it; delivered more than 14 days ago (approve); could not mark
   Delivered automatically (live); orders with no ABS shipment. Each row has its
   action (confirm / reject / link / acknowledge / approve / don't mark
   automatically).
3. **Ready to mark Delivered (N)** — approval mode only, with **Mark these N
   Delivered** (two-step confirm).
4. **Done automatically** — today and the last 7 days: order number, AWB last
   4, time, automatic or approved by whom, and **Undo**.
5. **Details** (collapsed): Would mark Delivered, Shadow accuracy, All
   shipments, History — the Phase 2 sections below, unchanged.

| # | Section | What it shows |
|---|---|---|
| 1 | Status bar | Mode badge (Off / Shadow), last check "x min ago" + outcome, backoff / catch-up notes, unknown-status warning, **Check ABS now** (disabled in Off and during the 2-minute cooldown, with the remaining seconds). |
| 2 | Would mark Delivered | Every AWB with a `would_mark_delivered` decision in the last 14 days, with today's website status: **"already Delivered on website ✓"** / **"still Shipped on website"** / "no longer proposed". |
| 3 | Needs your decision | `needs_review` / `unmatched` links: the shipment (AWB, ABS status, COD, phone last 4, date, why) next to ranked candidate orders (number, date, total, website status, phone last 4, reasons). Actions: **Confirm** per candidate, **Not this one** (reject, note required), **Link to another order** (number + role + note required). |
| 4 | Problems | Open alerts (latest decision per AWB, not acknowledged): *Amount differs*, *Problems at ABS* (hold, undelivered, lost, reverted, #10053-type "returned after delivered", unknown status…), *Delivered or returned but not linked*. Each row: **Acknowledge** with a note. |
| 5 | Returned to us | Open `needs_return_confirmation` rows. Shows only — confirming a return on the website is Phase 4. Can be acknowledged ("seen"). |
| 6 | Orders with no ABS shipment | The missing-AWB list (policy above). |
| 7 | Shadow accuracy | The validation report's headline numbers, the live-mode targets checklist, wrong "would mark Delivered" rows and explained misses. |
| 8 | All shipments | Filters (all / needs review / not matched / problems / would change / delivered at ABS not on website / returned to us), search (AWB, order number, phone last 4), keyset "Load more". ABS status next to website status. **Unlink** on linked rows (note required). |
| 9 | History | Last 50 ABS checks and the last 100 actions (who, what, note). |

### Actions and what each writes

Every action runs in **one transaction**, locks the row it changes
(`SELECT … FOR UPDATE`), re-validates the state inside the transaction, and
writes **exactly one** `abs_audit_log` row (`actor` = admin email, `before` /
`after` = link or decision state, no PII). Repeating an action that is
already in effect is a no-op (no audit row). All refuse in `off` and for
non-admins.

| Procedure | Allowed when | Writes |
|---|---|---|
| `confirmLink({ awb, orderId })` | link `needs_review` / `unmatched` and the order is a listed candidate, or link `auto` to that same order | `abs_order_link`: `state = confirmed`, `order_id`, `decided_by/at`, recompute flag. Refused if the order already has another primary `auto|confirmed` link (CONFLICT, names the other AWB's last 4). |
| `rejectLink({ awb, note })` | any state but `rejected` | `state = rejected`, `order_id = NULL`, reason `rejected_by_admin`. The matcher never re-links it. |
| `manualLink({ awb, orderNumber, role, note })` | any state but `confirmed` (unlink first) | `state = confirmed`, `method = manual`, `link_role = role`, `order_id`. Same one-primary-per-order rule for `primary`. |
| `unlink({ awb, note })` | `auto` / `confirmed` / `rejected` | `state = needs_review`, `order_id = NULL`, reason `unlinked_by_admin`. Only this AWB's row; other AWBs' links are never touched. The next tick re-proposes candidates but will not auto-link (reason `previously_unlinked`). |
| `acknowledgeDecision({ decisionId, note })` | decision is `alert` or `needs_return_confirmation` | `abs_tracking_decision.acknowledged_at/by`, `ack_note` (≤ 500, CHECK). Hides **that row** only: a later decision for the same AWB has a new dedupe key and is shown again. |
| `pollNow()` | at most once per 2 minutes (last `manual` run in `abs_sync_run`) | One tick in the request (≤ 5 pages, same advisory lock → `skipped_locked` if a tick is running; ignores the backoff); then one `poll_now` audit row with the run summary. |

Queries (`overview`, `shipments`, `reviewQueue`, `decisions`, `actionGroups`,
`missingAwb`, `runs`, `audit`, `validation`) are SELECT-only.

## ABS API probe (`scripts/abs-tracking/probe.ts`)

Run by the owner on his own machine, with the real key only in his shell:

```bash
ABS_API_BASE_URL='https://<abs-api-host>' ABS_API_KEY='<read-scope-key>' npx tsx scripts/abs-tracking/probe.ts --days 30
```

Uses the Phase 1 client and allow-list only (no other endpoint is possible),
no retries, ≥ 300 ms between requests, **at most 40 requests**, and stops at
the first HTTP 401. It imports nothing from the database layer and refuses
to run without `ABS_API_BASE_URL` / `ABS_API_KEY` (even if `DATABASE_URL` is
set). Steps, each PASS / FAIL / INFO with HTTP statuses:

1. Auth (`/shipments/list`, page size 5, last 3 days).
2. Key permissions for each allow-listed endpoint (200 / 404 = permitted; 401 / 403 = denied).
3. Pagination contract (`nextCursor` vs `page` + `hasMore`; page size honoured; page 2 must not repeat page 1).
4. Whether `lastChangeDateFrom/To` are inclusive (needs a last-change field in the rows; otherwise INFO — the 30-min overlap covers either answer).
5. Which requested `columns[]` come back; whether an unknown column is rejected.
6. Status vocabulary seen, mapped through the normaliser — **every status that maps to UNKNOWN is listed** (FAIL if any).
7. Field presence (% of rows): Reference, collectedCash, absFees, deliveryDate, isPaid; and how often Reference holds an order number.
8. `/tracking/:awb/history` for 3 AWBs: event count, oldest / newest event.
9. Rate behaviour: 10 sequential requests; any 429 or `Retry-After`.

Output: a short summary on stdout and `scripts/abs-tracking/out/probe-<timestamp>.json`
(git-ignored). Both are redacted by construction: counts, percentages, column
names, ABS status vocabulary, dates and **AWB last 4** only — no names,
phones, addresses, Reference text or full AWBs; the key is scrubbed.

## Shadow validation report

`absTracking.validation({ from, to })` (screen section 7) and, locally,
`npx tsx scripts/abs-tracking/report.ts --validation [--from ISO] [--to ISO]`.
Default range: Shadow start (first ok/partial run) → now. SELECT-only on
`abs_*`, `order` and `order_log`.

- **Delivered agreement:** per order with a `would_mark_delivered` decision
  first seen in the range — *agreed* (an admin set it `delivered`; lead time =
  decision first seen → `order_log` change), *pending*, or *false positive*.
- **False positives:** the order was cancelled later; ABS later left
  DELIVERED (DELIVERY_REVERTED, PARTIALLY_DELIVERED, RETURN_*, RETURNED_TO_SHIPPER);
  or a human rejected / unlinked / replaced the link.
- **Delivered misses:** orders an admin set `delivered` in the range that
  have an `auto|confirmed` primary link but never got `would_mark_delivered`,
  each with its rule: `not_delivered_at_abs` (e.g. #10053, our own courier),
  `cod_mismatch` (e.g. #10100), `alert:<reason>`, `unlinked_when_delivered`,
  `website_delivered_first`, else **`unexplained`** (a bug candidate).
- **Matching quality:** auto links later overruled by a human (precision, by
  method `reference` / `phone_amount`), review links confirmed as the top
  candidate, manual links, unmatched rate.
- **Shipped agreement:** the same for `would_mark_shipped` (secondary).
- **Summary:** delivered precision / recall, median lead time, auto-link
  precision, open alerts by reason, and the live-mode targets as pass/fail.

## How a reviewer runs a Shadow review

1. Open **Dashboard → ABS Tracking**. Check the status bar: Shadow, last
   check a few minutes ago, outcome `ok`, no unknown-status warning.
2. **Needs your decision:** for each card, Confirm the right order, or "Not
   this one" with a note, or "Link to another order" with a note (returns:
   choose "Return of this order").
3. **Problems / Returned to us:** check each one (call the customer, look at
   the parcel), then Acknowledge with a short note of what you did.
4. **Orders with no ABS shipment:** create the missing ABS shipment (with the
   order number in Reference) or note why there is none.
5. **Would mark Delivered:** compare with reality; mark orders Delivered on
   the Orders page as usual (Shadow never does it for you).
6. Daily: read **Shadow accuracy**. Report any "wrong would mark Delivered"
   or "Not explained by a rule" row to the tech lead.

## Data model

| Table | What |
|---|---|
| `abs_shipment` | One row per AWB (mirror of the ABS row, validated raw JSON, phone normalised + last 4). |
| `abs_shipment_status_history` | Distinct statuses per AWB. |
| `abs_order_link` | One link per AWB → `order(id)` (FK ON DELETE SET NULL). Partial unique: one `primary` link in `auto|confirmed` per order. 0071: `recompute_requested_at`. |
| `abs_tracking_decision` | Shadow audit trail, unique `dedupe_key = awb|shipment status|order status|decision`. 0071: snapshot columns and `acknowledged_at/by`, `ack_note` (CHECK ≤ 500). |
| `abs_sync_run` | One row per tick (incl. skipped_locked / skipped_config). 0071: `backoff_until`. |
| `abs_sync_state` | Single row: watermark; 0071: `resume_window_from/to`, `resume_page`, `resume_cursor`. |
| `abs_audit_log` (0071) | One row per human action, and (0072) per live system action: `live_apply`, `live_undo`, `live_pause` / `live_resume`, `live_suppress`, `alert_email`, `digest_email`. No FKs (the trail outlives what it describes). |
| `abs_live_application` (0072) | One row per live outcome: `applied` (with `order_log_id`, `from_status`, `actor`, `trigger`, undo columns), `skipped` / `failed` with `reason_code` (deduped per AWB × reason × Cairo day). Partial unique: one `applied` per decision and per (order, `to_status`). CHECK `to_status = 'delivered'`. No FKs. |
| `abs_settings` (0072) | Single row: `live_paused` + who / when / note. |

All status / state / role / decision / action values are `text` (no enums).

## Migrations, locks and rollback

All three migrations are additive and touch `abs_*` objects only; all are
idempotent (`IF NOT EXISTS`; the ADD CONSTRAINT re-runs raise 42710, which
auto-migrate skips) and set `lock_timeout = '5s'` while they run.
Auto-migrate runs each statement on its own (autocommit) at server start.

- **0070:** creates the six tables and their indexes (new, empty objects). The
  two FOREIGN KEYs to `"order"(id)` take **SHARE ROW EXCLUSIVE** on `order`
  (verified on PG 16): reads continue, writes to `order` wait. Validation
  scans the new, empty `abs_*` table, so the lock lasts milliseconds whatever
  the order count — measured **3.5 ms and 2.1 ms with 200 orders** (whole file
  ~104 ms). With the 5 s `lock_timeout`, a long transaction on `order` makes the
  statement fail fast and retry on the next boot instead of queueing checkout
  writes. `order` is never rewritten or altered.
- **0071:** `abs_audit_log` + indexes (new); nullable `ADD COLUMN` without
  default on `abs_*` tables (ACCESS EXCLUSIVE on that `abs_*` table, catalog
  only, no rewrite); two indexes on `abs_*` tables (SHARE on that table); one
  CHECK on `abs_tracking_decision`. **No lock on `order` or any website table.**
  ~48 ms.

- **0072:** `abs_live_application` + `abs_settings` (new tables, new indexes,
  the settings row), one nullable `ADD COLUMN applied_at` on
  `abs_tracking_decision` (ACCESS EXCLUSIVE on that `abs_*` table, catalog
  only). No FK, nothing references `"order"`: **no lock on `order` or any
  website table.** No type change. `lock_timeout = '5s'`.

Rollback: pause on the screen, then `ABS_TRACKING_MODE=shadow` (or `off`) +
restart. To remove the objects: `docs/ABS_TRACKING_ROLLBACK.sql` (PART 0 = 0072,
PART 1 = 0071, PART 2 = everything), after a backup; documentation only, never
run by the app. Removing 0072 does **not** undo orders live mode delivered.

## Running locally (no ABS, no key)

Synthetic fixtures live in `backend/shipping-tracking/abs/__tests__/fixtures/`.
Against a **local** Postgres with the schema:

```bash
export DATABASE_URL=postgresql://postgres:test@localhost:55450/abs_demo   # local only
npx tsx scripts/abs-tracking/run-once.ts --input backend/shipping-tracking/abs/__tests__/fixtures/shipments-list.json --dry-run
npx tsx scripts/abs-tracking/run-once.ts --input backend/shipping-tracking/abs/__tests__/fixtures/shipments-list.json
npx tsx scripts/abs-tracking/report.ts
npx tsx scripts/abs-tracking/report.ts --validation
```

Both scripts refuse a non-local `DATABASE_URL` (do not pass
`--i-know-this-is-not-local`) and print AWBs and phones as their last 4.

Tests: `npx vitest run backend/shipping-tracking scripts/abs-tracking pages/dashboard/abs-tracking`
(unit + UI); with a disposable Postgres, `TEST_DATABASE_URL=… npx vitest run backend/shipping-tracking`
adds the integration suites (migrations, ticks, resume / budget / backoff,
every mutation and refusal, audit rows, recompute, pollNow lock + cooldown,
and the no-write proof over every non-abs table).

## Live mode (Delivered only)

`ABS_TRACKING_MODE=live`. Operations, canary and rollback:
[ABS_TRACKING_LIVE_RUNBOOK.md](ABS_TRACKING_LIVE_RUNBOOK.md).

### The one transition and the one code path

`pending | processing | shipped → delivered`, nothing else. `ABS_LIVE_TRANSITIONS`
may only be `delivered`; any other value keeps live off at boot (runs shadow).
The table enforces it too (`CHECK to_status = 'delivered'`).

The write goes through `applyOrderStatusChange(tx, { orderId, newStatus,
actor })` (`backend/orders/update-order-status/apply-status-change.ts`), the
transactional core extracted unchanged from the admin's `updateOrderStatus`.
The admin tRPC procedure calls the same function with a `user` actor, so both
paths write identical rows (proved by a test that replays the pre-refactor
code side by side):

- `order.status` (and, only on a first cancel, `stock_restored` + the product
  stock restore — never reached by live mode);
- one `order_log` row: `action = status_changed`, old / new status. Live:
  `user_id = NULL`, note `[ABS auto] Delivered at ABS (AWB …1234, decision
  <id>).` (approval: `… Approved on the ABS screen.`). No phone, no full AWB;
- the review-check email enqueue (`enqueueReviewCheckForOrder`, own
  connection, dedupe key `review_check:<orderId>` — it may also create the
  customer's `email_subscription` token row, exactly as the admin path does).

The live writer itself writes only `abs_live_application`,
`abs_tracking_decision` (`applied`, `applied_at`, `mode`), `abs_audit_log` and
`abs_settings`. ABS stays read-only (same four-endpoint allow-list; the fresh
history uses `GET /tracking/:awb/history`).

### Eligibility — every rule, re-checked inside the transaction

`live-rules.ts` (pure, unit-tested matrix). The writer runs the local rules
before the ABS history call, then **all** rules again inside the transaction,
with `abs_settings` and the order row locked (`SELECT … FOR UPDATE`) and
decision, link, shipment and human activity re-read. First failing rule = the
recorded reason.

1. **Decision:** the AWB's latest decision is `would_mark_delivered`, not
   applied, not suppressed by a person ("Don't mark automatically").
2. **Order:** exists; `pending` / `processing` / `shipped` (delivered → nothing
   to do; cancelled → attention).
3. **Link:** primary; `auto` by `reference` or exact `phone_amount`, or
   `confirmed` by a person (any method). Never `phone_amount_fuzzy` auto,
   reverse / exchange / other roles, `needs_review` / `unmatched` /
   `rejected`. Its order is the decision's order, it was not updated after the
   decision's last sighting, and no recompute is pending.
4. **Shipment:** DELIVERED; `lastEventCode` is not `SHP_PRTL_DLVD` /
   `SHP_DLVD_RVRT`; `raw.isUnderRevision` is `false` (true or missing → skip);
   service `DELIVERY` (or not sent).
5. **Never overwrite a person:** no `order_log` status change (`status_changed`
   / `cancelled`) not written by ABS since ABS **first** proposed Delivered for
   this AWB and order; the order was never `delivered` before; no open blocking
   alert on this AWB, the order, or another AWB of the order (`cod_mismatch`,
   `returned_after_delivered`, `delivered_but_cancelled`, partial / reverted,
   unknown / lost / damaged…, any reverse / exchange alert — a hold or failed
   attempt *before* the delivery does not block); no other AWB linked to or
   proposed for the order; no reject / unlink after the last confirmation.
6. **Compare-and-set:** order status = `order_status_at_decision`, total =
   `order_total_at_decision`, `stock_restored = false`.
7. **Money:** COD — `collectedCash` present and within `ABS_COD_TOLERANCE_EGP`
   of the total (`cash` alone is not enough). Prepaid — `payment_status = paid`
   and ABS collected 0 / nothing.
8. **Age:** ABS `deliveryDate` present and within `ABS_LIVE_MAX_AGE_DAYS`
   (older → attention, one-click approve that waives only this rule).
9. **Fresh history** (`GET /tracking/:awb/history`, same tick): contains
   DELIVERED; every event dated; nothing after the last DELIVERED. DELIVERED
   stable for `ABS_LIVE_SETTLE_MINUTES`, counted from the later of ABS's last
   DELIVERED event and our first sighting. A failed call skips this tick.
10. **Limits:** `ABS_LIVE_MAX_PER_TICK` per tick, `ABS_LIVE_DAILY_CAP` per
    Cairo day (cap hit → stop + alert). At most 25 history calls per tick.

Real-data shapes covered by the tests: #10053 returned after delivered,
#10100 COD mismatch then corrected (blocked until the old alert is
acknowledged), fuzzy phone, reverse shipment, cancelled order, prepaid,
missing collectedCash, an event after DELIVERED, older than 14 days, inside
the settle window.

### Idempotency, concurrency, audit

- `abs_live_application`: the `applied` row is inserted in the **same
  transaction** as the status change, before it (`ON CONFLICT DO NOTHING` on
  the partial unique indexes — one per decision, one per (order,
  `delivered`)); nothing inserted → stop. The decision gets `applied = true`,
  `applied_at` in the same transaction; `order_log_id` is filled after the core
  call.
- The tick runs under the existing advisory lock; every live write (tick,
  button, approve) also locks the `abs_settings` row, which serialises them and
  makes the pause flag and the daily cap exact.
- The shared core is called **last** in the transaction: its review-email
  enqueue uses its own connection, so nothing that can fail runs after it.
- Every evaluated candidate that did not pass records a `skipped` row with its
  reason (at most one per AWB × reason × Cairo day; repeats bump
  `last_seen_at` / `seen_count`). A failed transaction records `failed /
  apply_error` and alerts. These rows feed the screen, the digest and
  validation.
- `abs_audit_log`: `live_apply` per applied change; `live_undo`, `live_pause`,
  `live_resume`, `live_suppress` per human action; `alert_email` /
  `digest_email` per email.

### Switches, approval mode, Undo

| Switch | Effect |
|---|---|
| `ABS_TRACKING_MODE=live` | Live writer on (needs 0072). `shadow` / `off` behave exactly as before. |
| **Pause** button (`abs_settings.live_paused`) | Runtime, no restart, audited, checked inside every live transaction. Paused = shadow (the poller keeps recording). The buttons that change orders refuse. |
| `ABS_LIVE_REQUIRE_APPROVAL=true` (default) | The tick runs every check (incl. the history) and lists eligible items as **Ready to mark Delivered (N)**; nothing is applied until **Mark these N Delivered**, which applies exactly the previewed ids that are still Ready, re-running every check per item. An item already Ready is re-checked by the tick at most hourly. |
| `ABS_LIVE_REQUIRE_APPROVAL=false` | Eligible items apply automatically each tick. |
| **Approve** (delivered > 14 days) | One item; only the age rule is waived. |
| **Don't mark automatically** | Suppresses that decision (`acknowledged_*` on it, note required). |
| **Undo this automatic Delivered** | Only while the order is still Delivered and no status change happened after the automatic one. Sets the status back to `from_status` through the same core (admin user id, note `[ABS auto-undo] …`), records `undone_at / by / undo_order_log_id`. An undone order is never re-applied (it "was delivered before"). Works in live, and in shadow after a rollback while the 0072 tables exist. The review email queued on Delivered is **not** cancelled (same as an admin moving an order back). |

**ERP after Undo:** if the ERP already recorded the sale for that order, the
undo shows up there as a **status regression** issue on its next sync. That
issue is handled in the ERP (reverse the SAL entry there); nothing on the
website does it.

### Alerts and the daily digest

Existing SMTP mailer; recipients `ABS_ALERT_EMAILS`, else
`ORDER_NOTIFICATION_EMAILS`. Live mode only (Shadow sends nothing).

- **Immediate** (each type at most once per 6 h): 3 failed checks in a row; no
  successful check for 60 min; the daily cap reached; an automatic Delivered
  failed; an UNKNOWN ABS status present.
- **Digest at 09:00 Cairo** (first tick at or after 09:00, once per Cairo
  day): yesterday's automatic Delivered (count + order numbers), what needs
  attention by type, sync health. No phones, names or addresses.
- The status bar shows last success, consecutive failures, paused state and
  applied today / cap.

### Validation report in live mode

The Shadow accuracy report counts any `order_log` change to delivered as
"agreed", including live mode's own `[ABS auto]` rows. Read it as the
pre-live gate; once live is on, use **Done automatically** and the digest.

## Not confirmed by ABS (open — the probe answers most)

Production base URL; Read-key permission for `POST /shipments/list` and
`/tracking/bulk`; rate limits; `isPaid` / `paymentDate` meaning (stored, unused);
history retention; inclusive `lastChangeDate*` bounds; pagination contract when
`nextCursor` is null; unknown `columns[]` handling; whether staff will type the
order number into Reference.
