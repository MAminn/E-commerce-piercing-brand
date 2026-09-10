# Lebsy Shop — Complete Project Audit

> **Generated:** February 19, 2026
> **Purpose:** Full technical + product analysis for selling this codebase as a digital product on CodeCanyon / Gumroad / similar marketplaces.

---

## 1. Executive Summary

**Lebsy Shop** (branded "Percé" in the UI) is a **single-shop e-commerce template** built with a modern SSR stack: **Vike (React 19) + Fastify + tRPC + PostgreSQL (Drizzle ORM) + Tailwind CSS 4 + shadcn/ui**.

### Who it's for

Solo entrepreneurs, small brands, and agencies who want a ready-made, customizable online store without vendor/marketplace complexity.

### What it can do today

- Full product catalog with categories, variants, multi-image support, reviews
- Shopping cart (client-side, localStorage) with promo code validation
- Checkout flow with order creation and email confirmation
- Admin dashboard: product CRUD, category management, order management, promo codes, homepage CMS, template switching
- **22 swappable templates** across 8 page types (the core selling point)
- Auth system (registration, login, email verification, session management)
- Fincart shipping integration (webhook-based)
- Docker-ready deployment, SSR-first architecture

### What it cannot do today (blockers to selling)

- No payment gateway integration (Stripe, PayPal, etc.)
- No `.env.example` documentation beyond bare minimum
- No buyer-facing setup guide or README
- Hard-coded Egyptian locale (EGP currency, Egyptian phone regex)
- No i18n framework
- No rate limiting on auth endpoints
- Debug endpoints exposed in production
- Vendor schema remnants still in database (kept for FK compatibility but confusing)
- Brand inconsistency (Navbar says "Percé", Footer says "Lebsey")

---

## 2. Architecture Map

