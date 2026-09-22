# Percé — LAUNCH CONFIGURATION

Everything that is **not code** and must be decided, supplied or configured
before Percé can safely accept a real customer order.

Every item below was derived by reading the runtime — the environment
variables the server actually reads, the database rows the storefront actually
queries, and the conditionals that actually gate a feature on or off. Nothing
here is guessed, and nothing here is a recommendation about how the business
*should* work.

**Status key**

| Status | Meaning |
|---|---|
| **REQUIRED FOR FIRST SALE** | An order cannot be placed, or cannot be fulfilled, or the storefront states something untrue, until this is set. |
| **OPTIONAL FOR FIRST SALE** | The store works without it; it improves the experience or the marketing. |
| **CAN WAIT** | No effect on taking or fulfilling the first order. |

Where a value has *no default on purpose* (support email, social links,
policies), the runtime hides the corresponding UI rather than inventing one.
That is deliberate — see `docs/CURRENT_PROJECT.md`.

---

## 1. BRAND

| Item | Where it is read | Default if unset | Status |
|---|---|---|---|
| Final brand name | `VITE_STORE_NAME` → `shared/config/branding.ts` `STORE_NAME`; CMS `layoutSettings.siteTitle` overrides the *displayed* name | `"Percé"` | **REQUIRED FOR FIRST SALE** — it appears in the order-confirmation email subject and body, and in every page title. Shipping under a working name that later changes means already-sent emails carry the old name. |
| Store description / meta | `VITE_STORE_DESCRIPTION` | `"Piercing jewelry, curated in Egypt."` | OPTIONAL FOR FIRST SALE |
| Currency label | `VITE_CURRENCY` | `"EGP"` | CAN WAIT (already correct) |
| Logo | Dashboard → Layout Settings → Header logo (uploaded file) | none — the header falls back to the store name as text | OPTIONAL FOR FIRST SALE |
| Email logo | Dashboard → Marketing Emails → Automation Settings; falls back to the header logo | none | OPTIONAL FOR FIRST SALE |
| Favicon | `assets/favicon.svg` (committed file) | a placeholder mark is committed | OPTIONAL FOR FIRST SALE |
| Support email | `VITE_SUPPORT_EMAIL` → `SUPPORT_EMAIL` | **none, deliberately** — every contact line is hidden when unset | **REQUIRED FOR FIRST SALE** — a customer whose COD order goes wrong currently has no address to write to. |
| Social URLs (Instagram / Facebook / TikTok / YouTube / WhatsApp) | `VITE_SOCIAL_INSTAGRAM`, `VITE_SOCIAL_FACEBOOK`, `VITE_SOCIAL_TIKTOK`, `VITE_SOCIAL_YOUTUBE`, `VITE_SOCIAL_WHATSAPP` | **none** — footer, `/links` and email icons render nothing | OPTIONAL FOR FIRST SALE. The previous brand's accounts must not be reused. |

---

## 2. DOMAIN

| Item | Where it is read | Default if unset | Status |
|---|---|---|---|
| Production origin | `PUBLIC_ORIGIN`, falling back to `BASE_URL` (`shared/config/site-url.ts`) | none | **REQUIRED FOR FIRST SALE** — `toAbsoluteUrl()` builds every email image URL and every password-reset / verification link from it. Unset means broken images and dead links in transactional email. |
| Canonical store URL | `VITE_STORE_URL`, falling back to `PUBLIC_ORIGIN` / `BASE_URL` | falls back as above | OPTIONAL FOR FIRST SALE (SEO/social preview only) |
| Trusted origins (auth CORS) | `TRUSTED_ORIGINS` | derived from the origin above | **REQUIRED FOR FIRST SALE** if the storefront is served from more than one hostname. |
| DNS / TLS | Hosting (Coolify), not the app | — | **REQUIRED FOR FIRST SALE** |
| Remote asset fallback | `PROD_ASSET_ORIGIN` | unset — product images resolve against the local `/uploads` directory only | CAN WAIT |

