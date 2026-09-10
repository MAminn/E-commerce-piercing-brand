# Lebsy Single-Shop Template — Current State Audit

> Generated: 2026-03-07 | Updated: 2026-03-25 | Version: 1.1  
> Auditor: Automated code audit  
> Scope: Full codebase, CMS inventory, runtime verification, product readiness

---

## 1. Executive Summary

**Lebsy Shop** is a React + Vike + Fastify + tRPC + Drizzle single-shop e-commerce template with a CMS-driven layout system and 30+ switchable page templates. The codebase is ~80% ready for commercial sale.

### What Works (Genuinely Ready)

- Product CRUD (admin), product browsing, search, reviews
- Cart + checkout flow (COD, Stripe, Paymob)
- Order management with status tracking
- Promo code system (percentage/fixed, per-product/category targeting, usage limits)
- Homepage CMS (hero, sections, value props — all connected end-to-end)
- Layout CMS (header logo, nav links, announcement bar, navbar style switching)
- Footer CMS (logo, description, link groups, social links, newsletter toggle)
- Template switcher (~30 templates across 8 page types)
- Pixel & tracking system (Meta, GA4, TikTok, Snapchat, Pinterest) with server-side delivery pipeline
- Analytics dashboard with real backend data (overview, funnel, event breakdown, platform health)
- Conversion tracking across full commerce funnel (page view → product view → add to cart → checkout → purchase)
- Auth system (register, login, email verification, password reset, admin guard)
- Category CRUD + per-category CMS content

### What's Risky or Broken

- `footerStyle` CMS field exists but does NOT control footer rendering (misleading)
- `/shop` route doesn't exist but is heavily linked in CMS defaults and templates
- Hardcoded `/featured/men/` and `/featured/women/` routes (not generic for a template)
- "Brands" page is misleading — it's just "All Products" (vendor-era naming)
- Template selection is localStorage-only — not persisted to DB
- Newsletter UI exists but no subscription backend
- Two coexisting template systems (V1 legacy + V2 new)
- Dead `backend/router/router.ts` file (stale copy, confuses auditors)
- Category hero image has no upload — text-only URL input
- Settings page has only shipping fee (no store name, currency, etc.)
- `useAnalytics` hook has dead vendor code

---

## 2. Codebase Map

See [audit/codebase-map.md](codebase-map.md) for full architecture documentation.

### Key Architecture Facts

| Concern  | Detail                                                                                   |
| -------- | ---------------------------------------------------------------------------------------- |
| Frontend | React 19 + Vike (SSR) + Tailwind + shadcn/ui                                             |
| Backend  | Fastify + tRPC + PostgreSQL + Drizzle ORM                                                |
| Auth     | Custom (session tokens, httpOnly cookies)                                                |
| State    | Server: tRPC queries. Client: CartContext (localStorage), TemplateContext (localStorage) |
| Router   | `shared/trpc/router.ts` — 11 sub-routers registered                                      |
| Schema   | 25+ tables in `shared/database/drizzle/schema.ts`                                        |
| Config   | `SINGLE_SHOP_MODE`, `DEFAULT_STORE_ID`, `STORE_NAME` (env vars)                          |

### Primary Router (shared/trpc/router.ts)

✅ auth, ✅ product, ✅ order, ✅ category, ✅ promoCode, ✅ homepage, ✅ layout, ✅ pixelTracking, ✅ payment, ✅ settings, ✅ analytics

⚠️ `backend/router/router.ts` is a **dead file** (only 6 routers, not imported anywhere). Should be deleted.

---

## 3. CMS/Admin Inventory

See [audit/cms-inventory.json](cms-inventory.json) for machine-readable format.

### 3.1 Layout Settings (`/dashboard/admin/layout-settings`)

**Tabs: Header | Footer**

#### Header Settings — Field Status

