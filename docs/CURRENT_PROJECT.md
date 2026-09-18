# CURRENT PROJECT — authoritative

> **Read this before any other document in this repository.**
>
> Every other `.md` file here (`README.md`, `CHATGPT_ONBOARDING_BRIEF.md`,
> `CHATGPT_REPLY_WITH_CODE.md`, `PHASE2_REPORT.md`, `PHASE3_REPORT.md`,
> `EDITORIAL-DESIGN-DIRECTION.md`, `docs/PROJECT_AUDIT.md`,
> `docs/MARKETING_SUITE_PLAN.md`, `docs/SYNT_TEST_MANUAL.md`,
> `docs/synt-new-changes.md`, `audit/*.md`, `.github/Copilot-Instructions.md`)
> was written for an **earlier project** and is retained as engineering history
> only. Where any of them conflicts with this file, **this file wins**.

## Repository

- **Repo:** `MAminn/E-commerce-piercing-brand`
- **Branch:** `master`
- This is the **independent** repository for a new Egyptian piercing jewelry
  brand. It is not a fork that tracks, syncs with, or deploys alongside the
  older repositories it was copied from.

## Brand

- **Working brand name: ZELI.**
  This is a working name and may change. It is therefore **not** written into
  runtime code. The single source of truth is
  [`shared/config/branding.ts`](../shared/config/branding.ts), overridable per
  environment via `VITE_STORE_NAME` and the other `VITE_*` variables documented
  in [`.env.example`](../.env.example). Renaming the brand means changing that
  one file's defaults, or the environment — never a repo-wide search/replace.
- **Primary market:** Egypt only.
- **Primary audience:** Egyptian Gen Z women, roughly 18–27.
- **Secondary audience:** younger millennials.

## Relationship to previous brands

The codebase was copied from earlier e-commerce projects. Names that appear in
the git history and in the archived documents — **Percé / Percée**, **Lebsy /
Lebsey**, **SYNT** — are **previous, unrelated brands**.

- The old **Percé** social accounts (Instagram, Facebook, TikTok) are **not**
  being renamed, reused, or inherited. They are historical assets belonging to
  a different brand.
- The new brand will have **entirely new** Instagram / Facebook / TikTok
  accounts. Until those exist, social links are simply **hidden** everywhere
  (footer, `/links`, emails) rather than filled with placeholders or the old
  brand's URLs. See `STORE_SOCIAL_LINKS` in `shared/config/branding.ts`.
- Old domains (`perce-eg.com`, `syntperfumes.com`) and old support inboxes
  (`support@lebsy.com`, `syntperfumes@gmail.com`, `cs@Lebsey.com`) must never
  be reintroduced into runtime code, defaults, or configuration.

## What is reused vs. what is new

**Reused:** the e-commerce infrastructure — Vike/React 19 SSR, Fastify, tRPC,
Drizzle/PostgreSQL, the admin dashboard, the template system, pixel tracking
and Meta CAPI, promo codes and offers, Bosta/Fincart shipping, Paymob/Stripe
payments, the email automation suite.

**New:** the entire public brand identity — name, logo, favicon, typography,
colour system, photography, copy, social presence, domain.

## Current phase

**Brand / storefront rebuild before launch.** The store has not launched.

Phase 0 (complete) removed legacy brand contamination from active runtime code
and consolidated brand identity into one configuration module. See the Phase 0
notes below for what is deliberately left outstanding.

## Rules for anyone (human or agent) working in this repo

1. Never hardcode a brand name, support email, domain, phone number, or social
   URL in runtime code. Read it from `shared/config/branding.ts`, from the CMS
   (Layout Settings / Homepage Content), or omit it.
2. Never invent business facts. Delivery times, return windows, refund
   timelines, warranties, materials, and hypoallergenic or medical/safety
   claims are **not established**. A default that would have to assert one
   should instead be blank or disabled, and the admin fills it in.
3. Never reintroduce a previous brand's name, assets, domains, inboxes, phone
   numbers, or social accounts — including "temporarily".
4. Treat the archived documents listed at the top of this file as history, not
   as a specification.

## ZELI production template preset

The template system has eight independent selectors. Left to their own
defaults they used to disagree — five page files each carried their own
`?? "some-id"` fallback, and an unconfigured store silently got
`templateConfig[category][0]`, a mix of three different visual families that
no page file mentioned. There is now exactly one answer, in
[`shared/config/storefront.ts`](../shared/config/storefront.ts) as
`ZELI_TEMPLATE_PRESET`, with the reasoning for each id recorded beside it.

| Selector | Template id | Notes |
|---|---|---|
| `landing` | `landing-minimal` | Only shell with Arabic/RTL, live search and a mobile bottom nav. |
| `home` | `featured-products-modern` | **Inert** — no customer route reads this selector. |
| `sorting` | `sorting-minimal` | Fallback for `/shop` when the shell is not minimal. |
| `productPage` | `product-minimal` | |
| `categoryPage` | `category-minimal` | The only category template with no fabricated filter or product defaults. |
| `cartPage` | `cart-minimal` | The only cart template implementing the full offer + promo-code prop surface. |
| `checkoutPage` | `checkout-modern` | The only checkout wired to the real order and payment-method contract. |
| `searchResults` | `search-results-minimal` | `search-results-grid` ships placeholder filter scaffolding. |

Rules:

- **These are fallbacks only.** A value in
  `store_settings.template_selection` always wins, and the admin template
  picker keeps working unchanged.
