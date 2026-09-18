# Bundles & Stacks

Merchant-managed bundle campaigns sold for one price. Two models:

- **Build Your Stack** — the shopper picks N units from an eligible pool
  ("choose any 6 for 480").
- **Curated Stack** — the merchant fixes the exact products and quantities
  ("Golden Ear Stack: A×1, B×1, C×2, D×1 for 450"); the shopper buys the set.

Phase 1 delivered the data model, the pure pricing/qualification rules, the
admin API and the CMS page. Phase 2 made Build Your Stack usable end to end:
public builder, grouped bundle instances in the cart, server-authoritative
validation, checkout pricing and order snapshots. Phase 3 added curated
stacks and turned bundles into a discovery surface: `/bundles`, homepage and
category merchandising, navigation, and availability.

Read [`CURRENT_PROJECT.md`](CURRENT_PROJECT.md) first; its rules apply here.

## Why not `cart_offer`?

`cart_offer` is a generic, automatic promotions engine: a condition
(`always` / `quantity_threshold` / `cart_total` / `product_bundle`) plus a
reward (`percentage_off` / `fixed_off` / `free_shipping` / `free_items`),
evaluated against the whole cart in priority order with an exclusivity flag.
It answers "does this cart earn a discount?".

A bundle campaign answers a different question: "does *this deliberate
selection* form a complete stack, and what does the stack cost?". It needs

- its own identity and merchandising (slug, customer-facing title, image,
  badge) because shoppers navigate *into* it;
- an explicit eligible-product pool that is joined, indexed and cleaned up by
  FK rather than a JSON array of ids;
- a pricing model that prices **N qualifying units as a whole** (`fixed_total`)
  rather than subtracting an amount — the example "6 for 480 instead of 600"
  is *not* "120 off", because eligible products need not share a price;
- selection semantics (duplicates, per-product cap, repeatability) that have no
  equivalent in the offers engine.

So bundles are a **sibling domain** beside Offers, not a new `cart_offer`
condition type. The offers engine, promo codes, free items, priority,
exclusivity and order totals are untouched by Phase 1.

## Data model

Migration: `shared/database/migrations/0051_cuddly_cobalt_man.sql` (additive only).

### `bundle_campaign`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | v7 |
| `internal_name` | text | dashboard-only label |
| `title` | text | customer-facing |
| `slug` | text, unique index `bundle_campaign_slug_idx` | future `/bundles/<slug>` |
| `description`, `badge_text` | text, nullable | merchandising copy |
| `image_id` | uuid → `file.id`, `ON DELETE SET NULL` | same image pattern as category/product |
| `type` | enum `bundle_campaign_type` = `build_your_stack` | |
| `is_active` | boolean, default **false** | master switch; new campaigns are drafts |
| `required_quantity` | integer | qualifying **units** per bundle |
| `pricing_type` | enum `bundle_campaign_pricing_type` = `fixed_total` | room for `percentage_off`, `fixed_off`, `tiered` later via `ALTER TYPE … ADD VALUE` |
| `fixed_bundle_price` | numeric(10,2), nullable | required when `pricing_type = fixed_total` (service-enforced) |
| `allow_duplicates` | boolean, default false | |
| `max_per_product` | integer, nullable | only meaningful with duplicates on |
| `is_repeatable` | boolean, default false | several complete bundles per cart |
| `offer_stacking` | enum `bundle_campaign_offer_stacking` = `exclusive` \| `stackable`, default `exclusive` | interaction with Offers/promo codes, see below |
| `sort_order` | integer, default 0 | merchandising order |
| `starts_at`, `ends_at` | timestamptz, nullable | same semantics as `cart_offer` |
| `created_at`, `updated_at` | timestamptz | |

Index `bundle_campaign_active_schedule_idx (is_active, starts_at, ends_at)`
backs the public "live campaigns" query.

### `bundle_campaign_product`

| Column | Notes |
|---|---|
| `id` | uuid PK |
| `bundle_campaign_id` | → `bundle_campaign.id`, `ON DELETE CASCADE` |
| `product_id` | → `product.id`, `ON DELETE CASCADE` (matches `promo_code_product`) |
| `sort_order` | position in the builder |
| `created_at` | |

Unique `(bundle_campaign_id, product_id)`; index on `product_id`.

This table is the **manual pool only** (and, for a curated stack, the exact
composition with quantities). Phase 4's dynamic eligibility lives in separate
columns and its own table — see "Phase 4 — dynamic eligibility" below. Dynamic
matches are **never** written here: they are resolved per request, which is the
whole point of them.

### Lifecycle state is derived, not stored

Like `cart_offer` (and unlike `promo_code`, whose stored `status` has to be
kept in sync), a campaign's state is computed at read time by
`getBundleCampaignState()`:

| `is_active` | schedule | state |
|---|---|---|
| false | any | `inactive` (shown as **Draft**) |
| true | `starts_at` in the future | `scheduled` |
| true | `ends_at` in the past | `expired` |
| true | otherwise | `active` |

### Delete

Hard delete, matching Offers and promo codes; pool rows cascade. When bundle
instances reach orders (Phase 2), the order must **snapshot** the campaign's
title and bundle price the way `order_item` snapshots product name/price, so a
deleted campaign never rewrites order history.

## Qualification & pricing rules — `shared/bundles/evaluate.ts`

Pure, framework-free, shared by browser and server. **The server is the
authority**: whatever the builder shows, `evaluateBundleSelection()` must be
re-run server-side before a bundle is priced into a cart or order.

- **Units, not products.** "Requires 6" means 6 qualifying units.
- **Eligibility is product-level.** Cart lines carry variant choices
  (`selectedOptions`); a variant changes a line's **price** (effective price +
  option modifiers, since Phase 7) but never whether a unit qualifies. Lines
  of the same product (different variants) are merged and share one slot
  budget, each unit keeping its own price. See *Phase 7* below.
- **Non-eligible units** are ignored (`ineligibleUnits`) and never invalidate
  the selection — in a cart they are simply other items.
- **`allow_duplicates = false`**: a product fills at most one slot. A second
  unit of the same product makes the selection invalid
  (`duplicates_not_allowed`).
- **`allow_duplicates = true`**: quantity > 1 contributes several units, up to
  `max_per_product` if set; units over the cap invalidate the selection
  (`max_per_product_exceeded`).
- **Exactness.** A selection qualifies only when the counted units are an
  exact multiple of `required_quantity` — exactly one multiple unless
  `is_repeatable`. Fewer → `not_enough_units` with `remainingUnitsNeeded`;
  more → `too_many_units` with `excessUnits`. The domain function reports, it
  never silently prices a subset.
- **Pricing (`fixed_total`)**: `bundleTotal = fixed_bundle_price × completeBundles`,
  `regularTotal` = sum of the counted units' regular prices,
  `discountAmount = regularTotal − bundleTotal` (may be negative if the bundle
  is dearer than buying separately — surfaced, not hidden). All arithmetic is in
  integer minor units to avoid float drift.
- Optional liveness gate: pass the campaign schedule to get `campaign_not_live`.

Campaign invariants (`validateBundleCampaignConfig`), enforced by the service
on create and on the **merged** row on update:

- `required_quantity ≥ 1` integer; `fixed_bundle_price > 0`;
- `max_per_product` only with duplicates on (turning duplicates off drops it);
- no duplicate ids in the pool; every id must exist and not be soft-deleted
  (hidden is allowed and flagged);
