# Reply to ChatGPT — Full Demo 2 Component Details for Prompt Pack Generation

Great work on the Master Prompt and example specs. The detail level is exactly right. Here's everything you need to generate the full Prompt Pack.

---

## Current Demo 2 Components (Files That Exist Today)

### 1. `LandingTemplateEditorial` — Landing Page

**File:** `components/template-system/landing/LandingTemplateEditorial.tsx` (369 lines)
**Template ID:** `"landing-editorial"`
**Label:** `"Demo 2: Editorial (Premium Luxury)"`

**Props interface:**
```typescript
export interface LandingTemplateEditorialProps {
  content: HomepageContent;
  featuredProducts?: FeaturedProduct[];
  className?: string;
  onCtaClick?: (link: string) => void;
}
```

**NOTE:** The Modern template (Demo 1, the production one) also receives `categories?: CategoryStripItem[]`, `categoriesLoading?: boolean`, `newArrivals?: NewArrivalProduct[]`, `newArrivalsLoading?: boolean`. The editorial template currently does NOT accept these, but I can add them to its interface (optional props only — no page-level changes needed since the page already fetches and passes them).

**Current sections in order:**
1. Full-screen hero (`min-h-[600px]`, `h-screen`) — gradient bg + optional background image + scroll indicator
2. Promo banner strip (top of hero, `bg-white/10 backdrop-blur-md`)
3. Hero content (centered text: title `text-5xl lg:text-7xl`, subtitle, CTA button)
4. Featured Collection Story (2-col grid: image placeholder with ShoppingBag icon + text)
5. Featured Products (`HomeFeaturedProducts` component reuse)
6. Value Propositions (3-col grid of icon + title + description)
7. Newsletter (dark `bg-stone-900` section, email input + subscribe)
8. Footer CTA (large centered heading + CTA button)

**What it imports:**
```typescript
import { Button } from "#root/components/ui/button";
import { Card, CardContent } from "#root/components/ui/card";
import { Badge } from "#root/components/ui/badge";
import { HomeFeaturedProducts } from "../home/HomeFeaturedProducts";
import type { FeaturedProduct } from "../home/HomeFeaturedProducts";
import { ShoppingBag, Truck, Shield, Headphones, Award, RefreshCw, ArrowRight, Sparkles } from "lucide-react";
import type { HomepageContent, ValuePropIconType } from "#root/shared/types/homepage-content";
```

---

### 2. `ProductPageEditorial` — Product Detail Page

**File:** `components/template-system/productPage/ProductPageEditorial.tsx` (327 lines)
**Template ID:** `"product-editorial"`
**Label:** `"Demo 2: Editorial (Luxury Storytelling)"`

**Props interface:**
```typescript
export interface ProductPageEditorialProps {
  product?: ProductPageProduct;
  relatedProducts?: FeaturedProduct[];
  showWishlist?: boolean;
  showSocialShare?: boolean;
  onAddToCart?: (product: ProductPageProduct) => void;
  onAddToWishlist?: (product: ProductPageProduct) => void;
  onImageClick?: (imageUrl: string, index: number) => void;
  className?: string;
}
```

**ProductPageProduct shape (extends FeaturedProduct):**
```typescript
export interface ProductImage {
  url: string;
  alt?: string;
  isPrimary?: boolean;
}

export interface ProductFeature {
  icon: "package" | "zap" | "award" | "shield";
  title: string;
  description: string;
}

export interface ProductSpecification {
  label: string;
  value: string;
}

export interface ProductPageProduct extends FeaturedProduct {
  description?: string;
  longDescription?: string;
  rating?: number;
  reviewCount?: number;
  sku?: string;
  brand?: string;
  specifications?: ProductSpecification[];
  features?: ProductFeature[];
}
```

