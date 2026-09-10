# Lebsy Shop — Copilot Context Prompt

> Last updated: 2026-03-28 (post-audit corrections applied)

---

## Project Identity

**Lebsy** is a single-shop e-commerce template I'm building to sell on marketplaces (CodeCanyon, Gumroad, etc.). It's NOT a live store — it's a product that developers/entrepreneurs buy and deploy as their own shop. A brand called **Percé** is currently using this template in production.

**Stack:** React 19 + Vike (SSR) + Tailwind + shadcn/ui | Fastify + tRPC + Drizzle ORM + PostgreSQL

## Architecture — Key Files

### Configuration (source of truth)
- `shared/config/app.ts` → `SINGLE_SHOP_MODE` flag
- `shared/config/store.ts` → `DEFAULT_STORE_ID` (vendor FK workaround)
- `shared/config/branding.ts` → `STORE_NAME`, `STORE_CURRENCY`, `STORE_DESCRIPTION` (env vars)
- `shared/config/payment.ts` → Payment gateway detection (Stripe, Paymob, COD)

### Type Definitions (Zod + TypeScript)
- `shared/types/layout-settings.ts` → LayoutSettings (header + footer CMS)
- `shared/types/homepage-content.ts` → HomepageContent (hero, promo, sections)
- `shared/types/category-content.ts` → CategoryContent (title, desc, hero)
- `shared/types/pixel-tracking.ts` → Pixel platforms, events, tracking types

### Database
- `shared/database/drizzle/schema.ts` → ~30 tables: product (with variants/images/categories), order (with items + Fincart tracking fields), category, promoCode, user, vendor (legacy, full schema still present). CMS: layoutSettings, homepageContent, categoryContent (all JSONB). Tracking: pixelConfig, trackingEvent, attributionTouchpoint. Config: storeSettings (shipping fee + templateSelection JSONB). Unused tables: template, templateAssignment, templateAnalytics.
- **Note:** Products have dual category relationships — `product.categoryId` (direct FK, primary category) + `productCategory` junction table (many-to-many, additional categories). This is intentional.

### Router (ONLY use this one)
- `shared/trpc/router.ts` → PRIMARY router with 13 sub-routers: auth (8 procedures), category, product, order, file, promoCode, homepage, layout, pixelTracking, payment, settings (includes getTemplateSelection + updateTemplateSelection), analytics
- ⚠️ `backend/router/router.ts` is a DEAD FILE — never import or reference it

### Layout Wrapper
- `layouts/LayoutDefault.tsx` → Root layout: AuthContext → CartProvider → TemplateProvider → LayoutSettingsContext → NavbarModeContext → TrackingProvider → Navbar/EditorialNavbar → {children} → Footer
- Editorial templates use `EditorialChrome` wrapper which hides global navbar/footer via CSS data-attribute and renders its own

## Template System

Two systems coexist — ONLY work with V2:
- **V2 (active):** `components/template-system/templateConfig.ts` — 30 templates across 8 page types
- **V1 (legacy/dead):** `frontend/components/template/templateRegistry.ts` — do not extend. V1 backward-compat code (activeTemplates / switchTemplate / getActiveTemplate) still exists in TemplateContext — ignore it.

### Template Selection Flow (fully wired to DB)
```
Admin selects template → optimistic localStorage cache update → DB mutation via trpc.settings.updateTemplateSelection.mutate()
                                                                    ↓
Page load → TemplateContext initializes from localStorage (fast hydration) → fetches from DB via trpc.settings.getTemplateSelection.query() (source of truth) → renders selected component
```
Persistence uses `storeSettings.templateSelection` JSONB column. The old `template`, `templateAssignment`, `templateAnalytics` tables are unused.

### V2 Template inventory
- Landing (homepage): 4 — Modern, Classic, Editorial, Minimal
- Home: 2 — Featured Products, Modern V2
- Product Page: 6 — Percé, Classic, Editorial, Technical, Minimal, Modern Split
- Category Page: 5 — Grid Classic, Hero Split, Minimal, Showcase, Grid with Filters
- Cart: 2 — Modern, Editorial
- Checkout: 2 — Modern, Editorial
- Search Results: 2-3 — Grid, Minimal, Editorial
- Sorting: 2 — Minimal, Editorial

## Folder Structure

```
shared/          → Config, DB schema, tRPC router, types, email templates, utils
backend/         → Route handlers: analytics, auth, categories, dashboard, file, homepage, layout, orders, payments, pixel-tracking, products, promo-codes, settings
pages/           → Vike page routes (index, shop, featured/brands|men|women|products, categories/@slug, cart, checkout, orders, order-confirmation, search, dashboard/*, login, register, etc.)
components/      → globals (Navbar, Footer), template-system (V2 templates), dashboard, shop, ui (shadcn), template (admin), home
frontend/        → contexts (TemplateContext, LayoutSettingsContext, TrackingContext), pixel-adapters, tracking, V1 legacy templates
layouts/         → LayoutDefault.tsx
```

