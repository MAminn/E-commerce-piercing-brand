# SYNT Marketing Suite — Implementation Plan

**Status:** Approved, ready for execution
**Author:** Opus (planning) → Sonnet (execution)
**Date:** 2026-08-08

This plan covers four workstreams derived from the LOOPA GROWTH marketing report and the
client's email-automation document. Every open decision has already been answered by the
user — the "Locked decisions" section below is not up for re-litigation. If something in
here turns out to be wrong or impossible, **stop and report it**, do not silently substitute
a different approach.

---

## Locked decisions (do not re-open)

| Question | Decision |
|---|---|
| Server-side cart capture | **Build it now.** Required for abandoned-cart + abandoned-browse. |
| Email admin control | **Preset + editable fields.** No drag-drop block builder, no raw HTML editing. |
| Scheduler | **In-process worker + Postgres queue table.** No Redis/BullMQ. |
| Email provider | **Provider-agnostic interface.** Do NOT hardcode Resend/SES/etc. Keep SMTP as the default concrete impl. |
| Microsoft Clarity | **Add as a platform in the existing pixel system**, not a hardcoded script. |
| Popup discount codes | **Fully CMS-controlled**, including which promo code is used/shown. |
| Popup abuse gate | **One code per email AND per phone, enforced server-side**, permanently. |
| Compliance | **Unsubscribe link + preference page.** (Transactional/marketing separation is inherent to a correct implementation — build it, it is not an optional extra.) |
| Language | **Bilingual EN + AR**, admin fills both, RTL-aware. |
| Automation scope | **All 8 automations in one delivery.** |
| Progress-bar link | **Change `/offers` → `/shop`**, and update the label away from "VIEW OFFERS". |

---

## Ground truth about the current codebase

Verified by direct reading, not assumption. Trust these; re-verify anything not listed.

- **No cart table exists.** Carts are browser `localStorage` only. Confirmed by full table
  listing of `shared/database/drizzle/schema.ts`.
- **No job scheduler exists.** The only `setInterval` in the backend is an unrelated temp-file
  cleanup in `backend/file/upload-file/api.ts:52`.
- **Email sending** lives in `shared/email/service.ts` using `nodemailer` + `createTransport`.
  The sender is **hardcoded** to the SMTP username: `from: input.smtpUser` (line ~138).
  This must become configurable.
- **Email templates** are React Email components in `backend/emails/minimal/*.tsx`, rendered
  via `renderEmailTemplate()` (also in `shared/email/service.ts`). Four exist today:
  `coming-soon-welcome`, `email-verification`, `order-confirmation`, `password-reset`.
- **Email branding** is resolved by `backend/emails/branding.ts` → `getEmailBranding()`.
  Note it embeds local logos as **base64 data URIs**, and `service.ts` then rewrites those
  into CID inline attachments because Gmail blocks data URIs. Preserve that behaviour.
- **Subscribers** live in `comingSoonSubscribers` (`schema.ts:1380`) which **already has both
  `email` and `phone` columns**. Two endpoints write to it, both in `backend/settings/trpc.ts`:
  `subscribeNewsletter` (line ~173, email only, no email sent) and `subscribeComingSoon`
  (line ~202, email + optional phone, sends welcome mail).
- **Promo codes**: `promoCode` table at `schema.ts:796`. Has `usageLimit`, `usedCount`,
  `usageLimitPerUser`, `minPurchaseAmount`, `startDate`/`endDate`, `showOnOffersPage`.
  Creation schema at `backend/promo-codes/create-promo-code/create-promo-code.ts`.
- **Pixel system**: `pixelPlatform` pg enum at `schema.ts:1111` (`meta`, `google_ga4`,
  `tiktok`, `snapchat`, `pinterest`, `custom`). Config table `pixelConfig` at `schema.ts:1124`
  with `enabled`/`enableClientSide`/`enableServerSide`/`consentRequired`/`consentCategory`.
  Client adapters in `frontend/pixel-adapters/` (one file per platform + `registry.ts`,
  `factory.ts`). Admin UI at `pages/dashboard/admin/pixels/+Page.tsx`.
- **tRPC root router**: `shared/trpc/router.ts` (NOT `backend/router/router.ts`, which is a
  stale partial copy — do not edit that one).
