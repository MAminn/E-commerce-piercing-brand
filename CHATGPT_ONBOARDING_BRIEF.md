# ONBOARDING BRIEF — For ChatGPT 5.2 (Creative Planner/Research Lead)

## Who You're Working With

You are collaborating with **Claude Opus 4.6** (that's me), a full-stack developer AI embedded inside VS Code with direct file read/write/terminal access to the codebase. I will implement everything you plan. The human developer (our mutual client) will relay messages between us.

**Your role:** Research, creative direction, UI/UX planning, asset curation, and specification writing.
**My role:** Code implementation — I write React/TypeScript/Tailwind components directly into the project.

The human explicitly said: **"I don't want ugly AI-slop UI"** — he wants heavy research into real professional clothing brand websites, elegant design patterns, and component asset libraries like **21st.dev**.

---

## The Project: Single-Shop-DP (Lebsy Shop / Percé)

A **multi-template e-commerce platform** built as a single-shop storefront engine. One codebase supports **4 demo themes** that merchants can switch between from an admin dashboard. The production site (https://perce-eg.com/) currently sells piercing jewelry using Demo 1.

**Our mission: Redesign Demo 2 ("Editorial / Premium Luxury") as a professional clothing/fashion e-commerce template.**

---

## Tech Stack (What I Can Use)

| Layer | Technology |
|---|---|
| **Framework** | Vike (SSR) + React 19 + Vite 6 |
| **Server** | Fastify 5 + Hono 4 |
| **API** | tRPC 10 (typed RPC, not REST) |
| **Backend Logic** | Effect-TS 3 (functional error handling) |
| **Database** | PostgreSQL via Drizzle ORM |
| **UI Components** | shadcn/ui (Radix primitives), all installed: Button, Card, Input, Label, Dialog, Sheet, Tabs, Accordion, Badge, Alert, Separator, Select, Checkbox, Switch, Slider, Tooltip, Popover, DropdownMenu, NavigationMenu, ScrollArea, Skeleton, Breadcrumb, Table, Textarea, Calendar, Command, Form, RadioGroup, TagsInput, PhoneInput, PasswordInput |
| **Styling** | Tailwind CSS 4 + tailwindcss-animate + class-variance-authority + tailwind-merge |
| **Animation** | Framer Motion 12, @react-spring/web 9 |
| **Icons** | Lucide React (477+) |
| **Charts** | Recharts 3 |
| **Module** | ESM, import alias `#root/*` → `./build/*` |

---

## Template System Architecture

### How It Works

The app has a **category-based template system** with 8 template categories:

| Category | What It Renders | Current Demo 2 Template |
|---|---|---|
| `landing` | Homepage/storefront landing page | `LandingTemplateEditorial` (369 lines) |
| `productPage` | Individual product detail page | `ProductPageEditorial` (327 lines) |
| `home` | Featured products section (embedded in landing) | Only Modern versions exist (no editorial) |
| `categoryPage` | Product listing by category | No editorial-specific — uses shared templates |
| `sorting` | Product grid with search/sort/filter | Only `SortingMinimalTemplate` exists |
| `cartPage` | Shopping cart | Only `CartPageModernTemplate` exists |
| `checkoutPage` | Checkout form + payment | Only `CheckoutPageModernTemplate` exists |
| `searchResults` | Search results display | Grid + Minimal variants (no editorial) |

### Template Resolution Pattern

1. **Pages are thin data-fetching shells** — they call tRPC for data, then resolve a template at runtime
2. `useTemplate().getTemplateId("landing")` → returns template ID like `"landing-editorial"`
3. `getTemplateComponent("landing", "landing-editorial")` → returns the React component
4. Page passes strongly-typed props to `<Template content={...} products={...} />`
5. `TemplateProvider` wraps the entire app in the layout

### Template Registration

Every template must be registered in `components/template-system/templateConfig.ts`:

```typescript
{
  id: "landing-editorial",           // Unique ID used for selection
  label: "Demo 2: Editorial (Premium Luxury)",  // Display label
  component: LandingTemplateEditorial,           // The actual React component
  previewComponent: LandingEditorialPreview,     // Admin thumbnail preview
}
```

### File Locations

```
components/template-system/
├── templateConfig.ts          # Central registry of all templates
├── landing/
│   ├── LandingTemplateModern.tsx     # Demo 1 (production)
│   ├── LandingTemplateEditorial.tsx  # Demo 2 (our target)
│   ├── LandingTemplateClassic.tsx    # Demo 3
│   └── LandingTemplateMinimal.tsx    # Demo 4
├── productPage/
│   ├── ProductPagePerce.tsx          # Default product page
│   ├── ProductPageEditorial.tsx      # Demo 2 (our target)
│   ├── ProductPageClassic.tsx        # Demo 3
│   ├── ProductPageMinimal.tsx        # Demo 4
│   └── ProductPageTechnical.tsx      # Demo 3 variant
├── categoryPage/                     # 5 variants (none editorial-specific yet)
├── cartPage/                         # 1 modern template
├── checkoutPage/                     # 1 modern template
├── searchResults/                    # Grid + Minimal
├── sorting/                          # 1 minimal template
├── home/                             # 2 featured product templates
└── previews/                         # Admin preview thumbnails
```

---

## Key Data Types (Props Contracts)

### Landing Page Props

```typescript
interface LandingTemplateEditorialProps {
  content: HomepageContent;          // Merchant-editable content (hero, sections, newsletter)
  featuredProducts?: FeaturedProduct[];  // Dynamic product data from DB
  categories?: CategoryStripItem[];     // Category navigation strip
  categoriesLoading?: boolean;
  newArrivals?: NewArrivalProduct[];    // Recent products
  newArrivalsLoading?: boolean;
  className?: string;
  onCtaClick?: (link: string) => void;  // Button click handler
}
```

### HomepageContent (What Merchants Can Edit)

```typescript
interface HomepageContent {
  meta: { enabled, pageTitle, pageDescription }
  hero: { enabled, title, subtitle, ctaText, ctaLink, backgroundImage?, mobileBackgroundImage? }
  brandStatement: { enabled, title, description, image? }
  promoBanner: { enabled, text, linkText?, linkUrl? }
  categories: { enabled, title, subtitle, ctaText, ctaLink }
  featuredProducts: { enabled, title, subtitle, viewAllText, viewAllLink }
  valueProps: { enabled, items: [{ icon, title, description }] }
  newsletter: { enabled, title, subtitle, placeholderText, ctaText, privacyText }
  footerCta: { enabled, title, subtitle, ctaText, ctaLink }
}
```

### Product Page Props

```typescript
interface ProductPageEditorialProps {
  product?: ProductPageProduct;        // Full product details
  relatedProducts?: FeaturedProduct[]; // "You may also like" section
  showWishlist?: boolean;
  onAddToCart?: (product) => void;
  onAddToWishlist?: (product) => void;
  onImageClick?: (url, index) => void;
  className?: string;
}

// Product shape:
interface ProductPageProduct extends FeaturedProduct {
  description?: string;
  longDescription?: string;
  rating?: number;             // 0-5 stars
  reviewCount?: number;
  sku?: string;
  brand?: string;
  specifications?: { label, value }[];
  features?: { icon, title, description }[];
}

// Base product:
interface FeaturedProduct {
  id: string;
  name: string;
  price: number;
  discountPrice?: number | string | null;
  stock: number;
  imageUrl?: string;
  images?: { url: string; isPrimary?: boolean }[];
  categoryName?: string | null;
  available: boolean;
}
```

### Cart Page Props

```typescript
interface CartPageModernTemplateProps {
  items: CartPageCartItem[];     // { id, name, price, quantity, imageUrl, variant, stock, available }
  totals: CartPageTotals;        // { subtotal, discount?, shipping?, grandTotal }
  currency?: string;             // Default "EGP"
  onQuantityChange?: (id, qty) => void;
  onRemoveItem?: (id) => void;
  onApplyCoupon?: (code) => void;
  onProceedToCheckout?: () => void;
}
```

### Checkout Page Props

```typescript
interface CheckoutPageModernTemplateProps {
  customerInfo, address, orderItems, totals, currency,
  paymentMethods, selectedPaymentMethod,
  onCustomerInfoChange, onAddressChange,
  onPaymentMethodChange, onPlaceOrder,
  isSubmitting, isLoadingPaymentMethods
}
```

---

## What Demo 2 Currently Has (And What Needs Work)

### Current State

The editorial templates that exist today are **generic luxury/premium** templates with placeholder content about headphones and electronics. They need to be **completely redesigned as a clothing/fashion brand template**.

**Landing Page (LandingTemplateEditorial.tsx — 369 lines):**

- Full-screen hero with gradient overlay + background image
- Promotional top banner
- Featured collection section (two-column with image placeholder + text)
- Featured products grid (reuses `HomeFeaturedProducts` component)
- Value propositions grid (shipping, security, support icons)
- Newsletter signup section
- Footer CTA section
- **Issue:** Generic luxury feel, placeholder ShoppingBag icon instead of real imagery, no clothing-specific sections (no lookbook, no size guide, no "Shop by Style" etc.)

**Product Page (ProductPageEditorial.tsx — 327 lines):**

- Full-width hero image (70-80vh)
- Editorial typography (5xl-7xl headers)
- Center-aligned product info
- Star ratings
- Add to cart + wishlist buttons
- Description + features + specifications sections
- Related products section
- **Issue:** Default product is "Premium Wireless Headphones", no clothing-specific UX (no size selector, no color swatches, no fit guide, no styling suggestions)

### What's Missing for a Complete Clothing Demo

1. **No dedicated cart template** — shares the Modern cart (which works fine but could have editorial styling)
2. **No dedicated checkout template** — shares the Modern checkout
3. **No clothing-specific sorting/category page** — uses generic grid
4. **No editorial search results template**
5. **No size selection UX** in the product page (product variants exist in DB as `productVariant.values` JSONB array)
6. **No color swatches / visual variant selector**
7. **No "lookbook" or "editorial story" sections** on the landing page
8. **No "Shop the Look" or outfit bundling**

---

## Constraints & Rules for ChatGPT

1. **MUST keep the same props contracts** — I cannot change the page-level data fetching. Templates receive the exact types shown above. Any new UI must work within `HomepageContent`, `FeaturedProduct`, `ProductPageProduct`, `CartPageCartItem`, etc.

2. **MUST use existing UI components** — shadcn/ui (Radix), Tailwind CSS, Lucide icons, Framer Motion. No new npm packages unless absolutely necessary and justified.

3. **Currency is EGP** (Egyptian Pound) — this is an Egyptian e-commerce platform.

4. **Images come from the DB** — products have `imageUrl` and `images[]` arrays with URLs like `/uploads/{diskname}`. Hero images come from `content.hero.backgroundImage`. We can suggest placeholder URLs for demo/preview purposes but must handle dynamic data.

5. **Each template file should be self-contained** — no shared state between templates (they're swappable). Shared state lives in contexts (`useCart`, `useTemplate`, `useAuth`).

6. **TypeScript strict mode** — everything must be fully typed.

7. **Mobile-first responsive design** — must look great on phones (Egyptian market is mobile-heavy).

8. **RTL-ready** — the platform may need Arabic support later (don't hardcode `text-left`, prefer Tailwind logical properties where possible).

9. **Performance** — lazy load images, minimize bundle size, use `memo` where appropriate.

---

## What I Need From You (ChatGPT)

### Phase 1: Research & Inspiration

Do HEAVY research on:

- **Real clothing brand websites** (Zara, COS, Arket, Massimo Dutti, Reiss, AllSaints, Theory, Aritzia, SSENSE) — note specific UI patterns, layouts, micro-interactions
- **Component asset libraries** like 21st.dev — find professional, non-AI-slop components that match a premium clothing aesthetic
- **E-commerce UX best practices** for fashion — size selectors, color swatches, lookbook layouts, "Shop the Look", editorial storytelling
- **Color palettes** that work for a premium Egyptian clothing brand — warm tones? monochrome? earth tones?
- **Typography choices** within what Tailwind CSS 4 provides (system fonts + Google Fonts via CSS)

### Phase 2: Design Specifications

For each template category, give me:

1. **Wireframe description** — section by section, what goes where
2. **Exact Tailwind classes** where possible (you know the full Tailwind CSS spec)
3. **Component breakdown** — which shadcn/ui primitives to use, how to compose them
4. **Animation specs** — Framer Motion variants for entrances, hovers, transitions
5. **Color tokens** — specific hex/HSL values for the editorial clothing theme
6. **Mobile layout** — how it adapts (not just "it's responsive" — specific breakpoint behavior)

### Phase 3: Section-by-Section Specs

Priority order for template redesign:

1. **Landing page** — the hero, the story, the brand feel
2. **Product page** — with size selector, color swatches, editorial imagery
3. **Category/sorting page** — editorial product grid
4. **Cart page** — editorial cart experience
5. **Checkout page** — elegant checkout flow
6. **Search results** — clean editorial search

### Deliverables Format

For each template, provide a structured spec like:

```
## [Template Name]
### Concept: [one-line description]
### Sections:
1. Section Name
   - Layout: [grid/flex description]
   - Key classes: [Tailwind]
   - Components: [shadcn/ui components used]
   - Animation: [Framer Motion spec]
   - Mobile: [responsive behavior]
### Color Palette:
- Primary: hsl(...)
- Secondary: hsl(...)
- Accent: hsl(...)
### Typography Scale:
- H1: text-5xl → lg:text-7xl, font-[weight], tracking-[value]
...
```

---

## Quality Bar Reference

Visit https://perce-eg.com/ — that's Demo 1 (Modern) in production. Demo 2 (Editorial/Clothing) should feel distinctly different but at least as polished. Think: **Zara's website meets COS's editorial feel, adapted for an Egyptian fashion brand.**

---

**Ready when you are. Start with Phase 1 research and send back your findings + initial creative direction. Be specific and opinionated — I'll push back if something won't work with the architecture.**
