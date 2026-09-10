/**
 * @legacy
 * Legacy Template System (v1)
 * - Fully preserved for admin preview
 * - Not used in frontend rendering
 * - Used as a design asset library
 */

import DefaultHomeTemplate from "./templates/home/DefaultHomeTemplate";
import ModernHomeTemplate from "./templates/home/ModernHomeTemplate";
import DefaultMenTemplate from "./templates/men/DefaultMenTemplate";
import DefaultWomenTemplate from "./templates/women/DefaultWomenTemplate";
import DefaultBrandsTemplate from "./templates/brands/DefaultBrandsTemplate";
import DefaultProductsTemplate from "./templates/products/DefaultProductsTemplate";
import ModernMenTemplate from "./templates/men/ModernMenTemplate";
import ModernWomenTemplate from "./templates/women/ModernWomenTemplate";
import ModernBrandsTemplate from "./templates/brands/ModernBrandsTemplate";
import ModernProductsTemplate from "./templates/products/ModernProductsTemplate";
import DefaultCartTemplate from "./templates/cart/DefaultCartTemplate";
import ModernCartTemplate from "./templates/cart/ModernCartTemplate";
import DefaultCheckoutTemplate from "./templates/checkout/DefaultCheckoutTemplate";
import ModernCheckoutTemplate from "./templates/checkout/ModernCheckoutTemplate";
import DefaultProductTemplate from "./templates/product/DefaultProductTemplate";
import ModernProductTemplate from "./templates/product/ModernProductTemplate";
import DefaultProductCardTemplate from "./templates/productCard/DefaultProductCardTemplate";
import ModernProductCardTemplate from "./templates/productCard/ModernProductCardTemplate";
import DefaultSortingTemplate from "./templates/sorting/DefaultSortingTemplate";
import ModernSortingTemplate from "./templates/sorting/ModernSortingTemplate";

export type TemplateCategory =
  | "home"
  | "men"
  | "women"
  | "brands"
  | "products"
  | "cart"
  | "checkout"
  | "product"
  | "sorting"
  | "productCard";

// Template data interfaces
interface FeaturedProduct {
  id: string;
  name: string;
  price: number;
  discountPrice?: number | string | null;
  stock: number;
  imageUrl?: string;
  images?: { url: string; isPrimary?: boolean }[];
  categoryName: string;
  available: boolean;
  categories?: { id: string; name: string }[];
}

interface Category {
  id: string;
  name: string;
  type?: string;
  displayName?: string;
  slug?: string;
  imageId?: string | null;
  filename?: string | null;
  productCount?: number;
}

interface Vendor {
  id: string;
  name: string;
  description: string | null;
  logoImagePath: string | null;
}

interface Product {
  id: string;
  name: string;
  price: string | number;
  discountPrice?: number | string | null;
  imageUrl: string | null;
  images?: Array<{
    url: string;
    isPrimary?: boolean;
  }>;
  available: boolean;
  categoryId: string;
  categoryName: string | null;
  stock: number;
}

interface HomeTemplateData {
  featuredProducts: FeaturedProduct[];
  isLoading: boolean;
  error?: string | null;
}

interface MenTemplateData {
  subcategories: Category[];
  isLoading: boolean;
  error?: string | null;
}

interface WomenTemplateData {
  subcategories: Category[];
  isLoading: boolean;
  error?: string | null;
}

interface BrandsTemplateData {
  vendors: Vendor[];
  isLoading: boolean;
  error: string | null;
}

interface ProductsTemplateData {
  products: Product[];
  isLoading: boolean;
  error?: string | null;
}

interface CartItem {
  id: string;
  name: string;
  price: number;
  discountPrice?: number | string | null;
  quantity: number;
  imageUrl?: string;
  images?: Array<{
    url: string;
    isPrimary?: boolean;
  }>;
  selectedOptions: Record<string, string>;
  categoryName: string;
  stock: number;
}

interface CartTemplateData {
  items: CartItem[];
  totalItems: number;
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
  promoCode?: {
    id: string;
    code: string;
    discountType: "percentage" | "fixed_amount";
    discountValue: number;
  } | null;
  isLoading: boolean;
  error?: string | null;
}