### 2.1 System Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        BROWSER                              │
│  React 19 (SSR hydrated) + Tailwind 4 + shadcn/ui          │
│  Cart: localStorage │ Auth: httpOnly cookie │ tRPC client   │
└──────────────┬──────────────────────────────┬───────────────┘
               │ HTML (SSR)                   │ /api/trpc/*
               │ + client hydration           │ JSON-RPC
               ▼                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    FASTIFY SERVER (Node 22)                  │
│                                                             │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐ │
│  │ Vike SSR    │  │ tRPC Router  │  │ REST Endpoints     │ │
│  │ (all pages) │  │ 44 procedures│  │ /api/auth/token    │ │
│  │             │  │ 6 sub-routers│  │ POST /file         │ │
│  └──────┬──────┘  └──────┬───────┘  │ /api/webhooks/*    │ │
│         │                │          │ GET /health         │ │
│         │                │          └────────────────────┘ │
│  ┌──────┴────────────────┴──────────────────────────┐      │
│  │            MIDDLEWARE STACK                        │      │
│  │  1. @fastify/compress (gzip)                      │      │
│  │  2. @fastify/cookie (session cookie)              │      │
│  │  3. @fastify/multipart (100MB file uploads)       │      │
│  │  4. @fastify/static (assets, uploads, dist)       │      │
│  │  5. Drizzle DB plugin (connection + migrations)   │      │
│  │  6. Email service (Nodemailer SMTP)               │      │
│  │  7. Auth middleware (session validation on every   │      │
│  │     request via SHA-256 token lookup)              │      │
│  │  8. tRPC middleware (all procedure routing)        │      │
│  └──────────────────────┬───────────────────────────┘      │
└─────────────────────────┼───────────────────────────────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │   PostgreSQL 16       │
              │   Drizzle ORM         │
              │   20 tables           │
              │   12 migrations       │
              └───────────────────────┘
```

### 2.2 Tech Stack (from package.json)

| Layer                  | Technology                         | Version            |
| ---------------------- | ---------------------------------- | ------------------ |
| **Runtime**            | Node.js                            | ≥22                |
| **Package Manager**    | pnpm                               | (lockfile present) |
| **Frontend Framework** | React                              | 19.0.0             |
| **SSR Framework**      | Vike                               | 0.4.225            |
| **CSS**                | Tailwind CSS                       | 4.0.14             |
| **UI Components**      | shadcn/ui (Radix primitives)       | Latest             |
| **Animation**          | Framer Motion + React Spring       | 12.5, 9.7          |
| **Forms**              | React Hook Form + Zod              | 7.54, 3.24         |
| **Server**             | Fastify                            | 5.2.1              |
| **API Layer**          | tRPC                               | 10.45.2            |
| **Database**           | PostgreSQL 16 (Drizzle ORM)        | 0.39.3             |
| **Auth**               | Custom (Argon2 + SHA-256 sessions) | —                  |
| **Email**              | Nodemailer + React Email           | 6.10, 0.0.34       |
| **Image Processing**   | Sharp                              | 0.33.5             |
| **Build**              | Vite 6 + unbuild                   | 6.2.2              |
| **Linting**            | Biome                              | 1.9.4              |
| **Language**           | TypeScript                         | 5.8.2              |
| **Effect System**      | Effect                             | 3.13               |
| **Charts**             | Recharts                           | 3.1.2              |

### 2.3 Folder Map

```
lebsy/
├── pages/                  # Vike file-system routing (all customer + admin pages)
│   ├── index/              # Homepage (/)
│   ├── cart/               # Shopping cart (/cart)
│   ├── checkout/           # Checkout (/checkout)
│   ├── login/              # Auth - Login (/login)
│   ├── register/           # Auth - Register (/register)
│   ├── verify-email/       # Auth - Email verification
│   ├── featured/           # Shop pages (/shop, /shop/@productId, /featured/men, /featured/women)
│   ├── dashboard/          # Admin dashboard (all admin pages)
│   └── template-preview/   # Template preview page
├── components/
│   ├── ui/                 # 36 shadcn/ui primitives (Button, Card, Dialog, etc.)
│   ├── globals/            # Navbar, Footer, Sidebar, FAQ
│   ├── shop/               # Product cards, detail, category strip, new arrivals
│   ├── dashboard/          # Dashboard stats cards, analytics hook
│   ├── template-system/    # V2 template system (22 templates, 8 categories) ← CORE SELLING POINT
│   ├── template/           # Template admin components (selector, preview, customizer)
│   ├── file-uploads/       # File/image upload components
│   ├── home/               # Homepage featured section (deprecated wrapper)
│   └── utils/              # Link, AnimatedContent, Pagination
├── backend/
│   ├── auth/               # Auth module (login, register, logout, me, verify-email, session, middleware)
│   ├── products/           # Product CRUD + search + stats + reviews (13 tRPC procedures)
│   ├── orders/             # Order CRUD + stats + Fincart webhook (5 tRPC + 1 REST)
│   ├── categories/         # Category CRUD + content CMS (10 tRPC procedures)
│   ├── promo-codes/        # Promo code CRUD + validation (6 tRPC procedures)
│   ├── homepage/           # Homepage CMS (3 tRPC procedures)
│   ├── file/               # File upload (1 tRPC + 1 REST)
│   ├── dashboard/          # Admin overview (orphaned service, not registered)
│   └── router/             # tRPC app router (merges all sub-routers)
├── shared/
│   ├── database/           # Drizzle schema (924 lines, 20 tables), migrations, bootstrap
│   ├── trpc/               # tRPC server setup, context, middleware, client
│   ├── config/             # SINGLE_SHOP_MODE flag, DEFAULT_STORE_ID
│   ├── email/              # Email service (Nodemailer SMTP with fallback)
│   ├── types/              # HomepageContent, CategoryContent types
│   ├── error/              # ServerError class
│   ├── backend/            # Effect runtime, image optimization service
│   └── utils/              # formatCategoryName helper
├── frontend/
│   ├── components/template/# V1 legacy template system (preserved for admin preview)
│   └── contexts/           # TemplateContext (selection persistence)
├── layouts/                # LayoutDefault (root layout with providers)
├── hooks/                  # useParams, useSearchParams, useProductId, useIsMobile
├── context/                # AuthContext
├── lib/
│   ├── context/            # CartContext (315 lines), RoleContext
│   ├── services/           # CheckoutService, OrderService (legacy/mock)
│   ├── mock-data/          # Product/Order/Category mock data
│   └── utils/              # route-helpers, cn()
├── server/                 # Fastify server entry, Vike handler, env preload
├── assets/                 # 34 static images (product/brand/category .webp)
├── uploads/                # Runtime uploads (product images, homepage heroes)
├── build.config.ts         # unbuild config (server/shared/backend compilation)
├── drizzle.config.ts       # Drizzle migration config
├── vite.config.ts          # Vite + Vike + React + Tailwind plugins
├── docker-compose.yml      # PostgreSQL 16 dev database
├── Dockerfile              # Multi-stage production build
├── biome.json              # Linter/formatter config
└── package.json            # Dependencies, scripts (dev/build/start/drizzle)
```

---

## 3. Feature Inventory (Current State)

### 3.1 Customer-Facing Features

| Feature                     | Status         | Files                                                                                                                      | Data Flow                                                                           |
| --------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **Homepage**                | ✅ Implemented | [pages/index/+Page.tsx](pages/index/+Page.tsx), [components/template-system/landing/](components/template-system/landing/) | tRPC `product.search` + `category.view` + `homepage.getContent` → Template renderer |
| **Product Listing (/shop)** | ✅ Implemented | [pages/featured/products/+Page.tsx](pages/featured/products/+Page.tsx)                                                     | SSR `+data.ts` + client tRPC `product.search`, URL `?category=` filter              |
| **Product Detail**          | ✅ Implemented | [pages/featured/products/@productId/+Page.tsx](pages/featured/products/@productId/+Page.tsx)                               | tRPC `product.getById` + `product.getReviews` + related via `product.view`          |
| **Category Browsing**       | ✅ Implemented | [pages/featured/men/](pages/featured/men/), [pages/featured/women/](pages/featured/women/)                                 | Sidebar layout + `product.search` with `categoryType` filter                        |
| **Category Content CMS**    | ✅ Implemented | [pages/featured/\*/categories/@categoryId/](pages/featured/men/categories/@categoryId/)                                    | tRPC `category.getContent` per-category hero/description                            |
| **Shopping Cart**           | ✅ Implemented | [pages/cart/+Page.tsx](pages/cart/+Page.tsx), [lib/context/CartContext.tsx](lib/context/CartContext.tsx)                   | Client-side React Context + localStorage. Supports quantity, variants, promo codes  |
| **Promo Code Application**  | ✅ Implemented | [lib/context/CartContext.tsx](lib/context/CartContext.tsx)                                                                 | tRPC `promoCodes.validate` validates code, calculates discount                      |
| **Checkout**                | ⚠️ Partial     | [pages/checkout/+Page.tsx](pages/checkout/+Page.tsx)                                                                       | Form → tRPC `order.create`. **No payment gateway** — order created directly         |
| **Order Confirmation**      | ⚠️ Partial     | [backend/orders/create-order/email-template.tsx](backend/orders/create-order/email-template.tsx)                           | Email sent after order creation. No confirmation page (redirects to /)              |
| **Order History**           | ⚠️ Partial     | Only via admin dashboard. No customer-facing order history page                                                            |
| **User Registration**       | ✅ Implemented | [pages/register/+Page.tsx](pages/register/+Page.tsx)                                                                       | tRPC `auth.register` → email verification required                                  |
| **Login**                   | ✅ Implemented | [pages/login/+Page.tsx](pages/login/+Page.tsx)                                                                             | tRPC `auth.login` → POST `/api/auth/token` (cookie set)                             |
| **Email Verification**      | ✅ Implemented | [pages/verify-email/+Page.tsx](pages/verify-email/+Page.tsx)                                                               | Token in URL → tRPC `auth.verifyEmail`                                              |
| **Product Reviews**         | ✅ Implemented | [backend/products/create-review/trpc.ts](backend/products/create-review/trpc.ts)                                           | Protected: logged-in users can submit 1-5 star reviews                              |
| **Product Search**          | ✅ Implemented | [backend/products/search-products/](backend/products/search-products/)                                                     | Search by name, filter by category/type, sort by price/date                         |
| **Product Variants**        | ⚠️ Partial     | Schema + admin CRUD exists. Frontend selection is template-dependent                                                       |
| **Responsive Design**       | ✅ Implemented | Throughout all templates                                                                                                   | Tailwind breakpoints, `useIsMobile()` hook, mobile nav sheet                        |
| **SEO**                     | ⚠️ Partial     | [pages/+Head.tsx](pages/+Head.tsx)                                                                                         | Basic meta tags, SSR rendering. No sitemap, no robots.txt, no structured data       |
| **Newsletter**              | ❌ Missing     | UI exists in footer + homepage CMS                                                                                         | No backend handler, no email list, no integration                                   |
| **Wishlist**                | ❌ Missing     | —                                                                                                                          | Not implemented                                                                     |
| **User Profile/Account**    | ❌ Missing     | —                                                                                                                          | No profile page, no address book, no order history for users                        |
| **Search Results Page**     | ⚠️ Partial     | Templates exist (`search-results-grid`, `search-results-minimal`)                                                          | No dedicated search route page found                                                |
| **Payment Integration**     | ❌ Missing     | —                                                                                                                          | No Stripe, PayPal, or any payment gateway                                           |
| **Shipping Calculator**     | ❌ Missing     | —                                                                                                                          | Fixed values, no dynamic shipping                                                   |
| **Tax Calculator**          | ❌ Missing     | —                                                                                                                          | Fixed values, no tax engine                                                         |

