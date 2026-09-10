# Lebsy Single-Shop Template — Codebase Map

> Generated: 2026-03-07 | Updated: 2026-03-25 | Audit version: 1.1

## Architecture Overview

```
React 19 + Vike (SSR) + Tailwind + shadcn/ui
         │
    LayoutDefault.tsx          ← global wrapper
    ├── AuthContext             ← session from SSR + /api/auth/me fallback
    ├── CartProvider            ← local cart state (localStorage)
    ├── TemplateProvider        ← template selection (localStorage)
    ├── LayoutSettingsContext   ← CMS header/footer config (tRPC query)
    ├── NavbarModeContext       ← solid vs overlay per route
    ├── TrackingProvider        ← pixel event bus
    │
    ├── Navbar | EditorialNavbar   ← navbarStyle from CMS
    ├── {children}                 ← page content
    └── Footer                     ← always rendered (editorial pages hide via CSS + inject EditorialFooter)
```

```
Fastify + tRPC + Drizzle ORM + PostgreSQL
         │
    shared/trpc/router.ts  ← PRIMARY router (11 sub-routers)
    shared/trpc/server.ts  ← tRPC init, context, middleware
    shared/trpc/client.ts  ← client proxy
```

## Source-of-Truth Files

### Configuration

| File                        | Purpose                                                        |
| --------------------------- | -------------------------------------------------------------- |
| `shared/config/app.ts`      | `SINGLE_SHOP_MODE` flag                                        |
| `shared/config/store.ts`    | `DEFAULT_STORE_ID` (vendor FK workaround)                      |
| `shared/config/branding.ts` | `STORE_NAME`, `STORE_CURRENCY`, `STORE_DESCRIPTION` (env vars) |
| `shared/config/payment.ts`  | Payment gateway detection (Stripe, Paymob, COD fallback)       |

### Type Definitions (Zod + TypeScript)

| File                               | Defines                                              |
| ---------------------------------- | ---------------------------------------------------- |
| `shared/types/layout-settings.ts`  | `LayoutSettings` (header + footer) + defaults        |
| `shared/types/homepage-content.ts` | `HomepageContent` (hero, promo, sections) + defaults |
| `shared/types/category-content.ts` | `CategoryContent` (title, desc, hero) + defaults     |
| `shared/types/pixel-tracking.ts`   | Pixel platforms, event names, tracking types         |

### Database Schema

| File                                | Tables                                                                                                                                                                       |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shared/database/drizzle/schema.ts` | 25+ tables: user, session, vendor(legacy), product, order, category, promoCode, layoutSettings, homepageContent, categoryContent, template, pixelConfig, storeSettings, etc. |

### Router (PRIMARY — the one actually used)

| File                       | Status                                                                                                                                        |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `shared/trpc/router.ts`    | ✅ PRIMARY — 11 routers registered (auth, product, order, category, promoCode, homepage, layout, pixelTracking, payment, settings, analytics) |
| `backend/router/router.ts` | ⚠️ DEAD FILE — stale copy with only 6 routers, NOT imported anywhere                                                                          |

## Folder Responsibilities

```
shared/
├── config/          → App, store, branding, payment configuration
├── database/drizzle → Schema + migrations
├── trpc/            → Router, server init, middleware, client
├── types/           → Layout, homepage, category, pixel types
├── email/           → Email templates (order confirmation, etc.)
├── error/           → Error handling utilities
└── utils/           → Shared utilities

backend/
├── analytics/       → Analytics engine (overview, funnel, events, platform health, top products)
├── auth/            → Login, register, logout, me, verify-email, password-reset, update-profile
├── categories/      → CRUD + CMS content
├── dashboard/       → Admin overview stats
├── file/            → File upload handler
├── homepage/        → Homepage CMS CRUD
├── layout/          → Layout settings CMS (header/footer)
├── orders/          → Order CRUD + status + fincart webhook
├── payments/        → Stripe/Paymob webhook handlers + payment session creation
├── pixel-tracking/  → Event tracking, server-side delivery pipeline (5 CAPI adapters), attribution, consent
├── products/        → Product CRUD + search + reviews + stats
├── promo-codes/     → Promo code CRUD + validation
├── settings/        → Store settings (shipping fee)
└── router/          → ⚠️ DEAD FILE (stale appRouter copy)