| Field                            | Type          | Status                                         |
| -------------------------------- | ------------- | ---------------------------------------------- |
| Navbar Style (default/editorial) | Radio group   | ✅ Fully working — drives global navbar render |
| Logo Image                       | Image upload  | ✅ Fully working                               |
| Logo Size (4 dimensions)         | Number inputs | ✅ Fully working                               |
| Logo Text                        | Text input    | ✅ Fully working (fallback to STORE_NAME)      |
| Tagline                          | Text input    | ✅ Fully working                               |
| Announcement Bar Enable          | Toggle        | ✅ Fully working                               |
| Announcement Bar Text            | Text input    | ✅ Fully working                               |
| Navigation Links                 | Repeater      | ⚠️ Default link to `/shop` which doesn't exist |

#### Footer Settings — Field Status

| Field                            | Type            | Status                                                                                          |
| -------------------------------- | --------------- | ----------------------------------------------------------------------------------------------- |
| Logo Image                       | Image upload    | ✅ Fully working                                                                                |
| Logo Text                        | Text input      | ✅ Fully working (fallback to STORE_NAME)                                                       |
| Logo Size (4 dimensions)         | Number inputs   | ✅ Fully working                                                                                |
| Description                      | Textarea        | ✅ Fully working                                                                                |
| Copyright                        | Text input      | ✅ Fully working                                                                                |
| Newsletter Toggle                | Toggle          | ✅ Fully working (hides newsletter section)                                                     |
| Footer Style (default/editorial) | **Schema only** | 🔴 **MISLEADING** — exists in type/Zod but NOT exposed in admin UI, NOT read by any render code |
| Footer Link Groups               | Repeater        | ⚠️ Default links to `/shop` and `/contact` which don't exist                                    |
| Social Links                     | Repeater        | ✅ Fully working                                                                                |

### 3.2 Homepage CMS (`/dashboard/admin/homepage`)

| Section           | Fields                                                                             | Status                               |
| ----------------- | ---------------------------------------------------------------------------------- | ------------------------------------ |
| Hero              | title, subtitle, ctaText, ctaLink, backgroundImage, mobileBackgroundImage, enabled | ✅ Fully working                     |
| Promo Banner      | text, linkUrl, linkText, enabled                                                   | ✅ Fully working                     |
| Value Props       | items[] (icon, title, desc), max 6                                                 | ✅ Fully working                     |
| Categories        | title, subtitle, enabled                                                           | ✅ Fully working                     |
| Featured Products | title, subtitle, enabled                                                           | ✅ Fully working                     |
| Newsletter        | title, subtitle, enabled                                                           | ⚠️ UI-only — no subscription backend |
| Footer CTA        | title, subtitle, ctaText, ctaLink, enabled                                         | ✅ Fully working                     |
| Brand Statement   | heading, description, image, enabled                                               | ✅ Fully working                     |

### 3.3 Category CMS (`/dashboard/admin/category-content`)

| Field                     | Type                | Status                                                                  |
| ------------------------- | ------------------- | ----------------------------------------------------------------------- |
| Category selector         | Select dropdown     | ⚠️ Hardcoded options ("electronics, fashion, home, sports, men, women") |
| Title                     | Text input          | ✅ Fully working                                                        |
| Description toggle + text | Toggle + textarea   | ✅ Fully working                                                        |
| Hero toggle + image URL   | Toggle + text input | ⚠️ No image upload — must paste URL manually                            |

### 3.4 Templates (`/dashboard/admin/templates`)

| Aspect                                                            | Status                                                                                           |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Template selection UI                                             | ✅ Fully working — card grid with preview + select                                               |
| Template preview                                                  | ✅ Working via `?templatePreview=` URL param                                                     |
| Persistence                                                       | 🔴 **localStorage only** — not saved to DB. Different browsers/devices show different templates. |
| DB tables exist (template, templateAssignment, templateAnalytics) | ⚠️ Created but unused                                                                            |
| Two systems coexist (V1 + V2)                                     | ⚠️ Admin page shows both in collapsible sections                                                 |

### 3.5 Products (`/dashboard/products`)

| Feature                      | Status           |
| ---------------------------- | ---------------- |
| Create/Edit/Delete           | ✅ Fully working |
| Multi-image support          | ✅ Fully working |
| Variants (size, color, etc.) | ✅ Fully working |
| Multi-category assignment    | ✅ Fully working |
| Stock management             | ✅ Fully working |
| Product stats (admin)        | ✅ Fully working |

