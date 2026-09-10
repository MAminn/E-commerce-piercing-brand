import type React from "react";
import { useState } from "react";
import { Button } from "#root/components/ui/button";
import { Card, CardContent } from "#root/components/ui/card";
import { Input } from "#root/components/ui/input";
import { HomeFeaturedProducts } from "./HomeFeaturedProducts";
import type { FeaturedProduct } from "./HomeFeaturedProducts";
import {
  ShoppingBag,
  Truck,
  Shield,
  CreditCard,
  Award,
  HeadphonesIcon,
  ArrowRight,
  Tag,
  Mail,
  Sparkles,
} from "lucide-react";

/**
 * Category configuration for the categories grid
 */
export interface CategoryItem {
  id: string;
  name: string;
  imageUrl?: string;
  link?: string;
  productCount?: number;
}

/**
 * Feature item for "Why Shop With Us" section
 */
export interface FeatureItem {
  icon: "shipping" | "security" | "payment" | "award" | "support" | "quality";
  title: string;
  description: string;
}

/**
 * Props for ModernHomeTemplateV2
 */
export interface ModernHomeTemplateV2Props {
  /**
   * Hero section configuration
   */
  hero?: {
    title?: string;
    subtitle?: string;
    ctaText?: string;
    ctaLink?: string;
    backgroundImage?: string;
    showButton?: boolean;
  };

  /**
   * Promo banner configuration
   */
  promoBanner?: {
    text?: string;
    highlightText?: string;
    backgroundColor?: string;
    show?: boolean;
  };

  /**
   * Categories to display in the grid
   */
  categories?: CategoryItem[];

  /**
   * Featured products
   */
  featuredProducts?: FeaturedProduct[];

  /**
   * Features for "Why Shop With Us" section
   */
  features?: FeatureItem[];

  /**
   * Newsletter section configuration
   */
  newsletter?: {
    title?: string;
    description?: string;
    placeholder?: string;
    buttonText?: string;
    show?: boolean;
  };

  /**
   * Footer CTA section
   */
  footerCta?: {
    title?: string;
    description?: string;
    buttonText?: string;
    buttonLink?: string;
    show?: boolean;
  };

  /**
   * Callback handlers
   */
  onHeroCtaClick?: () => void;
  onCategoryClick?: (category: CategoryItem) => void;
  onNewsletterSubmit?: (email: string) => void;
  onFooterCtaClick?: () => void;

  /**
   * Additional CSS classes
   */
  className?: string;
}

// Default categories
const DEFAULT_CATEGORIES: CategoryItem[] = [
  {
    id: "new-arrivals",
    name: "New Arrivals",
    imageUrl:
      "https://images.unsplash.com/photo-1490578474895-699cd4e2cf59?w=400",
    link: "/shop",
    productCount: 0,
  },
  {
    id: "best-sellers",
    name: "Best Sellers",
    imageUrl:
      "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=400",
    link: "/shop",
    productCount: 0,
  },
  {
    id: "featured",
    name: "Featured",
    imageUrl:
      "https://images.unsplash.com/photo-1498049794561-7780e7231661?w=400",
    link: "/shop",
    productCount: 0,
  },
  {
    id: "on-sale",
    name: "On Sale",
    imageUrl:
      "https://images.unsplash.com/photo-1523293182086-7651a899d37f?w=400",
    link: "/shop",
    productCount: 0,
  },
];

// Default features
const DEFAULT_FEATURES: FeatureItem[] = [
  {
    icon: "shipping",
    title: "Fast & Free Shipping",
    description: "Free delivery on orders over EGP 50",
  },
  {
    icon: "security",
    title: "Secure Payments",
    description: "100% secure transaction guarantee",
  },
  {
    icon: "support",
    title: "24/7 Support",
    description: "Dedicated customer support team",
  },
  {
    icon: "award",
    title: "Quality Guarantee",
    description: "30-day money back guarantee",
  },
];

// Icon mapping
const FEATURE_ICON_MAP = {
  shipping: Truck,
  security: Shield,
  payment: CreditCard,
  award: Award,
  support: HeadphonesIcon,
  quality: Sparkles,
};

/**
 * Modern Home Template V2
 *
 * A complete homepage layout featuring:
 * - Hero section with CTA
 * - Promotional banner
 * - Categories grid
 * - Featured products
 * - Features/benefits section
 * - Newsletter signup
 * - Footer CTA
 */
