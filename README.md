# Lebsy Shop — Single-Shop E-Commerce Template

A production-ready, fully-featured single-shop e-commerce template built with **React 19**, **Fastify 5**, **tRPC**, **Drizzle ORM**, and **Tailwind CSS 4**. Designed for developers who want a clean, modern, and extensible store — ready to customize and ship.

---

## Features

### Storefront
- **26 swappable templates** across 8 categories — homepage, product pages, category pages, cart, checkout, search results, sorting, and landing pages
- **Full product catalog** with images, descriptions, pricing, discounts, and stock management
- **Hierarchical categories** — main categories with subcategories, Men/Women collections
- **Shopping cart** with promo code support (percentage & fixed discounts)
- **Checkout flow** with order confirmation page
- **Customer order history** at `/orders`
- **Product search** — navbar search bar + dedicated search results page with sorting & pagination
- **Mobile responsive** — sheet-based mobile menu, responsive layouts throughout
- **Page transitions** — smooth CSS-overlay page transitions via Vike hooks (SSR-safe, reduced-motion aware)

### Admin Dashboard
- **Product CRUD** — create, edit, delete products with multi-image uploads
- **Order management** — view orders, update status (pending → processing → shipped → delivered)
- **Category management** — hierarchical CRUD with main/subcategory support
- **Promo codes** — full CRUD with validation, usage limits, date ranges
- **Homepage CMS** — drag-and-drop sections: hero, brand statement, promo banner, featured products, value props, newsletter, footer CTA
- **Category content CMS** — editable content per category
- **Template switcher** — choose and preview templates with device-frame preview
- **Pixel tracking dashboard** — multi-platform ad pixel configuration (Meta, Google GA4, TikTok, Snapchat, Pinterest)
- **Analytics dashboard** — conversion funnel, channel breakdown, platform health

### Technical
- **Full-stack type safety** — tRPC v10 with SuperJSON, end-to-end TypeScript
- **SSR** — Vike 0.4 with server-side rendering and client-side hydration
- **Effect-TS** — functional error handling in backend services
- **Auth** — login, register, email verification, JWT sessions, admin-only dashboard guard
- **Email** — order confirmation + admin notification emails via SMTP (React Email templates)
- **Payment gateways** — Stripe and Paymob (optional, auto-activates when keys are set); falls back to COD-only mode
- **Shipping integration** — Fincart API with webhook status updates
- **Pixel tracking** — client-side + server-side event tracking with consent management (GDPR)
- **Motion toolkit** — scroll-triggered `Reveal`, `Stagger`, `ParallaxImage` components (Framer Motion 12, reduced-motion safe)
- **Editorial Chrome** — custom `EditorialNavbar` + `EditorialFooter` with transparent-to-solid scroll effect, used across all editorial templates
- **Skeleton shimmer** — premium gradient shimmer animations on all loading skeletons
- **Docker** — PostgreSQL compose file for local development

---

## Quick Start

### Prerequisites
- **Node.js ≥ 22**
- **pnpm** (recommended) or npm
- **Docker** (for PostgreSQL) or a remote PostgreSQL instance

### 1. Clone & install

```bash
git clone <your-repo-url>
cd lebsy-shop
pnpm install
```

### 2. Set up environment

```bash
cp .env.example .env
```

Edit `.env` with your values:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `PUBLIC_ORIGIN` | Yes | Public-facing origin URL (e.g. `http://localhost:5173`) |
| `BASE_URL` | Yes | Internal server base URL (e.g. `http://127.0.0.1:3000`) |
| `SINGLE_SHOP_MODE` | Yes | Set to `true` |
| `ADMIN_EMAIL` | Yes | Admin account email |
| `ADMIN_PASSWORD` | Yes | Admin account password |
| `JWT_SECRET` | Yes | Secret string for JWT signing (at least 32 characters recommended) |
| `SMTP_HOST` | Yes | SMTP server (e.g. `smtp.gmail.com`) |
| `SMTP_PORT` | Yes | SMTP port (e.g. `465`) |
| `SMTP_USER` | Yes | SMTP username |
| `SMTP_PASSWORD` | Yes | SMTP password or app password |
| `FINCART_API_URL` | Optional | Fincart API base URL |
| `FINCART_API_KEY` | Optional | Fincart shipping API key |
| `FINCART_WEBHOOK_SECRET` | Optional | Fincart webhook verification secret |
| `FINCART_PICKUP_ID` | Optional | Fincart pickup location ID |
| `FINCART_MERCHANT_LOCATION` | Optional | Fincart merchant location identifier |
| `STRIPE_SECRET_KEY` | Optional | Stripe secret key — enables Stripe payments |
| `STRIPE_WEBHOOK_SECRET` | Optional | Stripe webhook signing secret |
| `VITE_STRIPE_PUBLIC_KEY` | Optional | Stripe publishable key (client-side) |
| `PAYMOB_API_KEY` | Optional | Paymob API key — enables Paymob payments |
| `PAYMOB_INTEGRATION_ID` | Optional | Paymob integration ID |
| `PAYMOB_IFRAME_ID` | Optional | Paymob iframe ID |
| `PAYMOB_HMAC_SECRET` | Optional | Paymob HMAC verification secret |

### 3. Start the database

```bash
docker compose up -d
```

### 4. Run migrations

```bash
pnpm drizzle:generate
pnpm drizzle:migrate
```

### 5. Start the dev server

```bash
pnpm dev
```