### 3.6 Orders (`/dashboard/orders`)

| Feature                                     | Status           |
| ------------------------------------------- | ---------------- |
| View all orders (admin) / own orders (user) | ✅ Fully working |
| Status filtering                            | ✅ Fully working |
| Update status (admin)                       | ✅ Fully working |
| Delete/cancel (admin)                       | ✅ Fully working |
| Order stats                                 | ✅ Fully working |

### 3.7 Promo Codes (`/dashboard/promo-codes`)

| Feature                              | Status           |
| ------------------------------------ | ---------------- |
| Create/Edit/Delete                   | ✅ Fully working |
| Percentage / Fixed amount            | ✅ Fully working |
| Date range + status management       | ✅ Fully working |
| Usage limits (total + per-user)      | ✅ Fully working |
| Per-product / per-category targeting | ✅ Fully working |
| Checkout validation                  | ✅ Fully working |

### 3.8 Pixels & Tracking (`/dashboard/admin/pixels`)

| Feature                                                      | Status                                          |
| ------------------------------------------------------------ | ----------------------------------------------- |
| Add/edit/delete pixel configs                                | ✅ Fully working                                |
| 6 platforms (Meta, GA4, TikTok, Snapchat, Pinterest, Custom) | ✅ Fully working                                |
| Event log viewer                                             | ✅ Working                                      |
| Custom event definitions                                     | ✅ Working                                      |
| Client-side event bus                                        | ✅ Working                                      |
| Server-side delivery pipeline                                | ✅ Implemented (5 CAPI adapters + delivery log) |
| Pixel readiness panel                                        | ✅ Live platform health + commerce event badges |
| Delivery logging                                             | ✅ Per-event per-platform audit trail           |

### 3.9 Analytics (`/dashboard/admin/analytics`)

| Feature                   | Status                                                                                       |
| ------------------------- | -------------------------------------------------------------------------------------------- |
| Overview metrics          | ✅ Real data (orders, revenue, AOV, products, 7-day)                                         |
| Conversion funnel         | ✅ Real data (5-stage from tracking events)                                                  |
| Best selling products     | ✅ Real data (by revenue)                                                                    |
| Most viewed products      | ✅ Real data (from tracking events, 30 days)                                                 |
| Event breakdown           | ✅ Real data (all event types with session counts)                                           |
| Platform health           | ✅ Real data (delivery rates, status per platform)                                           |
| Backend: analytics router | ✅ 5 admin procedures (overview, funnel, eventBreakdown, platformHealth, topTrackedProducts) |

### 3.10 Settings (`/dashboard/settings`)

| Feature                 | Status                         |
| ----------------------- | ------------------------------ |
| Shipping fee            | ✅ Fully working               |
| Store name/currency/tax | ❌ Not exposed — env vars only |

### 3.11 Dashboard Overview (`/dashboard`)

| Feature            | Status                              |
| ------------------ | ----------------------------------- |
| Product stats card | ✅ Working                          |
| Order stats card   | ✅ Working                          |
| Revenue card       | ✅ Working                          |
| Attention alerts   | ✅ Working                          |
| Templates card     | ✅ Working (link to templates page) |

---

## 4. Runtime Verification

### 4.1 What Was Verified

All verification done via code analysis (reading actual component render paths, tRPC calls, data binding). The app was not started due to environment dependencies (Docker/PostgreSQL).

### 4.2 Header Chain: CMS → Render

```
Admin: /dashboard/admin/layout-settings → Header tab
  ↓ tRPC layout.updateSettings → layoutSettings DB (JSONB)
  ↓ LayoutDefault.tsx → trpc.layout.getSettings → state
  ↓ layoutSettings.header.navbarStyle === "editorial"
     → EditorialNavbar (transparent, scroll-aware, motion)
     → Navbar (solid, pill-style nav, modern)
  ↓ Both read: logoUrl, logoText, logoSize, navLinks, announcements
```

**Verdict: ✅ FULLY WIRED END-TO-END**

### 4.3 Footer Chain: CMS → Render