- **i18n**: `lib/i18n/MinimalI18nContext.tsx`, locale persisted as `minimal-template-locale`
  in localStorage and mirrored to a `minimal-locale` cookie by the blocking script in
  `pages/+Head.tsx`. The cookie is what the server can read.
- **Layout CMS pattern** to copy for any new settings: `shared/types/layout-settings.ts`
  (types + defaults) → `backend/layout/trpc.ts` (zod schema) → **both**
  `backend/layout/get-layout-settings/index.ts` **and** `backend/layout/get-layout-settings-raw.ts`
  (two separate `mergeWithDefaults` functions — **forgetting the second one is a real bug that
  already happened once in this project**) → `pages/dashboard/admin/layout-settings/+Page.tsx`.

---

## Workstream 1 — Progress-bar link (trivial)

**File:** `layouts/LayoutDefault.tsx` (~line 259-264)

Current:
```tsx
{!isDashboardRoute && isMinimal && (
  <StickyCartBar
    desktopOnly
    ctaHref={{ href: "/offers", label: "VIEW OFFERS" }}
  />
)}
```

Change `href` to `/shop` and `label` to `"SHOP MORE"`. Update the stale code comment directly
above it (which currently explains the `/offers` choice) so it doesn't contradict the code.

Rationale for the change: the bar appears when a user needs *one more item* to unlock a reward.
Sending them to a static offers page is a dead end; they need the product catalogue.

---

## Workstream 2 — Microsoft Clarity

Add `clarity` to the existing pixel infrastructure so the client configures it themselves at
Dashboard → Pixels, with no redeploy and with consent gating consistent with every other tracker.

### Steps
1. **Schema**: add `"clarity"` to the `pixelPlatform` pg enum (`schema.ts:1111`). Generate a
   migration (`npm run drizzle:generate`). Note: Postgres `ALTER TYPE ... ADD VALUE` cannot run
   inside a transaction block in some setups — verify the generated migration applies cleanly.
2. **Client adapter**: new `frontend/pixel-adapters/clarity-adapter.ts` following the shape of
   the existing adapters. Clarity's snippet is:
   ```js
   (function(c,l,a,r,i,t,y){
       c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
       t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
       y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
   })(window, document, "clarity", "script", PIXEL_ID);
   ```
   Clarity is a **session-recording/heatmap** tool, not a conversion pixel. It has no
   purchase/add-to-cart event API worth wiring. Implement `init()` properly; for the
   event-tracking methods required by the adapter interface, either no-op or map to
   `clarity("event", name)` if the interface demands a real implementation. **Do not** invent
   a fake Conversions-API server adapter for it — Clarity has no server-side ingest endpoint.
3. **Register** it in `frontend/pixel-adapters/registry.ts` / `factory.ts` per the existing pattern.
4. **Admin UI**: add to `PLATFORM_LABELS` and `PIXEL_ID_PLACEHOLDERS` in
   `pages/dashboard/admin/pixels/+Page.tsx`. Placeholder should hint at the Clarity project ID
   format (a short alphanumeric string, e.g. `abcdefghij`). The "Access Token" and
   "Server-Side" controls are meaningless for Clarity — hide or disable them for this platform.
5. **Client instructions** (for the handover doc): get the project ID from
   clarity.microsoft.com → project → Settings → Overview → the ID in the install snippet.

---

## Workstream 3 — Entry popup

A first-visit popup collecting **email + phone** in exchange for a **first-order discount**,
feeding the existing subscriber list.

### 3.1 CMS configuration

Follow the layout-settings pattern exactly (see "Ground truth" above — remember **both**
merge functions). Store under a new `popup` key. Everything the admin controls:

