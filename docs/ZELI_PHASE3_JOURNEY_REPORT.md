# ZELI PHASE 3 — Purchase journey, template alignment, selling readiness

> Not to be confused with the repository-root `PHASE3_REPORT.md`, which is an
> archived document from an **earlier project** (page transitions). This is the
> ZELI phase report. The authoritative project document remains
> [`docs/CURRENT_PROJECT.md`](CURRENT_PROJECT.md).

Scope: discovery → category → search → product → cart → checkout → order
confirmation, as one store. No commit, no push, no deploy, no production
writes, no schema migration, no catalogue data.

---

## A. ZELI production template preset

Defined once in [`shared/config/storefront.ts`](../shared/config/storefront.ts)
as `ZELI_TEMPLATE_PRESET`, with the per-id reasoning recorded beside it.

```
landing:       landing-minimal
home:          featured-products-modern     (inert — no customer route reads it)
sorting:       sorting-minimal
productPage:   product-minimal
categoryPage:  category-minimal
cartPage:      cart-minimal
checkoutPage:  checkout-modern
searchResults: search-results-minimal
```

Two selection rules were verified rather than assumed:

- **No `*-editorial` template may be a fallback.** Every one wraps itself in
  `EditorialChrome`, which renders a second footer and hides the global one
  from a client-only `useEffect` — so SSR emits both and one disappears on
  hydration. A unit test enforces this.
- **`cart-editorial` is functionally incomplete**, not merely a different
  look: it types `onApplyCoupon` as fire-and-forget, omits the coupon
  feedback/notice/remove props entirely, and renders neither
  `OfferProgressBanner` nor `AppliedOffersSavings`. Selecting it silently
  drops the working offers and promo-code UX.
- **`search-results-grid` ships placeholder scaffolding** — a filter sidebar
  reading "Filter options will appear here", "Price filters will appear here",
  "Stock filters will appear here", shown to customers.

### Local dev DB alignment

Value read from `store_settings.template_selection` **before** the change
(recorded per the phase brief):

```json
{
  "home": "featured-products-modern",
  "landing": "landing-minimal",
  "sorting": "sorting-minimal",
  "cartPage": "cart-editorial",
  "productPage": "product-minimal",
  "categoryPage": "category-grid-classic",
  "checkoutPage": "checkout-editorial",
  "searchResults": "search-results-grid"
}
```

The local row was then set to the preset above. **Production was not
touched.** No migration was written.

---

## B. Customer journey architecture

| Route | Renders | Selector | Data source |
|---|---|---|---|
| `/` | `landing-minimal` | `templateSelection.landing` | `homepage_content` (SSR via `+data.ts`) |
| `/shop` | `MinimalCategoryPage` | **shell-owned** (`navbarStyle === "minimal"`); else `sorting` | `product.search` (client), `category.view`, `homepage.getContent` for `?section=` |
| `/categories/[slug]` | `MinimalCategoryPage` | **shell-owned**; else `sorting` | `category.view` → `product.search` (client) |
| `/search?q=` | `search-results-minimal` | `templateSelection.searchResults` | `product.search` (client) |
| navbar live search | `MinimalNavbar` | shell | `product.search` limit 5 + client-side category filter |
| `/featured/products/[id]` | `product-minimal` | `templateSelection.productPage` | `product.getById`, `product.getReviews`, `category.viewMain`, `product.view`, `product.search` |
| `/cart` | `cart-minimal` | `templateSelection.cartPage` | `CartContext` (localStorage) + `settings.getShippingFee`, `offer.evaluate`, `promoCode.validate` |
| `/checkout` | `checkout-modern` | `templateSelection.checkoutPage` | `CartContext`, `payment.methods`, `order.bosta.listShippingLocations`, submits `order.create` |
| `/order-confirmation` | bespoke page (no selector) | — | URL query params + `payment.verify` polling |
| `/login`, `/register`, `/forgot-password` | `Minimal*Page` | shell | `better-auth` client |
| `/reset-password`, `/verify-email` | bespoke | — | `better-auth` client |
| `/account`, `/orders` | bespoke | — | tRPC user/order queries |
| `/offers` | bespoke | — | `offer.listActive` |
| `/contact`, `/return-policy` | bespoke / `ReturnPolicyPage` | — | `homepage_content` (SSR) |
| `/links` | bespoke, chromeless | — | `store_settings.link_tree_config` |
| `/_error` | bespoke | — | — |
| `/featured/{men,women,brands,products}`, `/featured/*/categories/[id]` | legacy gendered routes | `sorting` / `categoryPage` | no inbound links anywhere in the ZELI shell |

