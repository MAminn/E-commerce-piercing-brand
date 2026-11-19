# ABS tracking — Shadow runbook (production)

For: the owner and the tech lead who deploy through Coolify.
What Shadow is: the website reads ABS shipments, links them to orders and
shows **what it would do**. **It never changes an order, its stock,
`order_log`, emails or the ERP.** Background: [ABS_TRACKING.md](ABS_TRACKING.md).

This runbook does not deploy anything by itself. Deploying the branch and
setting variables are separate, approved steps.

**Live mode** (automatic Delivered) has its own runbook:
[ABS_TRACKING_LIVE_RUNBOOK.md](ABS_TRACKING_LIVE_RUNBOOK.md). Deploying the
release that contains migration 0072 while staying in `shadow` changes
nothing on the website.

---

## 1. Environment variables

Set in Coolify → the app → Environment Variables. Names only here — values
never go into git, tickets, chat or screenshots.

| Variable | Value to use | Notes |
|---|---|---|
| `ABS_TRACKING_MODE` | `shadow` (to enable) / `off` or unset (to disable) | Anything else = off. |
| `ABS_API_BASE_URL` | the ABS Client API base URL, `https://…` | Required. No default. |
| `ABS_API_KEY` | the ABS **Read** key | **Secret.** The owner adds it himself as a secret (locked) variable. Never logged. |
| `ABS_BACKFILL_FROM` | default `2026-11-01` | First production window starts here (Cairo midnight). |
| `ABS_MAX_PAGES_PER_TICK` | default `20` | 20 × 100 shipments per tick; the rest continues next tick. |
| `ABS_TICK_TIMEOUT_MS` | default `300000` (5 min) | Total time budget per tick. |
| `ABS_POLL_INTERVAL_MS` | default `600000` (10 min) | Floor 5 min. |
| `ABS_POLL_OVERLAP_MS` | default `1800000` (30 min) | |
| `ABS_MATCH_WINDOW_DAYS` | default `10` | |
| `ABS_REVERSE_WINDOW_DAYS` | default `45` | Returns / exchanges: suggestions only. |
| `ABS_COD_TOLERANCE_EGP` | default `1` | |
| `ABS_ONLY_SINCE` | default `2026-11-18` | ABS-only policy start. |
| `ABS_MISSING_AWB_ALERT_DAYS` | default `2` | |

Only the first three need setting; leave the rest unset to use the defaults.

## 2. Before enabling (once)

1. **Run the probe** on the owner's machine (not the server), with the key
   only in that shell:

   ```bash
   ABS_API_BASE_URL='https://<abs-api-host>' ABS_API_KEY='<read-key>' npx tsx scripts/abs-tracking/probe.ts --days 30
   ```

   Share the summary and `scripts/abs-tracking/out/probe-*.json` with the
   tech lead (both are redacted: no names, phones, addresses or full AWBs).
   Step 1 and step 2 must PASS. Any status listed under step 6 as UNMAPPED →
   UNKNOWN must be mapped in code before or shortly after enabling.
2. **Back up** the database (the usual Coolify / pg_dump backup).
3. The deploy runs migrations **0070** and **0071** automatically at start.
   Both are additive (`abs_*` only), idempotent, and take at most a few
   milliseconds of write-lock on `order` (two foreign keys in 0070; measured
   2–4 ms with 200 orders). With `ABS_TRACKING_MODE` unset the deploy changes
   nothing else.

## 3. Enable Shadow

1. Set `ABS_API_BASE_URL`, `ABS_API_KEY` (secret), `ABS_TRACKING_MODE=shadow`.
2. Redeploy / restart.
3. In the deploy log, look for exactly one of:
   - `[ABS tracking] mode=shadow` and `[ABS tracking] worker started (mode=shadow, every 600s)` → running;
   - `[ABS tracking] off (…)` → not running; the reason names what is missing
     (e.g. `ABS_API_KEY not set`, `not ready: table abs_audit_log`). The site
     works normally either way; fix the reason and restart.
4. Open **Dashboard → ABS Tracking**. The badge says **Shadow**; the status
   bar shows the last check.