- unique slug (pre-check + unique index, race handled);
- `ends_at > starts_at`;
- **activation requires a completable pool**: pool size ≥ N when duplicates are
  off; pool × cap ≥ N when capped. A draft may be saved with an empty pool.

## Coexistence with Offers and promo codes

Stored per campaign in `offer_stacking` and implemented in
`shared/bundles/cart-pricing.ts` (`buildOfferInputs`, `computeCartTotals`),
which both `CartContext` and `create-order` use. The offers engine itself
(`applyOffersToCart`) is untouched — it is fed different inputs:

- `exclusive` (default): the stack is **invisible** to the engine. Its
  children are not in the item list and its value is not in the subtotal the
  engine sees, so no cart offer (percentage, fixed, free items, thresholds)
  and no promo code can touch the bundle. Ordinary items next to the stack
  still earn offers on their own value. Promo-code applicability and
  minimum-purchase checks use the same reduced view.
- `stackable`: the stack is visible **at its charged price**: each child unit
  becomes a quantity-1 line priced at its proportional share of the bundle
  total (`allocateBundleUnitLines`, minor-unit exact, remainder on the last
  unit), and the bundle total is added to the engine's subtotal. Offers and
  promo codes therefore apply on top of the fixed price, never on the regular
  value. Quantity thresholds count the children as units.

Promo codes follow the same policy as offers; there is no separate switch.
The enum can grow (e.g. `promo_codes_only`) without a schema redesign.

## API — `backend/bundles/trpc.ts` (`trpc.bundle.*`)

| Procedure | Auth | Purpose |
|---|---|---|
| `adminList` | admin | all campaigns with derived `state` and hydrated pool |
| `adminGet` | admin | one campaign |
| `slugAvailable` | admin | live slug check for the form |
| `previewEligibility` | admin | effective-pool counts for the **unsaved** CMS form (Phase 4) |
| `create` / `update` / `setActive` / `delete` | admin | mutations, all invariants server-enforced |
| `listLive` | public | live campaigns; hidden/deleted products filtered out of the pool |
| `getLiveBySlug` | public | data source for the Phase 2 builder page |

Prices leave the API as numbers (`fixedBundlePrice: 480`), not decimal strings.

## CMS — `/dashboard/bundles` ("Bundles & Stacks", Catalog section)

List: image, internal name, title, slug, one-line rule summary
("Choose any 6 from 10 eligible products for 480.00 EGP"), option badges,
Draft / Scheduled / Active / Expired, schedule, on/off switch, edit, delete.
Form: identity (internal name, title, slug with auto-derivation and live
availability check, description, badge, display order, image), rules
(required quantity, fixed total, duplicates + cap, repeatable, offer
stacking), searchable eligible-product picker with ordering, schedule window,
active switch, live summary and "bought separately costs between X and Y".

## Phase 2 — customer journey

### Public builder — `/bundles/[slug]`

`pages/bundles/@slug/+Page.tsx` → `components/bundles/BundleBuilder.tsx`.
Data: `trpc.bundle.getLiveBySlug` (live campaigns only; hidden/deleted
products already removed). Drafts, scheduled and expired campaigns render the
same not-found state as an unknown slug. The builder runs
`evaluateBundleSelection` client-side for live progress ("4 / 6 selected",
"Choose 2 more", regular vs stack price, saving) and enforces per-product
caps (stock, `allow_duplicates`, `max_per_product`) and the stack size in the
UI. Out-of-stock products are shown disabled. The builder builds exactly one
stack at a time; a repeatable campaign is added again to get a second
instance. Since Phase 7 a product with option groups is added with the
configuration the shopper chose in the builder (see *Phase 7 — variant-aware
bundles*); simple products still carry empty `selectedOptions`.

### Bundle instance — `shared/bundles/cart-instance.ts`

```
CartBundleInstance {
  instanceId          client UUID — two identical stacks stay distinct
  campaignId, campaignSlug, campaignTitle, requiredQuantity
  bundlePrice         server quote at add time (echoed back only for change detection)
  regularTotal        sum of child regular prices
  offerStacking, isRepeatable
  items[]             { productId, name, quantity, unitPrice, imageUrl, selectedOptions, stock }
  addedAt
}
```

Persisted in `localStorage["cartBundles"]`, separate from the legacy
`"cart"` array, and parsed with `parseStoredBundleInstances` (malformed →
dropped, never a crash). `CartContext` exposes `bundles`, `addBundle`,
`removeBundle` and the pricing breakdown (`merchandiseSubtotal`,
`bundleRegularValue`, `bundleChargedValue`, `bundleSavings`). Adding a stack
for a non-repeatable campaign that is already in the cart **replaces** the
earlier instance. Children are never editable individually — a stack is
removed or rebuilt whole.

### Server authority

`trpc.bundle.evaluateSelection` and `create-order` both call
`backend/bundles/selection.ts → validateBundleSelection`, which re-reads the
campaign (state, rules, price), the pool and the product rows (deleted,
hidden, stock, `discountPrice ?? price`) and runs the shared evaluator. The
client sends product ids + quantities only. `expectedBundleTotal` is the
price the shopper saw; a mismatch is rejected as `price_changed` with a
customer-safe message instead of charging the new price silently.

### Pricing order (`shared/bundles/cart-pricing.ts`)

1. `merchandiseSubtotal` = sum of ordinary lines
2. `bundleRegularValue` / `bundleChargedValue` / `bundleSavings`
3. `subtotal` = merchandise + bundle regular value (`order.subtotal`)
4. offers via `applyOffersToCart(buildOfferInputs(...))` → `offerDiscount`
5. `promoDiscount` = `computePromoDiscount(type, value, offerBase, offerDiscount)`
6. shipping (0 on a free-shipping offer)
7. `total` = max(0, merchandise + bundleCharged − offerDiscount − promoDiscount) + shipping

`order.discount` = bundleSavings + offerDiscount + promoDiscount, so
`subtotal − discount + shipping = total` and `edit-order`'s recomputation from
item lines stays consistent.

### Order creation

Inside the existing transaction, per instance: validate (above), reject a
second instance of a non-repeatable campaign, aggregate stock per product
across ordinary lines and every child, price with `computeCartTotals`, insert
the order, then an `order_bundle` snapshot per instance and one `order_item`
per child (`order_bundle_id` set, product prices snapshotted at regular
values, name suffixed with the campaign title). Stock is decremented in SQL
(`stock = stock − qty`) per line so duplicates subtract correctly.

### Order snapshot — `order_bundle` (migration `0052_boring_rhodey`)

`id, order_id (cascade), instance_id, campaign_id (SET NULL), campaign_slug,
campaign_title, required_quantity, regular_total, bundle_total,
offer_stacking, created_at` + index on `order_id`; `order_item.order_bundle_id`
(SET NULL). History survives campaign edits and deletes.

## Phase 3 — curated stacks and discovery

Migration: `0053_tense_falcon.sql` (additive only) — `curated_stack` added to
`bundle_campaign_type`, `bundle_campaign.subtitle`, `bundle_campaign_product.quantity`
(default 1, so every Phase 1/2 row keeps working), and the
`bundle_campaign_category` placement relation.

### Curated stacks

The same `bundle_campaign_product` rows serve both types: for
`build_your_stack` they are the eligible pool (quantity always 1); for
`curated_stack` they ARE the composition and `quantity` is how many units of
each product the stack contains.

