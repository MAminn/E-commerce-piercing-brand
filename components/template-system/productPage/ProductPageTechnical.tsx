import type React from "react";
import { useState } from "react";
import { VariantSelector } from "#root/components/shop/VariantSelector";
import { Button } from "#root/components/ui/button";
import { Badge } from "#root/components/ui/badge";
import { HomeFeaturedProducts } from "../home/HomeFeaturedProducts";
import type {
  ProductPageProduct,
  ProductImage,
  ProductFeature,
  ProductSpecification,
} from "./ProductPageModernSplit";
import type { FeaturedProduct } from "../home/HomeFeaturedProducts";
import {
  ShoppingCart,
  Heart,
  Star,
  Package,
  Zap,
  Award,
  Shield,
  ChevronRight,
} from "lucide-react";

/**
 * Props for ProductPageTechnical
 */
export interface ProductPageTechnicalProps {
  product?: ProductPageProduct;
  relatedProducts?: FeaturedProduct[];
  showWishlist?: boolean;
  showSocialShare?: boolean;
  onAddToCart?: (
    product: ProductPageProduct,
    selectedOptions?: Record<string, string>,
  ) => void;
  onAddToWishlist?: (product: ProductPageProduct) => void;
  onImageClick?: (imageUrl: string, index: number) => void;
  className?: string;
}

// Default product for preview
const DEFAULT_PRODUCT: ProductPageProduct = {
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
    },
  ],
  description:
    "High-quality wireless headphones with premium sound and comfort",
  longDescription:
    "Experience superior sound quality with our Premium Wireless Headphones. Featuring advanced noise cancellation, 40-hour battery life, and premium comfort padding. Engineered for professionals who demand the best in audio technology.",
  rating: 4.5,
  reviewCount: 128,
  sku: "WH-PRO-2024",
  brand: "TechGear",
  specifications: [
    { label: "Brand", value: "TechGear" },
    { label: "Model", value: "WH-PRO-2024" },
    { label: "Color", value: "Matte Black" },
    { label: "Connectivity", value: "Bluetooth 5.0" },
    { label: "Battery Life", value: "40 hours" },
    { label: "Weight", value: "250g" },
    { label: "Driver Size", value: "40mm" },
    { label: "Impedance", value: "32 Ohm" },
  ],
  features: [
    {
      icon: "package",
      title: "Premium Build",
      description: "Aircraft-grade aluminum and leather padding",
    },
    {
      icon: "zap",
      title: "Fast Charging",
      description: "5 hours playback from 10-minute charge",
    },
    {
      icon: "shield",
      title: "Noise Cancellation",
      description: "Active ANC blocks up to 95% ambient noise",
    },
    {
      icon: "award",
      title: "Hi-Res Audio",
      description: "Support for LDAC, aptX HD codecs",
    },
  ],
};

type TabType = "overview" | "specs" | "features" | "reviews";

const FEATURE_ICON_MAP = {
  package: Package,
  zap: Zap,
  award: Award,
  shield: Shield,
};

/**
 * Product Page Technical Template
 *
 * Specs-first product page for technical/complex products:
 * - Tabbed interface (Overview, Specs, Features, Reviews)
 * - Detailed specifications table
 * - Technical feature breakdown
 * - Compact image gallery
 * - Data-driven layout
 * - Clear information hierarchy
 *
 * Best for: Electronics, technical products, gadgets, appliances
 */
