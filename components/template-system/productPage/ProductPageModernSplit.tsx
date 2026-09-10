import type React from "react";
import { useState } from "react";
import { VariantSelector } from "#root/components/shop/VariantSelector";
import { Button } from "#root/components/ui/button";
import { Card, CardContent } from "#root/components/ui/card";
import { Badge } from "#root/components/ui/badge";
import { Separator } from "#root/components/ui/separator";
import { HomeFeaturedProducts } from "../home/HomeFeaturedProducts";
import type { FeaturedProduct } from "../home/HomeFeaturedProducts";
import {
  ShoppingCart,
  Heart,
  Star,
  StarHalf,
  Truck,
  Shield,
  RotateCcw,
  Share2,
  Facebook,
  Twitter,
  Instagram,
  Check,
  Package,
  Zap,
  Award,
} from "lucide-react";

/**
 * Product image for gallery
 */
export interface ProductImage {
  url: string;
  alt?: string;
  isPrimary?: boolean;
}

/**
 * Product feature item
 */
export interface ProductFeature {
  icon: "package" | "zap" | "award" | "shield";
  title: string;
  description: string;
}

/**
 * Product specification item
 */
export interface ProductSpecification {
  label: string;
  value: string;
}

/**
 * Extended product type for product pages
 */
export interface ProductFragranceInfo {
  tagline?: string;
  taglineAr?: string;
  about?: string;
  aboutAr?: string;
  longevity?: string;
  longevityAr?: string;
  whenToUse?: string;
  whenToUseAr?: string;
  concentration?: string;
  scentIntensity?: string;
  scentIntensityAr?: string;
  gender?: string;
  genderAr?: string;
  topNotes?: string;
  topNotesAr?: string;
  middleNotes?: string;
  middleNotesAr?: string;
  baseNotes?: string;
  baseNotesAr?: string;
  ingredients?: string;
  ingredientsAr?: string;
  badges?: string[];
}

export interface ProductPageProduct extends FeaturedProduct {
  description?: string;
  longDescription?: string;
  inspiredBy?: string;
  sortOrder?: number;
  rating?: number;
  reviewCount?: number;
  sku?: string;
  brand?: string;
  specifications?: ProductSpecification[];
  features?: ProductFeature[];
  variants?: { name: string; values: { value: string; priceModifier?: number; enabledOverride?: boolean }[] }[];
  fragranceInfo?: ProductFragranceInfo | null;
  /** Admin-picked products for the "Best Layered With" section; empty/absent falls back to automatic category suggestions. */
  bestLayeredWith?: FeaturedProduct[];
}

/**
 * Props for ProductPageModernSplit
 */
export interface ProductPageModernSplitProps {
  /**
   * Product data
   */
  product?: ProductPageProduct;

  /**
   * Related products
   */
  relatedProducts?: FeaturedProduct[];

  /**
   * Show wishlist button
   */
  showWishlist?: boolean;

  /**
   * Show social share buttons
   */
  showSocialShare?: boolean;

  /**
   * Callback handlers
   */
  onAddToCart?: (
    product: ProductPageProduct,
    selectedOptions?: Record<string, string>,
  ) => void;
  onAddToWishlist?: (product: ProductPageProduct) => void;
  onImageClick?: (imageUrl: string, index: number) => void;

  /**
   * Additional CSS classes
   */
  className?: string;
}

// Default product features
const DEFAULT_FEATURES: ProductFeature[] = [
  {
    icon: "package",
    title: "Free Shipping",
    description: "On orders over EGP 50",
  },
  {
    icon: "shield",
    title: "Secure Payment",
    description: "100% secure transaction",
  },
  {
    icon: "zap",
    title: "Fast Delivery",
    description: "Ships within 24 hours",
  },
  {
    icon: "award",
    title: "Quality Guaranteed",
    description: "30-day money back",
  },
];

// Icon mapping for features
const FEATURE_ICON_MAP = {
  package: Package,
  zap: Zap,
  award: Award,
  shield: Shield,
};