**Current sections:**
1. Hero image (70-80vh, full-width `object-cover`)
2. Discount badge (top-right)
3. Image selector dots (bottom-center)
4. Product info (center-aligned): brand, name (`text-5xl sm:text-6xl lg:text-7xl`), rating stars, price
5. CTA buttons: Add to Cart (rounded-full) + Save/Wishlist (ghost)
6. Divider
7. Description (editorial prose, centered)
8. Features grid (2-col, Check icons)
9. Specifications list (key-value pairs)
10. Related products (`HomeFeaturedProducts` reuse)

**What it imports:**
```typescript
import { Button } from "#root/components/ui/button";
import { Badge } from "#root/components/ui/badge";
import { HomeFeaturedProducts } from "../home/HomeFeaturedProducts";
import type { ProductPageProduct, ProductImage } from "./ProductPageModernSplit";
import type { FeaturedProduct } from "../home/HomeFeaturedProducts";
import { ShoppingCart, Heart, Star, ArrowRight, Check } from "lucide-react";
```

---

### 3. Components That DO NOT Exist Yet (Need Creating)

These template categories currently only have Modern/shared variants. The Prompt Pack should spec editorial versions of:

| Template | Would-be File | Would-be ID | Props Contract (same as existing Modern version) |
|---|---|---|---|
| Cart Page | `cartPage/CartPageEditorialTemplate.tsx` | `"cart-editorial"` | `CartPageModernTemplateProps` (keep same interface) |
| Checkout Page | `checkoutPage/CheckoutPageEditorialTemplate.tsx` | `"checkout-editorial"` | `CheckoutPageModernTemplateProps` (keep same interface) |
| Category/Sorting | `sorting/SortingEditorialTemplate.tsx` | `"sorting-editorial"` | `SortingMinimalTemplateProps` (keep same interface) |
| Search Results | `searchResults/SearchResultsEditorial.tsx` | `"search-results-editorial"` | `SearchResultsGridProps` (keep same interface) |

---

### 4. Existing Cart Props (for editorial cart spec)

```typescript
export interface CartPageCartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  imageUrl?: string | null;
  variant?: string | null;
  stock?: number | null;
  available: boolean;
}

export interface CartPageTotals {
  subtotal: number;
  discount?: number;
  shipping?: number;
  grandTotal: number;
}

export interface CartPageModernTemplateProps {
  items: CartPageCartItem[];
  totals: CartPageTotals;
  isLoading?: boolean;
  isUpdating?: boolean;
  currency?: string;  // Default "EGP"
  onQuantityChange?: (id: string, quantity: number) => void;
  onRemoveItem?: (id: string) => void;
  onApplyCoupon?: (code: string) => void;
  onProceedToCheckout?: () => void;
}
```

---

### 5. Existing Checkout Props (for editorial checkout spec)

```typescript
export interface CheckoutCustomerInfo {
  name: string;
  email: string;
  phone: string;
}

export interface CheckoutAddress {
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface CheckoutOrderSummaryItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  imageUrl?: string | null;
  variant?: string | null;
}

export interface CheckoutTotals {
  subtotal: number;
  discount?: number;
  shipping?: number;
  grandTotal: number;
}

export interface PaymentMethodOption {
  id: string;      // "cod" | "stripe" | "paymob"
  name: string;
  description: string;
  icon: string;    // Lucide icon name
  enabled: boolean;
}

export interface CheckoutPageModernTemplateProps {
  customerInfo: CheckoutCustomerInfo;
  address: CheckoutAddress;
  orderItems: CheckoutOrderSummaryItem[];
  totals: CheckoutTotals;
  currency?: string;
  paymentMethods?: PaymentMethodOption[];
  selectedPaymentMethod?: string;
  onCustomerInfoChange: (info: CheckoutCustomerInfo) => void;
  onAddressChange: (address: CheckoutAddress) => void;
  onPaymentMethodChange?: (methodId: string) => void;
  onPlaceOrder: () => void;
  isSubmitting?: boolean;
  isLoadingPaymentMethods?: boolean;
}
```

---

### 6. Existing Sorting/Category Props (for editorial PLP spec)