export function ModernHomeTemplateV2({
  hero = {},
  promoBanner = {},
  categories = DEFAULT_CATEGORIES,
  featuredProducts,
  features = DEFAULT_FEATURES,
  newsletter = {},
  footerCta = {},
  onHeroCtaClick,
  onCategoryClick,
  onNewsletterSubmit,
  onFooterCtaClick,
  className = "",
}: ModernHomeTemplateV2Props) {
  const {
    title = "Discover Amazing Products",
    subtitle = "Shop the latest trends and exclusive collections",
    ctaText = "Shop Now",
    ctaLink = "/shop",
    backgroundImage,
    showButton = true,
  } = hero;

  const {
    text = "Limited Time Offer:",
    highlightText = "Get 20% OFF on your first order!",
    backgroundColor = "bg-gradient-to-r from-orange-500 to-red-500",
    show: showPromoBanner = true,
  } = promoBanner;

  const {
    title: newsletterTitle = "Subscribe to Our Newsletter",
    description:
      newsletterDesc = "Get the latest updates on new products and exclusive offers",
    placeholder: newsletterPlaceholder = "Enter your email",
    buttonText: newsletterButtonText = "Subscribe",
    show: showNewsletter = true,
  } = newsletter;

  const {
    title: footerCtaTitle = "Ready to Start Shopping?",
    description: footerCtaDesc = "Join thousands of satisfied customers",
    buttonText: footerCtaButtonText = "Browse Products",
    buttonLink: footerCtaLink = "/shop",
    show: showFooterCta = true,
  } = footerCta;

  const [newsletterEmail, setNewsletterEmail] = useState("");

  const handleNewsletterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newsletterEmail && onNewsletterSubmit) {
      onNewsletterSubmit(newsletterEmail);
      setNewsletterEmail("");
    }
  };

  const handleHeroCtaClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (onHeroCtaClick) {
      e.preventDefault();
      onHeroCtaClick();
    }
  };

  const handleCategoryClick = (category: CategoryItem) => {
    if (onCategoryClick) {
      onCategoryClick(category);
    }
  };

  const handleFooterCtaClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (onFooterCtaClick) {
      e.preventDefault();
      onFooterCtaClick();
    }
  };

  return (
    <div className={`modern-home-template-v2 ${className}`}>
      {/* Promo Banner */}
      {showPromoBanner && (
        <section className={`${backgroundColor} text-white py-3 px-4`}>
          <div className='container mx-auto'>
            <div className='flex items-center justify-center gap-2 text-center'>
              <Tag className='w-5 h-5' />
              <p className='text-sm sm:text-base font-medium'>
                <span className='opacity-90'>{text}</span>{" "}
                <span className='font-bold'>{highlightText}</span>
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Hero Section */}
      <section
        className='relative bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 text-white overflow-hidden'
        style={
          backgroundImage
            ? {
                backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.4)), url(${backgroundImage})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }
            : undefined
        }>
        {/* Background Pattern */}
        <div className='absolute inset-0 opacity-10'>
          <div
            className='absolute inset-0'
            style={{
              backgroundImage: `radial-gradient(circle at 2px 2px, white 1px, transparent 0)`,
              backgroundSize: "40px 40px",
            }}
          />
        </div>

        <div className='relative container mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24 lg:py-32'>
          <div className='max-w-3xl mx-auto text-center'>
            <h1 className='text-4xl sm:text-5xl lg:text-6xl font-bold mb-6 leading-tight animate-fade-in'>
              {title}
            </h1>
            <p className='text-lg sm:text-xl lg:text-2xl text-purple-100 mb-8 leading-relaxed'>
              {subtitle}
            </p>
            {showButton && (
              <Button
                size='lg'
                className='bg-white text-purple-700 hover:bg-purple-50 font-semibold px-8 py-6 text-lg shadow-xl hover:shadow-2xl transition-all duration-300 group'
                onClick={handleHeroCtaClick}
                asChild={!onHeroCtaClick}>
                {onHeroCtaClick ? (
                  <>
                    {ctaText}
                    <ArrowRight className='ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform' />
                  </>
                ) : (
                  <a href={ctaLink}>
                    {ctaText}
                    <ArrowRight className='ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform' />
                  </a>
                )}
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* Categories Grid */}
      <section className='py-12 sm:py-16 lg:py-20 bg-gray-50'>
        <div className='container mx-auto px-4 sm:px-6 lg:px-8'>
          <div className='text-center mb-10 sm:mb-12'>
            <h2 className='text-3xl sm:text-4xl font-bold text-gray-900 mb-4'>
              Shop by Category
            </h2>
            <p className='text-lg text-gray-600'>
              Explore our wide range of product categories
            </p>
          </div>

          <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6'>
            {categories.map((category) => (
              <Card
                key={category.id}
                className='group cursor-pointer border-none shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden'
                onClick={() => handleCategoryClick(category)}>
                <div className='relative h-48 overflow-hidden'>
                  {category.imageUrl ? (
                    <img
                      src={category.imageUrl}
                      alt={category.name}
                      className='w-full h-full object-cover group-hover:scale-110 transition-transform duration-500'
                    />
                  ) : (
                    <div className='w-full h-full bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center'>
                      <ShoppingBag className='w-16 h-16 text-gray-400' />
                    </div>
                  )}
                  <div className='absolute inset-0 bg-gradient-to-t from-black/60 to-transparent' />
                  <div className='absolute bottom-0 left-0 right-0 p-4'>
                    <h3 className='text-xl font-bold text-white mb-1'>
                      {category.name}
                    </h3>
                    {category.productCount !== undefined && (
                      <p className='text-sm text-gray-200'>
                        {category.productCount} Products
                      </p>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Products */}
      <section className='py-12 sm:py-16 lg:py-20 bg-white'>
        <div className='container mx-auto px-4 sm:px-6 lg:px-8'>
          <div className='text-center mb-10 sm:mb-12'>
            <h2 className='text-3xl sm:text-4xl font-bold text-gray-900 mb-4'>
              Featured Products
            </h2>
            <p className='text-lg text-gray-600'>
              Check out our top picks for this season
            </p>
          </div>

          <HomeFeaturedProducts
            title=''
            products={featuredProducts}
            showViewAllButton={true}
            viewAllHref='/shop'
            maxProducts={8}
          />
        </div>
      </section>

      {/* Why Shop With Us */}
      <section className='py-12 sm:py-16 lg:py-20 bg-gradient-to-br from-gray-50 to-gray-100'>
        <div className='container mx-auto px-4 sm:px-6 lg:px-8'>
          <div className='text-center mb-10 sm:mb-12'>
            <h2 className='text-3xl sm:text-4xl font-bold text-gray-900 mb-4'>
              Why Shop With Us
            </h2>
            <p className='text-lg text-gray-600'>
              We provide the best shopping experience
            </p>
          </div>

          <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6'>
            {features.map((feature, index) => {
              const IconComponent = FEATURE_ICON_MAP[feature.icon];
              return (
                <Card
                  key={index}
                  className='border-none shadow-md hover:shadow-lg transition-shadow duration-300'>
                  <CardContent className='p-6 text-center'>
                    <div className='inline-flex items-center justify-center w-16 h-16 rounded-full bg-purple-100 text-purple-600 mb-4'>
                      <IconComponent className='w-8 h-8' />
                    </div>
                    <h3 className='text-lg font-semibold mb-2 text-gray-900'>
                      {feature.title}
                    </h3>
                    <p className='text-gray-600 text-sm'>
                      {feature.description}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* Newsletter Signup */}
      {showNewsletter && (
        <section className='py-12 sm:py-16 lg:py-20 bg-purple-600 text-white'>
          <div className='container mx-auto px-4 sm:px-6 lg:px-8'>
            <div className='max-w-2xl mx-auto text-center'>
              <Mail className='w-12 h-12 mx-auto mb-4' />
              <h2 className='text-3xl sm:text-4xl font-bold mb-4'>
                {newsletterTitle}
              </h2>
              <p className='text-lg text-purple-100 mb-8'>{newsletterDesc}</p>

              <form
                onSubmit={handleNewsletterSubmit}
                className='flex flex-col sm:flex-row gap-3 max-w-md mx-auto'>
                <Input
                  type='email'
                  placeholder={newsletterPlaceholder}
                  value={newsletterEmail}
                  onChange={(e) => setNewsletterEmail(e.target.value)}
                  required
                  className='flex-1 bg-white text-gray-900 border-none h-12'
                />
                <Button
                  type='submit'
                  size='lg'
                  className='bg-white text-purple-600 hover:bg-purple-50 font-semibold whitespace-nowrap'>
                  {newsletterButtonText}
                </Button>
              </form>
            </div>
          </div>
        </section>
      )}

      {/* Footer CTA */}
      {showFooterCta && (
        <section className='py-12 sm:py-16 lg:py-20 bg-gradient-to-r from-indigo-600 to-purple-600 text-white'>
          <div className='container mx-auto px-4 sm:px-6 lg:px-8'>
            <div className='max-w-3xl mx-auto text-center'>
              <h2 className='text-3xl sm:text-4xl lg:text-5xl font-bold mb-4'>
                {footerCtaTitle}
              </h2>
              <p className='text-lg sm:text-xl text-purple-100 mb-8'>
                {footerCtaDesc}
              </p>
              <Button
                size='lg'
                className='bg-white text-purple-700 hover:bg-purple-50 font-semibold px-8 py-6 text-lg shadow-xl hover:shadow-2xl transition-all duration-300 group'
                onClick={handleFooterCtaClick}
                asChild={!onFooterCtaClick}>
                {onFooterCtaClick ? (
                  <>
                    {footerCtaButtonText}
                    <ShoppingBag className='ml-2 w-5 h-5 group-hover:scale-110 transition-transform' />
                  </>
                ) : (
                  <a href={footerCtaLink}>
                    {footerCtaButtonText}
                    <ShoppingBag className='ml-2 w-5 h-5 group-hover:scale-110 transition-transform' />
                  </a>
                )}
              </Button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

// Display name for debugging
ModernHomeTemplateV2.displayName = "ModernHomeTemplateV2";