### 3.2 Admin/Dashboard Features

| Feature                   | Status         | Files                                                                                                | Notes                                                                                                     |
| ------------------------- | -------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **Dashboard Overview**    | ✅ Implemented | [pages/dashboard/+Page.tsx](pages/dashboard/+Page.tsx)                                               | Product stats, order stats, revenue, attention alerts                                                     |
| **Product CRUD**          | ✅ Implemented | [pages/dashboard/products/](pages/dashboard/products/)                                               | Full form: name, description, price, discount, stock, multi-image, multi-category, variants               |
| **Category Management**   | ✅ Implemented | [pages/dashboard/categories/](pages/dashboard/categories/)                                           | Main categories + subcategories, image upload, rename, soft-delete                                        |
| **Order Management**      | ✅ Implemented | [pages/dashboard/orders/+Page.tsx](pages/dashboard/orders/+Page.tsx)                                 | View all orders, status update workflow (pending→processing→shipped→delivered), delete                    |
| **Promo Code Management** | ✅ Implemented | [pages/dashboard/promo-codes/+Page.tsx](pages/dashboard/promo-codes/+Page.tsx)                       | Full CRUD with percentage/fixed amount, date ranges, usage limits, product/category targeting             |
| **Homepage CMS**          | ✅ Implemented | [pages/dashboard/admin/homepage/+Page.tsx](pages/dashboard/admin/homepage/+Page.tsx)                 | Edit hero, promo banner, brand statement, value propositions, newsletter config, footer CTA. Image upload |
| **Category Content CMS**  | ✅ Implemented | [pages/dashboard/admin/category-content/+Page.tsx](pages/dashboard/admin/category-content/+Page.tsx) | Per-category hero, description, promotion content                                                         |
| **Template Management**   | ✅ Implemented | [pages/dashboard/admin/templates/+Page.tsx](pages/dashboard/admin/templates/+Page.tsx)               | Switch templates per page type, preview with device frames, 22 templates available                        |
| **File/Image Upload**     | ✅ Implemented | [components/file-uploads/](components/file-uploads/)                                                 | Multi-image with primary selection, drag-and-drop, Sharp optimization (WebP)                              |
| **Analytics**             | ⚠️ Partial     | [components/dashboard/hooks/useAnalytics.ts](components/dashboard/hooks/useAnalytics.ts)             | Basic stats from DB aggregation. No GA, no pixel tracking, no real analytics                              |
| **Customer Management**   | ❌ Missing     | —                                                                                                    | No customer list, no user management page                                                                 |
| **Inventory Alerts**      | ⚠️ Partial     | Dashboard shows low-stock/out-of-stock counts                                                        | No email alerts, no automated actions                                                                     |
| **Export/Import**         | ❌ Missing     | —                                                                                                    | No CSV/Excel product import/export                                                                        |
| **Store Settings**        | ❌ Missing     | —                                                                                                    | No settings page (store name, currency, timezone, shipping rules, tax config)                             |
| **Media Library**         | ❌ Missing     | —                                                                                                    | Files uploaded per-product only, no centralized media manager                                             |

### 3.3 Template System (CORE SELLING POINT)

**22 templates across 8 page categories:**

| Category                | Templates                                                      | Files                                                                                  |
| ----------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **Landing Page** (4)    | Modern, Classic, Editorial, Minimal                            | [components/template-system/landing/](components/template-system/landing/)             |
| **Home** (2)            | Featured Products Modern, Modern V2                            | [components/template-system/home/](components/template-system/home/)                   |
| **Product Page** (6)    | Classic, Editorial, Technical, Minimal, Modern Split, Percé    | [components/template-system/productPage/](components/template-system/productPage/)     |
| **Category Page** (5)   | Grid Classic, Hero Split, Minimal, Showcase, Grid with Filters | [components/template-system/categoryPage/](components/template-system/categoryPage/)   |
| **Cart** (1)            | Modern                                                         | [components/template-system/cartPage/](components/template-system/cartPage/)           |
| **Checkout** (1)        | Modern                                                         | [components/template-system/checkoutPage/](components/template-system/checkoutPage/)   |
| **Search Results** (2)  | Grid, Minimal                                                  | [components/template-system/searchResults/](components/template-system/searchResults/) |
| **Sorting/Listing** (1) | Minimal                                                        | [components/template-system/sorting/](components/template-system/sorting/)             |

**System Architecture:**

- Central registry: [components/template-system/templateConfig.ts](components/template-system/templateConfig.ts) (339 lines)
- Each template has a `component` (renders actual page) and a `previewComponent` (scaled-down admin preview)
- Admin selects active template per page type at `/dashboard/admin/templates`
- Selection persisted in localStorage via [frontend/contexts/TemplateContext.tsx](frontend/contexts/TemplateContext.tsx)
- Pages resolve template via `getTemplateId(category)` → dynamic render

**Legacy V1 System** still exists in [frontend/components/template/](frontend/components/template/) (654 lines) — marked `@legacy`, preserved for admin preview compatibility only.

---

## 4. Data Model

### 4.1 Entity-Relationship Diagram

```
                         ┌──────────┐
                    ┌───►│  vendor  │◄────────────────────────────┐
                    │    │ (single  │                              │
                    │    │  row)    │                              │
                    │    └────┬─────┘                              │
                    │         │                                    │
               vendorId    vendorId                            vendorId
                    │         │                                    │
┌──────────┐   ┌───┴────┐  ┌─┴──────────┐   ┌──────────────┐  ┌──┴──────────┐
│  session  │──►│  user  │  │  product   │◄──│product_image │  │ order_item  │
│           │   │        │  │            │   │              │  │             │
└───────────┘   └───┬────┘  └──┬───┬─────┘   └──────┬───────┘  └──────┬──────┘
                    │          │   │                  │                 │
              userId│    categoryId│productId    fileId│            orderId│
                    │          │   │                  │                 │
                    │    ┌─────┘   │           ┌─────┘          ┌──────┘
                    │    │         │           │                │
                    │  ┌─┴────────┐│    ┌──────┴──┐     ┌──────┴──┐
                    │  │ category ││    │  file   │     │  order  │
                    │  │          ││    │         │     │         │
                    │  └──────────┘│    └─────────┘     └────┬────┘
                    │              │                         │
                    │     ┌────────┘                    promoCodeId
                    │     │                                 │
              ┌─────┴─────┴───────┐              ┌─────────┴───┐
              │  product_category │              │  promo_code  │
              │  (junction M:M)   │              │              │
              └───────────────────┘              └──────────────┘
```