Notes worth carrying forward:

- **`templateSelection.home` is dead.** No customer route reads it; the
  landing templates compose `HomeFeaturedProducts` directly. Kept in the
  preset so the admin preview resolves.
- Catalogue pages fetch **client-side**, so SSR emits a skeleton and the real
  grid (or empty state) appears after hydration. Pre-existing; not changed.

---

## C. Shop (`/shop`)

`MinimalCategoryPage` moved onto the ZELI token system and had its
information design corrected.

- Palette: `stone-*` / `bg-white` → `zeli-bg`, `zeli-surface`, `zeli-ink*`,
  `zeli-line*`. Container/gutters → `.zeli-container`.
- **Header clearance:** `mt-25` (an ad-hoc 6.25rem) → `.zeli-header-offset`,
  which tracks the chrome's *measured* height. The old value did not match the
  real navbar + banner stack.
- **Result count** added, driven by the API's own `total`. No estimate.
- **Two distinct empty states** replacing one: a search that matched nothing
  gets "No products match this search" plus a *Clear search* control; a
  collection with no products gets "Nothing here yet" and a route home. The
  single old message told shoppers to "adjust your filters" on a page that has
  no filters — including on a brand-new store with zero products.
- Skeleton changed from `aspect-square` to `aspect-[4/5]`, matching
  `MinimalProductCard`, so the grid no longer reflows when data lands.
- Toolbar: search + sort only, both backed by real `product.search`
  parameters. No price/brand/rating facets — the product schema has no fields
  behind them.
- Breadcrumb `<nav>` with `aria-current`, pagination promoted to a labelled
  `<nav>` with `aria-current="page"` and 44px targets.

No fake products, no clothing imagery, no invented counts, no scarcity, no
badges beyond the real `sale` / `out of stock` states the card already derives.

---

## D. Category (`/categories/[slug]`)

Shares `MinimalCategoryPage`, so everything in §C applies, plus:

- The **not-found** state was a bare stone-palette block with a pill button;
  it is now a ZELI page with a truthful message and a route to `/shop`.
- The non-minimal breadcrumb on both `/shop` and `/categories` became a real
  `<nav aria-label="Breadcrumb">` on ZELI tokens.
- Category title and product grid come from `category.view` + `product.search`.
  No editorial copy is invented and no product count is fabricated.

**Fabricated defaults removed from the alternate category templates** (they
stay selectable, so they had to be cleaned):

- `CategoryGridClassic`, `CategoryHeroSplit`, `CategoryPageGridWithFilters`
  defaulted their filter lists to `Electronics / Fashion / Home & Garden /
  Sports` and `Apple / Samsung / Sony / LG`, each with an invented product
  count. Now empty arrays.
- `CategoryPageGridWithFilters` additionally defaulted `products` to **twelve
  fabricated "Premium Product N" entries** with invented prices, Unsplash
  placeholder photography and invented star ratings — and it was the hardcoded
  fallback id in the `/featured/*/categories/[id]` routes. Now `[]`, and those
  routes resolve through the preset instead.