- No `*-editorial` template may enter the preset. Each one wraps itself in
  `EditorialChrome`, which renders a second footer and hides the global one
  from a client-only effect — so the server emits both and one disappears on
  hydration. `shared/config/__tests__/storefront.test.ts` enforces this, and
  that every preset id exists in the registry.
- Resolve template ids with `resolveTemplateId(category, selected)`. Do not
  write a literal fallback id at a call site.

### Shell-owned routes

Under the ZELI shell (`layoutSettings.header.navbarStyle === "minimal"`)
`/shop` and `/categories/[slug]` do **not** go through the `sorting` /
`categoryPage` selectors. Both render `MinimalCategoryPage`, the only
catalogue UI with the shell's Arabic/RTL, pagination and shared product card.
The preset values for those two selectors are what those routes fall back to
if an admin switches the shell away from minimal.

Launch prerequisites that are configuration rather than code are tracked in
[`docs/ZELI_LAUNCH_CONFIGURATION.md`](ZELI_LAUNCH_CONFIGURATION.md).

## Bundles & Stacks

Merchant-managed bundle campaigns sold for one price, in two models:
**Build Your Stack** (the shopper picks N units from an eligible pool) and
**Curated Stack** (the merchant fixes the exact products and quantities).

They live in their own domain beside the Offers engine — `bundle_campaign`,
`bundle_campaign_product`, `bundle_campaign_category` and
`bundle_campaign_eligibility_category` tables, `shared/bundles/` for the pure
qualification, pricing, eligibility and cart rules, `backend/bundles/` for the
tRPC API and the authoritative eligibility resolver, and `/dashboard/bundles`
for the CMS. Customers reach them at `/bundles` and `/bundles/[slug]`, plus the
homepage rail, any category the merchant places them on, and the navbar.

A Build Your Stack campaign prices through **quantity tiers** (3 for 270, 4 for
340, 6 for 480). A selection buys the tier it matches exactly — a count between
rungs is not a bundle and is never rounded down. Campaign availability means
"at least one tier can currently be completed", so a campaign stays sellable at
its smaller sizes when the largest is out of stock. Pre-Phase-5 campaigns were
backfilled with a single equivalent tier and behave exactly as before.

A Build Your Stack pool can be **manual**, **dynamic** (rules over product
category and price, re-evaluated on every request so new matching products join
the campaign with no CMS edit) or **hybrid**. One server-side resolver answers
eligibility for every surface — storefront, builder, cart, checkout and the CMS
preview — and checkout always re-resolves rather than trusting what the cart
captured. Curated stacks ignore eligibility rules entirely.

Stacks travel through the cart as grouped **bundle instances**
(`localStorage["cartBundles"]`), are re-validated and re-priced by the server
at add-to-cart and again at order creation, and are snapshotted onto orders in
`order_bundle`. The admin order detail groups each purchased instance from that
snapshot alone, so editing or deleting a campaign never rewrites history.

Two category relations exist and are deliberately independent: placement
(merchandising — where a campaign is shown) never affects eligibility or
pricing; eligibility categories decide which products a shopper may pick.

**Bundle sales analytics** live at `/dashboard/bundles/analytics` and are
derived entirely from placed orders and their `order_bundle` snapshots — never
from tracking events, and never from current campaign pricing. An order counts
unless it was cancelled or archived, the same rule the store-wide revenue
figures use. Revenue is the sum of charged bundle totals, so a bundle's
children (which carry regular prices the shopper did not pay) are never
counted a second time. The same figures drive the storefront **Best Selling
Bundles** source for the homepage rail, which ranks live campaigns by bundle
instances sold over a trailing 30-day window; the merchant's manual campaign
picks are preserved when switching between Manual and Best Selling.

Bundles are **variant-aware**. This store's variants are option groups on a
product (`product_variant` = `{ name, values[{ value, priceModifier }] }`),
so a variant's identity is the canonical `{ Color: "Gold" }` map, its price is
the effective product price plus modifiers, and its stock is the product's.
Build Your Stack shoppers pick the configuration in the builder; curated lines
fix it in the CMS (`bundle_campaign_product.selected_options`); the server
re-resolves every line against the live option groups at add-to-cart and at
checkout (a removed or struck-through value is refused, never substituted);
order lines snapshot the canonical options and modifier-inclusive prices
(`order_item.selected_options`, migration `0057`). Eligibility, duplicate and
max-per-product rules stay product-level, and product analytics still
aggregate by product. The same resolver now prices ordinary cart lines, fixing
the pre-existing gap where the product page showed a modifier-inclusive price
that checkout did not charge. `shared/products/options.ts` is the one place
these rules live.

Design, semantics, metric definitions and the Offers/promo coexistence rule are
in [`docs/BUNDLES_AND_STACKS.md`](BUNDLES_AND_STACKS.md).

## Known internal legacy identifiers (deliberately retained)

| Identifier | Where | Why it stays |
|---|---|---|
| `product-perce` | `components/template-system/templateConfig.ts`, default in `pages/featured/products/@productId/+Page.tsx` | Persisted in `store_settings.template_selection`. Renaming it would silently unselect the product template on any store that has already chosen it. Invisible to customers. Rename only together with a data migration. |

The React component behind that id was renamed `ProductPagePerce` →
`ProductPagePremium` (pure code symbol, nothing persisted), and its
admin-facing label is now "Premium (Default)".
