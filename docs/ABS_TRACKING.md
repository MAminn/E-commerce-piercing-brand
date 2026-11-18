# ABS courier tracking — Shadow (Phases 1 + 2)

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

Code: `backend/shipping-tracking/abs/`, config `shared/config/abs-tracking.ts`,
migrations `0070_abs_tracking.sql` + `0071_abs_tracking_review.sql`, scripts
`scripts/abs-tracking/`, page `pages/dashboard/abs-tracking/`. Operations:
[ABS_TRACKING_SHADOW_RUNBOOK.md](ABS_TRACKING_SHADOW_RUNBOOK.md).

## Modes

| `ABS_TRACKING_MODE` | Behaviour |
|---|---|
| `off` (default, unset, or any unknown value) | Nothing starts. No ABS request, no query against `abs_*`. One boot line: `[ABS tracking] off (…)`. The screen says "ABS tracking is off"; every procedure except `overview` refuses; `overview` makes no query. |
| `shadow` | Poller runs; writes `abs_*` only; decisions recorded, never applied. The screen works. |
| `live` | **Not implemented.** Treated as `shadow`, with one boot warning. |

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
| `ABS_TRACKING_MODE` | `off` | `off` \| `shadow` \| `live` (= shadow) |
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
4. `POST /api/v1/shipments/list` page by page (100 per page), at most
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
7. The watermark advances to `to` (and the resume point clears) **only** when
   the window is complete. A failed run stores `backoff_until = finish +
   min(interval × 2^(n−1), 1 h)` (n = consecutive failed runs; a longer
   429 `Retry-After` wins, still ≤ 1 h).

Each decision row also stores a snapshot for a future compare-and-set
writer: `order_status_at_decision`, `order_total_at_decision`,
`abs_delivery_date`, refreshed on every sighting. Not used for writes.

## The review screen (`/dashboard/abs-tracking`)

Sidebar: **Catalog → ABS Tracking**. Admin only (page guard + `adminProcedure`).
Phone numbers appear as their last 4 digits; no customer names or addresses.
Usable on a phone (stacked cards, inline note forms, no wide tables).

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
| `abs_audit_log` (0071) | One row per human action. No FKs (the trail outlives what it describes). |

All status / state / role / decision / action values are `text` (no enums).

## Migrations, locks and rollback

Both migrations are additive and touch `abs_*` objects only; both are
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

Rollback: `ABS_TRACKING_MODE=off` + restart makes everything inert. To remove
the objects: `docs/ABS_TRACKING_ROLLBACK.sql` (PART 1 = 0071 only, PART 2 =
everything), after a backup; documentation only, never run by the app.

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

## Live mode (Phase 3 — not built; constraints the code keeps open)

Only after the targets in the runbook are met and the owner approves: apply
only `would_mark_delivered`, through the same transactional core as the admin
status change (order_log entry, review email, no stock change on Delivered),
actor `system:abs`; compare-and-set on `order_status_at_decision` and
`order_total_at_decision`; idempotent per decision; kill switch and
`ABS_LIVE_TRANSITIONS=delivered`; daily cap; never cancels or restocks.

## Not confirmed by ABS (open — the probe answers most)

Production base URL; Read-key permission for `POST /shipments/list` and
`/tracking/bulk`; rate limits; `isPaid` / `paymentDate` meaning (stored, unused);
history retention; inclusive `lastChangeDate*` bounds; pagination contract when
`nextCursor` is null; unknown `columns[]` handling; whether staff will type the
order number into Reference.