// Mock product for preview
const MOCK_PRODUCT: ProductPageProduct = {
  id: "mock-1",
  name: "Premium Wireless Headphones",
  price: 199.99,
  discountPrice: 149.99,
  stock: 45,
  available: true,
  imageUrl:
    "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800",
  images: [
    {
      url: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800",
      isPrimary: true,
    },
    {
      url: "https://images.unsplash.com/photo-1484704849700-f032a568e944?w=800",
      isPrimary: false,
    },
    {
      url: "https://images.unsplash.com/photo-1487215078519-e21cc028cb29?w=800",
      isPrimary: false,
    },
    {
      url: "https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=800",
      isPrimary: false,
    },
  ],
  description:
    "High-quality wireless headphones with premium sound and comfort",
  longDescription:
    "Experience superior sound quality with our Premium Wireless Headphones. Featuring advanced noise cancellation, 40-hour battery life, and premium comfort padding. Perfect for music lovers, professionals, and travelers.",
  rating: 4.5,
  reviewCount: 128,
  sku: "WH-PRO-2024",
  brand: "TechGear",
  categoryName: "Electronics",
  specifications: [
    { label: "Brand", value: "TechGear" },
    { label: "Model", value: "WH-PRO-2024" },
    { label: "Color", value: "Matte Black" },
    { label: "Connectivity", value: "Bluetooth 5.0" },
    { label: "Battery Life", value: "40 hours" },
    { label: "Weight", value: "250g" },
  ],
  features: DEFAULT_FEATURES,
};

/**
 * Product Page Modern Split Template
 *
 * A complete product page layout featuring:
 * - Split layout with image gallery and product info
 * - Image thumbnails with zoom effect
 * - Product details and specifications
 * - Add to cart and wishlist functionality
 * - Related products section
 */