Curated stacks reuse the Phase 1 evaluator rather than a parallel engine.
`curatedEvaluationConfig()` derives the config one composition is evaluated
under — duplicates inherently allowed, no per-product cap, `requiredQuantity`
taken from the composition (not the stored column, so a drifted row still
prices the set the merchant defined), and exactly one bundle per composition.
`isRepeatable` is unrelated: it governs how many *instances* a cart may hold.

**The server owns the composition.** `validateBundleSelection` discards
whatever items a client sent for a curated campaign and substitutes the stored
rows, so a browser cannot swap products, change quantities or alter the price.
The client may legitimately send no items at all. Everything else (liveness,
stock, deleted/hidden, prices, totals) is re-derived exactly as in Phase 2,
and again inside the order transaction.

### Value and savings are always current

A curated stack's `regularValue` / `savings` are computed from **current**
product prices (`discountPrice ?? price`) every time the campaign is read —
never stored at creation. The fixed price is the merchant's; the saving is
whatever the arithmetic says today:

| regularValue vs price | Storefront | CMS |
|---|---|---|
| greater | "Save X" | "saves X (N%)" |
| equal | "Same as buying separately" | "no saving" |
| less | "This stack costs more…" (never framed as a saving) | "costs X MORE" |

Build Your Stack has no single regular value, so `valueRange` reports the
cheapest and dearest completable stack from the currently purchasable pool
(honouring duplicate/cap rules) and is `null` when the pool cannot complete
one. Cards show "From X separately" only when that minimum genuinely exceeds
the bundle price.

### Availability is separate from state

- `state` — draft / scheduled / active / expired, from `is_active` + schedule.
  Only `active` campaigns are returned by the public procedures at all.
- `availability` — available / sold_out, from current stock and visibility.
  Curated: every line needs `stock >= quantity` and must be purchasable.
  Build Your Stack: the purchasable pool, capped per product by stock and the
  duplicate rules, must reach `requiredQuantity`.

A live-but-sold-out campaign stays visible and merchandised, with the purchase
CTA disabled — `listLive` deliberately kept its "visible" semantics rather
than silently hiding stock-outs.

Curated compositions are never filtered for the shopper: hiding a line would
make the page claim a unit count and value it no longer lists. The stack goes
`sold_out` and the offending line is flagged instead. Build-your-stack pools
*are* filtered, since an unpickable product is just noise there.

### Discovery surfaces

| Surface | Source | Notes |
|---|---|---|
| `/bundles` | `listLive({})` | All live campaigns, CMS `sortOrder`, card data only |
| `/bundles/[slug]` | `getLiveBySlug` | Builder or curated detail by `type` |
| Homepage rail | `listLive({ ids \| limit })` | CMS section, minimal template |
| Category pages | `listLive({ categoryId })` | Only explicit placements |
| Navbar | `listLive({ limit: 1 })` | Auto-added when live bundles exist |

`listLive` orders and limits **before** hydrating pools/placements, so a nav
probe or a 6-card rail never loads every live campaign's composition. Three
queries total regardless of campaign count — no N+1.

**Category placement is merchandising only.** `bundle_campaign_category` never
influences eligibility or pricing; a campaign full of Ear products does not
appear on the Ear page unless the merchant placed it there.

### Navigation

The minimal navbar appends a Bundles & Stacks link when at least one campaign
is live, and only if the CMS navigation does not already point at `/bundles`
(a merchant-authored link wins, with their own label and position). Desktop
and mobile menu both render from the same list. The five mobile bottom-nav
tabs are deliberately untouched.

### CMS

One editor for both types, switched by a type selector. Build Your Stack keeps
its pool, required quantity, duplicates and cap. Curated gets a composition
builder with per-product quantities, line totals, and a live summary of normal
value / stack price / saving / percentage plus stock and hidden/deleted
warnings. Activation is blocked when the composition is empty or the unit
count disagrees. The campaign list shows a type badge, per-type rule summary,
current value and savings status, sold-out state and placement count.

## Phase 4 — dynamic eligibility & order operations

Migration `0054_slow_fabian_cortez` (additive only). Existing campaigns are
unaffected: `eligibility_mode` defaults to `manual`, which is exactly their
Phase 1–3 behaviour, and curated stacks are untouched.

### Schema

`bundle_campaign` gains:

| Column | Type | Notes |
|---|---|---|
| `eligibility_mode` | enum `bundle_campaign_eligibility_mode` = `manual` \| `dynamic` \| `hybrid`, default `manual` | Build Your Stack only |
| `eligibility_min_price` | numeric(10,2), nullable | inclusive lower bound on the **effective** price |
| `eligibility_max_price` | numeric(10,2), nullable | inclusive upper bound |

New table `bundle_campaign_eligibility_category`:

| Column | Notes |
|---|---|
| `id` | uuid PK |
| `bundle_campaign_id` | → `bundle_campaign.id`, `ON DELETE CASCADE` |
| `category_id` | → `category.id`, `ON DELETE CASCADE` |
| `created_at` | ordering of the rule's values |

Unique `(bundle_campaign_id, category_id)`; index on `category_id`. Also added:
`product_category_idx` on `product(category_id)`, which backs the rule scan.

`order_bundle` gains `campaign_type` (default `build_your_stack`) so a
historical order can be labelled without reading the live campaign.

### Category placement is NOT category eligibility

These are two different relations and must stay that way:

| Table | Question it answers | Affects pricing? |
|---|---|---|
| `bundle_campaign_category` | *Where is this campaign promoted?* (which category pages show its card) | no, never |
| `bundle_campaign_eligibility_category` | *Which products may a shopper pick?* | yes |

A campaign can be merchandised on the Lip page while only accepting Ear
products. The CMS shows them as two separate controls.

### Eligibility modes

| Mode | Effective pool |
|---|---|
| `manual` | only the `bundle_campaign_product` rows (Phase 1–3 behaviour) |
| `dynamic` | only products currently matching the rules |
| `hybrid` | the union of both, deduplicated |

`curated_stack` never uses any of this: its composition is exact and
merchant-owned. The service forces curated campaigns to `manual` and strips
any rules rather than storing rules it would ignore.

### Supported dynamic rules

Only what this repository's product model actually supports today:

| Rule | Backed by |
|---|---|
| Category is one of […] | `product.category_id` (a product has exactly one category) |
| Price ≥ min | `least(price, coalesce(discount_price, price))` |
| Price ≤ max | same |

There is **no** tag or collection rule, because the catalogue has no tag or
collection table. Adding one would mean inventing taxonomy that does not
exist; when such a table lands, it becomes another rule column/table beside
these, not a redesign.

### AND / OR semantics

* Within one filter, the selected values are **OR**'d.
* Across different filters, the filters are **AND**'d.
* A filter left empty is not applied.
* All filters empty means **matches nothing**, not "matches the whole
  catalogue" — a dynamic campaign with no rules is unfinished, and the schema
  refuses to save it.

```
categories ∈ [Ear, Nose]  AND  80 ≤ price ≤ 120
  ⇒  (Ear OR Nose) AND price in [80, 120]
```

Deliberately not an arbitrary boolean-expression engine.

### Category hierarchy

Categories in this repository are **flat** — `category` has no parent column —
so `Category = Ear` means "products assigned to Ear", which is exactly what the
Ear category page lists. Bundle eligibility and normal storefront category
filtering therefore agree by construction. If categories ever gain children,
the descendant decision must be made in **one** place (the resolver) and must
match whatever `/categories/[slug]` does.

### Price rules compare the effective price

`least(price, coalesce(discount_price, price))` — the price a shopper would
actually pay, matching `candidateEffectivePrice` in the domain module and the
convention used everywhere else in the bundle code. A product listed at 200 and
discounted to 100 matches an "80–120" rule.