interface CheckoutItem {
  id: string;
  name: string;
  price: number;
  discountPrice?: number | string | null;
  quantity: number;
  imageUrl?: string;
  images?: Array<{
    url: string;
    isPrimary?: boolean;
  }>;
  selectedOptions: Record<string, string>;
  categoryName: string;
  stock: number;
}

interface CheckoutTemplateData {
  items: CheckoutItem[];
  totalItems: number;
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
  promoCode?: {
    id: string;
    code: string;
    discountType: "percentage" | "fixed_amount";
    discountValue: number;
  } | null;
  formData: {
    fullName: string;
    phoneNumber: string;
    email: string;
    address: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
    notes: string;
  };
  isSubmitting: boolean;
  showOrderConfirmation: boolean;
  orderDetails?: {
    id: number;
    date: string;
    customerInfo: {
      fullName: string;
      phoneNumber: string;
      email: string;
      address: string;
      city: string;
      state: string;
      postalCode: string;
      country: string;
    };
    items: CheckoutItem[];
    subtotal: number;
    shipping: number;
    discount?: number;
    total: number;
    status: string;
    promoCode?: {
      id: string;
      code: string;
      discountType: "percentage" | "fixed_amount";
      discountValue: number;
    };
    notes?: string;
  } | null;
  isLoading: boolean;
  error?: string | null;
}

interface ProductVariant {
  name: string;
  values: string[];
}

interface ProductReview {
  id: string;
  userName: string;
  rating: number;
  comment: string;
  createdAt: string;
}

interface ProductReviewStats {
  averageRating: number;
  totalReviews: number;
}

interface ProductTemplateData {
  product: {
    id: string;
    name: string;
    description: string;
    price: number | string;
    discountPrice?: number | null;
    images?: { url: string; isPrimary?: boolean }[];
    stock: number;
    available: boolean;
    categoryId: string;
    categoryName: string;
    variants?: ProductVariant[];
    specifications?: Record<string, string>;
    features?: string[];
  };
  reviews: ProductReview[];
  reviewStats: ProductReviewStats;
  relatedProducts?: {
    id: string;
    name: string;
    price: number | string;
    discountPrice?: number | null;
    imageUrl?: string;
    images?: { url: string; isPrimary?: boolean }[];
    categoryName: string;
  }[];
  selectedOptions: Record<string, string>;
  quantity: number;
  currentImageIndex: number;
  isZoomed: boolean;
  isAddingToCart: boolean;
  isSubmittingReview: boolean;
  isLoading: boolean;
  error?: string | null;
}

// Sorting template data interface
export interface SortingTemplateData {
  products: {
    description: string | null;
    id: string;
    name: string;
    price: number | string;
    discountPrice?: number | string | null;
    imageUrl?: string | null;
    available: boolean;
    categoryName?: string | null;
    stock?: number;
    sku?: string;
    dateAdded?: string;
    categories?: { id: string; name: string }[];
    images?: { url: string; isPrimary?: boolean }[];
  }[];
  isLoading: boolean;
  sortCriteria: string;
  selectedPriceRange: string;
  selectedCategories: string[];
  showFilters: boolean;
  showMobileFilters: boolean;
  toggleCategoryFilter?: (categoryId: string) => void;
  resetFilters?: () => void;
  handleSortChange?: (value: string) => void;
  handlePriceRangeChange?: (value: string) => void;
  setShowMobileFilters?: (show: boolean) => void;
  categories?: {
    id: string;
    name: string;
    displayName?: string;
    slug?: string;
    imageId?: string | null;
    filename?: string | null;
    type?: string;
    productCount?: number;
  }[];
}

// ProductCard template data interface
export interface ProductCardTemplateData {
  product: {
    id: string;
    name: string;
    price: number | string;
    discountPrice?: number | string | null;
    imageUrl?: string | null;
    images?: { url: string; isPrimary?: boolean }[];
    available: boolean;
    categoryName?: string | null;
    categories?: { id: string; name: string }[];
  };
  showVendor?: boolean;
  showAddToCart?: boolean;
  showQuickView?: boolean;
  showWishlist?: boolean;
  isAddingToCart?: boolean;
  isHovered?: boolean;
  isInWishlist?: boolean;
  isQuickViewOpen?: boolean;
  setIsHovered?: (isHovered: boolean) => void;
  setIsAddingToCart?: (isAdding: boolean) => void;
  imageLoaded?: boolean;
  setImageLoaded?: (loaded: boolean) => void;
}