---

## 3. EMAIL

The email service is constructed only when SMTP credentials are present.
Without them the server logs `Missing SMTP configuration environment
variables` at boot and installs a dummy service: **no order confirmation, no
password reset, no email verification is ever sent, and nothing surfaces this
to the customer.**

| Item | Where it is read | Default if unset | Status |
|---|---|---|---|
| `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_PORT` | `shared/email/service.ts` | none → outbound email silently disabled | **REQUIRED FOR FIRST SALE** |
| `EMAIL_FROM_ADDRESS` | send options | falls back to `SMTP_USER` | OPTIONAL FOR FIRST SALE |
| `EMAIL_FROM_NAME` | send options | falls back to the SMTP account name | OPTIONAL FOR FIRST SALE |
| Order-confirmation template branding | `backend/emails/branding.ts` → CMS Layout Settings + `shared/config/branding.ts` | store name and logo resolve automatically | already wired (Phase 0) — no action |
| Password reset / email verification | `backend/auth/*` via the same email service | — | **REQUIRED FOR FIRST SALE** if customer accounts are offered at all (guest checkout works without it) |

> The order-confirmation page no longer claims an email was sent. It only
> shows the address the order was placed with.

---

## 4. PAYMENTS

Payment methods shown at checkout come from `payment.methods`, which derives
them from environment credentials via `shared/config/payment.ts`. The UI
cannot show a method that is not configured, and it cannot hide COD.

| Gateway | Detection | Current state | Status |
|---|---|---|---|
| **Cash on Delivery** | always available; never gated | **WORKING** — order is created with `paymentMethod: "cod"`, stock is decremented, confirmation email attempted | already the only method — no action |
| **Paymob** | `PAYMOB_SECRET_KEY` *or* `PAYMOB_API_KEY`, **and** one of `PAYMOB_CARD_INTEGRATION_ID` / `PAYMOB_WALLET_INTEGRATION_ID` / `PAYMOB_INTEGRATION_ID` | **IMPLEMENTED BUT UNCONFIGURED** — full intention-creation, redirect, webhook and polling path exists in code; zero credentials set; never exercised against Paymob | OPTIONAL FOR FIRST SALE if selling COD-only. **REQUIRED** before advertising card payment. |
| `PAYMOB_HMAC_SECRET` | webhook signature check | unset | **REQUIRED** if Paymob is enabled — without it the webhook cannot be trusted |
| **Stripe** | `STRIPE_SECRET_KEY` | **IMPLEMENTED BUT UNCONFIGURED** — Checkout Session + webhook + session polling exist; no keys | CAN WAIT. Stripe is a poor fit for an Egypt-only COD/local-card market; Paymob is the local gateway. |
| `STRIPE_WEBHOOK_SECRET`, `VITE_STRIPE_PUBLIC_KEY` | webhook verification / client key | unset | CAN WAIT |

**No card-scheme branding (Visa / Mastercard / Meeza / wallets) is rendered
anywhere.** Method labels and descriptions come from
`PAYMENT_METHOD_LABELS` / `PAYMENT_METHOD_DESCRIPTIONS`, and the Stripe
description that names Visa and Mastercard is only reachable when Stripe is
actually configured.

---

## 5. SHIPPING

Shipping is priced server-side by `backend/shipping/service.ts` (`quoteShipping`),
the single entry point used by both the public `shipping.quote` endpoint the
cart/checkout render from and by create-order, which re-quotes inside the
order transaction and never reads a fee from the client. Two modes, chosen at
Dashboard → Settings → Shipping and stored in `store_settings.shipping_rules`:

- **Flat fee for all orders** (`mode: "flat"`, and what a `NULL` column means):
  `store_settings.shipping_fee` for every order, governorate optional — the
  pre-zones behaviour, unchanged.