### 4.2 Tables (20 total)

Defined in [shared/database/drizzle/schema.ts](shared/database/drizzle/schema.ts) (924 lines):

| Table                   | Key Fields                                                                                                           | Purpose                                       |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| **user**                | id, name, email, passwordDigest, phone, role (`admin`/`vendor`/`user`), emailVerified, vendorId (FK)                 | User accounts                                 |
| **session**             | id, token (unique), userId (FK), expiresAt                                                                           | Auth sessions (30-day, SHA-256 hashed tokens) |
| **vendor**              | id, name, status, description, logoId                                                                                | Single default row for FK satisfaction        |
| **vendor_log**          | id, vendorId, userId, action, note                                                                                   | Legacy — not used in single-shop              |
| **file**                | id, diskname, createdAt                                                                                              | Uploaded file records                         |
| **category**            | id, name, slug, imageId, type (text), deleted (soft-delete)                                                          | Product categories                            |
| **category_log**        | id, categoryId, userId, action                                                                                       | Category change audit                         |
| **product**             | id, name, description, imageId, categoryId, price, discountPrice, vendorId, stock                                    | Products                                      |
| **product_variant**     | id, name, productId, values (jsonb string[])                                                                         | e.g. "Size": ["S","M","L"]                    |
| **product_image**       | id, productId, fileId, isPrimary                                                                                     | Multi-image support                           |
| **product_category**    | id, productId, categoryId, isPrimary                                                                                 | M:M junction (unique index)                   |
| **product_review**      | id, productId, userId, userName, rating (1-5), comment                                                               | Customer reviews                              |
| **order**               | id, userId, customer*, shipping*, subtotal, shipping, tax, discount, promoCodeId, total, status, fincart\* fields    | Orders with full address + Fincart tracking   |
| **order_item**          | id, orderId, productId, vendorId, quantity, price, discountPrice, name                                               | Line items                                    |
| **order_log**           | id, orderId, userId, action, oldStatus, newStatus, note                                                              | Status change audit                           |
| **promo_code**          | id, code (unique), discountType, discountValue, status, dates, usage limits, minPurchaseAmount, appliesToAllProducts | Discount codes                                |
| **promo_code_product**  | promoCodeId, productId                                                                                               | Code→Product targeting                        |
| **promo_code_category** | promoCodeId, categoryId                                                                                              | Code→Category targeting                       |
| **template**            | id, name, type, category, componentPath, configSchema, defaultConfig, status                                         | Template registry (DB-side, schema only)      |
| **template_assignment** | id, templateId, scope, targetIdentifier, config, isActive, priority                                                  | Template→page binding                         |
| **template_analytics**  | id, templateId, pageViews, interactions, conversionRate                                                              | Template performance tracking                 |
| **homepage_content**    | id, merchantId (unique), content (jsonb)                                                                             | CMS content for homepage                      |
| **category_content**    | id, merchantId, categoryId, content (jsonb)                                                                          | CMS content per category                      |
| **auth_log**            | id, userId, email, action, ipAddress, userAgent                                                                      | Auth attempt auditing                         |
| **webhook_log**         | id, webhookType, provider, payload, status, orderId                                                                  | Webhook event tracking                        |

### 4.3 Schema Issues

| Issue                                                | Severity   | Detail                                                                               |
| ---------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------ |
| **vendor table still exists**                        | SHOULD-FIX | Kept for FK satisfaction. Contains single default row. Confusing for template buyers |
| **user.vendorId FK**                                 | SHOULD-FIX | Still references vendor table. Not needed in single-shop                             |
| **orderItem.vendorId FK**                            | SHOULD-FIX | Still required NOT NULL. Filled with default store ID                                |
| **product.vendorId FK**                              | SHOULD-FIX | Still required NOT NULL. Filled with default store ID                                |
| **user_role enum has "vendor"**                      | SHOULD-FIX | Only "admin" and "user" are needed                                                   |
| **category.type is text but schema has legacy enum** | LOW        | `categoryType` enum defined but not used (type field is plain text)                  |
| **Duplicate migration sequences**                    | SHOULD-FIX | Two `0001_*` and two `0004_*` files may cause issues                                 |

---

## 5. API Inventory

### 5.1 tRPC Procedures (44 total)

#### Auth (5 procedures)

| Procedure          | Type     | Auth      | Input                                                   | Purpose                                   |
| ------------------ | -------- | --------- | ------------------------------------------------------- | ----------------------------------------- |
| `auth.login`       | mutation | public    | `{email, password}`                                     | Login with argon2 verify, creates session |
| `auth.register`    | mutation | public    | `{email, password, confirmPassword, name, phone, role}` | Register + verification email             |
| `auth.me`          | mutation | protected | `{token}`                                               | Validate session, return user data        |
| `auth.logout`      | mutation | protected | `{token}`                                               | Delete session                            |
| `auth.verifyEmail` | mutation | public    | `{token}`                                               | Verify email address                      |

#### Products (13 procedures)

| Procedure                  | Type     | Auth      | Input                                                                           | Purpose                                          |
| -------------------------- | -------- | --------- | ------------------------------------------------------------------------------- | ------------------------------------------------ |
| `product.create`           | mutation | admin     | Full product data + variants + images                                           | Create product                                   |
| `product.edit`             | mutation | admin     | Same + id                                                                       | Edit product                                     |
| `product.delete`           | mutation | admin     | `{id}`                                                                          | Delete product                                   |
| `product.view`             | query    | public    | `{limit, offset, search, sortBy, categoryId}`                                   | Paginated product list                           |
| `product.search`           | query    | public    | `{categoryIds, categoryType, search, sortBy, limit, offset, includeOutOfStock}` | Advanced product search                          |
| `product.getById`          | query    | public    | `{productId}`                                                                   | Single product with images, categories, variants |
| `product.getCategories`    | query    | public    | `{productId}`                                                                   | Product's categories                             |
| `product.getProductImages` | query    | public    | `{productId}`                                                                   | Product's images                                 |
| `product.stats`            | query    | admin     | `{lowStockThreshold?}`                                                          | Product statistics                               |
| `product.topSelling`       | query    | admin     | `{limit?}`                                                                      | Top selling by order volume                      |
| `product.revenue`          | query    | admin     | —                                                                               | Total revenue sum                                |
| `product.getReviews`       | query    | public    | `{productId}`                                                                   | Product reviews + avg rating                     |
| `product.createReview`     | mutation | protected | `{productId, userName, rating, comment}`                                        | Submit review                                    |