```
Admin: /dashboard/admin/layout-settings → Footer tab
  ↓ tRPC layout.updateSettings → layoutSettings DB (JSONB)
  ↓ Footer.tsx reads: description, copyright, socialLinks, linkGroups, showNewsletter, logoUrl, logoText, logoSize
  ↓ FooterLogo component renders image or text fallback
```

**Verdict: ✅ MOSTLY WIRED — but `footerStyle` field is dead (not read by render)**

Footer style switching reality:

- `footerStyle` in schema → **NOT read by any component**
- When editorial template is active → `EditorialChrome` wrapper renders `EditorialFooter` AND hides `#global-footer` via CSS
- Footer variant is template-driven, NOT CMS-driven

### 4.4 Homepage Chain: CMS → Render

```
Admin: /dashboard/admin/homepage
  ↓ tRPC homepage.updateContent → homepageContent DB (JSONB)
  ↓ pages/index/+Page.tsx
     ↓ trpc.homepage.getContent → HomepageContent
     ↓ trpc.product.search → products
     ↓ trpc.category.view → categories
     ↓ TemplateContext.getTemplateId("landing") → active template ID
     ↓ getTemplateComponent("landing", id) → React component
     ↓ Template renders with CMS content + product data
```

**Verdict: ✅ FULLY WIRED END-TO-END**

### 4.5 Template Switching

```
Admin: /dashboard/admin/templates → select template
  ↓ localStorage: template-selection = { landing: "landing-editorial", ... }
  ↓ TemplateContext reads localStorage
  ↓ Each page calls getTemplateId(pageType) → gets ID
  ↓ getTemplateComponent(type, id) → returns different React component
```

**Verdict: ⚠️ FUNCTIONALLY WORKING but localStorage-only (not DB-persisted)**

### 4.6 Category CMS Chain

```
Admin: /dashboard/admin/category-content → select category
  ↓ tRPC category.updateContent → categoryContent DB (JSONB)
  ↓ pages/featured/men/categories/@categoryId → trpc.category.getContent
  ↓ Category page template receives title, description, hero
```

**Verdict: ✅ WIRED but only accessible via hardcoded men/women routes**

### 4.7 Missing `/shop` Route

The `/shop` route is referenced in:

- Default navigation link: `{ label: "Collection", url: "/shop" }`
- Default footer links: "All Products → /shop", "New Arrivals → /shop"
- Hero CTA default: "/shop"
- Multiple template breadcrumbs and "continue shopping" links

**But `/shop` does not exist as a page.** This is a broken link that would appear on first load with defaults.

---

## 5. Screenshots Index

Browser screenshots were **not captured** — the app requires Docker/PostgreSQL setup and was not running during this audit. All verification was performed via code analysis.

### What Was Verified Instead

| Area                | Method                                                                                 |
| ------------------- | -------------------------------------------------------------------------------------- |
| Admin pages         | Read complete page source files, identified all fields/controls                        |
| Storefront pages    | Read render logic, template data binding, tRPC calls                                   |
| Data chains         | Traced CMS field → DB column → backend procedure → frontend context → render component |
| Router registration | Verified actual imported router file vs dead file                                      |
| Template system     | Read both V1 and V2 template registries, counted templates                             |

---

## 6. Product Readiness Assessment

### ✅ READY for Commercial Release

| Feature                                     | Confidence | Notes                                              |
| ------------------------------------------- | ---------- | -------------------------------------------------- |
| Product CRUD                                | High       | Clean admin, multi-image, variants, multi-category |
| Order flow (cart → checkout → confirmation) | High       | COD + Stripe + Paymob, guest checkout              |
| Promo codes                                 | High       | Comprehensive — %, fixed, targeting, usage limits  |
| Homepage CMS                                | High       | All sections toggle + customize, hero images       |
| Header CMS                                  | High       | Logo, nav links, announcement bar, style switching |
| Footer CMS                                  | Medium     | Content works; style switching is broken           |
| Template system (visual variety)            | High       | 30+ templates, 8 page types                        |
| Auth system                                 | High       | Register, login, verify, reset, admin guard        |
| Admin dashboard                             | High       | KPIs, stats, attention alerts                      |
| Pixel tracking config                       | High       | UI complete; server-side delivery pipeline wired   |
| Analytics dashboard                         | High       | Real data — overview, funnel, events, health       |