```typescript
export interface SortingMinimalTemplateProps {
  products?: Array<{
    id: string;
    name: string;
    price: number;
    discountPrice?: number | string | null;
    stock: number;
    imageUrl?: string;
    images?: { url: string; isPrimary?: boolean }[];
    categoryName?: string | null;
    available: boolean;
    categories?: { id: string; name: string }[];
  }>;
  isLoading?: boolean;
  onSearchChange?: (query: string) => void;
  onSortChange?: (sort: string) => void;
  onCategoryFilter?: (categoryId: string | null) => void;
  selectedCategory?: string | null;
  searchQuery?: string;
  sortOrder?: string;
}
```

---

### 7. Existing Search Results Props (for editorial search spec)

```typescript
export interface SearchResultsGridProps {
  query: string;
  results?: FeaturedProduct[];
  isLoading?: boolean;
  totalResults?: number;
  onProductClick?: (productId: string) => void;
  className?: string;
}
```

---

### 8. HomepageContent — Full Type (what merchants edit in admin)

```typescript
export interface HomepageContent {
  meta: {
    enabled: boolean;
    pageTitle: string;
    pageDescription: string;
  };
  hero: {
    enabled: boolean;
    title: string;
    subtitle: string;
    ctaText: string;
    ctaLink: string;
    backgroundImage?: string;
    mobileBackgroundImage?: string;
  };
  brandStatement: {
    enabled: boolean;
    title: string;
    description: string;
    image?: string;
  };
  promoBanner: {
    enabled: boolean;
    text: string;
    linkText?: string;
    linkUrl?: string;
  };
  categories: {
    enabled: boolean;
    title: string;
    subtitle: string;
    ctaText: string;
    ctaLink: string;
  };
  featuredProducts: {
    enabled: boolean;
    title: string;
    subtitle: string;
    viewAllText: string;
    viewAllLink: string;
  };
  valueProps: {
    enabled: boolean;
    items: Array<{
      icon: "shopping" | "shipping" | "security" | "support" | "quality" | "returns";
      title: string;
      description: string;
    }>;
  };
  newsletter: {
    enabled: boolean;
    title: string;
    subtitle: string;
    placeholderText: string;
    ctaText: string;
    privacyText: string;
  };
  footerCta: {
    enabled: boolean;
    title: string;
    subtitle: string;
    ctaText: string;
    ctaLink: string;
  };
}
```

---

### 9. FeaturedProduct — Base product type used everywhere

```typescript
export interface FeaturedProduct {
  id: string;
  name: string;
  price: number;
  discountPrice?: number | string | null;
  stock: number;
  imageUrl?: string;
  images?: { url: string; isPrimary?: boolean }[];
  categoryName?: string | null;
  available: boolean;
  categories?: { id: string; name: string }[];
}
```

---

### 10. Additional Types Used by Modern Landing (Available for Editorial Too)

```typescript
// Category strip items (horizontal scrollable categories)
export interface CategoryStripItem {
  id: string;
  name: string;
  slug: string;
  imageUrl?: string | null;
}

// New arrival products (same shape as FeaturedProduct)
export interface NewArrivalProduct {
  id: string;
  name: string;
  price: number;
  discountPrice?: number | null;
  stock: number;
  imageUrl?: string;
  images?: { url: string; isPrimary?: boolean }[];
  categoryName?: string | null;
  available: boolean;
}
```

---

### 11. Available shadcn/ui Components (Already Installed)

All of these are imported from `#root/components/ui/{name}`:

`accordion`, `alert`, `alert-dialog`, `badge`, `breadcrumb`, `button`, `calendar`, `card`, `checkbox`, `command`, `dialog`, `dropdown-menu`, `form`, `input`, `label`, `navigation-menu`, `password-input`, `phone-input`, `popover`, `radio-group`, `scroll-area`, `select`, `separator`, `sheet`, `sidebar`, `skeleton`, `slider`, `sonner`, `switch`, `table`, `tabs`, `tags-input`, `textarea`, `toast`, `toaster`, `tooltip`