#### Orders (5 procedures)

| Procedure            | Type     | Auth      | Input                               | Purpose                                                                 |
| -------------------- | -------- | --------- | ----------------------------------- | ----------------------------------------------------------------------- |
| `order.create`       | mutation | protected | Customer info + items + promoCodeId | Create order (validates stock, applies promo, sends to Fincart, emails) |
| `order.view`         | query    | protected | `{limit, offset, status?}`          | Admin: all orders; User: own orders                                     |
| `order.updateStatus` | mutation | admin     | `{orderId, status}`                 | Change order status                                                     |
| `order.stats`        | query    | admin     | —                                   | Order counts by status                                                  |
| `order.delete`       | mutation | admin     | `{orderId}`                         | Delete order + items                                                    |

#### Categories (10 procedures)

| Procedure                | Type     | Auth      | Input                               | Purpose                                   |
| ------------------------ | -------- | --------- | ----------------------------------- | ----------------------------------------- |
| `category.create`        | mutation | admin     | `{name, type, imageId}`             | Create subcategory                        |
| `category.edit`          | mutation | admin     | `{id, name, type, imageId?}`        | Edit category                             |
| `category.delete`        | mutation | admin     | `{id}`                              | Soft-delete category                      |
| `category.view`          | query    | public    | —                                   | All categories with image + product count |
| `category.viewMain`      | query    | public    | —                                   | Main categories with subcategory counts   |
| `category.getContent`    | query    | public    | `{merchantId, categoryId}`          | Category CMS content                      |
| `category.updateContent` | mutation | protected | `{merchantId, categoryId, content}` | Update category CMS                       |
| `category.createMain`    | mutation | admin     | `{name, imageId?}`                  | Create main category                      |
| `category.renameMain`    | mutation | admin     | `{oldName, newName, imageId?}`      | Rename main category                      |
| `category.deleteMain`    | mutation | admin     | `{name}`                            | Delete main category + all subcategories  |

#### Promo Codes (6 procedures)

| Procedure             | Type     | Auth      | Input                                                    | Purpose                       |
| --------------------- | -------- | --------- | -------------------------------------------------------- | ----------------------------- |
| `promoCodes.create`   | mutation | admin     | Full promo code data                                     | Create promo code             |
| `promoCodes.list`     | query    | admin     | `{page, limit, searchCode?, status?, sortBy, sortOrder}` | Paginated list                |
| `promoCodes.getById`  | query    | admin     | `{id}`                                                   | Single promo code             |
| `promoCodes.update`   | mutation | admin     | Same as create + id                                      | Update promo code             |
| `promoCodes.delete`   | mutation | admin     | `{id}`                                                   | Delete promo code             |
| `promoCodes.validate` | query    | protected | `{code, cartItems?, subtotal?}`                          | Validate + calculate discount |

#### Homepage (3 procedures)

| Procedure                  | Type     | Auth      | Input                     | Purpose                          |
| -------------------------- | -------- | --------- | ------------------------- | -------------------------------- |
| `homepage.getContent`      | query    | public    | `{merchantId}`            | Get homepage CMS content         |
| `homepage.updateContent`   | mutation | protected | `{merchantId, content}`   | Update homepage CMS              |
| `homepage.uploadHeroImage` | mutation | protected | `{file, preserveAspect?}` | Upload hero image (Sharp → WebP) |

#### File (1 procedure)

| Procedure     | Type     | Auth      | Input                          | Purpose                 |
| ------------- | -------- | --------- | ------------------------------ | ----------------------- |
| `file.upload` | mutation | protected | `{file: {name, type, buffer}}` | Upload + optimize image |

### 5.2 REST Endpoints (5 total)

| Endpoint                | Method | Auth               | File                                                                           | Purpose                 |
| ----------------------- | ------ | ------------------ | ------------------------------------------------------------------------------ | ----------------------- |
| `/api/auth/token`       | POST   | Session validation | [backend/auth/api.ts](backend/auth/api.ts)                                     | Set session cookie      |
| `/api/auth/token`       | DELETE | None               | [backend/auth/api.ts](backend/auth/api.ts)                                     | Clear session cookie    |
| `/file`                 | POST   | Session (admin)    | [backend/file/upload-file/api.ts](backend/file/upload-file/api.ts)             | Multipart file upload   |
| `/api/webhooks/fincart` | POST   | Bearer token       | [backend/orders/fincart-webhook/api.ts](backend/orders/fincart-webhook/api.ts) | Fincart status webhooks |
| `/health`               | GET    | None               | [server/server.ts](server/server.ts)                                           | Health check            |

---

## 6. Admin/Dashboard Audit

### 6.1 Current Capabilities

| Capability               | Completeness | Notes                                                                                                                                                                                                 |
| ------------------------ | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dashboard Overview**   | ✅ Complete  | Revenue, order stats (by status), product stats (total, low-stock, out-of-stock, new), attention alerts                                                                                               |
| **Product CRUD**         | ✅ Complete  | Create/edit/delete with: name, description, price, discount price, stock, multi-image (primary selection), multi-category assignment, variants (name + values). Debounced search, sorting, pagination |
| **Category CRUD**        | ✅ Complete  | Main categories (create/rename/delete) and subcategories (create/edit/soft-delete). Image upload per category                                                                                         |
| **Order Management**     | ✅ Complete  | Table with status filter, search. Detail dialog with all order info + items. Status update dropdown (pending→processing→shipped→delivered→cancelled). Delete with confirmation                        |
| **Promo Codes**          | ✅ Complete  | Full CRUD. Percentage or fixed amount. Date ranges. Usage limits (total + per-user). Min purchase. Product/category targeting. Status management                                                      |
| **Homepage CMS**         | ✅ Complete  | Hero (title, subtitle, CTA, image), promo banner, brand statement, value propositions, newsletter config, footer CTA. Image upload. Unsaved changes tracking                                          |
| **Category Content CMS** | ✅ Complete  | Per-category: title, description toggle, hero image toggle                                                                                                                                            |
| **Template Management**  | ✅ Complete  | Visual template selector per page type. Device-frame preview (desktop/tablet/mobile). 22 templates across 8 categories                                                                                |

### 6.2 Gaps for Real Store Operations