**The first tick is gentle:** it reads from `ABS_BACKFILL_FROM` at most 20
pages (2,000 shipments) per tick, ≥ 300 ms between requests, within 5
minutes, and continues on the next tick. While it catches up, runs show
`partial` with "page cap reached … continuing next tick" and the status bar
says "Catching up". That is expected.

## 4. Disable / roll back

| Goal | Steps |
|---|---|
| Stop Shadow (keep data) | Set `ABS_TRACKING_MODE=off` (or delete it) → restart. No ABS request, no `abs_*` query; the screen says "ABS tracking is off". |
| Remove the key | Delete `ABS_API_KEY` → restart. Mode falls back to off with `ABS_API_KEY not set`. |
| Remove the tables (rare) | Off first, take a backup, then run `docs/ABS_TRACKING_ROLLBACK.sql` (PART 1 = 0071 only; PART 1 + PART 2 = everything) and delete the matching `__drizzle_migrations` rows only if the tables should come back on the next deploy. |
| Undo the code | Redeploy the previous image. The `abs_*` tables stay and are unused. |

Nothing to restore on the website side in any case: Shadow never wrote to it.

## 5. First hour

Check on **Dashboard → ABS Tracking** (or the SQL below, read-only):

- [ ] Status bar: Shadow, last check within ~10 minutes, outcome `ok` or
      `partial` (catching up). Not `failed`.
- [ ] History → ABS checks: one row every ~10 minutes; no `failed` streak. A
      failure pauses scheduled checks 10 → 20 → 40 → 60 minutes ("automatic
      checks pause until …"). **Check ABS now** works once per 2 minutes.
- [ ] No red "status we do not know" line. If there is one, send the labels
      to the tech lead (they are ABS words, not customer data).
- [ ] Counts look plausible: "would mark Delivered" ≈ orders ABS delivered
      recently; "need your decision" small.
- [ ] **No-write evidence** — every `status_changed` since enabling was made
      by a signed-in admin (Shadow never writes `order_log`):

  ```sql
  -- expect zero rows
  SELECT l.created_at, l.action, l.old_status, l.new_status, l.note
  FROM order_log l
  LEFT JOIN "user" u ON u.id = l.user_id
  WHERE l.created_at >= '<time Shadow was enabled>'
    AND l.action = 'status_changed'
    AND (u.id IS NULL OR u.role NOT IN ('admin', 'superadmin'));
  ```

  and Shadow has applied nothing:

  ```sql
  SELECT count(*) FILTER (WHERE applied) AS applied, count(*) AS decisions FROM abs_tracking_decision;  -- applied = 0
  ```

- [ ] Run outcomes:

  ```sql
  SELECT started_at, trigger, outcome, pages, shipments_seen, decisions_new, backoff_until, error
  FROM abs_sync_run ORDER BY started_at DESC LIMIT 20;
  ```

## 6. First day

- [ ] Backfill finished: a run with outcome `ok`; `SELECT watermark, resume_page FROM abs_sync_state;` shows a watermark and `resume_page` NULL.
- [ ] Work through **Needs your decision** (confirm / not this one / link).
- [ ] **Problems** and **Returned to us**: check each, acknowledge with a note.
- [ ] **Orders with no ABS shipment**: each one either gets an ABS shipment
      (with the order number in Reference) or a reason.
- [ ] Unknown statuses: `SELECT status_raw, count(*) FROM abs_shipment WHERE status = 'UNKNOWN' GROUP BY 1;` → zero rows.
- [ ] Read **Shadow accuracy**; report every "wrong would mark Delivered" and
      every "Not explained by a rule" row.

## 7. Targets before anyone proposes live mode

The tech lead checks these (Shadow accuracy section, or
`report.ts --validation` against a local copy):

1. At least **7 days** of Shadow **or 40 ABS-delivered orders, whichever is later**.
2. **Delivered precision 100%** — no `would_mark_delivered` on an order that was not actually delivered.
3. **Every miss explained by a rule**, not a bug (no "unexplained").
4. **Auto-link precision 100%** — zero human rejections / unlinks of an auto link.
5. **Zero UNKNOWN statuses** unmapped.

Live mode is a separate phase and a separate approval. Even then it will
only mark **Delivered**, through the same path as an admin's status change,
with compare-and-set, a kill switch, a daily cap — and it will never cancel
or restock (returns stay manual).