### Stock is not an eligibility rule — on purpose

```
eligibility  = which products BELONG to this campaign
availability = which of those can be BOUGHT right now
```

A sold-out product stays in the pool; the Phase 3 `availability` calculation
(`computeBundleAvailability`) decides whether enough purchasable units exist to
complete a stack. A campaign that loses stock becomes **live + sold_out**, not
deactivated.

### Hidden and deleted products

Dynamic rules never match a hidden or soft-deleted product — a rule is a
standing query over the live catalogue, so it must not resurrect something the
store has withdrawn. A *manually* picked product that is later hidden stays in
the pool but is flagged, because that membership was an explicit merchant
decision the CMS should keep showing. Either way the storefront never offers it.

### The authoritative resolver

`backend/bundles/eligibility.ts` — `resolveEligiblePools` (batched) and
`resolveEligibleMembership` (for a specific selection). The membership
predicate itself is pure, in `shared/bundles/eligibility.ts`
(`matchesEligibilityRules`, `mergeEligiblePools`), so SQL narrowing and
in-memory assignment can never drift apart.

Every consumer goes through it — there is no second implementation anywhere,
and none in the browser:

| Surface | Path |
|---|---|
| `/bundles` cards, homepage rail, category rail, navbar probe | `listLiveBundleCampaigns` → `hydrate` |
| Bundle detail / builder | `getLiveBundleCampaignBySlug` → `hydrate` |
| Admin list & editor load | `listAllBundleCampaigns` / `getBundleCampaign` → `hydrate` |
| Cart check (`bundle.evaluateSelection`) | `loadSelectionContext` → `resolveEligibleMembership` |
| Checkout / order creation | `loadAndValidateBundleSelection`, same path, inside the order transaction |
| Activation validation on create/update | `effectiveEligibleIds` |
| CMS live preview | `previewBundleEligibility` |

### Effective pool ordering

Deterministic and stable:

1. manual products, in CMS `sort_order`
2. dynamic-only products, in product-name order (the same secondary sort the
   manual pool query uses)

A product in both halves appears **once**, keeps its manual position, and is
reported as `source: "manual"` — the merchant's explicit placement wins over a
rule that would have added it anyway.

### Checkout re-resolves; the cart is never trusted

A shopper can build a stack, then the merchant edits the rules before checkout.
`loadSelectionContext` re-resolves eligibility from the live campaign on every
validation, so:

* a product that no longer qualifies → `product_not_eligible`, the bundle is
  rejected and the shopper is asked to rebuild;
* a product the client inserted that never qualified → same rejection;
* a product that only started matching today → accepted, with no campaign edit.

Nothing about eligibility is captured when the item enters the cart.

### CMS

The Build Your Stack form gains an **Eligibility** section: mode selector,
manual product picker (shown for `manual`/`hybrid`), and — for
`dynamic`/`hybrid` — eligible categories and a min/max price band. Below them,
a live read-out from `bundle.previewEligibility`:

```
18 eligible products
4 manual · 14 from rules · 14 currently in stock
Can complete this 6-piece stack: Yes
```

The counts are computed on the **server** by the same resolver and the same
Phase 3 availability rules; the browser never approximates them. The panel
distinguishes the two failure modes explicitly:

* **invalid configuration** (pool too small for the required quantity, rules
  matching nothing) — blocks activation, offers "save as draft instead";
* **valid but unavailable** (nothing in stock today) — the campaign stays live
  and simply reads as sold out.

### Performance

Resolution is batched, never per campaign:

* `hydrate` runs a fixed 4 queries for any number of campaigns (manual pools,
  placements, eligibility categories, and one product query whose `WHERE` is an
  OR of each campaign's narrowed predicate). Campaigns in `manual` mode and all
  curated stacks are filtered out before any rule query runs, so a store with
  no dynamic campaigns pays nothing.
* Public listings still slice/limit their campaign rows **before** hydrating,
  so the navbar "is there any live bundle?" probe (`limit: 1`), the `/bundles`
  cards and the homepage rail never resolve pools they will not show.
* The checkout path uses `resolveEligibleMembership`, which narrows to the ids
  the shopper actually selected instead of materialising the whole pool.
* The admin order list batches its items and bundle snapshots into one query
  each for the whole page (it previously ran one items query per order).

No caching was added: Phase 4 has no established cache layer to hook into, and
a stale eligibility cache that accepted an invalid product would be worse than
the queries it saves.

### Admin order bundle grouping

`shared/bundles/order-grouping.ts` (pure) + `pages/dashboard/orders/OrderItemsPanel.tsx`.

An order's bundle groups are built from `order_bundle` + `order_item.order_bundle_id`
and **nothing else**:

* every label, quantity and money figure comes from the order snapshot, so
  renaming, repricing or deleting a campaign leaves past orders untouched
  (`campaign_id` is `SET NULL` and is only ever an optional link);
* grouping is by bundle **instance**, so two stacks of the same campaign stay
  two groups;
* standalone products stay outside every group;
* children remain individual order SKUs — bundle grouping is visual and
  financial only, and inventory/fulfilment semantics are unchanged;
* the bundle's charged price is shown once, on the group; children show their
  regular prices labelled "regular" so they are never read as money taken.
  `chargedMerchandiseTotal` counts each bundle once and excludes its children.
  The order's authoritative `subtotal`/`discount`/`total` come from the order
  row and are not recomputed.

## Phase 5 — tiered Build Your Stack pricing

Migration `0055_colorful_dazzler` (additive, with a backfill). One campaign can
now offer several quantity → price steps:

```
3 pieces → 270 EGP
4 pieces → 340 EGP
6 pieces → 480 EGP
```

Still one campaign: one eligible pool, one eligibility configuration, one page,
one card, one cart/order model. Tiers are pricing choices inside it, never
separate campaigns.

### Schema

`bundle_campaign_tier`:

| Column | Notes |
|---|---|
| `id` | uuid PK |
| `bundle_campaign_id` | → `bundle_campaign.id`, `ON DELETE CASCADE` |
| `quantity` | qualifying UNITS this tier prices |
| `price` | numeric(10,2), the total charged for those units |
| `sort_order` | display position; written ascending by quantity on every save |
| `created_at`, `updated_at` | |

Unique `(bundle_campaign_id, quantity)` — two tiers of one campaign can never
claim the same quantity, which would make tier resolution ambiguous. Index on
`bundle_campaign_id` backs the batched load.

`order_bundle` gains `tier_id`: a plain uuid with **no foreign key**, on
purpose. A merchant may delete a tier tomorrow and the order must still render
as it was sold, so nothing in the admin display depends on that row existing.

### Compatibility with `required_quantity` / `fixed_bundle_price`

**Build Your Stack**: `bundle_campaign_tier` is canonical. The two legacy
columns remain as **mirrors of the lowest tier**, rewritten by the service on
every save, so they can never drift. They describe the whole campaign only when
it has one tier; anything else must read `tiers`.

**Curated Stack**: unchanged. `fixed_bundle_price` remains the actual price and
curated campaigns store **no** tier rows — the CMS never offers them a tier
editor. The domain evaluates them through a single synthetic tier
(`curatedEvaluationConfig`) purely so both types price through identical code.

Legacy callers still work: `create` with `requiredQuantity` + `fixedBundlePrice`
and no `tiers` synthesises the equivalent single tier, and an `update` that
patches either field on a **single-tier** campaign moves that tier. The same
patch on a multi-tier campaign is **refused**, because "the" price does not
exist there — better an error than a silent no-op.

### Exact-match semantics and gaps

A selection buys the tier whose unit count it matches **exactly**:

```
3 selected → 3-tier (270)
4 selected → 4-tier (340)
5 selected → NO tier — not a bundle
6 selected → 6-tier (480)
```

There is no nearest-tier, next-cheapest or round-down fallback. 5 pieces is
never priced as the 4-tier plus a loose item. The evaluator reports
`no_matching_tier` for a count between rungs, `not_enough_units` below the
smallest and `too_many_units` above the largest, so the builder can word each
case correctly without knowing any pricing rules.

`BundleEvaluation` carries `tier` (matched, or null) and `nextTier` (the next
rung up, or null at the top).

### Repeatability

Unchanged: **one cart bundle instance = one qualified tier selection**, and a
repeatable campaign holds several independent instances. A multi-tier campaign
never interprets 12 units as 4×3 or 3×4 or 2×6 — that is ambiguous, so it is
refused.

The one place multiples still apply is a **single-tier** campaign, which is what
every pre-Phase-5 campaign is: 12 units of a repeatable "6 for 480" remain two
complete bundles, exactly as before, because there is only one quantity to
divide by. The storefront builder itself always builds one tier-sized instance.

### Availability: per tier and campaign-wide

```
campaign available  ⇔  at least ONE tier can currently be completed
tier available      ⇔  the effective pool can fill THAT quantity
```

A campaign offering 3/4/6 whose pool can fill only 4 is **available** — sellable
at its 3- and 4-piece tiers — and must not read as sold out because its top rung
is out of reach. Capacity comes from one function, `bundlePoolCapacity`, which
honours the duplicate and max-per-product rules; `computeTierAvailability`
derives each rung from it. Activation requires the pool to complete the
**smallest** tier.

Tier availability is a stock fact, never an eligibility one: an unfillable tier
still belongs to the campaign.

### Value ranges are per quantity

`valueRangeForTier(config, products, quantity)` replaces the single range —
a 3-piece and a 6-piece tier of one campaign have genuinely different
separately-bought values. Each `BundleTierDto` carries its own; the
campaign-level `valueRange` is the lowest tier's, i.e. the cheapest way in.

### Savings stay truthful

```
regular total = the selected products' current regular prices
bundle total  = the matched tier's price
saving        = regular − bundle
```

Positive, zero and negative are all retained by the domain; nothing is clamped.
The storefront shows a saving only when it is genuinely positive, and never
calls a negative number a saving. With no matched tier there is no price and no
saving — the builder shows neither.

### Server authority

`loadSelectionContext` re-reads `bundle_campaign_tier` on **every** validation
(cart check, checkout, order creation), so:

* repricing 6 → 520 makes a cart quoting 480 fail as `price_changed`;
* deleting the 6-piece tier makes a 6-piece selection fail outright — it is
  never repriced onto a neighbouring rung;
* the tier id is derived by the server from the unit count; there is no input
  through which a client could nominate one.

The browser may send `expectedBundleTotal`, and it is used **only** to detect a
stale price — never to set the charge.

### Builder UX

The tier ladder is stated before the shopper starts, with prices exactly as
configured and no "best value" badge (a merchant may price 6 above two 3s; the
engine does not editorialise). A rung the pool cannot currently fill is dimmed
and marked sold out rather than hidden. Progress reads:

```
0 selected   Choose 3 pieces to unlock your first stack
2 selected   Choose 1 more for 3 pieces at 270 EGP
3 selected   Your stack: 270 EGP   ·  Add 1 more to unlock 4 for 340 EGP
4 selected   Your stack: 340 EGP   ·  Add 2 more to unlock 6 for 480 EGP
5 selected   Add 1 more to unlock 6 for 480 EGP        (CTA disabled, no price)
6 selected   Your stack: 480 EGP                        (no next-tier message)
```

The CTA is enabled only on an exact tier, and the next-tier prompt is
suppressed when the pool cannot currently fill that rung.

### Cards and discovery

One helper, `summarizeBundleTiers` in `components/bundles/bundle-ui.ts`, used by
every surface through `BundleCampaignCard` (the `/bundles` grid, the homepage
rail, category rails, both landing templates):

* one tier → the concrete pre-Phase-5 message, "Choose any 6 for 480.00 EGP";
* several tiers → "3–6 pieces" + "From 270.00 EGP", where *from* is the lowest
  **price** (not the smallest quantity's price), so the figure is always payable.

Sold-out behaviour is campaign-level: any completable tier keeps the card live.

### CMS

The Build Your Stack editor replaces the single quantity/price pair with a tier
table — add, remove, edit quantity and price, sorted ascending on save. It
refuses duplicate quantities, quantity < 1, price ≤ 0, and an active campaign
with no tiers, using the same `validateBundleTiers` the server runs. The live
preview shows each rung's price, whether it is currently completable and its
value range, all from the DTO — the CMS runs no second availability
calculation. Curated stacks keep their single price field and no tier editor.

### Order snapshot and admin

`order_bundle` stores the charged price, the tier's quantity (as
`required_quantity`) and `tier_id`. The admin order group labels the purchased
tier ("6-piece tier") from that snapshot alone; repricing or deleting the tier
afterwards cannot change a placed order. Curated groups show no tier label.

### Dynamic eligibility

Tiers operate on the Phase 4 **effective** pool — manual, dynamic or hybrid —
with no special-case path. Tier capacity, value ranges, the builder, cart
validation, checkout and the CMS preview all consume the same resolved
eligibility.

### Performance

`hydrate()` is now **five** batched queries for any number of campaigns (manual
pools, placements, eligibility categories, **tiers**, and the dynamic product
union when any campaign has rules). There is no per-campaign tier query. Public
listings still slice/limit before hydrating, so the navbar probe and card rails
never hydrate pools or tiers they will not show.

## Phase 6 — bundle analytics and Best Selling Bundles

Phase 6 adds **measurement** (an admin dashboard at `/dashboard/bundles/analytics`)
and **merchandising driven by it** (a Best Selling source for the homepage rail).
It adds no pricing behaviour and changes no existing selling path.

Code: `shared/bundles/analytics.ts` (pure definitions),
`backend/bundles/analytics.ts` (the grouped queries),
`pages/dashboard/bundles/analytics/+Page.tsx` (the dashboard).

### What counts as a bundle sale

The commercial source of truth is the **order**, never a tracking event:

```
order  +  order_bundle  +  bundle child order_item rows
```

`order_bundle` is an immutable snapshot of one purchased bundle instance. It
holds the campaign identity as sold, the tier quantity as sold, the
`regular_total` the children would have cost separately and — the figure that
decides all revenue — `bundle_total`, what the shopper was actually charged.

Tracking events (`bundle_viewed`, builder interactions, etc.) remain useful for
behavioural/funnel questions and are untouched, but they are **not** authoritative
for revenue, units, instances, historical price, savings or tier performance.
Those come from placed orders only.

### Sales-status rule

One rule, reused everywhere:

```
order.status != 'cancelled'   AND   order.archived_at IS NULL
```

This is deliberately the **same** filter `backend/analytics/service.ts` already
applies to every store-wide revenue figure, so a bundle number and a store
number can never disagree about which orders happened. It lives in exactly one
place — `countedBundleOrderWhere()` — and is composed by the headline totals,
the campaign table, the type comparison, tier analytics, product analytics, the
time series and the Best Sellers ranking alike.

Orders are dated by `order.created_at`, the timestamp the rest of the dashboard
reports orders by.

**Refund limitation.** `payment_status` has a `refunded` value, but the schema
stores no refunded *amount* anywhere, so a partial refund cannot be represented
faithfully. Rather than invent a prorated bundle refund, a refunded-but-not-
cancelled order is counted at its full charged value — exactly what the
store-wide revenue figure does today. Cancelling the order is the action that
removes it from reporting. If per-line refund amounts are ever stored, this is
the one helper that needs revisiting.

### Date ranges and timezone

Presets are Last 7 / 30 / 90 days, All time, and a custom range. Relative
periods are computed **on the server** as whole days back from `now`, matching
`getOverviewMetrics()`; the browser never sends a locally-computed instant, so
an admin's timezone cannot shift which orders land in a range.

Ranges are half-open **`[start, end)`**, so an order at exactly the boundary
belongs to one range and never to both. A custom range is entered as calendar
days and read as UTC; the inclusive "to" day is expanded to the following
midnight.

Time-series buckets use `date_trunc(..., created_at AT TIME ZONE 'UTC')`, so a
bucket is a property of the order rather than of the database session's
TimeZone. Granularity is a fixed ladder: ≤92 days daily, ≤550 days weekly,
longer (and All time) monthly.

### Metric definitions

| Metric | Definition |
| --- | --- |
| Bundle revenue | `Σ order_bundle.bundle_total` |
| Bundle instances | `COUNT(*)` over `order_bundle` — one per purchased stack |
| Orders with bundles | `COUNT(DISTINCT order_bundle.order_id)` |
| Pieces sold in bundles | `Σ order_bundle.required_quantity` (the tier quantity as sold; for curated stacks, the snapshotted composition unit count) |
| Historical regular value | `Σ order_bundle.regular_total` — the children's regular value **at purchase** |
| Difference / discount | `regular value − revenue`, from the snapshots |
| Average bundle value | `revenue ÷ instances`, 0 when nothing sold |

**No double counting.** A bundle's children are ordinary `order_item` rows
carrying REGULAR prices the shopper did not pay. Revenue never touches them: a
stack charged 480 whose parts list at 600 contributes **480** — not 600, not
1080. Standalone product lines never enter bundle revenue at all.

**Savings stay truthful.** The difference is not clamped. It may be zero or
negative (a stack priced above its parts), and the dashboard only uses the
words "Bundle discount granted" when it is mathematically positive; otherwise
it says "Charged above regular value" or "Difference vs regular value".

Conversion rate, CTR and abandonment are deliberately **not** reported here —
the repository has no session data that reliably supports a bundle-level
numerator and denominator. Funnel analytics would be a separate phase.

### Historical integrity

Analytics never reads live campaign or tier pricing for a past figure. So:

- Repricing a tier from 480 to 520 leaves every earlier sale at 480. Both sales
  still aggregate as the same **6-piece** tier, with revenue 1000.
- Renaming a campaign keeps its sales as one row, reported under the newest
  snapshotted name.
- Deleting a campaign nulls `order_bundle.campaign_id` (the FK is `SET NULL`)
  but the sale survives, shown under its snapshotted title and slug and flagged
  *Deleted*. Historical sales are never hidden because the live row is gone.
- Deleting a tier changes nothing: `order_bundle.tier_id` is a plain id with no
  FK, and tier analytics groups by the snapshotted **quantity**, not by tier id.

### Campaign identity

Grouped by `COALESCE(campaign_id::text, 'slug:' || campaign_slug)`. The id
survives renames and repricing; the slug survives deletion. A live join to
`bundle_campaign` is used only to offer an optional "open campaign" link, never
to obtain a historical title.

### Tier analytics

Grouped by campaign identity × `required_quantity`, restricted to
`build_your_stack` (curated stacks have no tiers). Revenue uses each
transaction's own charged price, so a repriced tier reports the sum of what was
really taken. No live tier row needs to exist.

### Product insight

Two separate tables, because the questions differ:

- **Most selected in Build Your Stack** — products the shopper picked
  themselves, i.e. children of `build_your_stack` instances.
- **Most included across all bundles** — every product that shipped inside any
  bundle, including merchant-composed curated stacks.

A curated child is never called "most selected", because the shopper did not
select it. `units` sums the child order-item quantity; `instances` counts
DISTINCT bundle instances, so buying 2 of one stud is 2 units but 1 instance.
The product table is joined only for the current display name.

Revenue is deliberately **not** attributed to individual products: splitting one
bundle price across its children would need an allocation methodology this
phase does not define. Units and occurrences only.

### Best Selling Bundles (storefront)

Ranking metric, in order:

1. **Bundle instances sold** in the window, descending
2. **Bundle revenue**, descending
3. **Campaign id** ascending (UUIDv7 — stable and creation-ordered)

so the order is fully deterministic and never left to SQL.

- **Window:** trailing **30 days** by default, merchant-configurable (1–365).
  A window rather than all-time, so early campaigns cannot lock the top of the
  rail forever.
- **Backfill:** live campaigns with no sales in the window fill any remaining
  slots in CMS `sortOrder`, so a quiet week does not empty the section. No
  other fallback.
- **Liveness vs availability:** ranking re-orders the campaigns the existing
  Phase 3–5 liveness rules already returned (`isActive` + inside schedule).
  Drafted, scheduled, expired and deleted campaigns can never be ranked into
  view, whatever they sold — otherwise the rail would render a dead link.
  Availability is separate and unchanged: a **live but sold-out** best seller
  stays visible with its sold-out treatment, and availability does not affect
  the ranking.

Admin analytics and the storefront ranking intentionally differ on one point
only: analytics includes deleted/inactive campaigns (history), merchandising
does not (eligibility).

### Homepage CMS: manual vs best selling

`HomepageBundlesContent.source` switches the rail:

- `manual` (default, and what any pre-Phase-6 stored content means) — the
  merchant's `campaignIds` in their order, or every live campaign in CMS order
  when empty. Identical to Phase 5.
- `best_selling` — the server ranks live campaigns by the rule above over
  `bestSellingPeriodDays`.

Switching to `best_selling` **does not clear `campaignIds`**. The manual
selection and its order are kept verbatim so switching back restores exactly
what the merchant arranged. The storefront heading falls back to "Best Selling
Stacks" / "الأطقم الأكثر مبيعاً" in best-selling mode when the merchant has not
written their own title.

The rail reuses the existing `BundleCampaignCard` / `MinimalBundleSection`
components — there is no second card design for best sellers.

### Schema

Migration **0056** is purely additive: two indexes, no columns, no data change.

```sql
CREATE INDEX order_created_at_idx ON "order" (created_at);
CREATE INDEX order_item_order_bundle_idx ON order_item (order_bundle_id)
  WHERE order_bundle_id IS NOT NULL;
```

Both are justified by the actual query shapes: every dated report filters a
`created_at` range on `order` and then joins outwards, and product analytics
walks `order → order_bundle → order_item` by `order_bundle_id` (partial,
because bundle children are a minority of order lines). `EXPLAIN` confirms the
planner uses each for its predicate.

Deliberately **not** added: any `bundle_campaign.total_sales` / `total_revenue`
counter, and any materialised analytics table. Both can drift from the orders
that are the actual truth, and the derived queries are cheap enough.

### Performance

`getBundleAnalytics` issues **seven statements**, independent of how many
campaigns, tiers, products or days are in range: the headline totals (the only
ungrouped one) plus six `GROUP BY` queries — per campaign, per type, per tier,
per product twice (selected vs included) and per time bucket. There is no
per-campaign or per-product follow-up query.

The Best Sellers ranking is **one** extra grouped query on top of the existing
live-campaign listing, and hydration stays batched: the pool is read once for
all campaigns, never once per campaign, and the homepage rail still slices to
its limit before hydrating so it never loads full bundle pools.

The "query shape" tests in `backend/bundles/__tests__/analytics.integration.test.ts`
assert these counts and fail if an N+1 is ever introduced.

## Phase 7 — variant-aware bundles

Shoppers choose the actual option configuration ("variant") of an eligible
product inside Build Your Stack; merchants fix the exact variant of every
curated line; and that identity flows builder → validation → cart → checkout →
inventory → order line → admin order → analytics with the server re-resolving
price, validity and stock at every step.

### The variant model this store actually has

There are **no per-combination variant rows**. A `product_variant` row is an
**option group** on a product:

```
{ name: "Color", values: [{ value: "Gold", priceModifier: 20 }, { value: "Silver" }] }
```

A purchasable variant is one value from every group the product has. So:

| Concept | In this repository |
| --- | --- |
| Variant identity | the canonical map `{ [groupName]: value }` — `{ "Color": "Gold" }`. There is no variant id or SKU to reference. |
| Variant price | product effective price (`discountPrice ?? price`) **+ Σ chosen `priceModifier`s** |
| Variant stock | **the product's stock.** Options never own inventory. |
| Variant availability | a value is unavailable when the store-wide preset for that group lists it in `strikethroughValues`, unless the product sets `enabledOverride: true` on the value |
| Variant image | none — the product image is used |
| Required options | a product with ANY option group requires a value for every group (the product page refuses to add otherwise) |

`shared/products/options.ts` is the single implementation of these rules:
`toPurchasableOptionGroups` (availability applied), `resolveSelectedOptions`
(client map → canonical map + modifier, or `option_required` /
`option_not_found` / `option_unavailable`), `resolvePurchasableLinePrice`
(effective price + modifier, minor-unit exact), `hasPurchasableConfiguration`
and the label/identity helpers. `backend/products/option-groups.ts` loads the
groups for a set of product ids in **one** batched query plus one settings read.

### The shared bug this phase fixed

Before Phase 7 the storefront product page added option modifiers to the price
it showed and put in the cart, but `create-order` priced every line at
`discountPrice ?? price` and ignored the options entirely — a "Gold +20" line
was shown at 80 and charged at 60. Bundle work had been deferred on exactly
that mismatch. Ordinary lines and bundle children now go through the same
resolver in the same transaction: the modifier is charged, the canonical
options are stored, and an option that names a value which no longer resolves
is refused with the same wording a bundle child gets. The product page itself
is unchanged; the product route's shared `onAddToCart` (used by every
template other than Minimal) now prices the cart line with the same resolver.