export function ProductPageTechnical({
  product = DEFAULT_PRODUCT,
  relatedProducts,
  showWishlist = true,
  onAddToCart,
  onAddToWishlist,
  onImageClick,
  className = "",
}: ProductPageTechnicalProps) {
  const [selectedImage, setSelectedImage] = useState(0);
  const [activeTab, setActiveTab] = useState<TabType>("overview");

  const images = product.images || [
    { url: product.imageUrl || "", isPrimary: true },
  ];
  const hasDiscount =
    product.discountPrice &&
    typeof product.discountPrice === "number" &&
    product.discountPrice < product.price;
  const discount = hasDiscount
    ? Math.round(
        ((product.price - (product.discountPrice as number)) / product.price) *
          100,
      )
    : 0;

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

  const handleImageClick = (index: number) => {
    setSelectedImage(index);
    if (onImageClick) {
      onImageClick(images[index]?.url || "", index);
    }
  };

  const renderStars = (rating: number = 0) => {
    const stars = [];
    const fullStars = Math.floor(rating);

    for (let i = 0; i < 5; i++) {
      stars.push(
        <Star
          key={i}
          className={`w-4 h-4 ${
            i < fullStars
              ? "fill-blue-600 text-blue-600"
              : "fill-gray-300 text-gray-300"
          }`}
        />,
      );
    }

    return stars;
  };

  return (
    <div className={`product-page-technical bg-gray-50 ${className}`}>
      {/* Header */}
      <div className='bg-white border-b border-gray-200 py-4 px-4 sm:px-6 lg:px-8'>
        <div className='max-w-7xl mx-auto flex items-center gap-2 text-sm text-gray-600'>
          <a href='/' className='hover:text-blue-600'>
            Home
          </a>
          <ChevronRight className='w-4 h-4' />
          <a href='/shop' className='hover:text-blue-600'>
            Shop
          </a>
          <ChevronRight className='w-4 h-4' />
          <span className='text-gray-900 font-medium'>{product.name}</span>
        </div>
      </div>

      {/* Main Product Section */}
      <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8'>
        <div className='bg-white rounded-lg shadow-sm overflow-hidden'>
          <div className='grid lg:grid-cols-5 gap-8 p-6 lg:p-8'>
            {/* Left: Images (2 cols) */}
            <div className='lg:col-span-2 space-y-4'>
              {/* Main Image */}
              <div className='border border-gray-200 rounded-lg overflow-hidden bg-gray-50 aspect-square'>
                <img
                  src={images[selectedImage]?.url || product.imageUrl}
                  alt={product.name}
                  className='w-full h-full object-cover cursor-pointer'
                  onClick={() => handleImageClick(selectedImage)}
                />
              </div>

              {/* Thumbnail Strip */}
              {images.length > 1 && (
                <div className='flex gap-2 overflow-x-auto'>
                  {images.map((img, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleImageClick(idx)}
                      className={`flex-shrink-0 w-20 h-20 border-2 rounded-lg overflow-hidden ${
                        idx === selectedImage
                          ? "border-blue-600"
                          : "border-gray-200 hover:border-gray-400"
                      }`}>
                      <img
                        src={img.url}
                        alt={`View ${idx + 1}`}
                        className='w-full h-full object-cover'
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Right: Product Info (3 cols) */}
            <div className='lg:col-span-3 space-y-6'>
              {/* Header */}
              <div>
                {product.brand && (
                  <p className='text-sm text-blue-600 font-medium mb-2'>
                    {product.brand}
                  </p>
                )}
                <h1 className='text-3xl font-bold text-gray-900 mb-3'>
                  {product.name}
                </h1>

                {/* Rating & SKU */}
                <div className='flex items-center gap-4 text-sm'>
                  {product.rating && (
                    <div className='flex items-center gap-2'>
                      <div className='flex items-center gap-1'>
                        {renderStars(product.rating)}
                      </div>
                      <span className='text-gray-600'>
                        ({product.reviewCount || 0})
                      </span>
                    </div>
                  )}
                  {product.sku && (
                    <span className='text-gray-600'>SKU: {product.sku}</span>
                  )}
                </div>
              </div>

              {/* Price & Stock */}
              <div className='flex items-center justify-between p-4 bg-gray-50 rounded-lg'>
                <div className='flex items-center gap-3'>
                  {hasDiscount ? (
                    <>
                      <span className='text-3xl font-bold text-blue-600'>
                        EGP {(product.discountPrice as number).toFixed(2)}
                      </span>
                      <span className='text-xl text-gray-400 line-through'>
                        EGP {product.price.toFixed(2)}
                      </span>
                      {discount > 0 && (
                        <Badge className='bg-red-600 text-white'>
                          -{discount}%
                        </Badge>
                      )}
                    </>
                  ) : (
                    <span className='text-3xl font-bold text-gray-900'>
                      EGP {product.price.toFixed(2)}
                    </span>
                  )}
                </div>

                {product.available && product.stock && (
                  <div className='text-sm'>
                    <span className='text-green-600 font-medium'>
                      ✓ In Stock
                    </span>
                    <p className='text-gray-600'>
                      {product.stock} units available
                    </p>
                  </div>
                )}
              </div>

              {/* Quick Specs */}
              {product.specifications && product.specifications.length > 0 && (
                <div className='grid grid-cols-2 gap-3'>
                  {product.specifications.slice(0, 4).map((spec, idx) => (
                    <div
                      key={idx}
                      className='border border-gray-200 rounded-lg p-3'>
                      <p className='text-xs text-gray-600 mb-1'>{spec.label}</p>
                      <p className='text-sm font-semibold text-gray-900'>
                        {spec.value}
                      </p>
                    </div>
                  ))}
                </div>
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

              {/* Actions */}
              <div className='flex gap-3 pt-4'>
                <Button
                  size='lg'
                  className='flex-1 bg-blue-600 hover:bg-blue-700 text-white'
                  onClick={handleAddToCart}
                  disabled={!product.available || !allVariantsSelected}>
                  <ShoppingCart className='mr-2 w-5 h-5' />
                  {product.available ? "Add to Cart" : "Out of Stock"}
                </Button>

                {showWishlist && (
                  <Button
                    size='lg'
                    variant='outline'
                    className='border-2'
                    onClick={handleAddToWishlist}>
                    <Heart className='w-5 h-5' />
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Tabs Section */}
          <div className='border-t border-gray-200'>
            {/* Tab Headers */}
            <div className='flex border-b border-gray-200 bg-gray-50'>
              {[
                { id: "overview", label: "Overview" },
                { id: "specs", label: "Specifications" },
                { id: "features", label: "Features" },
                { id: "reviews", label: "Reviews" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as TabType)}
                  className={`px-6 py-4 text-sm font-medium transition-colors ${
                    activeTab === tab.id
                      ? "text-blue-600 border-b-2 border-blue-600 bg-white"
                      : "text-gray-600 hover:text-gray-900"
                  }`}>
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className='p-6 lg:p-8'>
              {/* Overview Tab */}
              {activeTab === "overview" && (
                <div className='space-y-6 max-w-4xl'>
                  <div>
                    <h3 className='text-xl font-semibold text-gray-900 mb-3'>
                      Product Description
                    </h3>
                    <p className='text-gray-700 leading-relaxed mb-4'>
                      {product.description}
                    </p>
                    {product.longDescription && (
                      <p className='text-gray-700 leading-relaxed'>
                        {product.longDescription}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Specifications Tab */}
              {activeTab === "specs" && (
                <div className='max-w-4xl'>
                  <h3 className='text-xl font-semibold text-gray-900 mb-6'>
                    Technical Specifications
                  </h3>
                  {product.specifications &&
                  product.specifications.length > 0 ? (
                    <div className='grid md:grid-cols-2 gap-x-8 gap-y-4'>
                      {product.specifications.map((spec, idx) => (
                        <div
                          key={idx}
                          className='flex justify-between py-3 border-b border-gray-200'>
                          <span className='text-gray-600 font-medium'>
                            {spec.label}
                          </span>
                          <span className='text-gray-900'>{spec.value}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className='text-gray-600'>
                      No specifications available.
                    </p>
                  )}
                </div>
              )}

              {/* Features Tab */}
              {activeTab === "features" && (
                <div className='max-w-4xl'>
                  <h3 className='text-xl font-semibold text-gray-900 mb-6'>
                    Key Features
                  </h3>
                  {product.features && product.features.length > 0 ? (
                    <div className='grid md:grid-cols-2 gap-6'>
                      {product.features.map((feature, idx) => {
                        const IconComponent = FEATURE_ICON_MAP[feature.icon];
                        return (
                          <div
                            key={idx}
                            className='flex gap-4 p-4 border border-gray-200 rounded-lg hover:border-blue-600 transition-colors'>
                            <div className='flex-shrink-0'>
                              <div className='w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center'>
                                <IconComponent className='w-6 h-6 text-blue-600' />
                              </div>
                            </div>
                            <div>
                              <h4 className='text-lg font-semibold text-gray-900 mb-1'>
                                {feature.title}
                              </h4>
                              <p className='text-gray-600 text-sm'>
                                {feature.description}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className='text-gray-600'>No features available.</p>
                  )}
                </div>
              )}

              {/* Reviews Tab */}
              {activeTab === "reviews" && (
                <div className='max-w-4xl'>
                  <div className='text-center py-12'>
                    <Star className='w-16 h-16 text-gray-300 mx-auto mb-4' />
                    <h3 className='text-xl font-semibold text-gray-900 mb-2'>
                      Customer Reviews
                    </h3>
                    <p className='text-gray-600'>
                      {product.reviewCount || 0} reviews for this product
                    </p>
                    <p className='text-sm text-gray-500 mt-2'>
                      Review functionality coming soon
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Related Products */}
        {relatedProducts && relatedProducts.length > 0 && (
          <div className='mt-12'>
            <HomeFeaturedProducts
              title='Related Products'
              products={relatedProducts}
              showViewAllButton={false}
            />
          </div>
        )}
      </div>
    </div>
  );
}

ProductPageTechnical.displayName = "ProductPageTechnical";