## CMS Pages (Admin Dashboard)

| Route | Purpose | Storage |
|-------|---------|---------|
| `/dashboard/admin/layout-settings` | Header/footer config (logo, nav, announcement, footer links, social) | layoutSettings table (JSONB) |
| `/dashboard/admin/homepage` | Homepage sections (hero, promo, value props, categories, featured, newsletter, CTA, brand statement) | homepageContent table (JSONB) |
| `/dashboard/admin/category-content` | Per-category hero & description | categoryContent table (JSONB) |
| `/dashboard/admin/templates` | Template switcher per page type | storeSettings.templateSelection (JSONB) + localStorage cache |
| `/dashboard/admin/pixels` | Pixel/tracking config (Meta, GA4, TikTok, Snapchat, Pinterest, Custom) | pixelConfig + tracking tables |
| `/dashboard/admin/analytics` | Real analytics (overview, funnel, events, platform health, top products) | Real DB queries |
| `/dashboard/products` | Product CRUD | product + variants + images tables |
| `/dashboard/categories` | Category CRUD | category table |
| `/dashboard/orders` | Order management (includes Fincart integration fields) | order + orderItem tables |
| `/dashboard/promo-codes` | Promo code CRUD | promoCode tables |
| `/dashboard/settings` | Store settings (shipping fee + template selection) | storeSettings table |

## Route Status

### Working Routes
- `/shop` — ✅ EXISTS and works. Renders sorting template with optional `?category=<slug>` filtering. CMS default links are valid.
- `/categories/@slug` — ✅ Dynamic category route exists and works.

### Routes to Remove (pre-launch cleanup)
- `/featured/men/` and `/featured/women/` — ⚠️ STILL EXIST. Hardcoded gendered category pages that filter by `categoryType: "men"/"women"`. Redundant with the dynamic `/categories/@slug` route. Inappropriate for a generic template product — must be removed before marketplace submission.

## Known Issues to Fix

1. **Hardcoded gendered routes** — `/featured/men/` and `/featured/women/` must be deleted. They limit the template's audience.
2. **`footerStyle` field** — exists in `shared/types/layout-settings.ts` Zod schema but is NOT read by any render component. Footer variant is controlled by EditorialChrome wrapper per-template, not by this CMS field. Either wire it or remove it.
3. **`getCategoryUrl()` in route-helpers.ts** — points to stale `/featured/categories/:id`. Should point to `/categories/:slug` or be deleted.
4. **Dead `categoryType` enum** — `category.type` was changed from enum to text (default "general") but the old `categoryType` enum is still declared in schema. Remove it.
5. **Newsletter** — UI renders but no subscription backend exists.
6. **V1 template system** — still in codebase at `frontend/components/template/`. Should be removed or clearly deprecated.
7. **Dead files to delete:** `backend/router/router.ts` (stale router copy), internal audit files.
8. **Vendor remnants:** `showVendor` prop in TopSellingProductsCard, vendor code in `useAnalytics` hook. Vendor table has full schema beyond the FK workaround — clean up or document.
9. **Unused DB tables:** `template`, `templateAssignment`, `templateAnalytics` — template persistence now uses `storeSettings.templateSelection`. These tables can be dropped.
10. **EDITORIAL-DESIGN-DIRECTION.md** — review for useful design guidelines before deletion.

## UX/UI Priority

The templates need visual polish to compete on marketplaces. When working on templates:
- Each template should feel like a distinct, premium design — not a minor color variation
- Focus on spacing, typography hierarchy, hover states, micro-interactions, image treatment
- The "Editorial" variants should feel magazine-quality
- The "Modern" variants should feel clean and conversion-optimized
- Mobile responsiveness is critical — marketplace reviewers test this
- Currently the Modern, Classic, and Minimal landing pages look nearly identical — they need significant visual differentiation

## Development Rules

1. Always use the V2 template system (`components/template-system/`)
2. Never import from `backend/router/router.ts` — use `shared/trpc/router.ts`
3. All CMS data flows: Admin UI → tRPC mutation → DB (JSONB) → tRPC query → Context/Props → Component render
4. Template selection flows through: `storeSettings.templateSelection` (DB, source of truth) + localStorage (cache for fast hydration)
5. Use Tailwind + shadcn/ui for all UI work
6. Keep `SINGLE_SHOP_MODE` assumptions — no multi-vendor logic
7. When adding routes, follow Vike conventions: `pages/[route-name]/+Page.tsx`
8. Do not modify or extend the V1 template system or its backward-compat layer in TemplateContext