| Gap                          | Impact                                                                                         | Complexity |
| ---------------------------- | ---------------------------------------------------------------------------------------------- | ---------- |
| **No store settings page**   | Can't configure store name, currency, timezone, shipping rules, tax rates without code changes | M          |
| **No customer management**   | Can't view registered users, contact customers, or analyze customer data                       | M          |
| **No order export**          | Can't export orders to CSV/Excel for accounting                                                | S          |
| **No product import/export** | Can't bulk-add products from spreadsheet                                                       | M          |
| **No media library**         | Files only accessible through product/category uploads, no central management                  | M          |
| **No inventory alerts**      | Low-stock shown on dashboard but no email/notification system                                  | S          |
| **No refund workflow**       | `orderLog` has "refunded" action but no refund process exists                                  | M          |
| **No shipping rule editor**  | Shipping cost is hardcoded in cart context                                                     | S          |
| **No tax configuration**     | Tax is hardcoded in cart context                                                               | S          |
| **No SEO settings**          | No per-page meta tag editor, no sitemap generator                                              | M          |
| **No backup/restore**        | No data export/import for the entire store                                                     | L          |

---

## 7. Template Monetization Readiness

### 7.1 What Makes It "Template-Ready" ✅

1. **22 swappable templates across 8 page types** — This is genuinely differentiating. Most eCommerce templates on marketplaces ship with 1 design. Having 4 landing pages, 6 product pages, 5 category pages, etc. is strong.

2. **Admin template switcher with live preview** — [pages/dashboard/admin/templates/+Page.tsx](pages/dashboard/admin/templates/+Page.tsx) lets admins switch between templates with device-frame previews. Professional UX.

3. **Homepage CMS** — Full content management for hero, banners, value propositions. No code editing needed to customize homepage.

4. **Category content CMS** — Per-category hero images and descriptions.

5. **Modern tech stack** — React 19, Vite 6, Tailwind 4, SSR. Appealing to technical buyers.

6. **Docker-ready** — Dockerfile + docker-compose for easy deployment.

7. **Clean admin UI** — Dashboard uses shadcn/ui components consistently. Professional look.

### 7.2 What Blocks Selling It Today 🚫

| Blocker                                       | Why It Matters                                                                                                            | Effort |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------ |
| **No payment gateway**                        | Template is useless without payments. Need at least Stripe integration                                                    | L      |
| **No buyer documentation**                    | No setup guide, no README for template buyers. They need step-by-step instructions                                        | M      |
| **No demo/seed data**                         | Buyer installs template → empty store. Need rich demo products, categories, and homepage content to make first impression | M      |
| **Hard-coded "Percé" / "Lebsey" branding**    | Navbar says "Percé", footer says "Lebsey". Must be configurable via env/settings                                          | S      |
| **Hard-coded EGP currency**                   | Throughout cart, product cards, dashboard. Needs currency configuration                                                   | S      |
| **Hard-coded Egyptian phone validation**      | [pages/register/+Page.tsx](pages/register/+Page.tsx) has `/^01[0125]\d{8}$/` regex                                        | S      |
| **Debug endpoints in production**             | `/api/debug/db-status` and `/api/debug/init-migrations` expose DB info                                                    | S      |
| **Fincart hardcoded webhook secret fallback** | `"your-default-secret-token-change-this"` in source                                                                       | S      |
| **No license file**                           | No LICENSE, no license terms for template buyers                                                                          | S      |
| **Vendor schema remnants**                    | Confusing for buyers inspecting the database. vendor table, vendorId columns still present                                | M      |
| **Missing .env documentation**                | `.env.example` exists but needs detailed comments + setup instructions                                                    | S      |
| **No onboarding wizard**                      | First-run experience is blank. Need guided setup or auto-seed                                                             | L      |

### 7.3 Multi-Store / White-Label Assessment

The codebase has **some multi-tenant traces** (`merchantId` in homepage/category content, `STORE_OWNER_ID` env var) but is **not multi-tenant ready**:

- Single database, no tenant isolation
- No subdomain/custom domain routing
- No per-tenant configuration
- Templates stored in localStorage (client-side, not per-tenant)
- Auth is single-pool (no tenant scoping)

**Verdict:** This is correctly positioned as a single-shop template, not a SaaS platform. Multi-tenancy would require a major rewrite and is out of scope.

---

## 8. Shipping Checklist (MAKE MONEY)

### 8.1 MUST HAVE Before Selling (Price: $49-79)

| #   | Item                                | Why It Matters                                                                                                                                            | Complexity | Key Files                                                                                         |
| --- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------- |
| 1   | **Payment gateway (Stripe)**        | No store works without payments. Stripe is the global default. Need: checkout integration, webhook for payment confirmation, order status tied to payment | L          | `pages/checkout/+Page.tsx`, `backend/orders/create-order/`, new `backend/payments/`               |
| 2   | **Setup documentation (README)**    | Buyers need: prerequisites, install steps, env configuration, deployment guide, template customization guide                                              | M          | New `docs/SETUP.md`, rewrite `README.md`                                                          |
| 3   | **Demo seed data**                  | First impression = everything. Need: 20+ products with images, 5+ categories with images, homepage content, 2 demo promo codes                            | M          | New `shared/database/seed.ts`, seed images in `assets/demo/`                                      |
| 4   | **Remove debug endpoints**          | Security risk. `/api/debug/*` routes expose database internals                                                                                            | S          | `server/server.ts` — delete debug route handlers                                                  |
| 5   | **Configurable currency**           | Hard-coded EGP prevents international sales                                                                                                               | S          | `shared/config/store.ts` → add `CURRENCY`/`CURRENCY_SYMBOL` env vars. Update all `EGP` references |
| 6   | **Configurable store branding**     | "Percé" and "Lebsey" hard-coded in multiple files                                                                                                         | S          | `shared/config/store.ts` → `STORE_NAME`, `STORE_TAGLINE`. Update Navbar, Footer, `+Head.tsx`      |
| 7   | **Remove Fincart hardcoded secret** | Security risk                                                                                                                                             | S          | `backend/orders/fincart-webhook/api.ts` — remove fallback, throw if env var missing               |
| 8   | **License file**                    | Legal requirement for selling digital products                                                                                                            | S          | New `LICENSE` (commercial template license)                                                       |
| 9   | **Customer order history page**     | Customers need to see past orders without admin access                                                                                                    | M          | New `pages/orders/+Page.tsx`, reuses `order.view` (already scopes by user)                        |
| 10  | **Order confirmation page**         | Currently just redirects to `/`. Need a proper "Thank you" page                                                                                           | S          | New `pages/checkout/confirmation/+Page.tsx`                                                       |

