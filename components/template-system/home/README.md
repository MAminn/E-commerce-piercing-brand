# Template System - Home Components

Modern, reusable components for building customizable homepage templates in the Lebsey e-commerce platform.

## 📁 Structure

```
components/template-system/home/
├── HomeFeaturedProducts.tsx    # Featured products section
├── index.ts                    # Barrel export file
└── README.md                   # This file
```

## 🎯 Purpose

This folder contains modular, reusable components specifically designed for homepage templates. These components can be used across different template variations (Default, Modern, Minimal, etc.) to create consistent yet customizable landing pages.

## 📦 Components

### HomeFeaturedProducts

A flexible featured products section with built-in loading states, empty states, and responsive grid layout.

**Features:**

- ✅ Responsive product grid (1-4 columns based on screen size)
- ✅ Loading skeleton states
- ✅ Empty state with fallback UI
- ✅ Customizable title and subtitle
- ✅ Optional "View All" button
- ✅ Product limit control
- ✅ Uses existing ProductCard component
- ✅ Fully typed with TypeScript

**Usage:**

```tsx
import { HomeFeaturedProducts } from "#root/components/template-system/home";

function MyTemplate() {
  return (
    <HomeFeaturedProducts
      products={featuredProducts}
      isLoading={false}
      title='Featured Products'
      subtitle='Discover our handpicked selection'
      showViewAllButton={true}
      viewAllHref='/shop'
      maxProducts={8}
    />
  );
}
```

**Props:**

| Prop                | Type                | Default               | Description                  |
| ------------------- | ------------------- | --------------------- | ---------------------------- |
| `products`          | `FeaturedProduct[]` | `[]`                  | Array of products to display |
| `isLoading`         | `boolean`           | `false`               | Shows loading skeletons      |
| `title`             | `string`            | `"Featured Products"` | Section heading              |
| `subtitle`          | `string`            | `undefined`           | Optional subtitle text       |
| `showViewAllButton` | `boolean`           | `true`                | Display "View All" button    |
| `viewAllHref`       | `string`            | `"/shop"`             | Link for "View All" button   |
| `maxProducts`       | `number`            | `8`                   | Maximum products to display  |

## 🎨 Styling

All components use **Tailwind CSS** for styling to maintain consistency and enable easy customization:

- Responsive breakpoints: `sm:`, `md:`, `lg:`, `xl:`
- Consistent spacing: `px-4`, `py-16`, `gap-6`, `mb-12`
- Color palette: Gray scale + accent colors
- Hover effects: `hover:shadow-lg`, `transition-all`

## 🔄 Migration from Old Components

The old `FeaturedSection` component has been updated to use `HomeFeaturedProducts` internally for backward compatibility:

```tsx
// Old way (still works, but deprecated)
import { FeaturedSection } from "#root/components/home/FeaturedSection";

// New way (recommended)
import { HomeFeaturedProducts } from "#root/components/template-system/home";
```

## 🚀 Adding New Components

When adding new home components to this folder:

1. **Create the component file** with clear props interface
2. **Export from index.ts** for clean imports
3. **Follow naming convention**: `Home[ComponentName].tsx`
4. **Include TypeScript types**: Export both component and prop types
5. **Use ProductCard** or other shared components where applicable
6. **Add loading/empty states** for better UX
7. **Make it responsive** using Tailwind breakpoints
8. **Document in this README**

Example:

```tsx
// HomeHeroSection.tsx
export interface HomeHeroSectionProps {
  title: string;
  subtitle?: string;
  // ... other props
}

export function HomeHeroSection({ title, subtitle }: HomeHeroSectionProps) {
  // Component implementation
}

// index.ts
export { HomeHeroSection } from "./HomeHeroSection";
export type { HomeHeroSectionProps } from "./HomeHeroSection";
```

## 🎯 Best Practices

1. **Keep components focused**: Each component should have a single responsibility
2. **Make props optional**: Provide sensible defaults for better DX
3. **Support theming**: Use consistent color classes that can be customized
4. **Optimize performance**: Use lazy loading for heavy components
5. **Mobile-first**: Design for mobile, enhance for desktop
6. **Accessibility**: Include ARIA labels and semantic HTML

## 🔗 Related Components

- `ProductCard` - `/components/shop/ProductCard.tsx`
- `Link` - `/components/utils/Link.tsx`
- `Button` - `/components/ui/button.tsx`

## 📝 Future Components

Planned components for this section:

- [ ] `HomeHeroSection` - Hero banner with CTA
- [ ] `HomeCategoryGrid` - Category browsing section
- [ ] `HomeTestimonials` - Customer reviews showcase
- [ ] `HomeNewArrivals` - Latest products section
- [ ] `HomeBrandShowcase` - Featured vendor/brand section
- [ ] `HomePromotion` - Promotional banner/cards
- [ ] `HomeNewsletterSignup` - Email subscription section

## 💡 Usage in Templates

These components are designed to be used in template files located in:
`frontend/components/template/templates/home/`

Example template structure:

```tsx
// DefaultHomeTemplate.tsx
import { HomeFeaturedProducts } from "#root/components/template-system/home";

export function DefaultHomeTemplate({ data }) {
  return (
    <div>
      {/* Hero Section */}

      {/* Featured Products */}
      <HomeFeaturedProducts
        products={data.featuredProducts}
        isLoading={data.isLoading}
      />

      {/* Other sections */}
    </div>
  );
}
```

---

**Last Updated:** December 10, 2025
**Maintainer:** Lebsey Development Team