export function ProductPageModernSplit({
  product = MOCK_PRODUCT,
  relatedProducts,
  showWishlist = true,
  showSocialShare = true,
  onAddToCart,
  onAddToWishlist,
  onImageClick,
  className = "",
}: ProductPageModernSplitProps) {
  const images = product.images || [
    { url: product.imageUrl || "", isPrimary: true },
  ];
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [isImageZoomed, setIsImageZoomed] = useState(false);

  const selectedImage = images[selectedImageIndex] || images[0];
  const hasDiscount =
    product.discountPrice &&
    typeof product.discountPrice === "number" &&
    product.discountPrice < product.price;
  const discountPercentage = hasDiscount
    ? Math.round(
        ((product.price - (product.discountPrice as number)) / product.price) *
          100,
      )
    : 0;

  const handleThumbnailClick = (index: number) => {
    setSelectedImageIndex(index);
    if (onImageClick) {
      onImageClick(images[index]?.url || "", index);
    }
  };

  const [selectedVariants, setSelectedVariants] = useState<
    Record<string, string>
  >({});

  const allVariantsSelected =
    !product.variants?.length ||
    product.variants.every((v) => selectedVariants[v.name]);

  const handleAddToCart = () => {
    if (onAddToCart) {
      onAddToCart(product, selectedVariants);
    }
  };

  const handleAddToWishlist = () => {
    if (onAddToWishlist) {
      onAddToWishlist(product);
    }
  };

  const renderStars = (rating: number) => {
    const stars = [];
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 !== 0;

    for (let i = 0; i < fullStars; i++) {
      stars.push(
        <Star
          key={`full-${i}`}
          className='w-5 h-5 fill-yellow-400 text-yellow-400'
        />,
      );
    }

    if (hasHalfStar) {
      stars.push(
        <StarHalf
          key='half'
          className='w-5 h-5 fill-yellow-400 text-yellow-400'
        />,
      );
    }

    const emptyStars = 5 - Math.ceil(rating);
    for (let i = 0; i < emptyStars; i++) {
      stars.push(<Star key={`empty-${i}`} className='w-5 h-5 text-gray-300' />);
    }

    return stars;
  };

  return (
    <div className={`product-page-modern-split ${className}`}>
      {/* Main Product Section */}
      <section className='bg-white py-8 sm:py-12 lg:py-16'>
        <div className='container mx-auto px-4 sm:px-6 lg:px-8'>
          <div className='grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12'>
            {/* Left Column - Image Gallery */}
            <div className='space-y-4'>
              {/* Main Image */}
              <div
                className='relative bg-gray-100 rounded-lg overflow-hidden aspect-square cursor-zoom-in'
                onMouseEnter={() => setIsImageZoomed(true)}
                onMouseLeave={() => setIsImageZoomed(false)}>
                {hasDiscount && (
                  <Badge className='absolute top-4 right-4 z-10 bg-red-500 text-white text-lg px-3 py-1'>
                    -{discountPercentage}%
                  </Badge>
                )}
                <img
                  src={selectedImage?.url}
                  alt={product.name}
                  className={`w-full h-full object-cover transition-transform duration-300 ${
                    isImageZoomed ? "scale-110" : "scale-100"
                  }`}
                />
              </div>

              {/* Thumbnail Gallery */}
              {images.length > 1 && (
                <div className='grid grid-cols-4 gap-3'>
                  {images.map((image, index) => (
                    <button
                      key={index}
                      type='button'
                      onClick={() => handleThumbnailClick(index)}
                      className={`relative bg-gray-100 rounded-lg overflow-hidden aspect-square border-2 transition-all duration-200 hover:border-purple-500 ${
                        selectedImageIndex === index
                          ? "border-purple-600 ring-2 ring-purple-200"
                          : "border-gray-200"
                      }`}>
                      <img
                        src={image.url}
                        alt={`${product.name} ${index + 1}`}
                        className='w-full h-full object-cover'
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Right Column - Product Info */}
            <div className='space-y-6'>
              {/* Title */}
              <div>
                <h1 className='text-3xl sm:text-4xl font-bold text-gray-900 mb-2'>
                  {product.name}
                </h1>
                {product.sku && (
                  <p className='text-sm text-gray-500'>SKU: {product.sku}</p>
                )}
              </div>

              {/* Rating */}
              {product.rating !== undefined && (
                <div className='flex items-center gap-3'>
                  <div className='flex items-center gap-1'>
                    {renderStars(product.rating)}
                  </div>
                  <span className='text-sm text-gray-600'>
                    {product.rating.toFixed(1)}
                  </span>
                  {product.reviewCount !== undefined && (
                    <span className='text-sm text-gray-500'>
                      ({product.reviewCount} reviews)
                    </span>
                  )}
                </div>
              )}

              {/* Price */}
              <div className='flex items-baseline gap-3'>
                {hasDiscount ? (
                  <>
                    <span className='text-4xl font-bold text-purple-600'>
                      EGP {product.discountPrice}
                    </span>
                    <span className='text-2xl text-gray-400 line-through'>
                      EGP {product.price.toFixed(2)}
                    </span>
                  </>
                ) : (
                  <span className='text-4xl font-bold text-gray-900'>
                    EGP {product.price.toFixed(2)}
                  </span>
                )}
              </div>

              {/* Stock Status */}
              <div className='flex items-center gap-2'>
                {product.available && product.stock > 0 ? (
                  <>
                    <Check className='w-5 h-5 text-green-600' />
                    <span className='text-green-600 font-medium'>
                      In Stock ({product.stock} available)
                    </span>
                  </>
                ) : (
                  <Badge
                    variant='secondary'
                    className='bg-red-100 text-red-600'>
                    Out of Stock
                  </Badge>
                )}
              </div>

              <Separator />

              {/* Short Description */}
              {product.description && (
                <p className='text-gray-600 leading-relaxed'>
                  {product.description}
                </p>
              )}

              {/* Variant Selector */}
              {product.variants && product.variants.length > 0 && (
                <VariantSelector
                  variants={product.variants}
                  selectedVariants={selectedVariants}
                  onVariantChange={(name, value) =>
                    setSelectedVariants((prev) => ({ ...prev, [name]: value }))
                  }
                />
              )}

              {/* CTA Buttons */}
              <div className='flex flex-col sm:flex-row gap-3'>
                <Button
                  size='lg'
                  className='flex-1 bg-purple-600 hover:bg-purple-700 text-white font-semibold py-6 text-lg'
                  onClick={handleAddToCart}
                  disabled={
                    !product.available ||
                    product.stock === 0 ||
                    !allVariantsSelected
                  }>
                  <ShoppingCart className='w-5 h-5 mr-2' />
                  Add to Cart
                </Button>

                {showWishlist && (
                  <Button
                    size='lg'
                    variant='outline'
                    className='border-2 hover:bg-purple-50 hover:border-purple-600'
                    onClick={handleAddToWishlist}>
                    <Heart className='w-5 h-5' />
                  </Button>
                )}
              </div>

              {/* Trust Badges */}
              <div className='grid grid-cols-3 gap-4 pt-4'>
                <div className='flex items-center gap-2 text-sm text-gray-600'>
                  <Truck className='w-5 h-5 text-purple-600' />
                  <span>Fast Delivery</span>
                </div>
                <div className='flex items-center gap-2 text-sm text-gray-600'>
                  <Shield className='w-5 h-5 text-purple-600' />
                  <span>Secure</span>
                </div>
                <div className='flex items-center gap-2 text-sm text-gray-600'>
                  <RotateCcw className='w-5 h-5 text-purple-600' />
                  <span>Easy Returns</span>
                </div>
              </div>

              {/* Social Share */}
              {showSocialShare && (
                <div className='pt-4'>
                  <Separator className='mb-4' />
                  <div className='flex items-center gap-3'>
                    <span className='text-sm text-gray-600 font-medium'>
                      Share:
                    </span>
                    <div className='flex items-center gap-2'>
                      <Button
                        size='sm'
                        variant='outline'
                        className='rounded-full w-10 h-10 p-0'>
                        <Facebook className='w-4 h-4' />
                      </Button>
                      <Button
                        size='sm'
                        variant='outline'
                        className='rounded-full w-10 h-10 p-0'>
                        <Twitter className='w-4 h-4' />
                      </Button>
                      <Button
                        size='sm'
                        variant='outline'
                        className='rounded-full w-10 h-10 p-0'>
                        <Instagram className='w-4 h-4' />
                      </Button>
                      <Button
                        size='sm'
                        variant='outline'
                        className='rounded-full w-10 h-10 p-0'>
                        <Share2 className='w-4 h-4' />
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      {product.features && product.features.length > 0 && (
        <section className='bg-gray-50 py-8 sm:py-12'>
          <div className='container mx-auto px-4 sm:px-6 lg:px-8'>
            <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6'>
              {product.features.map((feature, index) => {
                const IconComponent = FEATURE_ICON_MAP[feature.icon];
                return (
                  <Card key={index} className='border-none shadow-sm'>
                    <CardContent className='p-6 text-center'>
                      <div className='inline-flex items-center justify-center w-12 h-12 rounded-full bg-purple-100 text-purple-600 mb-3'>
                        <IconComponent className='w-6 h-6' />
                      </div>
                      <h3 className='font-semibold text-gray-900 mb-1'>
                        {feature.title}
                      </h3>
                      <p className='text-sm text-gray-600'>
                        {feature.description}
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Product Details Tabs */}
      <section className='bg-white py-8 sm:py-12'>
        <div className='container mx-auto px-4 sm:px-6 lg:px-8'>
          <div className='max-w-4xl mx-auto'>
            {/* Description */}
            {product.longDescription && (
              <div className='mb-8'>
                <h2 className='text-2xl font-bold text-gray-900 mb-4'>
                  Product Description
                </h2>
                <p className='text-gray-600 leading-relaxed whitespace-pre-line'>
                  {product.longDescription}
                </p>
              </div>
            )}

            {/* Specifications */}
            {product.specifications && product.specifications.length > 0 && (
              <div>
                <h2 className='text-2xl font-bold text-gray-900 mb-4'>
                  Specifications
                </h2>
                <Card>
                  <CardContent className='p-0'>
                    <table className='w-full'>
                      <tbody>
                        {product.specifications.map((spec, index) => (
                          <tr
                            key={index}
                            className={`border-b last:border-b-0 ${
                              index % 2 === 0 ? "bg-gray-50" : "bg-white"
                            }`}>
                            <td className='px-6 py-4 font-medium text-gray-900 w-1/3'>
                              {spec.label}
                            </td>
                            <td className='px-6 py-4 text-gray-600'>
                              {spec.value}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Related Products */}
      {relatedProducts && relatedProducts.length > 0 && (
        <section className='bg-gray-50 py-12 sm:py-16'>
          <div className='container mx-auto px-4 sm:px-6 lg:px-8'>
            <div className='text-center mb-10'>
              <h2 className='text-3xl sm:text-4xl font-bold text-gray-900 mb-4'>
                Related Products
              </h2>
              <p className='text-lg text-gray-600'>
                You might also be interested in these products
              </p>
            </div>

            <HomeFeaturedProducts
              title=''
              products={relatedProducts}
              showViewAllButton={true}
              viewAllHref='/shop'
              maxProducts={4}
            />
          </div>
        </section>
      )}
    </div>
  );
}

// Display name for debugging
ProductPageModernSplit.displayName = "ProductPageModernSplit";