### ⚠️ PARTIALLY READY (Needs Fix Before Release)

| Issue                                                  | Severity       | Impact                                                                      | Fix Effort                                                        |
| ------------------------------------------------------ | -------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `/shop` route missing                                  | **BLOCKER**    | Default nav link, footer links, hero CTA all broken on first load           | Create `/shop` as all-products page OR change defaults            |
| Hardcoded `/featured/men/` + `/featured/women/` routes | **BLOCKER**    | Template buyers with non-fashion stores can't use these. Not generic.       | Generalize to dynamic category routes                             |
| "Brands" page naming                                   | SHOULD-FIX     | Misleading — it's just "All Products"                                       | Rename to "Shop" or "All Products"                                |
| Template persistence is localStorage-only              | SHOULD-FIX     | Admin selects template but customers don't see it on other devices/browsers | Wire to DB (`templateAssignment` table already exists)            |
| `footerStyle` field is dead                            | SHOULD-FIX     | Schema exists, would confuse template customizers                           | Either wire it or remove from schema                              |
| Analytics page is 100% fake                            | ~~SHOULD-FIX~~ | ~~Customer would expect real data. Misleading.~~                            | ✅ **RESOLVED** — Now uses real backend data via analytics router |
| Newsletter has no backend                              | OPTIONAL       | UI renders but form does nothing                                            | Add simple email collection or remove                             |
| Category hero has no image upload                      | OPTIONAL       | Must paste URL manually                                                     | Add upload handler                                                |
| Settings page has only shipping fee                    | OPTIONAL       | Store name/currency only via env vars                                       | Add more settings or document clearly                             |

### 🔴 MISLEADING / FAKE (Remove or Fix Before Selling)

| Issue                                       | Risk                                  | Action                                         |
| ------------------------------------------- | ------------------------------------- | ---------------------------------------------- |
| `footerStyle` field in schema               | Developers will expect it to work     | Wire to render logic OR remove from types      |
| Analytics dashboard with hard-coded data    | ~~Was demo data~~ → ✅ Fixed          | Now uses real DB queries via analytics router  |
| Two template systems (V1 + V2) confusing    | Developers won't know which to extend | Remove V1 or clearly document as deprecated    |
| Dead `backend/router/router.ts`             | Confuses anyone reading the codebase  | Delete it                                      |
| `categoryType` enum ("men"/"women") in DB   | Not generic                           | Remove enum; category routes should be dynamic |
| `getVendorUrl()` helper function            | Vendor remnant                        | Delete                                         |
| `showVendor` prop in TopSellingProductsCard | Vendor remnant                        | Remove                                         |
| `useAnalytics` vendor data/functions        | Vendor remnant                        | Clean up                                       |

### 📦 What's MISSING for a True Sellable Template

| Gap                                     | Priority | Notes                                                  |
| --------------------------------------- | -------- | ------------------------------------------------------ |
| `/shop` (all products) route            | P0       | Required for launch — default links point here         |
| Generic category routing                | P0       | Replace `/featured/men/women` with `/categories/@slug` |
| Template persistence to DB              | P1       | Admin changes should be server-side                    |
| Documentation / README for buyers       | P1       | Setup guide, env vars, customization guide             |
| Demo/preview site                       | P1       | Marketplace buyers need to see it running              |
| `.env.example` with all vars documented | P1       |                                                        |
| Newsletter subscription backend         | P2       | Or remove newsletter UI                                |
| Footer style switching                  | P2       | Wire `footerStyle` to render, matching navbar pattern  |

---

## 7. Recommended Next Steps

### Immediate Priority: Fix Broken Defaults & Routes

1. **Create `/shop` route** — "All Products" page (can reuse brands page logic)
2. **Replace `/featured/men/` and `/featured/women/`** with generic `/categories/@slug/` dynamic route
3. **Rename "Brands"** to "Shop" or remove as a separate route
4. **Update CMS defaults** — change all `/shop` links to whatever the actual collection route becomes
5. **Delete dead `backend/router/router.ts`**
6. **Wire `footerStyle` to render** — match the `navbarStyle` pattern (2-line change in LayoutDefault.tsx)