One deliberate leniency, for ordinary lines only: a line that names **no**
option at all is accepted at the base price with no snapshot — exactly the
pre-Phase-7 behaviour. Product cards, quick view and search results have
always quick-added a product without a configuration, and refusing those at
checkout would have turned a long-standing storefront gap into a dead end.
A bundle child never gets this leniency: a stack unit must be a resolvable
variant. Closing the quick-add gap itself (routing option products to the
product page from cards) is a storefront task outside Bundles.

### Eligibility and campaign rules stay product-level

Build Your Stack eligibility (manual pool, dynamic rules, hybrid) is about the
**product**; a pool row never stores options (`bundle_campaign_product.
selected_options` is null for every BYS row). "Product A is eligible" means
the product may participate **and** the chosen configuration must resolve
against A's current option groups.

**Duplicates and `maxPerProduct` are product-level too.** Gold and Silver of one
product are two lines for pricing (they may cost different amounts) but one
product for the evaluator, which merges by `productId` before applying the
rules. With duplicates off, `A/Gold + A/Silver` is `duplicates_not_allowed`;
with duplicates on and `maxPerProduct = 2`, `A/Gold ×1 + A/Silver ×1` is
allowed and a third unit of A is `max_per_product_exceeded`. A different
option can never bypass a campaign rule.