### 8.2 SHOULD HAVE for Higher Price ($99-149)

| #   | Item                                 | Why It Matters                                                                       | Complexity | Key Files                                                               |
| --- | ------------------------------------ | ------------------------------------------------------------------------------------ | ---------- | ----------------------------------------------------------------------- |
| 11  | **Store settings page**              | Admin should configure currency, shipping, tax, store info without env vars          | M          | New `pages/dashboard/settings/`, new `backend/settings/`                |
| 12  | **SEO essentials**                   | Sitemap.xml, robots.txt, Open Graph meta per product/page, structured data (JSON-LD) | M          | New components, `server/server.ts` sitemap route, product page `<head>` |
| 13  | **Rate limiting**                    | Auth endpoints need rate limiting (brute force prevention)                           | S          | `@fastify/rate-limit` in `server/server.ts`                             |
| 14  | **Security headers**                 | CSP, X-Frame-Options, HSTS via Helmet                                                | S          | `@fastify/helmet` in `server/server.ts`                                 |
| 15  | **Remove vendor schema remnants**    | `vendor` table, `vendorId` columns confuse template buyers                           | M          | Migration to drop vendor FKs, schema update, service updates            |
| 16  | **Product import/export (CSV)**      | Bulk product management is expected in any serious template                          | M          | New admin page + backend procedures                                     |
| 17  | **Email templates polish**           | Current templates are functional but basic. Need branded, responsive HTML emails     | S          | `backend/*/email-template.tsx` files                                    |
| 18  | **Phone validation configurability** | Remove Egyptian-specific regex, use `react-phone-number-input` properly              | S          | `pages/register/+Page.tsx`, checkout form                               |
| 19  | **Error boundary + 404 polish**      | Current error page is minimal                                                        | S          | `pages/_error/+Page.tsx`                                                |
| 20  | **Loading states polish**            | Skeleton screens instead of spinners                                                 | S          | Throughout templates                                                    |

### 8.3 NICE TO HAVE for Premium ($199+)

| #   | Item                           | Why It Matters                                 | Complexity | Key Files                                   |
| --- | ------------------------------ | ---------------------------------------------- | ---------- | ------------------------------------------- |
| 21  | **i18n framework**             | RTL support, multiple languages = wider market | L          | New i18n setup, all strings extracted       |
| 22  | **Multiple payment gateways**  | PayPal, local gateways increase market         | M          | `backend/payments/` extensible architecture |
| 23  | **Wishlist**                   | Common eCommerce feature                       | M          | New table, context, UI                      |
| 24  | **Customer management page**   | Admin view of all registered users             | S          | New `pages/dashboard/customers/`            |
| 25  | **Real analytics integration** | GA4, Meta Pixel integration                    | S          | Analytics script injection                  |
| 26  | **Newsletter integration**     | Mailchimp/Brevo API                            | M          | Backend endpoint, third-party API           |
| 27  | **Dark mode**                  | `next-themes` is already a dependency          | S          | Theme provider + CSS variables              |
| 28  | **PWA support**                | Manifest, service worker                       | M          | `manifest.json`, SW registration            |
| 29  | **Onboarding wizard**          | First-run guided setup                         | L          | New pages/flow                              |
| 30  | **Image CDN support**          | Cloudinary/S3/R2 integration                   | M          | Backend storage abstraction                 |

---

## 9. Risks & Technical Debt

### 9.1 Security Risks

| Risk                                   | Severity  | Location                                                                       | Mitigation                                              |
| -------------------------------------- | --------- | ------------------------------------------------------------------------------ | ------------------------------------------------------- |
| **No rate limiting on auth endpoints** | 🔴 HIGH   | All tRPC procedures                                                            | Add `@fastify/rate-limit` (5 req/min on login/register) |
| **Debug endpoints exposed**            | 🔴 HIGH   | [server/server.ts](server/server.ts) lines 233-351                             | Delete or gate behind `NODE_ENV !== "production"`       |
| **Hardcoded webhook secret fallback**  | 🔴 HIGH   | [backend/orders/fincart-webhook/api.ts](backend/orders/fincart-webhook/api.ts) | Remove fallback, require env var                        |
| **No security headers**                | 🟡 MEDIUM | Server-wide                                                                    | Add `@fastify/helmet`                                   |
| **No CSRF beyond sameSite:lax**        | 🟡 MEDIUM | Cookie-based auth                                                              | sameSite:lax is sufficient for most cases               |
| **No XSS beyond React escaping**       | 🟡 MEDIUM | All rendered content                                                           | Add CSP header                                          |
| **Raw SQL string interpolation**       | 🟢 LOW    | [server/server.ts](server/server.ts) migration handler                         | Filesystem-sourced names only, not user input           |

### 9.2 Performance Bottlenecks

| Issue                                     | Impact                                                        | Location                                                       |
| ----------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------- |
| **No DB connection pooling config**       | Medium — single connection may bottleneck under load          | [shared/database/drizzle/db.ts](shared/database/drizzle/db.ts) |
| **Cart stored in localStorage only**      | Low — cart lost on device switch, no server-side cart         | [lib/context/CartContext.tsx](lib/context/CartContext.tsx)     |
| **Client-side data fetching on homepage** | Medium — three parallel `useEffect` calls after SSR hydration | [pages/index/+Page.tsx](pages/index/+Page.tsx)                 |
| **No image CDN**                          | Medium — images served from Node.js process directly          | [server/server.ts](server/server.ts) static routes             |
| **Large template bundle**                 | Medium — 22 templates likely increase initial JS bundle       | All template components                                        |
| **No API response caching**               | Low-Medium — every page load re-fetches from DB               | No caching layer                                               |

### 9.3 Maintainability Issues

