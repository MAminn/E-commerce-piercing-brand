# ABS tracking — Live runbook (automatic Delivered only)

For: the owner and the tech lead who deploy through Coolify.
What Live does: when ABS reports a shipment **DELIVERED**, the collected amount
equals the order total and nothing unusual happened, the linked website order
becomes **Delivered** through the same code an admin's status change uses. The
ERP records the sale on its next 10-minute sync, as for any admin change.
**Live never cancels, restocks, handles returns or changes totals, items,
payment or customer data.** Background and the full rules:
[ABS_TRACKING.md → Live mode](ABS_TRACKING.md#live-mode-delivered-only).
Shadow operations: [ABS_TRACKING_SHADOW_RUNBOOK.md](ABS_TRACKING_SHADOW_RUNBOOK.md).

This runbook deploys nothing by itself. Deploying the branch and changing
variables are separate, approved steps.

---

## 1. Before enabling (once)

1. Shadow has been healthy (status bar: last check a few minutes ago, `ok`,
   no unknown-status warning) and the Shadow accuracy targets are met.
2. **Deploy the release that contains migration 0072 first, still in
   `shadow`.** Auto-migrate applies 0072 at boot (additive, `abs_*` only, no
   lock on `order`; ~0.1 s). Check the boot log: `[ABS tracking] mode=shadow`
   and no `0072` migration error. Nothing changes on the website.
3. Set `ORDER_NOTIFICATION_EMAILS` (already set for new-order emails) or
   `ABS_ALERT_EMAILS` to an inbox someone reads. Without either, alerts and the
   digest are only logged.

## 2. Environment variables

Coolify → the app → Environment Variables. Names only here.

| Variable | Value | Notes |
|---|---|---|
| `ABS_TRACKING_MODE` | `live` | `shadow` / `off` = kill switch (restart needed). |
| `ABS_LIVE_REQUIRE_APPROVAL` | unset (= `true`) for the canary; `false` after | `true`: nothing is applied without the button. |
| `ABS_LIVE_TRANSITIONS` | unset (= `delivered`) | Only `delivered` is accepted; anything else keeps live off. |
| `ABS_LIVE_SETTLE_MINUTES` | unset (= 30) | |
| `ABS_LIVE_MAX_AGE_DAYS` | unset (= 14) | |
| `ABS_LIVE_MAX_PER_TICK` | unset (= 10) | |
| `ABS_LIVE_DAILY_CAP` | unset (= 40) | Normal days are well below; a hit means something is off → alert. |
| `ABS_ALERT_EMAILS` | optional | Defaults to `ORDER_NOTIFICATION_EMAILS`. |

## 3. Enable in approval mode (canary)

1. Set `ABS_TRACKING_MODE=live` (leave `ABS_LIVE_REQUIRE_APPROVAL` unset) and
   redeploy / restart.
2. Boot log must show
   `[ABS tracking] mode=live (approval required; settle 30 min, max age 14 d, 10/tick, 40/day)`.
   If it shows `live not ready: …` or `live refused: …`, the app is running
   **shadow** — fix the cause first.
3. Open **Dashboard → ABS Tracking**. Badge: **Live – approval**. Optional:
   press **Pause** first if you want to look before anything can be approved.
4. After the next check (≤ 10 min), **Ready to mark Delivered (N)** lists the
   eligible orders. For the first batch, check **each one** against the ABS
   portal (delivered, amount collected) — on 19 Nov there were 8 such orders
   (#10075, #10091, #10092, #10093, #10103, #10112, #10121, #10132).
5. Press **Mark these N Delivered**, then **Yes**. Every check runs again per
   order; anything that changed since the preview is skipped and shows under
   **Needs your attention**.
6. Repeat for 2–3 days. Each day: compare **Done automatically** with the ABS
   portal, and do the ERP check in §7.

## 4. Switch to automatic

When the canary days had no wrong item:

1. Set `ABS_LIVE_REQUIRE_APPROVAL=false`, redeploy / restart.
2. Boot log: `[ABS tracking] mode=live (automatic; …)`; badge: **Live**.
3. Normal deliveries now need nothing. Only **Needs your attention** and the
   09:00 digest need a look.

## 5. Pause (no restart)

**Pause** on the status bar → badge **Paused**. Takes effect inside the next
transaction (an application already running finishes or is rolled back).
While paused the website behaves exactly like Shadow; the approve buttons
refuse. **Resume** to continue. Both are in History (who, when).

## 6. Rollback (in this order)

1. **Pause** on the screen (immediate).
2. Set `ABS_TRACKING_MODE=shadow` (or `off`) and restart. Boot log
   `mode=shadow`. Undo and **Done automatically** still work in shadow.
3. If the code itself must go: redeploy the previous image in Coolify. 0072
   stays (harmless, `abs_*` only); remove it only with
   `docs/ABS_TRACKING_ROLLBACK.sql` PART 0, after a backup.

To revert individual orders: **Done automatically → Undo** (note required).
Allowed only while the order is still Delivered and nobody changed it since.
If the ERP had already recorded the sale, it raises a **status regression**
issue on its next sync — resolve it in the ERP (reverse that order's SAL
entry there).

## 7. First-day checks

- Status bar: health OK, last success a few minutes ago, applied today / cap
  sensible, not paused (unless intended).
- **Done automatically** = the orders ABS shows as delivered with the right
  amount; each order's Activity log has exactly one
  `[ABS auto] Delivered at ABS (AWB …1234, decision …)` line.
- **Needs your attention**: every row has a reason you recognise (amount
  differs, returned after delivery, someone changed the order, old delivery…).
- **ERP (after its next 10-minute sync): each applied order has exactly one SAL
  journal entry** (plus its COGS, stock-out and courier receivable), no
  duplicate, no missing one. An order you undid shows the status-regression
  issue instead.
- Inbox: no alert emails unless something failed; the digest arrives after
  09:00 Cairo the next morning, with order numbers only.

## 8. Alerts you may receive

| Email | Meaning | Do |
|---|---|---|
| ABS sync failing (N checks in a row) | ABS cannot be read; nothing is marked Delivered meanwhile. | Check ABS status / key; nothing to undo. |
| No successful ABS check for over 60 minutes | Same, or the poller is stuck. | Check the app is running; restart if needed. |
| Daily limit of automatic Delivered reached | More deliveries than `ABS_LIVE_DAILY_CAP` in one Cairo day. | Look at Done automatically; pause if unexpected. |
| An automatic Delivered failed | A transaction rolled back; the order was not changed. | Check the order; tell the tech lead. |
| ABS sent a status we do not know | A new ABS status; such shipments are never acted on. | Tell the tech lead (normaliser update). |

Each type is sent at most once per 6 hours.