Visit **http://localhost:3000**. An admin account is auto-seeded using `ADMIN_EMAIL` and `ADMIN_PASSWORD`.

---

## Project Structure

```
├── backend/           # tRPC procedures & business logic (Effect-TS)
│   ├── auth/          # Login, register, verify email, sessions
│   ├── categories/    # Category CRUD & content management
│   ├── orders/        # Order CRUD, email templates, Fincart webhook
│   ├── payments/      # Stripe & Paymob gateway services and webhooks
│   ├── pixel-tracking/ # Multi-platform pixel tracking
│   ├── products/      # Product CRUD, search
│   └── promo-codes/   # Promo code CRUD & validation
├── components/
│   ├── dashboard/     # Admin dashboard components
│   ├── globals/       # Navbar, Footer
│   ├── shop/          # Product cards, category strips
│   ├── template-system/ # 26 swappable templates
│   │   ├── editorial/ # EditorialChrome, EditorialNavbar, EditorialFooter
│   │   └── motion/    # Reveal, Stagger, ParallaxImage motion toolkit
│   └── ui/            # shadcn/ui primitives
├── frontend/          # Client-side contexts, pixel adapters, tracking
├── pages/             # Vike file-system routes
│   ├── checkout/      # Checkout flow
│   ├── dashboard/     # Admin dashboard (admin/, categories, products, orders)
│   ├── featured/      # Men, Women, Products, Brands collections
│   ├── order-confirmation/ # Post-checkout confirmation
│   ├── orders/        # Customer order history
│   └── search/        # Search results page
├── server/            # Fastify server, plugins, middleware
├── shared/            # Database schema, tRPC router, config, utils
└── uploads/           # User-uploaded images
```

---

## Template System

The template system is the core selling point. Admins can switch templates per category from the dashboard without touching code.

| Category | Templates | Description |
|----------|-----------|-------------|
| Landing | 4 | modern, editorial, classic, minimal |
| Home | 2 | featured products, modern v2 |
| Product Page | 6 | percé, classic, editorial, technical, minimal, modern-split |
| Category Page | 5 | grid-classic, hero-split, minimal, showcase, grid-with-filters |
| Cart | 2 | modern, editorial |
| Checkout | 2 | modern, editorial |
| Search Results | 3 | grid, minimal, editorial |
| Sorting/Collection | 2 | minimal, editorial |

### Motion Toolkit

All editorial templates use a shared animation toolkit (`components/template-system/motion/`):

| Component | Description |
|-----------|-------------|
| `Reveal` | Scroll-triggered reveal with `fadeUp`, `fadeIn`, or `clipReveal` variants |
| `StaggerContainer` / `StaggerItem` | Cascading entrance animations for grids and lists |
| `ParallaxImage` | GPU-accelerated parallax scroll effect for hero images |

All animations respect `prefers-reduced-motion` and are SSR-safe.

---

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start dev server with hot reload |
| `pnpm build` | Production build (unbuild + Vike build) |
| `pnpm start` | Start production server |
| `pnpm preview` | Preview production build locally |
| `pnpm test` | Run tests with Vitest |
| `pnpm test:watch` | Run tests in watch mode |
| `pnpm typecheck` | TypeScript type checking |
| `pnpm lint` | Lint with Biome |
| `pnpm format` | Format with Biome |
| `pnpm drizzle:generate` | Generate database migrations |
| `pnpm drizzle:migrate` | Apply database migrations |
| `pnpm drizzle:studio` | Open Drizzle Studio (DB GUI) |
| `pnpm seed` | Seed the database with sample data |

---

## Configuration

### Store Settings (`.env`)

- **`SINGLE_SHOP_MODE=true`** — Required. Ensures the store runs in single-shop mode.
- **`STORE_OWNER_ID`** — Optional. Auto-generated store owner UUID for DB foreign key constraints.
- **`VITE_SINGLE_SHOP_MODE=true`** — Client-side flag for conditional UI rendering.

### Payment Gateways

Payment gateways are **auto-activating** — add the relevant keys to `.env` and the gateway becomes available at checkout. Omit all gateway keys to run in **COD-only** mode.

- **Stripe** — set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `VITE_STRIPE_PUBLIC_KEY`
- **Paymob** — set `PAYMOB_API_KEY`, `PAYMOB_INTEGRATION_ID`, `PAYMOB_IFRAME_ID`, and `PAYMOB_HMAC_SECRET`

### Customization

- **Brand name** — Set `VITE_STORE_NAME` in `.env` (defaults to store name). Update `<title>` in `pages/+config.ts`.
- **Currency** — Set `VITE_CURRENCY` in `.env` (defaults to `EGP`).
- **Social links** — Configure in the Footer component props or via CMS.
- **Templates** — Switch templates from the admin dashboard at `/dashboard/admin/templates`.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Tailwind CSS 4, shadcn/ui, Framer Motion 12 |
| SSR Framework | Vike 0.4 |
| API | tRPC v10 with SuperJSON |
| Server | Fastify 5 |
| Database | PostgreSQL + Drizzle ORM |
| Backend Logic | Effect-TS |
| Auth | JWT sessions + cookie-based auth |
| Email | React Email + SMTP |
| Payments | Stripe, Paymob (optional; COD mode when keys are absent) |
| Shipping | Fincart API |
| Analytics | Custom pixel tracking (Meta, GA4, TikTok, Snapchat, Pinterest) |
| Build | Vite 6, unbuild, tsx |
| Testing | Vitest |
| Linting | Biome |

---

## License

[MIT](./LICENSE)