| Field | Notes |
|---|---|
| `enabled` | Master on/off |
| `imageUrl` | Upload, reuse `uploadLayoutImage` with a new `"popup"` prefix |
| `titleEn` / `titleAr` | e.g. "BECOME A MEMBER" |
| `descriptionEn` / `descriptionAr` | Supporting copy |
| `submitLabelEn` / `submitLabelAr` | e.g. "SUBSCRIBE" |
| `successMessageEn` / `successMessageAr` | Shown after signup, must be able to include the code |
| `dismissLabelEn` / `dismissLabelAr` | Optional secondary button text |
| `dismissHref` | Where the secondary button goes (blank = just close) |
| `collectPhone` | Toggle; and `phoneRequired` toggle |
| `promoCodeId` | **Which existing promo code to issue.** Admin picks from a dropdown of promo codes. |
| `codeMode` | `existing` (use `promoCodeId` as a shared code) or `generate` (unique per subscriber, derived from the selected code's discount settings) |
| `triggerDelaySeconds` | Default 5 |
| `triggerScrollPercent` | Optional, 0 = disabled |
| `triggerExitIntent` | Desktop only |
| `reshowAfterDays` | How long a dismissal is remembered client-side |

The `promoCodeId` dropdown satisfies the user's requirement that *"everything is to be
controlled through the CMS even what promo codes show"* — the admin selects which code the
popup hands out; they are not editing discount logic in two places.

### 3.2 Abuse gate (server-side — the important part)

Client-side suppression (localStorage) only stops the popup *re-appearing*. It does **not**
stop abuse — incognito or cleared storage defeats it. The real gate is on **issuance**:

- New table `popup_claim`: `id`, `email` (unique), `phone` (unique, nullable), `promoCodeId`,
  `issuedCode`, `claimedAt`, `ipAddress`, `userAgent`.
- On submit: if the email **or** the phone already exists in `popup_claim`, do **not** issue a
  new code. Return the *existing* code for that person (so a genuine user who lost the email
  isn't punished) but never mint a second one.
- Normalise before comparison: lowercase/trim email; strip spaces, dashes and leading `+`/`00`
  country prefix from phone so `+20 100 123 4567` and `01001234567` collide correctly.
  **Egyptian numbers are the primary case — handle the `+20` / `0` prefix equivalence.**
- When `codeMode = "generate"`: create a real row in `promoCode` with `usageLimit: 1`,
  copying `discountType`/`discountValue` from the admin-selected template code. Generate a
  collision-resistant suffix (e.g. `SYNT5-` + 6 random base32 chars, retry on unique violation).

### 3.3 Frontend component

- New `components/EntryPopup.tsx`, rendered from `layouts/LayoutDefault.tsx` alongside the
  other global overlays (guard with `!isDashboardRoute` like its neighbours).
- Must be **SSR-safe** — do not touch `window`/`localStorage` during render; gate on an effect.
- Must be **RTL-aware**: use the `direction` from the i18n context; do not hand-roll
  `textAlign`/`alignItems` flips.
- Accessibility: focus trap, `Esc` to close, restore focus on close, `aria-modal`.
- Do not block the page on first paint — it appears on a trigger, never during hydration.
- Reuse the existing subscribe path rather than duplicating it: extend the endpoint in
  `backend/settings/trpc.ts` (or add a sibling `subscribePopup`) that writes to
  `comingSoonSubscribers` **and** `popup_claim`, then sends the welcome email with the code.

### 3.4 Success path

On success the popup shows the code inline **and** the welcome email fires (Workstream 4's
`welcome` automation). If the email fails to send, the popup must still show the code —
never leave a user who gave you their data with nothing.

---

## Workstream 4 — Email automation suite

The large one. Build the engine first, then the eight automations on top of it.

### 4.1 Provider-agnostic sending layer

Refactor `shared/email/service.ts`:

- Keep `EmailServiceInterface` as the seam. Widen `sendEmail` to accept an options object
  (`to`, `subject`, `html`, `fromName?`, `fromAddress?`, `replyTo?`, `headers?`) rather than
  three positional strings — the `List-Unsubscribe` header is required for bulk sending.
- **Fix the hardcoded sender.** `from: input.smtpUser` must become a configurable
  `EMAIL_FROM_ADDRESS` / `EMAIL_FROM_NAME` (env), falling back to `smtpUser` when unset.
  This is what enables `cr@syntperfumes.com` as the visible sender.
- Keep the existing SMTP implementation as the default concrete provider. Add the interface
  boundary so a Resend/SES implementation can be dropped in later **without touching callers**.
  Do not add a provider SDK dependency now.
- **Preserve** the existing data-URI → CID inline-attachment rewriting. Gmail blocks base64
  data URIs in HTML; removing this silently breaks logos in every email.
- Preserve the fail-soft behaviour (email failure must never roll back an order) — but for
  *queued* automation sends, a failure must mark the queue row failed for retry, not vanish.

### 4.2 Scheduler + queue

New table `scheduled_email`:

| Column | Purpose |
|---|---|
| `id` | uuid v7 |
| `automationType` | enum: the 8 types + `broadcast` |
| `recipientEmail` | who |
| `locale` | `en` / `ar`, resolved at enqueue time |
| `payload` | jsonb — the data the template needs (order items, product, code, …) |
| `scheduledFor` | timestamptz — when it becomes due |
| `status` | enum: `pending`, `sending`, `sent`, `failed`, `cancelled` |
| `attempts` | int, for backoff |
| `lastError` | text |
| `dedupeKey` | text, **unique** — prevents double-enqueueing the same logical send |
| `sentAt`, `createdAt` | timestamps |

Worker:
- Started from `server/server.ts`. Wakes on an interval (60s is fine).
- Claims due rows atomically: `UPDATE ... SET status='sending' WHERE id IN (SELECT ... WHERE
  status='pending' AND scheduled_for <= now() ORDER BY scheduled_for LIMIT n FOR UPDATE SKIP LOCKED)
  RETURNING *`. **`FOR UPDATE SKIP LOCKED` is mandatory** — without it a second app instance
  double-sends.
- Retries with exponential backoff, capped (e.g. 5 attempts) then `failed`.
- **Cancellation matters**: when an abandoned cart is completed, or an order is cancelled,
  the pending follow-ups for that `dedupeKey` prefix must flip to `cancelled`. Emailing
  someone about a cart they already bought is worse than not emailing at all.
- Guard with an env flag (e.g. `EMAIL_WORKER_ENABLED`) so dev machines don't send real mail.

### 4.3 Cart capture

New table `captured_cart`: `id`, `sessionToken` (anonymous id from a cookie), `userId` (nullable),
`email` (nullable — filled the moment it becomes known), `phone` (nullable), `items` jsonb,
`subtotal`, `locale`, `lastActivityAt`, `convertedOrderId` (nullable), `createdAt`, `updatedAt`.

- Frontend syncs the cart to the server on change, **debounced** (~3-5s) — do not fire a
  request per click.
- Email is attached as soon as it is known: popup signup, login, or checkout entry.
- A cart is "abandoned" when `lastActivityAt` is older than the threshold, `email IS NOT NULL`,
  and `convertedOrderId IS NULL`.
- On successful order creation, set `convertedOrderId` **and cancel** the pending abandoned-cart
  queue rows for that cart.
- **Privacy**: this stores personal data tied to browsing behaviour. Only capture once an email
  is known or the user has interacted; respect the existing tracking-consent mechanism
  (`trackingConsent` table) where applicable.

For **abandoned browse**, record product views against the same session/email linkage. Keep it
lightweight — last N viewed products, not a full clickstream.

### 4.4 Template system (preset + editable fields)

New table `email_template`: `id`, `automationType` (unique), `enabled`, `subjectEn`/`subjectAr`,
`preheaderEn`/`preheaderAr`, `content` jsonb (all editable text/image/button fields, EN+AR),
`delayMinutes` (per-step timing), `updatedAt`.

- Ship a **seeded default** for all 8 so the client has working emails on day one and only
  overrides what they want.
- Rendering: one shared React Email layout (header w/ logo, body slots, footer w/ social +
  unsubscribe) matching the two reference designs — off-white background, generous whitespace,
  centered wordmark, black rectangular CTA button, bordered product row with image left /
  details right, social icon row, fine-print footer.
- **RTL**: when locale is `ar`, set `dir="rtl"` on the email root and mirror the layout. Test in
  a real client — email RTL is not the same as web RTL.
- **Email HTML constraints** (non-negotiable, Outlook/Gmail will break otherwise): table-based
  layout, inline styles, no flexbox/grid, no external CSS, no web fonts, images with explicit
  width and `alt`. React Email handles most of this — do not fight it with custom CSS.
- Admin UI: new dashboard page, one card/tab per automation, live preview pane, "send test
  email to me" button. **Include the test-send** — the client will otherwise test on customers.

### 4.5 The eight automations

| # | Type | Trigger | Timing | Data needed |
|---|---|---|---|---|
| 1 | `welcome` | Popup/newsletter signup | Immediate | Discount code, brand story |
| 2 | `review_check` | Order marked delivered | +7–14 days (admin-set) | Order items, review link |
| 3 | `abandoned_cart` | Cart idle w/ known email | +1h, +24h, +48–72h (3 steps) | Cart items, images, code on step 3 |
| 4 | `abandoned_browse` | Product viewed, not carted | +24h (admin-set) | Viewed product, reviews, badge |
| 5 | `win_back` | No order in N days | +60/90/120 days (admin-set) | Last purchase, new arrivals, code |
| 6 | `new_drops` | Manual / new product publish | On send | Selected products |
| 7 | `flash_offer` | Manual broadcast | On send | Offer details, expiry |
| 8 | `retention` | Manual / scheduled broadcast | On send | Editorial content |

Notes:
- 1–5 are **triggered** — they need the scheduler and the cancellation logic.
- 6–8 are **broadcasts** — "compose and send to a segment". They reuse the same template system
  and queue, but need a recipient-selection UI (all subscribers / customers only / no order in
  N days). Enqueue in batches; do not build one giant transaction.
- Order confirmation and shipping updates **already exist** as transactional emails. Do not
  duplicate or route them through the marketing unsubscribe check.

### 4.6 Unsubscribe + compliance

- `email_subscription` state per address: `unsubscribedAt`, `unsubscribeToken` (unguessable).
- Every **marketing** email includes an unsubscribe link and a `List-Unsubscribe` header
  (plus `List-Unsubscribe-Post` for one-click) — Gmail/Yahoo bulk rules require it.
- Public preference page at `/unsubscribe?token=…`. Must work **without login**.
- **Transactional emails (order confirmation, shipping, password reset, verification) ignore
  unsubscribe status entirely.** This is not an optional feature — it prevents an unsubscribe
  from silently killing someone's order receipt. Enforce it at the queue level: transactional
  sends bypass the check by construction, not by remembering to skip it.
- The worker re-checks unsubscribe status **at send time**, not enqueue time — a 90-day win-back
  queued today must respect an unsubscribe that happens next week.

---

## Sender address: `cr@syntperfumes.com` (infrastructure, not code)

For the handover conversation — this part is not code, it's setup the client must do.

**Why Gmail SMTP is not an option here**: Gmail caps around 500 sends/day and its terms prohibit
bulk marketing sends. Running these automations through a Gmail account will get it throttled
and eventually suspended. This is a hard constraint, not a preference.

Two separate concerns, often confused:

1. **Sending** (outbound automation) — needs a transactional email provider for deliverability,
   bounce handling and volume. Resend, Amazon SES, Mailgun, Postmark.
2. **Receiving** (someone replies to `cr@`) — needs an actual mailbox. Google Workspace, Zoho Mail,
   or even a forwarding rule to an existing inbox.

You need both. A transactional provider alone means replies bounce; a mailbox alone means the
automations get blocked.

**DNS records required on `syntperfumes.com` regardless of provider** — without these, mail lands
in spam:
- **SPF** — authorises the provider to send as your domain.
- **DKIM** — cryptographically signs outgoing mail.
- **DMARC** — tells receivers what to do when SPF/DKIM fail. Start at `p=none` and monitor
  before tightening to `quarantine`/`reject`.

Because the decision is "later", the code must not assume a provider. Build against the
interface (4.1); switching becomes an env change plus one adapter file.

---

## Execution order

Do not reorder — later steps depend on earlier ones.

1. **W1** progress-bar link. Trivial, ship it first.
2. **W2** Clarity. Self-contained, no dependencies.
3. **W4.1** sending layer refactor (unblocks everything email).
4. **W4.2** scheduler + queue.
5. **W4.6** unsubscribe (before any marketing email can legally send).
6. **W4.4** template system + admin UI.
7. **W3** popup (depends on 4.1 + 4.4 for the welcome email).
8. **W4.3** cart capture.
9. **W4.5** the eight automations.

## Quality bar (explicit user instruction)

The user does not care how many iterations this takes. Correctness beats speed. Do not ship a
workstream with a known bug, a type error, or an untested edge case to "move faster" — go back
and fix it before advancing to the next workstream. If something is ambiguous or risky, slow
down and verify against the actual running code/DB rather than assuming.

## Findings discovered during execution (not originally in this plan)

- **Dead exception handling in `shared/email/service.ts`** (fixed as part of W4.1): a
  `try { ... yield* $(effect) ... } catch {}` pattern around a failing Effect never actually
  catches it — Effect's fiber runtime short-circuits the generator without going through JS's
  exception machinery. Both the inner (transport-creation fallback) and outer (whole-function
  fallback) try/catch blocks were dead code; the dummy-service fallback only worked in
  production by accident, via a second safety net one level up in `middleware.server.ts`
  (a plain async function, not inside `Effect.gen`). Fixed by moving the recovery inside an
  `Effect.sync` that catches synchronously and returns `null` as a normal success value instead
  of routing through the Effect error channel. If you see this same
  `try { yield* $(...) } catch` pattern elsewhere in the codebase while working on later
  workstreams, it has the same bug — flag it, don't assume it works.
- **Broken historical migration chain**: replaying all migrations (`drizzle-kit migrate`) from
  scratch against a truly empty Postgres fails partway through — an early migration does
  `ALTER TABLE "homepage_content" DROP CONSTRAINT IF EXISTS ...` on a table a prior migration
  never actually created in that replay order. This is pre-existing and unrelated to this
  plan's migrations (0045/0046 never touch `homepage_content`). It doesn't affect the real
  database (which was built incrementally, not replayed from scratch), but it means
  `drizzle-kit migrate` cannot be used to provision a fresh environment/CI database from
  nothing — `drizzle-kit push` (schema-diff based, ignores migration history) works as a
  workaround and is what the integration test setup below uses. Worth a dedicated fix at some
  point (bisect the migration files to find where the chain diverges), but out of scope here.

## Running the DB integration tests

Some correctness properties (row-locking behavior under real concurrency, in particular) can't
be meaningfully verified against a mocked DB client — mocking Postgres's lock manager doesn't
prove anything. `backend/email-automations/queue/__tests__/service.integration.test.ts` runs
against a real, disposable Postgres and is skipped automatically when `TEST_DATABASE_URL` is
unset, so the normal `npm test` run (no local Postgres) is unaffected.

To run it:
```bash
docker run -d --name synt-test-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=synt_test -p 8052:5432 postgres:16-alpine
DATABASE_URL="postgresql://postgres:postgres@localhost:8052/synt_test" npx drizzle-kit push --force
TEST_DATABASE_URL="postgresql://postgres:postgres@localhost:8052/synt_test" npm test -- --run backend/email-automations/queue/__tests__/service.integration.test.ts
docker rm -f synt-test-pg
```
Use `drizzle-kit push`, not `drizzle-kit migrate` — see the broken-migration-chain finding above.

If running more than one `*.integration.test.ts` file in the same command, they run sequentially
against that shared database (`fileParallelism` is disabled in `vitest.config.ts` whenever
`TEST_DATABASE_URL` is set) — without that, vitest's default cross-file parallelism causes one
file's `beforeEach` cleanup to race another file's inserts against the same tables, producing
flaky failures that have nothing to do with application correctness. Don't re-enable file
parallelism for these without adding per-file schema/database isolation instead.

## Rules for the executing agent

- **Run `npx tsc --noEmit -p .` after every workstream.** Do not batch up type errors.
- **Two merge functions.** Any new layout-settings field must be added to *both*
  `get-layout-settings/index.ts` and `get-layout-settings-raw.ts`. This exact omission has
  already caused a "saves but doesn't persist" bug in this project.
- **Migrations**: `npm run drizzle:generate` to create, and note that migration `0044_sweet_angel.sql`
  may still be unapplied — check before generating on top of it.
- **Do not send real email during development.** Gate the worker behind an env flag.
- If a decision in "Locked decisions" appears wrong once you're in the code, **stop and report**.
  Do not silently pick a different approach.
- Tests: the project uses vitest, invoked as `npm test` (**not** `npx vitest` — the wrapper is
  needed for the `better-sqlite3` ABI). Add coverage for the abuse gate, the queue claim logic,
  and unsubscribe enforcement at minimum — those are the three places where a bug is expensive.