### Then: Template Persistence & Cleanup

7. **Move template selection to DB** — use existing `templateAssignment` table
8. **Remove V1 template system** — or clearly gate it as legacy
9. **Clean vendor remnants** — `showVendor`, `useAnalytics` vendor code, `getVendorUrl()`
10. **Add "Demo Data" badge to analytics page** — or remove from sidebar

### Then: Packaging

11. **Write buyer documentation** (setup guide, env vars, CMS guide)
12. **Create `.env.example`** with all variables documented
13. **Set up demo preview site**
14. **Marketplace listing assets** — screenshots, feature list, demo video

---

## 8. Appendix

### A. Environment Variables Required

| Variable                 | Purpose                             | Default                                |
| ------------------------ | ----------------------------------- | -------------------------------------- |
| `SINGLE_SHOP_MODE`       | Enable single-shop behavior         | `"true"`                               |
| `STORE_OWNER_ID`         | Vendor FK workaround UUID           | `00000000-0000-0000-0000-000000000001` |
| `VITE_STORE_NAME`        | Store name (header/footer fallback) | `"Percé"`                              |
| `VITE_CURRENCY`          | Currency display                    | `"EGP"`                                |
| `VITE_STORE_DESCRIPTION` | SEO description                     | `"Curated fashion, quiet confidence."` |
| `STRIPE_SECRET_KEY`      | Stripe payment (optional)           | —                                      |
| `STRIPE_WEBHOOK_SECRET`  | Stripe webhooks (optional)          | —                                      |
| `PAYMOB_API_KEY`         | Paymob payment (optional)           | —                                      |
| `PAYMOB_INTEGRATION_ID`  | Paymob integration (optional)       | —                                      |
| `PAYMOB_HMAC_SECRET`     | Paymob webhooks (optional)          | —                                      |
| `DATABASE_URL`           | PostgreSQL connection               | —                                      |

### B. Files Worth Reviewing Next

| File                                               | Why                                         |
| -------------------------------------------------- | ------------------------------------------- |
| `shared/database/drizzle/schema.ts`                | Check if vendor tables can be made optional |
| `frontend/components/template/templateRegistry.ts` | V1 system — assess if removable             |
| `pages/featured/brands/+Page.tsx`                  | Rename/repurpose for `/shop`                |
| `pages/dashboard/admin/category-content/+Page.tsx` | Hardcoded category options                  |
| `components/dashboard/hooks/useAnalytics.ts`       | Vendor remnants to clean                    |
| `layouts/style.css` (line ~265)                    | Editorial chrome CSS toggle logic           |

### C. Dead Files to Delete

| File                          | Reason                                                       |
| ----------------------------- | ------------------------------------------------------------ |
| `backend/router/router.ts`    | Stale copy of `shared/trpc/router.ts`, not imported anywhere |
| `lib/utils/route-helpers.ts`  | Contains `getVendorUrl()` — vendor remnant                   |
| `temp_FeaturedSection.txt`    | Temp file                                                    |
| `CHATGPT_ONBOARDING_BRIEF.md` | Dev-only onboarding                                          |
| `CHATGPT_REPLY_WITH_CODE.md`  | Dev-only instructions                                        |
| `PHASE2_REPORT.md`            | Internal development report                                  |
| `PHASE3_REPORT.md`            | Internal development report                                  |
| `status.json`                 | Internal status tracking                                     |

### D. Unresolved Questions

1. **Is the Fincart integration (Egyptian logistics) wanted in the template?** It adds regional-specific code.
2. **Should the user role ("vendor") remain in the DB enum?** Currently `["admin", "vendor", "user"]` — vendor is dormant but exists in schema.
3. **What happens if template DB tables are queried but empty?** Template system bypasses DB entirely (localStorage-based), but tables exist and will show in migrations.
4. **Is Paymob (Egyptian payment gateway) wanted in the template?** It's region-specific. Global template might want Stripe-only + COD.