- **By governorate** (`mode: "zones"`): a rate per governorate from the
  canonical 27-entry list (`shared/shipping/egypt-governorates.ts`), an explicit
  "other governorates" fee, and per-governorate / fallback "not available".
  The flat fee is **not** consulted in this mode. Governorate becomes required
  at checkout; the cart says "Calculated at checkout" until one is picked.

Every order freezes what it was charged and why in `order.shipping` (amount),
`order.shipping_governorate_code` and `order.shipping_quote` (rule fee, rate
source, whether a free-shipping offer waived it). Editing rates never changes an
existing order. Bosta and Fincart remain *dispatch* integrations — they create
a delivery after the order exists; neither is consulted for a price.

| Item | Where it is read | Current state | Status |
|---|---|---|---|
| Shipping mode + governorate rates | `store_settings.shipping_rules`, edited at Dashboard → Settings → Shipping | `NULL` (= flat) | **REQUIRED FOR FIRST SALE** — enter the real per-governorate rates and switch to "By governorate", or set a flat fee. The admin card refuses zones mode with no rates and no fallback. |
| Flat shipping fee | `store_settings.shipping_fee` (flat mode only) | `0.00` | Used only while the mode is flat — at `0` the cart and checkout omit the shipping line entirely and the customer is charged nothing for delivery. |
| **Bosta** | `SYN_BOSTA_KEY` → `isBostaEnabled()` | **IMPLEMENTED BUT UNCONFIGURED** — creates a delivery after order creation; also supplies the city suggestions behind the checkout governorate field, which silently degrades to a plain text input when absent | OPTIONAL FOR FIRST SALE (orders can be dispatched manually) |
| Bosta pickup address | `BOSTA_PICKUP_CITY`, `BOSTA_PICKUP_ZONE_ID`, `BOSTA_PICKUP_DISTRICT_ID`, `BOSTA_PICKUP_FIRST_LINE`, `BOSTA_PICKUP_BUILDING_NUMBER`, `BOSTA_PICKUP_FLOOR`, `BOSTA_PICKUP_APARTMENT`, `BOSTA_PICKUP_LOCATION_ID`, `BOSTA_EGYPT_COUNTRY_ID` | unset | **REQUIRED** if Bosta is enabled |
| `BOSTA_WEBHOOK_SECRET` | webhook endpoint; disabled without `SYN_BOSTA_KEY` | unset | **REQUIRED** if Bosta is enabled |
| **Fincart** | `FINCART_ENABLED === "true"` (explicit opt-in) → `FINCART_API_KEY`, `FINCART_API_URL`, `FINCART_MERCHANT_LOCATION`, `FINCART_PICKUP_ID`, `FINCART_WEBHOOK_SECRET` | **IMPLEMENTED BUT UNCONFIGURED** — opt-in flag is off, webhook logs "disabled" at boot | CAN WAIT — pick one courier; running both is not required |
| Delivery-time promise | nowhere — deliberately | no delivery window, courier name or confirmation-call promise is rendered on any customer page | **REQUIRED FOR FIRST SALE** as a *business decision*, then entered as content (see §7) |

---

## 6. TRACKING

All pixels are database-driven (`pixel_config`), configured at
Dashboard → Pixels. **The table is empty.** Nothing is loaded client-side and
no server-side event is delivered until a row exists.

| Item | Where it is read | Current state | Status |
|---|---|---|---|
| Meta Pixel (browser) | `pixel_config` row, `platform='meta'`, `enable_client_side` | none | OPTIONAL FOR FIRST SALE — **REQUIRED before spending on Meta ads** |
| Meta CAPI (server) | same row, `enable_server_side` + `access_token` | none | OPTIONAL FOR FIRST SALE |
| TikTok / Snapchat / Pinterest | `pixel_config` rows per platform | none | CAN WAIT |
| Consent gating | `consent_required` / `consent_category` per row | n/a | CAN WAIT |
| Built-in analytics | `tracking_event` table, populated by the app itself | working, empty | no action |

The storefront already fires `product_viewed`, `product_added_to_cart`,
`checkout_started` and `checkout_completed` into the internal event pipeline;
they simply have nowhere external to go yet.