| Issue                                               | Location                                                                                                                                                          | Impact                                                |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| **Two template systems coexist (V1 + V2)**          | `frontend/components/template/` (V1 legacy) + `components/template-system/` (V2 active)                                                                           | Confusing, increases bundle size                      |
| **Orphaned dashboard service**                      | [backend/dashboard/admin-overview/](backend/dashboard/admin-overview/) defined but not registered as tRPC procedure                                               | Dead code                                             |
| **Legacy services in lib/**                         | [lib/services/CheckoutService.ts](lib/services/CheckoutService.ts), [lib/services/OrderService.ts](lib/services/OrderService.ts) — mock-based, superseded by tRPC | Dead code                                             |
| **Mock data still referenced**                      | [lib/mock-data/](lib/mock-data/)                                                                                                                                  | Produces confusion about data sources                 |
| **Inconsistent router registration**                | Two AppRouters: [shared/trpc/router.ts](shared/trpc/router.ts) (with auth) and [backend/router/router.ts](backend/router/router.ts) (without auth)                | Which one is primary? (Answer: shared/trpc/router.ts) |
| **`hono-entry.ts`** — incomplete alternative server | [hono-entry.ts](hono-entry.ts), [hono-entry.node.ts](hono-entry.node.ts)                                                                                          | Should be removed or documented                       |
| **20+ markdown files in root**                      | `VENDOR_UI_REMOVAL_COMPLETE.md`, `PHASE_4_CART_CHECKOUT_MIGRATION_COMPLETE.md`, etc.                                                                              | Internal dev notes, must be cleaned before shipping   |

### 9.4 Broken/Incomplete Flows

| Flow                       | Issue                                                                                                     | Location                                                                                                                             |
| -------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Post-checkout**          | Order created → email sent → redirect to `/`. No confirmation page, no order number displayed             | [pages/checkout/+Page.tsx](pages/checkout/+Page.tsx)                                                                                 |
| **Customer order history** | `order.view` scopes by user email but no customer-facing page exists                                      | Missing page                                                                                                                         |
| **Newsletter signup**      | Footer has email input, homepage CMS has newsletter section, but no backend handler                       | [components/globals/Footer.tsx](components/globals/Footer.tsx), [shared/types/homepage-content.ts](shared/types/homepage-content.ts) |
| **Search results page**    | Templates exist (`search-results-grid`, `search-results-minimal`) but no search route/page                | Missing page                                                                                                                         |
| **Vendor brand page**      | Route exists but shows error stub                                                                         | [pages/featured/brands/@vendorId/+Page.tsx](pages/featured/brands/@vendorId/+Page.tsx)                                               |
| **Password reset**         | `authLog` has `password_reset_requested` + `password_reset_success` actions defined but no implementation | Schema only                                                                                                                          |
| **Template analytics**     | DB tables exist, service stub in template components, but no actual data collection                       | Schema + [components/template/TemplateAnalytics.tsx](components/template/TemplateAnalytics.tsx)                                      |

---

## 10. Quick Wins (Next 7 Days)

| Priority | Task                                                                                           | Time   | Impact                            |
| -------- | ---------------------------------------------------------------------------------------------- | ------ | --------------------------------- |
| 1        | **Delete debug endpoints** from `server/server.ts` (lines 233-351)                             | 30 min | 🔴 Security fix                   |
| 2        | **Remove hardcoded webhook secret fallback** in `backend/orders/fincart-webhook/api.ts`        | 15 min | 🔴 Security fix                   |
| 3        | **Add `.env` variables for STORE_NAME, CURRENCY, CURRENCY_SYMBOL** to `shared/config/store.ts` | 2 hrs  | Configurability                   |
| 4        | **Replace all hard-coded "Percé" / "Lebsey" / "EGP"** with config values                       | 3 hrs  | Configurability                   |
| 5        | **Delete 20+ internal markdown files** from project root                                       | 30 min | Clean shipping                    |
| 6        | **Remove the vendor brand route stub** (`pages/featured/brands/@vendorId/`)                    | 15 min | Clean routing                     |
| 7        | **Add order confirmation page** (`pages/checkout/confirmation/+Page.tsx`)                      | 4 hrs  | Completes checkout flow           |
| 8        | **Delete legacy V1 template system** (`frontend/components/template/`)                         | 2 hrs  | Reduces bundle, removes confusion |
| 9        | **Delete legacy services** (`lib/services/CheckoutService.ts`, `lib/services/OrderService.ts`) | 30 min | Removes dead code                 |
| 10       | **Create LICENSE file** with commercial template terms                                         | 1 hr   | Legal requirement                 |

---

## 11. Recommended Roadmap

### Phase 1: Ship-Ready (Weeks 1-2)

**Goal:** Template can be installed, configured, and used by a buyer.

| Week       | Tasks                                                                                                                                                                                                                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Week 1** | Quick wins 1-10 (above). Add `@fastify/rate-limit` on auth endpoints. Add `@fastify/helmet` for security headers. Write `docs/SETUP.md` (install guide). Remove Hono entry files. Fix phone validation (use `react-phone-number-input` validation, remove Egyptian regex).                        |
| **Week 2** | Create demo seed script (`shared/database/seed.ts`) with 20+ products, 5+ categories, homepage content, 2 promo codes. Add customer-facing order history page. Polish error page. Polish email templates. Write `README.md` for marketplace listing. Create marketplace screenshots/demo content. |

### Phase 2: Payment & Premium (Weeks 3-4)

**Goal:** Template has real payment processing and premium features.

| Week       | Tasks                                                                                                                                                                                                                                |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Week 3** | Stripe integration: checkout payment intent → webhook → order confirmation page. Add store settings admin page (currency, shipping rules, tax rates, store branding). Add SEO basics (sitemap.xml, robots.txt, per-product OG meta). |
| **Week 4** | Product CSV import/export. Customer management page. Polish all 22 templates for consistency. Remove vendor schema remnants (migration). Bundle analysis + code-splitting optimization. Create demo site deployment.                 |

### Post-Launch (Weeks 5-8)

| Tasks                                       |
| ------------------------------------------- |
| i18n framework integration + RTL support    |
| Additional payment gateways (PayPal)        |
| Wishlist feature                            |
| Dark mode (next-themes already installed)   |
| Newsletter integration (Mailchimp/Brevo)    |
| PWA manifest + service worker               |
| Analytics integration (GA4, Meta Pixel)     |
| Onboarding wizard for first-time setup      |
| Image CDN support (Cloudinary/S3)           |
| Performance audit + Lighthouse optimization |

---

## 12. Appendix: File Counts & Code Size

| Area                         | Files    | Approx Lines |
| ---------------------------- | -------- | ------------ |
| Database Schema              | 1        | 924          |
| Backend (all)                | ~60      | ~5,000       |
| Pages                        | ~40      | ~6,000       |
| Components (template-system) | ~30      | ~8,000       |
| Components (other)           | ~50      | ~5,000       |
| Shared                       | ~15      | ~1,500       |
| UI primitives (shadcn)       | 36       | ~3,000       |
| **Total estimated**          | **~230** | **~29,000**  |

### Dependency Count

- **Production:** 67 packages
- **Dev:** 8 packages
- **Notable large deps:** React 19, Fastify 5, Drizzle ORM, Sharp, Recharts, Framer Motion, React Spring

---

_End of audit. This document should be reviewed alongside the actual codebase for validation._