### Pricing

The bundle's **regular total** is the sum of the exact selected lines'
variant prices — `A/Gold 60 + B/Large 75 + C 40 = 175`, never the base
prices. The **tier price** is still the matched tier's configured price and is
never derived from the lines. Savings = regular total − tier price, and stay
truthful when negative (a 300 tier over a 285 selection reports −15).

`offerStacking` is unaffected: a stackable bundle's children enter the offers
engine at their variant-aware share exactly as they used to at their base
share, and an exclusive bundle stays invisible to it.

### Availability and capacity

Because stock is product-level, "Gold stock 1 + Silver stock 3" is simply a
product with stock 4, and `bundlePoolCapacity` already answers it: 1 unit with
duplicates off, 4 with duplicates on, `min(4, maxPerProduct)` with a cap. What
options add is a **purchasability** input: a product whose option groups leave
no available value (every value struck through, or a group with no values)
cannot resolve to any variant and contributes **no** capacity. The service
decides each pool product's `purchasable` and regular `unitPrice` once
(`finalizeSummaries`) and every consumer — campaign availability, per-tier
availability, the builder, the CMS preview — reads that flag through the same
capacity function. The CMS preview no longer has its own capacity loop.

Curated: a composition line is purchasable only if the product is
alive **and** its fixed configuration resolves today. A line whose product has
options but no configuration, or whose fixed value was removed or struck
through, makes the stack `sold_out` — never re-pointed at another value.

### Curated stacks fix the exact variant

A curated composition line is `productId + quantity + selected_options`
(migration `0057_variant_aware_bundles`, additive, nullable). The CMS shows one
select per option group on each line with options; `buildCampaignPayload` and
the service both refuse a composition that leaves a group unchosen, pairs a
product with a value it does not have, or fixes a struck-through value. The
storefront curated page shows the fixed variant under each piece and the
shopper cannot change it. At checkout the server **replaces** whatever the
client sent with the stored composition, variants included.