type TemplateData =
  | HomeTemplateData
  | MenTemplateData
  | WomenTemplateData
  | BrandsTemplateData
  | ProductsTemplateData
  | CartTemplateData
  | CheckoutTemplateData
  | ProductTemplateData
  | SortingTemplateData
  | ProductCardTemplateData;

export type {
  CartTemplateData,
  CartItem,
  CheckoutTemplateData,
  CheckoutItem,
  ProductTemplateData,
  ProductVariant,
  ProductReview,
  ProductReviewStats,
  TemplateData,
};

export interface TemplateInfo {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  component: React.ComponentType<{
    data?: TemplateData;
    onUpdateData?: (updates: Partial<TemplateData>) => void;
  }>;
}

// Template definitions for each category
const templates: Record<TemplateCategory, TemplateInfo[]> = {
  sorting: [
    {
      id: "default-sorting",
      name: "Default Sorting",
      description: "Standard product sorting and filtering layout",
      category: "sorting",
      component: DefaultSortingTemplate as React.ComponentType<{
        data?: TemplateData;
        onUpdateData?: (updates: Partial<TemplateData>) => void;
      }>,
    },
    {
      id: "modern-sorting",
      name: "Modern Sorting",
      description: "Enhanced sorting with modern styling and animations",
      category: "sorting",
      component: ModernSortingTemplate as React.ComponentType<{
        data?: TemplateData;
        onUpdateData?: (updates: Partial<TemplateData>) => void;
      }>,
    },
  ],
  productCard: [
    {
      id: "default-productCard",
      name: "Default Product Card",
      description: "Standard product card layout",
      category: "productCard",
      component: DefaultProductCardTemplate as React.ComponentType<{
        data?: TemplateData;
        onUpdateData?: (updates: Partial<TemplateData>) => void;
      }>,
    },
    {
      id: "modern-productCard",
      name: "Modern Product Card",
      description: "Enhanced product card with modern styling and animations",
      category: "productCard",
      component: ModernProductCardTemplate as React.ComponentType<{
        data?: TemplateData;
        onUpdateData?: (updates: Partial<TemplateData>) => void;
      }>,
    },
  ],
  home: [
    {
      id: "default-home",
      name: "Default Home",
      description: "The original home page design",
      category: "home",
      component: DefaultHomeTemplate as React.ComponentType<{
        data?: TemplateData;
        onUpdateData?: (updates: Partial<TemplateData>) => void;
      }>,
    },
    {
      id: "modern-home",
      name: "Modern Home",
      description: "A modern and sleek home page design",
      category: "home",
      component: ModernHomeTemplate as React.ComponentType<{
        data?: TemplateData;
        onUpdateData?: (updates: Partial<TemplateData>) => void;
      }>,
    },
  ],
  men: [
    {
      id: "default-men",
      name: "Default Men",
      description: "The original men's page design",
      category: "men",
      component: DefaultMenTemplate as React.ComponentType<{
        data?: TemplateData;
        onUpdateData?: (updates: Partial<TemplateData>) => void;
      }>,
    },
    {
      id: "modern-men",
      name: "Modern Men",
      description: "A modern men's page with dark theme",
      category: "men",
      component: ModernMenTemplate as React.ComponentType<{
        data?: TemplateData;
        onUpdateData?: (updates: Partial<TemplateData>) => void;
      }>,
    },
  ],
  women: [
    {
      id: "default-women",
      name: "Default Women",
      description: "The original women's page design",
      category: "women",
      component: DefaultWomenTemplate as React.ComponentType<{
        data?: TemplateData;
        onUpdateData?: (updates: Partial<TemplateData>) => void;
      }>,
    },
    {
      id: "modern-women",
      name: "Modern Women",
      description: "An elegant women's page with rose theme",
      category: "women",
      component: ModernWomenTemplate as React.ComponentType<{
        data?: TemplateData;
        onUpdateData?: (updates: Partial<TemplateData>) => void;
      }>,
    },
  ],
  brands: [
    {
      id: "default-brands",
      name: "Default Shop",
      description: "The original shop page design",
      category: "brands",
      component: DefaultBrandsTemplate as React.ComponentType<{
        data?: TemplateData;
        onUpdateData?: (updates: Partial<TemplateData>) => void;
      }>,
    },
    {
      id: "modern-brands",
      name: "Modern Shop",
      description: "A sleek shop page with gradient design",
      category: "brands",
      component: ModernBrandsTemplate as React.ComponentType<{
        data?: TemplateData;
        onUpdateData?: (updates: Partial<TemplateData>) => void;
      }>,
    },
  ],
  products: [
    {
      id: "default-products",
      name: "Default Products",
      description: "The original products page design",
      category: "products",
      component: DefaultProductsTemplate as React.ComponentType<{
        data?: TemplateData;
        onUpdateData?: (updates: Partial<TemplateData>) => void;
      }>,
    },
    {
      id: "modern-products",
      name: "Modern Products",
      description: "An enhanced products page with advanced features",
      category: "products",
      component: ModernProductsTemplate as React.ComponentType<{
        data?: TemplateData;
        onUpdateData?: (updates: Partial<TemplateData>) => void;
      }>,
    },
  ],
  cart: [
    {
      id: "default-cart",
      name: "Default Cart",
      description: "Standard shopping cart layout",
      category: "cart",
      component: DefaultCartTemplate as React.ComponentType<{
        data?: TemplateData;
        onUpdateData?: (updates: Partial<TemplateData>) => void;
      }>,
    },
    {
      id: "modern-cart",
      name: "Modern Cart",
      description: "Contemporary shopping cart with enhanced styling",
      category: "cart",
      component: ModernCartTemplate as React.ComponentType<{
        data?: TemplateData;
        onUpdateData?: (updates: Partial<TemplateData>) => void;
      }>,
    },
  ],
  checkout: [
    {
      id: "default-checkout",
      name: "Default Checkout",
      description: "Standard checkout process layout",
      category: "checkout",
      component: DefaultCheckoutTemplate as React.ComponentType<{
        data?: TemplateData;
        onUpdateData?: (updates: Partial<TemplateData>) => void;
      }>,
    },
    {
      id: "modern-checkout",
      name: "Modern Checkout",
      description: "Enhanced checkout with modern styling and animations",
      category: "checkout",
      component: ModernCheckoutTemplate as React.ComponentType<{
        data?: TemplateData;
        onUpdateData?: (updates: Partial<TemplateData>) => void;
      }>,
    },
  ],
  product: [
    {
      id: "default-product",
      name: "Default Product",
      description: "Standard product page layout",
      category: "product",
      component: DefaultProductTemplate as React.ComponentType<{
        data?: TemplateData;
        onUpdateData?: (updates: Partial<TemplateData>) => void;
      }>,
    },
    {
      id: "modern-product",
      name: "Modern Product",
      description: "Enhanced product page with modern styling and animations",
      category: "product",
      component: ModernProductTemplate as React.ComponentType<{
        data?: TemplateData;
        onUpdateData?: (updates: Partial<TemplateData>) => void;
      }>,
    },
  ],
};

// Helper function to get template component
export function getTemplateComponent(
  category: TemplateCategory,
  templateId: string,
) {
  const categoryTemplates = templates[category];
  if (!categoryTemplates) {
    console.warn(`No templates found for category: ${category}`);
    return null;
  }

  const template = categoryTemplates.find((t) => t.id === templateId);
  if (!template) {
    console.warn(
      `Template "${templateId}" not found in category "${category}"`,
    );
    return categoryTemplates[0]?.component || null;
  }

  return template.component;
}

// Helper function to get available templates for a category
export function getAvailableTemplates(
  category: TemplateCategory,
): TemplateInfo[] {
  return templates[category] || [];
}

// Helper function to get template metadata
export function getTemplateMetadata(
  category: TemplateCategory,
  templateId: string,
): TemplateInfo | null {
  const categoryTemplates = templates[category];
  if (!categoryTemplates) {
    return null;
  }

  return categoryTemplates.find((t) => t.id === templateId) || null;
}

// Export templates for external use
export { templates };