pages/
├── index/           → Homepage (landing template)
├── featured/
│   ├── brands/      → "All Products" page (misleading name)
│   ├── men/         → Men's category page (hardcoded)
│   ├── women/       → Women's category page (hardcoded)
│   └── products/    → Dynamic product listing + detail
├── cart/            → Cart page (template-driven)
├── checkout/        → Checkout page (template-driven, fires CHECKOUT_STARTED tracking event)
├── orders/          → Order history
├── order-confirmation/ → Post-checkout confirmation (fires CHECKOUT_COMPLETED/Purchase tracking event)
├── search/          → Search results (template-driven)
├── dashboard/       → Admin CMS + CRUD pages
├── login/           → Auth
├── register/        → Auth
├── forgot-password/ → Auth
├── reset-password/  → Auth
├── verify-email/    → Auth
└── template-preview/ → Template preview iframe

components/
├── globals/         → Navbar, Footer, HeaderLogo, FooterLogo, Sidebar
├── template-system/ → V2 templates (landing×4, product×6, category×5, cart×2, checkout×2, search×2, sorting×2, home×2)
├── dashboard/       → Dashboard cards, sidebar, hooks
├── shop/            → ProductCard, Sorting, product components
├── ui/              → shadcn/ui primitives
├── template/        → Template admin components (TemplateCard, TemplateCustomizer)
└── home/            → Home page sections

frontend/
├── components/template/ → V1 legacy template registry + templates
├── contexts/        → TemplateContext, LayoutSettingsContext, TrackingContext
├── pixel-adapters/  → Meta, GA4, TikTok, Snapchat, Pinterest adapters
└── tracking/        → Event bus, attribution

layouts/
└── LayoutDefault.tsx → Root layout wrapper
```

## Template System

### Two Coexisting Systems

| System      | Location                                           | Used By                                                                             |
| ----------- | -------------------------------------------------- | ----------------------------------------------------------------------------------- |
| V2 (new)    | `components/template-system/templateConfig.ts`     | All storefront pages, TemplateContext                                               |
| V1 (legacy) | `frontend/components/template/templateRegistry.ts` | Template preview page, admin templates page (V1 section), Sorting/ProductCard types |

### V2 Template Counts

| Page Type          | Templates | Components                                                     |
| ------------------ | --------- | -------------------------------------------------------------- |
| Landing (homepage) | 4         | Modern, Classic, Editorial, Minimal                            |
| Home               | 2         | Featured Products, Modern V2                                   |
| Product Page       | 6         | Percé, Classic, Editorial, Technical, Minimal, Modern Split    |
| Category Page      | 5         | Grid Classic, Hero Split, Minimal, Showcase, Grid with Filters |
| Cart               | 2         | Modern, Editorial                                              |
| Checkout           | 2         | Modern, Editorial                                              |
| Search Results     | 2-3       | Grid, Minimal, Editorial                                       |
| Sorting            | 2         | Minimal, Editorial                                             |

### Template Selection Flow

```
Admin → /dashboard/admin/templates → select template per page type
  ↓
localStorage ("template-selection") stores { pageType: templateId }
  ↓
TemplateContext.getTemplateId(pageType) returns active ID
  ↓
getTemplateComponent(pageType, id) returns React component
  ↓
Page renders selected component with data props
```

### Header/Footer Variant Selection

```
Admin → /dashboard/admin/layout-settings → Header tab → Navbar Style radio
  ↓
layoutSettings.header.navbarStyle saved to DB (layoutSettings.content JSONB)
  ↓
LayoutDefault.tsx reads navbarStyle
  ↓
"editorial" → EditorialNavbar | "default" → Navbar

Footer switching:
- footerStyle field EXISTS in schema but is NOT wired to any render logic
- Editorial footer renders via EditorialChrome wrapper (per-template, not global CMS)
- Global Footer always renders; editorial pages hide it via CSS data-attribute
```