**Existing curated campaigns:** a pre-Phase-7 line pointing at a product that
now has option groups is not migrated to any value. The campaign reads
`sold_out`, checkout refuses it as `composition_incomplete` ("This stack is not
available right now"), and re-activation is refused with "Choose a Color for
…" until the admin picks the variant. Nothing ever picks a first, cheapest or
default-looking value on the merchant's behalf.

One configuration per product per curated stack: the existing
`(campaign, product)` uniqueness stays, so "Flower Stud / Gold ×1 **and**
Flower Stud / Silver ×1" is expressed as two products or by quantity, not as
two lines of one product.

### Server authority — one path

`validateBundleSelection` (pure) does, per requested line: product exists and
is not deleted/hidden → product is in the effective pool → options resolve
against the product's current groups (canonical map, modifier) → product-level
stock across all of that product's lines → evaluator (duplicates, caps, exact
tier) → expected-total check. `loadSelectionContext` loads the option groups
for **exactly the selected product ids** (curated: the composition's) in one
query. `evaluateSelection` and `create-order` call the same function; nothing
else validates options.

Rejections carry a machine code and a `detail` (`productId`, `productName`,
`optionName`, `value`) so the builder can word them in the shopper's language
(`bundle.option_required` / `option_not_found` / `option_unavailable` /
`price_changed`, EN + AR), while the server's own message stays customer-safe
English like every other server error.

The validated item is `{ productId, name, quantity, unitPrice, price,
discountPrice, priceModifier, selectedOptions, optionsLabel, imageUrl,
categoryId, stock }` — `unitPrice` is the variant-aware regular price,
`selectedOptions` the canonical map, `optionsLabel` the display string.

### Cart and checkout

`CartBundleInstanceItem.selectedOptions` (which already existed) now carries the
**canonical** map the server returned — never the builder's own state — and
`unitPrice` the variant-aware regular price. Pre-Phase-7 carts with no
`selectedOptions` on simple products keep parsing. Cart and checkout summaries
render options with the same `Key: Value` formatting ordinary lines use.

The checkout payload sends the map itself (`selectedOptions: { Color: "Gold" }`)
for ordinary lines and bundle children alike; the legacy `"Color: Gold"` label
string is still accepted and parsed. Either way the server re-resolves
against the live product before pricing anything:

| Merchant change after add-to-cart | Checkout |
| --- | --- |
| value removed / renamed | refused — "The Color you chose … is no longer available" |
| ordinary line, no option named (card quick-add) | accepted at base price, no snapshot — pre-Phase-7 behaviour, ordinary lines only |
| value struck through store-wide | refused — "… is currently unavailable" |
| product stock below the product's total requested units | refused — insufficient stock |
| option modifier changed | accepted: the **regular** value is re-read (order line and `order_bundle.regular_total` show the new price); the bundle charge is still the tier price |
| tier repriced | refused as `price_changed` (unchanged expected-total rule) |

A Gold that became unavailable is never turned into Silver.

### Inventory

Bundle children decrement exactly what an ordinary line decrements: the
**product's** `stock`, once per unit, aggregated across every line of that
product in the order (Gold ×1 + Silver ×2 needs 3 units of the product). No
bundle-specific inventory semantics exist.

### Order snapshot and historical integrity

Each `order_item` written since Phase 7 stores:

- `price` / `discount_price` **with the chosen modifiers folded in** — the
  regular price of that configuration, so `standaloneLineTotal`, edit-order's
  recompute, emails and refunds read correctly without knowing about options;
- `selected_options` (jsonb, additive in `0057`) — the canonical map;
- `name` with the label, as before: `Flower Stud (Color: Gold) — Build Your Ear Stack`.

`orderLineDisplay` renders name + options from the line alone; renaming or
deleting the option group afterwards changes nothing. Pre-Phase-7 lines have
no `selected_options` and display their stored name untouched.

### Builder UX

Products without options are unchanged. A product with options shows the
storefront's own `VariantSelector` chips (unavailable values struck through);
a configuration counts toward the stack only once every group is chosen and
resolves — "Choose Color to add this piece" until then. With duplicates off
the one allowed unit of a product simply moves to the newly chosen
configuration; with duplicates on each configuration is its own line with
−/+ and the product-level cap applies across all of them. Stock is
product-level, so there is no per-option sold-out state; a product with no
purchasable configuration reads "No options available".

### Analytics

Unchanged. Product rankings group by `order_item.product_id`, so Flower Stud
Gold and Flower Stud Silver are still one "Flower Stud" row (2 units, 2
instances); instances, revenue, pieces, tier analytics and Best Sellers do not
look at options at all. No variant breakdown table was added.

### Query shapes

- Bundle detail / any DTO hydration: manual pools, placements, eligibility
  categories, tiers, dynamic union, **+ one option-group query over every pool
  product id** (and one settings read). Card listings run the same hydration
  for availability but still strip `eligibleProducts`, so no option matrix is
  sent to a homepage rail.
- Checkout / evaluate: products **and option groups for the selected ids
  only** — never the pool. The per-child product re-read the bundle insert
  loop used to do is gone; the snapshot is written from the rows the
  validation already loaded.

### Schema

`0057_variant_aware_bundles` adds `bundle_campaign_product.selected_options
jsonb` and `order_item.selected_options jsonb`, both nullable. No data
migration; every existing row is a simple product / a BYS pool row / a
pre-Phase-7 line and reads as such.

### Applying the bundle migrations (closeout audit, 2026-09-18)

**In deployment, migrations are applied by the app itself.** On every boot
`shared/database/auto-migrate.ts` (see `DEPLOYMENT.md`) applies each `.sql`
file in `shared/database/migrations` in filename order that is not yet
recorded in `public.__drizzle_migrations` (one row per file name), running
each statement individually. That is the mechanism a Coolify deploy uses —
not `drizzle-kit migrate` — so `0051`–`0057` are applied automatically by the
first start of a build that contains them, and nothing has to be run by hand.

Verified on disposable Postgres with that exact migrator:

- **Clean replay from `0000`:** 61 files applied, 0 failed, all bundle tables,
  the two nullable `selected_options` columns, the analytics indexes, the tier
  indexes and the `curated_stack` enum value present. The schema matches a
  `drizzle-kit push` of the current `schema.ts` except for one pre-existing,
  unrelated gap: `category_content` has never had a migration file (its
  readers fall back to defaults when the table is missing).
- **Upgrade path:** a database at the committed pre-bundle (`0050`) state,
  seeded at `0054` with a legacy single-price Build Your Stack, a curated
  campaign, an option product and orders, then booted: `0055`–`0057` applied,
  the `0055` backfill created exactly one tier (`2 × 120`) for the legacy BYS,
  none for the curated campaign or an unpriced draft, and every legacy row
  read back unchanged.

That second check found a bug in the migrator: its statement splitter dropped
any chunk that *began* with `--` comment lines — which is what the `0055`
backfill is — while still marking the file applied. The runtime never
noticed, because a Build Your Stack campaign with no tier rows is priced from
its legacy `required_quantity` / `fixed_bundle_price` pair by design, but the
backfill would have silently never run anywhere. The splitter now strips
leading comment lines and keeps the statement (`splitMigrationStatements`,
unit-tested against the committed migration folder). A database whose
`0055` was applied by the old migrator can be backfilled by deleting its
`0055_colorful_dazzler.sql` row from `public.__drizzle_migrations` and
restarting (the file is idempotent: `ON CONFLICT DO NOTHING`, and the
migrator skips "already exists" DDL).

`drizzle-kit migrate` (the `pnpm drizzle:migrate` script) is **not** the
deployment path and cannot replay this repository from `0000`: three
hand-written files are not in Drizzle's journal
(`0001_add_homepage_content`, `0004_fincart_integration`,
`0018_layout_settings_template_scope`), so it fails at `0017` and rolls back.
The boot migrator reads the folder, not the journal, which is why it works.
`drizzle-kit generate` (drift check) and the journal/snapshots remain correct
for `0051`–`0057`.

## Not built (genuinely post-Bundles work)

- Behavioural/funnel analytics for bundles (bundle page views, builder started,
  tier reached, added to cart) — a separate concern from the sales analytics
  above, and only worth building if the funnel questions become real.
- Bundle reviews and "Edit stack" from the cart.
- Tag/collection eligibility rules, once the catalogue has such a table.
- Per-line refund amounts, which would let analytics report net-of-refund
  revenue instead of the charged total.
- A per-combination variant table (own SKU, stock, image) — a catalogue
  redesign, not a bundles feature. Everything above is written against the
  option-group model and would carry over unchanged if identities became ids.
- Storefront quick-add of option products without a configuration (product
  cards, quick view, search results), and option-modifier previews on the
  non-default product page templates (only Minimal shows the modifier-
  inclusive price before add-to-cart; the cart, checkout and order are correct
  on every template). Both pre-date Bundles.