---

## 7. CONTENT

Everything here lives in the database and is entered through the dashboard.

| Item | Where | Current state | Status |
|---|---|---|---|
| **Categories** | Dashboard → Categories | **0 rows** | **REQUIRED FOR FIRST SALE** — `/categories/<slug>` cannot resolve and the navbar category menu is empty |
| **Products** (name, price, stock, images, variants) | Dashboard → Products | **0 rows** | **REQUIRED FOR FIRST SALE** — there is nothing to buy |
| Product images | uploaded per product | none | **REQUIRED FOR FIRST SALE** — cards fall back to `/assets/placeholder-product.png` |
| Homepage hero + editorial imagery | Dashboard → Homepage | none | **REQUIRED FOR FIRST SALE** — the homepage is the entry point |
| Shipping copy (product page accordion) | Dashboard → Settings → product page content | empty → section hidden | **REQUIRED FOR FIRST SALE** once a delivery policy exists |
| Returns copy (product page accordion) | same | empty → section hidden | **REQUIRED FOR FIRST SALE** once a returns policy exists |
| Return-policy page | Dashboard → Homepage → Return Policy (`enabled` + body) | disabled → `/return-policy` shows "not available yet" | **REQUIRED FOR FIRST SALE** |
| Terms & conditions | **no page exists in the app** | — | **REQUIRED FOR FIRST SALE** as a business decision. Checkout no longer links to a non-existent terms document. |
| FAQs | Dashboard → Settings | empty → FAQ section renders nothing | OPTIONAL FOR FIRST SALE |
| Testimonials / reviews | Dashboard → Homepage → Testimonials; `product_review` table | **0 rows** — nothing renders | CAN WAIT. Do not seed. |
| Announcement banner / marquee | Dashboard → Layout Settings | empty | CAN WAIT |
| Offers / promo codes | Dashboard → Offers, Dashboard → Promo Codes | **0 rows** — no offer UI renders anywhere | CAN WAIT |
| Coming-soon gate | `store_settings.coming_soon_mode` | `false` (storefront is open) | **REQUIRED FOR FIRST SALE** as a decision: turn it **on** until the catalogue exists, or accept that `/shop` currently shows an empty collection. |

---

## 8. OPERATIONAL ACCOUNTS

| Item | Where | Current state | Status |
|---|---|---|---|
| `DATABASE_URL` | production Postgres | set per environment | **REQUIRED FOR FIRST SALE** |
| `BETTER_AUTH_SECRET` / `JWT_SECRET` / `SESSION_SECRET` | auth | must be unique per environment | **REQUIRED FOR FIRST SALE** |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | admin bootstrap | set per environment | **REQUIRED FOR FIRST SALE** |
| `SUPERADMIN_EMAIL` / `SUPERADMIN_PASSWORD` | DB export/import page | intentionally unset locally | CAN WAIT |
| `STORE_OWNER_ID` / `SINGLE_SHOP_MODE` | single-shop resolution | `SINGLE_SHOP_MODE=true` | already set |
| Google / Facebook OAuth (`GOOGLE_CLIENT_ID`, `FACEBOOK_CLIENT_ID`, …) | social sign-in | unset — buttons hidden | CAN WAIT |

---

## 9. THE SHORT LIST

Strictly what blocks the **first real customer order**:

1. Products and categories in the database, with images.
2. A shipping fee (or an explicit decision that delivery is free).
3. `SMTP_*` — otherwise no order confirmation reaches the customer.
4. `VITE_SUPPORT_EMAIL` — otherwise the customer has nowhere to turn.
5. `PUBLIC_ORIGIN` and a live domain.
6. A returns policy (published to `/return-policy`) and delivery terms.
7. A decision on `coming_soon_mode` until 1–6 are done.

Everything else — Paymob, Stripe, Bosta, Fincart, Meta Pixel, social accounts,
testimonials, FAQs, offers — can follow the first sale without the storefront
saying anything untrue in the meantime.
