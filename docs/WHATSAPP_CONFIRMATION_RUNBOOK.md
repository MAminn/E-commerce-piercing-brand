# WhatsApp order confirmation — activation runbook

Sender: **+20 150 311 3922** (Cloud API only). Support **+20 10 35790911** is never touched.
Portfolio: **Amin Digital** (`2013701842305740`). Code: `backend/whatsapp-confirmation/`.

Every step marked **[APPROVAL]** needs the owner's explicit go-ahead first.

## 0. Before anything
- [ ] Confirm Coolify deploys `master` and note the live commit; rebase `feat/whatsapp-order-confirmation` on it.
- [ ] Confirm `SYN_BOSTA_KEY` and `FINCART_ENABLED` are unset in production (ABS is the courier).
- [ ] Run on a machine with package access: `pnpm install && pnpm typecheck && pnpm test && pnpm build`,
      and the integration suite with `TEST_DATABASE_URL` pointing at a throw-away Postgres.

## 1. Meta (no customer impact)
1. **[APPROVAL]** developers.facebook.com → Create app "Percé Orders", type Business, portfolio Amin Digital,
   use case "Connect with customers through WhatsApp". When asked for a Messaging account choose
   **Create new** ("Percé Orders") — never the existing "Percé" WABA `1576999750297285`.
2. **[APPROVAL]** Business Settings → System users → Add "percé-orders-api" (Admin) → assign: app "Percé Orders"
   (Full control) and the NEW WABA (Full control) → Generate token, expiry **Never**, permissions
   `whatsapp_business_messaging`, `whatsapp_business_management`. Store only in Coolify.
3. **[APPROVAL]** WhatsApp Manager (new WABA) → Message templates → create `order_confirmation_ar` and
   `order_reminder_ar` (category Utility, language Arabic) exactly as in §5. Wait for Approved.
4. **[APPROVAL]** Billing: add a payment method to the NEW WABA only.
5. Optional, recommended: start Business Verification for Amin Digital (raises the 250/day limit).

## 2. Deploy in shadow (no message can be sent)
1. **[APPROVAL]** Merge/deploy the branch. Migration 0073 runs at boot (additive, idempotent).
2. Coolify env: `WHATSAPP_CONFIRM_MODE=shadow` (+ the variables in DEPLOYMENT.md that are known so far).
3. Boot log must show `[WhatsApp confirm] requested=shadow effective=shadow`.
4. App dashboard → WhatsApp → Configuration → Callback URL `https://perce-eg.com/api/webhooks/whatsapp`,
   verify token = `WHATSAPP_WEBHOOK_VERIFY_TOKEN`; subscribe field `messages` (on the NEW WABA only).
5. 3–5 days of real orders. Checkout shows **no** WhatsApp box in shadow. Every eligible COD order is recorded
   without asking (`consent_source = 'shadow_not_asked'`), so `/dashboard/whatsapp-confirmations` → Shadow tab
   shows one row per eligible COD order (invalid / opted-out numbers are listed as ineligible, with no staff item).
   Use "Sim confirm/modify/cancel" (superadmin) to walk the flow. Check: no order status changed by WhatsApp
   (`order_log` notes starting `[WA auto]` = 0), WhatsApp Manager insights = 0 messages.

## 3. Phone migration — **[FINAL APPROVAL]**
1. Owner backs up / exports the chats on +20 150 311 3922 (WhatsApp Business app → Settings → Chats → Chat backup,
   and export any chat that must be kept). Confirm in writing that the backup exists.
2. On the phone: WhatsApp Business → Settings → Account → **Delete my account** for +20 150 311 3922 only.
3. App dashboard → WhatsApp → API Setup → Add phone number → display name "Percé" → verify by SMS/voice →
   register with a 6-digit PIN (two-step verification). Wait for display-name approval.
4. Put `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_WABA_ID`, token, app secret in Coolify.

## 4. Pilot — **[APPROVAL]**
1. `WHATSAPP_PILOT_ALLOWLIST=<team numbers>`, `WHATSAPP_CONFIRM_MODE=pilot`, daily cap ≤ 50. Restart.
2. The checkout box appears **only after an allow-listed number is typed** in the phone field; customers on other
   numbers never see it, and their orders are recorded as shadow (never sent). The allow-list is **not** consent:
   an allow-listed order is sent only if the box was ticked (not ticked → `ineligible: no_consent`).
   Team places real COD orders with the box ticked; test confirm, modify, cancel, no reply (24 h reminder,
   48 h follow-up), a late reply after cancelling, and pressing the same button twice. Also place one allow-listed
   order with the box NOT ticked and check that nothing is sent.
3. Check each: order status, single `[WA auto]` log row on confirm, staff items, ERP export unchanged except the
   status event, ABS untouched.

## 5. Templates (submit exactly)

**`order_confirmation_ar`** — Utility, Arabic
- Body: `أهلاً {{1}} 👋\nاستلمنا طلبك رقم {{2}} من Percé بإجمالي {{3}} جنيه، والدفع عند الاستلام.\nمن فضلك اختار من الأزرار تحت عشان نبدأ تجهيز طلبك.`
- Samples: {{1}} منى · {{2}} #10045 · {{3}} 1,250
- Footer (optional): `للمساعدة: خدمة العملاء 01035790911`
- Quick replies, in this order: `تأكيد الطلب` · `تعديل بيانات الطلب` · `إلغاء الطلب`

**`order_reminder_ar`** — Utility, Arabic
- Body: `أهلاً {{1}}، لسه مستنيين تأكيدك لطلب رقم {{2}} من Percé.\nمن فضلك اختار من الأزرار تحت.`
- Samples: {{1}} منى · {{2}} #10045
- Same three quick replies, same order.

## Pause behaviour
Orders placed while paused are queued, not dropped. On **Resume** the backlog is sent (only for orders still
`pending` with no reply), so after a long pause the first messages can be hours old — consider checking the
"Awaiting reply" tab before resuming.

## Mandatory checkout consent (rollout switch)
`WHATSAPP_CHECKOUT_CONSENT_REQUIRED=true` + restart makes the checkout tick mandatory for COD orders that
would be messaged. Remove it (or set `false`) + restart to return to the optional box; confirmations keep
running either way. Do not turn it on without owner approval (legal basis for bundled consent under
Egyptian law is not established).

## Consent data
`WHATSAPP_CONSENT_REQUEST_DETAILS` (default `anonymized`) decides what of the request is kept with the
evidence. `WHATSAPP_CONSENT_RETENTION_DAYS` is unset by default (nothing deleted); set it only to an
owner-approved period (≥ 30 days).

## Rollback
Dashboard **Pause** (instant) → `WHATSAPP_CONFIRM_MODE=shadow` or `off` + restart. Tables are additive;
nothing to undo in orders, ERP or ABS. Migration 0074 (`wa_checkout_consent`) can stay after a code
rollback (older code ignores it); if it is dropped, the feature runs `off` until it is back.