- Its default SEO paragraph ("the best deals and exceptional customer
  service") and default category description were blanked.

---

## E. Search

- `/search` now renders **`search-results-minimal`** instead of
  `search-results-grid` (placeholder filter sidebar, marketplace card look).
- **Real bug fixed:** the sort dropdown offered *Most Relevant*, *Name: A to
  Z* and *Name: Z to A*. `product.search` validates `sortBy` against
  `z.enum(["newest","price-asc","price-desc"])`, so choosing any of those
  three sent a request the server rejected; the failure was swallowed by a
  `try/catch` and the shopper was left staring at the previous results with no
  error. Only the three supported orderings are offered now.
- The results grid now uses **`MinimalProductCard`** — the same card as
  `/shop`, `/categories` and the homepage carousels — instead of
  `components/shop/ProductCard`. Same imagery ratio, same pricing behaviour,
  same discount treatment, same out-of-stock treatment.
- Header dropped from `text-7xl` (which overflowed at 375px) to
  `.zeli-section-title`; result count is `aria-live`; the refine input has a
  real label; loading has `role="status"`; pagination is a labelled `<nav>`
  with `aria-current` and 44px targets.
- Empty state states the fact and only offers *Clear search* when there is
  something to clear.
- **Navbar live search:** it printed `p.price` unconditionally, so a
  discounted product was quoted at its pre-discount price in the dropdown and
  at its real price everywhere else. It now shows struck-through original +
  sale price, matching the cards. Fixed on both the desktop and mobile
  dropdowns.

Search backend logic was not rewritten.

---

## F. Product

`product-minimal` confirmed as the ZELI product page, and given the pass it
had not had.

- **Selector bug fixed:** the page hard-coded `"product-minimal"` whenever the
  shell was minimal, which silently ignored the admin's own choice in
  Dashboard → Templates → Product Page. It now resolves through
  `resolveTemplateId("productPage", …)`, so a DB selection wins and the preset
  is the fallback.
- Full ZELI token pass — the file had **zero** ZELI tokens and ~46 distinct
  `gray-*` / `stone-*` / `black` / `white` classes.
- **Mobile sticky add-to-cart bar was underneath the bottom nav:**
  `bottom-15` is 3.75rem; the fixed mobile bottom nav is `h-16` (4rem) plus the
  safe-area inset. The Add-to-cart button was covered. Now positioned at
  `calc(4rem + env(safe-area-inset-bottom))` on the shared `--zeli-z-sticky`
  layer.
- **"Best Layered With" accordion** rendered unconditionally and, with nothing
  to show, told the shopper "Stay tuned for our recommended layering
  combination.." — an empty section promising future content, in the middle of
  the information a buyer reads to decide. It now renders only when there are
  real products, and is titled *Pairs With* rather than borrowing the previous
  perfume brand's layering vocabulary.
- **`fragranceInfo` / Scent Notes:** already correctly guarded behind
  `hasScentNotes` — nothing renders when the field is empty. Verified, left in
  place. The DB field was **not** migrated or removed, per the brief.
- Shipping and Returns accordions remain admin-authored-only (Phase 2) — they
  render nothing when the CMS is empty.
- Gallery, thumbnails, variants, quantity, stock, out-of-stock state,
  discounts, add-to-cart, related carousels, breadcrumbs and SEO metadata were
  left functionally intact.

No material, waterproof, hypoallergenic, tarnish, shipping, return, warranty,
scarcity or review claim is asserted anywhere on the active path.

---

## G. Cart

`cart-minimal` selected — the only cart template implementing the complete
working prop surface (offer progress banner, applied-offer savings, per-line
free quantities, the full promo apply/remove/notice cycle, mobile sticky CTA).

- Full ZELI token pass, including the inline `#111827` literals.
- **The mobile sticky checkout bar was never anchored.** It carried
  `fixed inset-x-0 z-40` with **no `bottom`**, so it sat at its static
  position and scrolled away — while `pb-60` above reserved empty space for a
  bar that was not there. It is now pinned above the mobile bottom nav at
  `calc(4rem + env(safe-area-inset-bottom))` on `--zeli-z-sticky`.
- The page did not clear the fixed header chrome; the "Cart" heading started
  underneath the navbar. Fixed with `.zeli-header-offset`.
- **Shipping line:** read "Calculated at checkout" whenever the fee was zero or
  unknown. Checkout applies the same single flat
  `store_settings.shipping_fee` and calculates nothing, so the line promised a
  step that does not exist. The row now renders only when a fee is actually
  configured.
- Mobile quantity steppers (38px) and the remove button (32px) raised to 44px.
- Empty cart restyled; loading spinner given `role="status"`.
- `AppliedOffersSavings` and `OfferProgressBanner` tokenised (they were emerald
  and amber). Both still render **nothing** unless a real offer applies.

### Claims removed from `cart-modern` (alternative, still selectable)

- **"We accept" followed by VISA, Mastercard, Meeza and Apple Pay marks**, in
  the cart summary one click before checkout. None is accepted: no gateway is
  configured, `payment.methods` returns COD only, and Apple Pay has no code
  path in this repository at all.
- Three trust rows: "100% Authentic Products", "Secure Payments", "Fast &
  Reliable Delivery", "Easy Returns", "Fast Delivery", "Secure Checkout".

---

## H. Checkout — the important one

### Actual behaviour, traced end to end

`checkout-modern` → `handleSubmit` → `order.create` (tRPC) → on success either
navigate to `/order-confirmation` (COD) or `payment.createSession` → gateway
redirect. Cart is cleared **after** creation for COD, and deferred to the
confirmation page for online payment so the browser back button does not lose
the cart.

Verified against the live dev server, without creating any order:

- `order.create` with a nonexistent product → `{"success":false,"error":
  "Products not found"}`. **No order row was written** (`order` table still
  0 rows after the probe).
- `order.create` with empty fields → a Zod issue array, which the page's
  `parseOrderError` maps to friendly field labels ("Full Name: …",
  "Governorate: …").
- `shippingPostalCode: ""` is **accepted** — the schema is
  `.optional().nullable()`.
- Server-side stock check, offer evaluation and promo revalidation all happen
  inside the order transaction, not just in the browser.
- **Duplicate submit:** `isSubmitting` disables both the desktop and mobile
  submit buttons for the duration of the request. Both live in the same
  `<form>`; only one is visible at a time.

### Payment integrations

| Integration | Classification | Evidence |
|---|---|---|
| **Cash on Delivery** | **WORKING** (untested end-to-end only because there is no product to buy) | Always in `getAvailablePaymentMethods()`; `payment.methods` on the dev server returns COD alone |
| **Paymob** | **IMPLEMENTED BUT UNCONFIGURED** | Intention creation, redirect, HMAC webhook and intention polling all exist; `isPaymobConfigured()` is false — no key, no integration id |
| **Stripe** | **IMPLEMENTED BUT UNCONFIGURED** | Checkout Session, webhook and session polling exist; `isStripeConfigured()` is false |
| **Bosta** | **IMPLEMENTED BUT UNCONFIGURED** | `isBostaEnabled()` false (`SYN_BOSTA_KEY` unset); webhook logs "disabled" at boot; also supplies the governorate suggestions, which degrade to a plain text input |
| **Fincart** | **IMPLEMENTED BUT UNCONFIGURED** (opt-in) | `FINCART_ENABLED !== "true"`; webhook logs "disabled" at boot |
| Apple Pay / Meeza / Mada | **DEAD** — never existed | Referenced only as hardcoded logos, now removed |

The checkout UI shows **only** what `payment.methods` returns, and that list
is derived from environment credentials. It cannot display an unconfigured
gateway.

### Shipping state

There is **no rate engine**. `store_settings.shipping_fee` is one flat decimal
applied to every order. Bosta and Fincart are dispatch integrations consulted
*after* the order exists; neither prices anything. No per-governorate table
exists. Local value: `0.00`.

### Changes made

- **Every field now has a real `<label>`.** They were labelled by placeholder
  alone — which disappears on typing, is not reliably announced, and gives
  autofill nothing stable to match.
- **Errors are associated with their fields** via `aria-invalid` +
  `aria-describedby`, and each error region carries `role="alert"` and exists
  before the error does. Previously a screen-reader user tabbing into a
  rejected "Phone Number" heard nothing.
- **Duplicate element id removed.** `renderCouponBlock()` is rendered twice
  (desktop card and mobile panel are both in the DOM; one is hidden by
  `lg:hidden` / `hidden lg:block`), so two elements shared
  `id="checkout-promo-code-feedback"` — invalid HTML, and the input's
  `aria-describedby` resolved to whichever came first, which on mobile is the
  hidden one. Each scope now has its own id.
- **`postalCode: "00000"` no longer forged onto every order.** Egyptian
  addresses are not routed by postal code, nothing downstream consumes one,
  and the schema accepts an empty string. It now submits blank instead of a
  value that looks like data and is not.
- **"Fast Delivery — Quick delivery to your doorstep." removed** from the
  summary card. No delivery time is set and no courier is configured, and the
  claim sat at the exact moment the shopper decides to pay.
- **"Secure Checkout — Your payment information is safe with us." is now
  conditional** on the server having offered a non-COD method, and reworded to
  the fact ("Card details are entered on the payment provider's own page").
  In a COD-only store there is no payment information to secure.
- **The Terms & Conditions line is gone.** It linked to `/links`, which is the
  link-tree page, not a terms document — ZELI has published no terms, so it
  pointed a paying customer at an agreement that does not exist. It reappears
  automatically if an admin supplies real copy via the `checkout.terms`
  translation override.
- Palette moved off `green-600` / `emerald-600` onto ZELI tokens; the page
  clears the header chrome and uses `.zeli-container`.

### Blockers

1. **No products** — checkout cannot be completed end to end.
2. **Shipping fee is 0** — customers are charged nothing for delivery.
3. **No SMTP** — the confirmation email is never sent.
4. **No support email** — a COD order that goes wrong has nowhere to go.

---

## I. Egypt checkout UX

Reviewed against the actual order schema — nothing migrated, nothing invented.

| Field | Status |
|---|---|
| Phone | Free text, `type="tel"` + `inputMode="tel"` (numeric keypad), placeholder `01XXXXXXXXX`, validated as 7–20 digits/spaces/`+()-`. Deliberately not locked to `01[0-25]\d{8}` — the store also has to accept landlines and `+20` forms. |
| Governorate | `CityCombobox`, free text with suggestions from Bosta's city list; degrades to a plain input when Bosta is unconfigured (which it is). Deliberately **not** a closed 27-governorate `<select>`: nothing downstream validates against a canonical list, so a closed list would reject deliverable addresses. Labelled optional, because the schema treats it as optional. |
| City / area | Required free text. |
| Street address | Required, minimum 5 characters. |
| Building / floor / apartment | `buildingNumber` and `apartment` are collected and accepted by `order.create`. **There is no floor field** in the order schema — Bosta's pickup config has `BOSTA_PICKUP_FLOOR` for the *merchant* address, but the customer address has no equivalent. Documented, not migrated. |
| Postal code | Now submitted blank. Schema-optional. |
| Country | Not shown; always submitted as `"Egypt"`. |

**Documented mismatches (no migration performed):**

- `order.shippingPostalCode` exists but is meaningless for this market.
- No customer-side `floor` field, though Bosta's delivery payload models one
  for the pickup address.
- `shippingState` is nullable in the schema but is the governorate — the
  single most operationally important address field for an Egyptian courier.
  Marking it required is a schema decision, not a UI one.

> **Update (2026-09-17).** The input-schema half of the last point was fixed.
> `order.shipping_state`, `shipping_postal_code` and `shipping_country` are all
> NOT NULL columns, but `createOrderSchema` accepted them as
> `.optional().nullable()`, so an API request that omitted them passed
> validation and then failed inside Postgres as a 500. They are now required
> **keys** (`z.string().trim()`), rejected at the tRPC input boundary before
> any order transaction opens. Presence only: state and postal code may still
> be `""`, because the Governorate input is optional in the checkout templates
> and this market has no postal codes — so the two observations above about
> empty values being accepted still hold. `shippingCountry` additionally
> requires a non-empty value, since checkout always sends "Egypt". No
> migration was needed; the database was already correct. See
> `backend/orders/create-order/__tests__/validation.test.ts` and
> `address-contract.integration.test.ts`.

---

## J. Order confirmation

Restyled onto ZELI and reduced to statements the page can actually support.

Removed:

- **"We've sent a confirmation email with your order details. You'll receive
  shipping updates as your order progresses."** — the email only goes out when
  SMTP is configured, and there is no shipping-update pipeline at all.
- **"Don't worry — no charges were made."** — asserted on a *failed* payment,
  which this page cannot know. Replaced with a factual note that any
  authorised amount is released by the provider.
- "Confirmation sent to" relabelled "Order email" — the address the order was
  placed with, which is a fact.

Kept: order number, total, payment status, and the three real states
(placed / payment pending / payment cancelled-or-failed), all driven by
`payment.verify` polling against the gateway. No delivery date, courier
timeline, confirmation call or shipping window anywhere.

**Transactional email:** `backend/orders/create-order/service.ts` resolves
branding through `getEmailBranding()`, which reads `shared/config/branding.ts`
plus CMS Layout Settings and resolves the active landing template via
`resolveLandingTemplateId()`. Phase 0's centralisation is intact and in use.
Nothing can be sent locally — SMTP is unset and the server logs "Missing SMTP
configuration environment variables" at boot.

---

## K. Offers and discounts

Audited; **no functional change**, which is the correct outcome.

- Product, cart and checkout all read offers from `offer.evaluate` /
  `offer.listActive`, and `order.create` re-evaluates them server-side inside
  the order transaction.
- Every offer surface — `OfferProgressBanner`, `AppliedOffersSavings`,
  `StickyCartBar` — returns `null` when there are no offers. Verified against
  the live server: `offer.listActive` returns `[]` and nothing renders.
- Legitimate `free_shipping` offer support was **left intact**, per the brief.
  The 35 `free shipping` strings in the production bundle are all either that
  reward type's label, an admin dashboard placeholder, or the
  `cart.free_shipping` i18n key used only in offer-driven contexts. There is
  no unconditional free-shipping claim.
- No default free shipping, no fake strike-through (the sale price comes from
  `product.discountPrice`), no invented percentage, and every savings figure is
  computed from the cart by `computeOfferSavingsTotal`.

---

## L. Account and auth pages

Login, register, forgot-password, reset-password, verify-email, account and
orders. **No auth backend or security behaviour was touched.**

- ZELI token pass across `MinimalLoginPage`, `MinimalRegisterPage`,
  `MinimalForgotPasswordPage`, `ReturnPolicyPage`, `QuickViewDialog`,
  `/account`, `/orders`, `/verify-email`.
- Every auth field already had a real `<label htmlFor>` and correct
  `autoComplete` (`email`, `current-password`, `new-password`, `tel`, `name`).
  Added the missing half: `aria-invalid` on the input and `role="alert"` +
  matching `id` on the error, so eight fields across three forms now announce
  their own validation errors.
- Store name comes from `STORE_NAME` / CMS. No Lebsy, Percé or SYNT strings.
- No generic fashion imagery on any auth page.

---

## M. Empty and error states

| State | Before | Now |
|---|---|---|
| Empty shop / category (no products at all) | "No products found — Try adjusting your filters or browse our full collection" | "Nothing here yet — This collection has no products at the moment." + route home |
| Search matched nothing (on `/shop`) | same message as above | "No products match this search." + *Clear search* |
| `/search` no results | generic, always offered *Clear Search* | states the query, offers *Clear search* only when there is a query |
| Empty cart | grey stack, "Add items to your cart to continue shopping" | ZELI page, "Nothing added yet", *Continue shopping* |
| Category not found | stone-palette block with a pill button | ZELI page, factual, routes to `/shop` |
| **404 / 500** | **two bare `<h1>`/`<p>` tags — no layout, no styling, browser-default serif on white inside the ZELI shell** | full ZELI page with a `404`/`500` eyebrow, factual copy, and both real destinations |
| No account orders | existing empty state, retokenised | unchanged in substance |
| Failed checkout | server error surfaced through `parseOrderError` with field labels | unchanged in substance |
| Failed product load | error block | unchanged in substance |

No lorem ipsum, no fabricated products, nothing that reads as a developer
error.

---

## N. Mobile and accessibility — what was actually tested

**Not tested:** real rendering at 375 / 390 / 430 / 768 / 1024 / 1440 px. This
environment has **no browser and no headless browser available**, so no
viewport was ever rendered, measured or screenshotted. Any statement about how
these pages *look* at a given width would be fabricated. Stating this plainly
again, as the brief requires.

**Actually tested** (live dev server against the local dev DB, HTTP + rendered
HTML inspection):

- Every customer route returns its expected status: 200 across `/`, `/shop`,
  `/categories/*`, `/search`, `/cart`, `/checkout`, `/login`, `/register`,
  `/account`, `/orders`, `/offers`, `/contact`, `/return-policy`, `/links`,
  `/order-confirmation`; 404 on an unknown path.
- **Exactly one `<h1>` per route** on `/shop`, `/cart`, `/checkout`,
  `/search`, `/404`.
- **Zero duplicate element ids** on `/`, `/shop`, `/cart`, `/checkout`,
  `/search`, `/login`, `/register`, `/offers`, `/404`.
- `payment.methods` returns COD only; `product.search`, `offer.listActive`
  and `category.view` all return empty; `order.create` rejects invalid input
  with a parseable Zod array and writes nothing.
- No SSR errors in the dev server log across the sweep.

**Static review** (code-read, not rendered):

- No `min-width` wider than a phone anywhere in the journey; the widest
  constraints are `max-w-[1400px]` and a `min-w-[200px]` dropdown.
- Touch targets: pagination, sort, search, empty-state actions, cart
  steppers/remove and both submit buttons are now ≥44px. Desktop-only controls
  (36px) were left.
- Sticky/bottom-nav overlap: two real defects found and fixed (cart sticky bar
  unanchored; product sticky bar 4px+safe-area behind the bottom nav). Both now
  use `calc(4rem + env(safe-area-inset-bottom))` and `--zeli-z-sticky`, below
  the bottom nav's `--zeli-z-bottom-nav` and the header's `--zeli-z-header`.
- Safe area: the bottom nav already had `pb-[env(safe-area-inset-bottom)]`;
  both sticky bars now account for it.
- Checkout form density: single column on mobile, `1fr 380px` from `lg`;
  the order summary collapses to a tappable bar with the coupon box always
  visible rather than hidden behind the toggle.
- Focus visibility is handled globally by the `.storefront-shell
  :focus-visible` outline rule in `layouts/style.css`.

---

## O. Validation

| Check | Result |
|---|---|
| `npm run typecheck` | **pass** — 0 errors |
| `npm test` | **pass** — 497 passed, 62 skipped (all skips are the `*.integration.test.ts` files that need `TEST_DATABASE_URL`) |
| `npm run build` | **pass** |
| Biome lint (changed files) | **77 → 76** pre-existing errors on the same 22 files; **0 introduced**. Newly authored files (`pages/_error/+Page.tsx`, `shared/config/storefront.ts`, its test, the i18n file) lint clean. The remaining 76 are long-standing repo-wide rules (`useSemanticElements`, `noSvgWithoutTitle`, `useExhaustiveDependencies`, `useButtonType`, `noLabelWithoutControl`). |
| Legacy brand scan (source + `dist/`) | Only `product-perce` — the internal template id documented in `docs/CURRENT_PROJECT.md` as deliberately retained because it is persisted in `store_settings.template_selection`. Its customer-facing label is "Premium (Default)". No Percé, Percée, perce-eg, piercingsperce, Lebsy, Lebsey, SYNT or syntperfumes. |
| Claims scan (`dist/`) | 0 for free returns, complimentary shipping, 30-day, 14-day, money-back, guarantee, hypoallergenic, waterproof, tarnish, lifetime warranty, ships within, delivery in, We accept, VISA, meeza, Apple Pay, 100% Authentic, Happy Customers. `free shipping` × 35 and `30 day` × 14 all classified below. `Fast Delivery` × 1, `Easy Returns` × 2, `satisfied customers` × 4 are **this phase's own explanatory code comments** compiled into the SSR bundle — no customer-visible text. |

**Classification of every remaining runtime hit**

- `free shipping` (35) — the `free_shipping` offer reward label, admin
  dashboard placeholder/help text, and the `cart.free_shipping` i18n key.
  All offer-driven or admin-only. Legitimate; the brief explicitly says not to
  disable real `free_shipping` offers.
- `30 day` (14) — admin analytics date ranges ("last 30 days").
- `Fast Delivery` / `Easy Returns` / `satisfied customers` — code comments
  recording what was removed and why.

---

## P. Changed files

**New**

| File | Purpose |
|---|---|
| `docs/ZELI_LAUNCH_CONFIGURATION.md` | Every non-code prerequisite, derived from the runtime |
| `docs/ZELI_PHASE3_JOURNEY_REPORT.md` | This document |

**Configuration / architecture**

| File | Change |
|---|---|
| `shared/config/storefront.ts` | `ZELI_TEMPLATE_PRESET` for all 8 categories + `resolveTemplateId()`, with the reasoning for each id |
| `shared/config/__tests__/storefront.test.ts` | 16 tests: preset covers every registry category, every id exists, no `*-editorial` fallback, resolver precedence |
| `frontend/contexts/TemplateContext.tsx` | `getDefaultSelection()` now uses the preset instead of `templateConfig[category][0]` — the invisible fallback an unconfigured store actually got |
| `layouts/LayoutDefault.tsx` | Footer follows `navbarStyle` like the navbar, instead of keying off the landing template |
| `pages/{cart,checkout,search,shop}/+Page.tsx`, `pages/categories/@slug/+Page.tsx`, `pages/featured/**` (7 files) | Literal fallback ids replaced with `resolveTemplateId(...)` |
| `pages/featured/products/@productId/+Page.tsx` | Stopped hard-overriding the admin's product-template choice |

**Journey UI**

| File | Change |
|---|---|
| `components/template-system/minimal/MinimalCategoryPage.tsx` | ZELI tokens, header offset, result count, two empty states, a11y on breadcrumb/pagination/toolbar |
| `components/template-system/minimal/MinimalNavbar.tsx` | Live-search discount pricing (desktop + mobile) |
| `components/template-system/searchResults/SearchResultsMinimal.tsx` | ZELI tokens, invalid sort options removed, shared product card, a11y |
| `components/template-system/productPage/ProductPageMinimal.tsx` | Full token pass, sticky-bar overlap fix, "Pairs With" gated on real data |
| `components/template-system/cartPage/CartPageMinimalTemplate.tsx` | Full token pass, sticky-bar anchoring fix, header offset, truthful shipping row, 44px targets |
| `components/template-system/cartPage/{AppliedOffersSavings,OfferProgressBanner}.tsx` | Token pass |
| `components/template-system/checkoutPage/CheckoutPageModernTemplate.tsx` | Labels, error association, duplicate-id fix, postal code, claims removed, token pass |
| `pages/order-confirmation/+Page.tsx` | ZELI pass, unsupported statements removed |
| `pages/_error/+Page.tsx` | Rewritten from bare unstyled tags |
| `pages/{categories/@slug,shop}/+Page.tsx` | Breadcrumb `<nav>`, ZELI not-found state |
| `pages/offers/+Page.tsx` | Perfume copy from the previous brand replaced; token pass |
| `pages/{account,orders,verify-email,contact}/+Page.tsx` | Token pass |
| `components/template-system/minimal/{MinimalLoginPage,MinimalRegisterPage,MinimalForgotPasswordPage,ReturnPolicyPage,QuickViewDialog}.tsx` | Token pass + error association |
| `lib/i18n/minimal-category-translations.ts` | Result-count and split empty-state keys (EN + AR) |

**Fabricated content removed from alternative / legacy templates**

| File | Change |
|---|---|
| `components/template-system/categoryPage/{CategoryGridClassic,CategoryHeroSplit,CategoryPageGridWithFilters}.tsx` | Mock categories, brands, 12 mock products and default SEO copy → empty |
| `components/template-system/cartPage/CartPageModernTemplate.tsx` | "We accept VISA/Mastercard/Meeza/Apple Pay", four trust claims |
| `components/template-system/productPage/ProductPageModernSplit.tsx` | "Fast Delivery" / "Easy Returns" badges |
| `components/template-system/home/ModernHomeTemplateV2.tsx` | "Join thousands of satisfied customers" default |
| `shared/types/homepage-content.ts` | Default value props ("thousands of products", "Fast Delivery", "Secure Shopping"), footer CTA social proof, default 20%-off announcement |
| `components/template-system/landing/{LandingTemplateClassic,LandingTemplateEditorial}.tsx` | Guard the now-empty footer CTA subtitle |
| `frontend/components/template/templates/{home/ModernHomeTemplate,checkout/ModernCheckoutTemplate,brands/ModernBrandsTemplate,cart/DefaultCartTemplate}.tsx` | "50K+ Happy Customers", "7 Days Fast Delivery", "99% Satisfaction", "500+ Quality Products", "Secure/Trusted/Fast Delivery", "We accept:" placeholder logos |

**Docs**

| File | Change |
|---|---|
| `docs/CURRENT_PROJECT.md` | ZELI production template preset section + shell-owned routes rule |

---

## Q. Selling-readiness matrix

### Storefront

| Surface | Status | What is missing |
|---|---|---|
| Homepage | **CODE READY / NEEDS CONTENT** | Hero image, editorial imagery, category tiles |
| Shop | **CODE READY / NEEDS CONTENT** | Products |
| Category | **CODE READY / NEEDS CONTENT** | Categories, then products |
| Search | **READY** | Works; returns nothing because the catalogue is empty |
| Product | **CODE READY / NEEDS CONTENT** | Products with images, prices, stock, variants |
| Cart | **READY** | — |
| Checkout | **NEEDS CONFIG** | Shipping fee; SMTP for the confirmation email |
| Order success | **READY** | — |

### Operations

| Area | Status | What is missing |
|---|---|---|
| Products | **BLOCKED** | 0 rows |
| Inventory | **CODE READY / NEEDS CONTENT** | Stock is enforced server-side; there is nothing to stock |
| Payments | **NEEDS CONFIG** | COD works. Paymob is implemented and unconfigured — required only if card payment is offered |
| Shipping | **NEEDS CONFIG** | Flat fee is 0.00; no courier configured (manual dispatch is viable) |
| Email | **NEEDS CONFIG** | No SMTP — no confirmation, no password reset, no verification |
| Domain | **NEEDS CONFIG** | `PUBLIC_ORIGIN` + DNS/TLS |
| Policies | **BLOCKED** | No returns policy, no delivery terms, no T&C — all business decisions, none written |
| Support | **BLOCKED** | No `VITE_SUPPORT_EMAIL`; every contact line is hidden |
| Tracking | **CAN WAIT** | `pixel_config` empty; internal event pipeline works |

### What exactly prevents ZELI from accepting its first real customer order today

1. There are **no products and no categories** in the database.
2. There is **no support email**, so `SUPPORT_EMAIL` is undefined and every
   contact route in the footer, `/links` and emails is hidden.
3. There is **no SMTP configuration**, so no order confirmation is sent.
4. The **shipping fee is 0.00**, so delivery is charged at nothing.
5. There is **no published returns policy or delivery term**, so
   `/return-policy` says the page is not available and the product page's
   Shipping and Returns sections do not render.
6. There is **no production domain** wired to `PUBLIC_ORIGIN`.

Nothing on that list is a code defect. The storefront handles all six states
without stating anything untrue.
