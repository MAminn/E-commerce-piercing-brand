/**
 * Mock Data for Template Previews
 *
 * Provides realistic sample data for rendering template previews
 * without requiring TRPC or database calls
 */

import { DEFAULT_HOMEPAGE_CONTENT } from "#root/shared/types/homepage-content";

// Mock homepage content - use default content from schema
export const mockHomepageContent = DEFAULT_HOMEPAGE_CONTENT;

// Mock product data (needs to match ProductPageProduct interface)
export const mockProduct = {
  id: "product-1",
  name: "Premium Leather Sneakers",
  description:
    "Handcrafted Italian leather sneakers with premium comfort and timeless style. Perfect for both casual and semi-formal occasions.",
  price: 149.99,
  discountPrice: null,
  images: [
    { url: "/placeholder-product-1.jpg", isPrimary: true },
    { url: "/placeholder-product-2.jpg", isPrimary: false },
    { url: "/placeholder-product-3.jpg", isPrimary: false },
  ],
  stock: 24,
  available: true,
  categoryId: "cat-1",
  categoryName: "Footwear",
  specifications: [
    { label: "Material", value: "Italian Leather" },
    { label: "Sole", value: "Rubber" },
    { label: "Origin", value: "Italy" },
    { label: "Care", value: "Clean with damp cloth" },
  ],
  features: [
    {
      icon: "shield" as const,
      title: "Premium Italian leather construction",
      description: "Handcrafted from the finest Italian leather",
    },
    {
      icon: "award" as const,
      title: "Cushioned insole for all-day comfort",
      description: "Memory foam insole provides all-day support",
    },
    {
      icon: "package" as const,
      title: "Durable rubber outsole",
      description: "Long-lasting traction and grip",
    },
    {
      icon: "zap" as const,
      title: "Classic versatile design",
      description: "Perfect for any occasion",
    },
  ],
};

export const mockReviews = [
  {
    id: "review-1",
    userName: "John D.",
    rating: 5,
    comment: "Amazing quality and comfort. Worth every penny!",
    createdAt: "2024-01-15",
  },
  {
    id: "review-2",
    userName: "Sarah M.",
    rating: 4,
    comment: "Great shoes, runs slightly large. Size down.",
    createdAt: "2024-01-10",
  },
];

export const mockReviewStats = {
  averageRating: 4.5,
  totalReviews: 48,
};

export const mockRelatedProducts = [
  {
    id: "related-1",
    name: "Canvas Sneakers",
    price: 69.99,
    imageUrl: "/placeholder-product.jpg",
    categoryName: "Footwear",
    stock: 50,
    available: true,
  },
  {
    id: "related-2",
    name: "Running Shoes",
    price: 129.99,
    imageUrl: "/placeholder-product.jpg",
    categoryName: "Athletic",
    stock: 30,
    available: true,
  },
  {
    id: "related-3",
    name: "Boat Shoes",
    price: 89.99,
    imageUrl: "/placeholder-product.jpg",
    categoryName: "Casual",
    stock: 40,
    available: true,
  },
];

// Mock category data
export const mockCategoryProducts = [
  {
    id: "prod-1",
    name: "Classic T-Shirt",
    price: 29.99,
    imageUrl: "/placeholder-product.jpg",
    available: true,
    categoryName: "Clothing",
    stock: 100,
  },
  {
    id: "prod-2",
    name: "Slim Fit Jeans",
    price: 79.99,
    discountPrice: 59.99,
    imageUrl: "/placeholder-product.jpg",
    available: true,
    categoryName: "Clothing",
    stock: 50,
  },
  {
    id: "prod-3",
    name: "Casual Hoodie",
    price: 49.99,
    imageUrl: "/placeholder-product.jpg",
    available: true,
    categoryName: "Clothing",
    stock: 75,
  },
  {
    id: "prod-4",
    name: "Sport Sneakers",
    price: 99.99,
    imageUrl: "/placeholder-product.jpg",
    available: true,
    categoryName: "Footwear",
    stock: 30,
  },
  {
    id: "prod-5",
    name: "Leather Belt",
    price: 39.99,
    imageUrl: "/placeholder-product.jpg",
    available: true,
    categoryName: "Accessories",
    stock: 200,
  },
  {
    id: "prod-6",
    name: "Canvas Backpack",
    price: 59.99,
    imageUrl: "/placeholder-product.jpg",
    available: true,
    categoryName: "Accessories",
    stock: 45,
  },
];

export const mockCategories = [
  {
    id: "cat-1",
    name: "Clothing",
    displayName: "Clothing",
    slug: "clothing",
    productCount: 150,
  },
  {
    id: "cat-2",
    name: "Footwear",
    displayName: "Footwear",
    slug: "footwear",
    productCount: 80,
  },
  {
    id: "cat-3",
    name: "Accessories",
    displayName: "Accessories",
    slug: "accessories",
    productCount: 120,
  },
];

// Mock vendor data
export const mockVendor = {
  id: "vendor-1",
  name: "Premium Fashion Store",
  description: "Curated collection of premium fashion and lifestyle products",
  logoImagePath: "/placeholder-logo.jpg",
  bannerImagePath: "/placeholder-banner.jpg",
  productsCount: 156,
  rating: 4.8,
};

// Mock cart data
export const mockCartItems = [
  {
    id: "cart-1",
    name: "Classic White Sneakers",
    price: 89.99,
    quantity: 1,
    imageUrl: "/placeholder-product.jpg",
    selectedOptions: { Size: "9", Color: "White" },
    categoryName: "Footwear",
    stock: 50,
  },
  {
    id: "cart-2",
    name: "Denim Jacket",
    price: 129.99,
    discountPrice: 99.99,
    quantity: 1,
    imageUrl: "/placeholder-product.jpg",
    selectedOptions: { Size: "M" },
    categoryName: "Outerwear",
    stock: 20,
  },
];

export const mockCartTotals = {
  subtotal: 189.98,
  shipping: 10.0,
  discount: 0,
  total: 199.98,
  grandTotal: 199.98,
};