---

### 12. Available Button Variants

The Button component has these variants: `default`, `destructive`, `outline`, `secondary`, `ghost`, `link`, `primary`, `primary-light`, `secondary-light`

Sizes: `default`, `sm`, `lg`, `icon`, `md`

---

### 13. Import Path Convention

All imports use `#root/` prefix which maps to `./build/`:
```typescript
import { Button } from "#root/components/ui/button";
import { trpc } from "#root/shared/trpc/client";
import { useCart } from "#root/lib/context/CartContext";
import { useTemplate } from "#root/frontend/contexts/TemplateContext";
import { getTemplateComponent } from "#root/components/template-system/templateConfig";
```

---

### 14. Template Registration Pattern

After Claude creates each new component file, it must be registered in `templateConfig.ts` like:
```typescript
// Import at top
import { CartPageEditorialTemplate } from "./cartPage/CartPageEditorialTemplate";
import { CartPageEditorialPreview } from "./previews/OtherPreviews"; // or new preview file

// Add to the cartPage array in templateConfig:
{
  id: "cart-editorial",
  label: "Demo 2: Editorial Cart",
  component: CartPageEditorialTemplate as React.FC<CartPageEditorialTemplateProps>,
  previewComponent: CartPageEditorialPreview,
}
```

---

## What I Need in the Prompt Pack

Generate standalone, painfully-detailed prompts (in the same style as your Hero and PLP examples) for each of these **in priority order**:

### Landing Page (rewrite `LandingTemplateEditorial.tsx`)
1. **Hero Section** — full-bleed editorial fashion hero
2. **Promo Banner** — subtle top announcement bar
3. **Brand Statement / Editorial Story** — the "about the brand" moment
4. **Category Navigation** — editorial category showcase (using `CategoryStripItem[]` data)
5. **New Arrivals Section** — using `NewArrivalProduct[]` data
6. **Featured Products** — editorial product grid (using `FeaturedProduct[]` data)
7. **Value Propositions** — editorial trust signals
8. **Newsletter** — premium email capture
9. **Footer CTA** — closing editorial statement

### Product Detail Page (rewrite `ProductPageEditorial.tsx`)
10. **Product Gallery** — multi-image with thumbnails, hover zoom
11. **Product Info + Size Selector + Color Swatches** — the buying area
12. **Product Description / Editorial Story** — narrative product content
13. **Specifications & Features** — clean accordion or tabs
14. **Related Products** — editorial "Complete the Look" / related grid

### New Templates to Create
15. **Sorting/PLP Page** — the editorial product listing page with filter bar + grid
16. **Cart Page** — editorial cart with item list, totals, promo code
17. **Checkout Page** — elegant multi-section checkout
18. **Search Results Page** — editorial search results grid

### Admin Previews
19. **Preview thumbnails** for each new/rewritten template (small static preview components)

---

## Color Direction I'd Suggest (Your Call to Refine)

The current editorial template uses `stone-` tones (Tailwind's warm gray). This works well for fashion. Possible palette:
- **Background:** `stone-50` (#fafaf9) / white
- **Surface:** `stone-100` (#f5f5f4)
- **Text primary:** `stone-900` (#1c1917)
- **Text secondary:** `stone-500` (#78716c)
- **Accent:** warm black or deep charcoal — NOT a bright color
- **Dark sections:** `stone-900` or `stone-950`

But you're the creative lead — research real brands and propose what's best.

---

## Generate the Full Prompt Pack Now

Each prompt should follow exactly your example format:
- TASK
- INPUTS YOU MUST RESPECT
- HARD CONSTRAINTS
- VISUAL SPEC (with exact Tailwind classes, spacing, typography)
- INTERACTION + MOTION SPEC
- RESPONSIVE SPEC (mobile/tablet/desktop)
- ACCESSIBILITY
- EDGE CASES
- DELIVERABLE
- FINAL CHECKLIST

Go.
