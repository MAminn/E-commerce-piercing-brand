import type React from "react";
import { useState } from "react";
import { VariantSelector } from "#root/components/shop/VariantSelector";
import { Button } from "#root/components/ui/button";
import { Badge } from "#root/components/ui/badge";
import { Separator } from "#root/components/ui/separator";
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
  Truck,
  Shield,
  RotateCcw,
  CheckCircle,
  Package,
  Zap,
  Award,
  Minus,
  Plus,
} from "lucide-react";

/**
 * Props for ProductPageClassic
 */
export interface ProductPageClassicProps {
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
    {
      url: "https://images.unsplash.com/photo-1487215078519-e21cc028cb29?w=800",
    },
  ],
  description:
    "High-quality wireless headphones with premium sound and comfort",
  longDescription:
    "Experience superior sound quality with our Premium Wireless Headphones. Featuring advanced noise cancellation, 40-hour battery life, and premium comfort padding.",
  rating: 4.5,
  reviewCount: 128,
  sku: "WH-PRO-2024",
  brand: "TechGear",
  specifications: [
    { label: "Brand", value: "TechGear" },
    { label: "Model", value: "WH-PRO-2024" },
    { label: "Connectivity", value: "Bluetooth 5.0" },
    { label: "Battery Life", value: "40 hours" },
  ],
};

const FEATURE_ICON_MAP = {
  package: Package,
  zap: Zap,
  award: Award,
  shield: Shield,
};

/**
 * Product Page Classic Template
 *
 * Conversion-focused traditional eCommerce product page featuring:
 * - Clear pricing and prominent CTA
 * - Trust signals and security badges
 * - Traditional left-image, right-info layout
 * - Stock availability and shipping info
 * - Star ratings and review count
 * - Simple quantity selector
 *
 * Best for: General retail, conversion-focused stores, traditional eCommerce
 */
export function ProductPageClassic({
  product = DEFAULT_PRODUCT,
  relatedProducts,
  showWishlist = true,
  onAddToCart,
  onAddToWishlist,
  onImageClick,
  className = "",
}: ProductPageClassicProps) {
  const [selectedImage, setSelectedImage] = useState(0);
  const [quantity, setQuantity] = useState(1);

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
    const hasHalfStar = rating % 1 >= 0.5;

    for (let i = 0; i < 5; i++) {
      stars.push(
        <Star
          key={i}
          className={`w-4 h-4 ${
            i < fullStars
              ? "fill-yellow-400 text-yellow-400"
              : "fill-gray-200 text-gray-200"
          }`}
        />,
      );
    }

    return stars;
  };

  return (
    <div className={`product-page-classic bg-white ${className}`}>
      {/* Breadcrumb */}
      <div className='border-b border-gray-200 bg-gray-50 py-3 px-4 sm:px-6 lg:px-8'>
        <div className='max-w-7xl mx-auto'>
          <nav className='text-sm text-gray-600'>
            <a href='/' className='hover:text-gray-900'>
              Home
            </a>
            <span className='mx-2'>/</span>
            <a href='/shop' className='hover:text-gray-900'>
              Shop
            </a>
            <span className='mx-2'>/</span>
            <span className='text-gray-900'>{product.name}</span>
          </nav>
        </div>
      </div>

      {/* Main Product Section */}
      <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12'>
        <div className='grid lg:grid-cols-2 gap-8 lg:gap-12'>
          {/* Left: Image Gallery */}
          <div className='space-y-4'>
            {/* Main Image */}
            <div className='border border-gray-200 rounded-lg overflow-hidden bg-gray-50 aspect-square'>
              <img
                src={images[selectedImage]?.url || product.imageUrl}
                alt={product.name}
                className='w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform duration-300'
                onClick={() => handleImageClick(selectedImage)}
              />
            </div>

            {/* Thumbnail Gallery */}
            {images.length > 1 && (
              <div className='grid grid-cols-4 gap-3'>
                {images.map((img, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleImageClick(idx)}
                    className={`border-2 rounded-lg overflow-hidden aspect-square ${
                      idx === selectedImage
                        ? "border-blue-600"
                        : "border-gray-200 hover:border-gray-400"
                    }`}>
                    <img
                      src={img.url}
                      alt={`${product.name} view ${idx + 1}`}
                      className='w-full h-full object-cover'
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right: Product Info */}
          <div className='space-y-6'>
            {/* Brand & SKU */}
            {(product.brand || product.sku) && (
              <div className='flex items-center gap-3 text-sm text-gray-600'>
                {product.brand && (
                  <span className='font-medium'>Brand: {product.brand}</span>
                )}
                {product.sku && <span>SKU: {product.sku}</span>}
              </div>
            )}

            {/* Product Name */}
            <div>
              <h1 className='text-3xl lg:text-4xl font-bold text-gray-900 mb-2'>
                {product.name}
              </h1>

              {/* Rating & Reviews */}
              {product.rating && (
                <div className='flex items-center gap-2'>
                  <div className='flex items-center gap-1'>
                    {renderStars(product.rating)}
                  </div>
                  <span className='text-sm text-gray-600'>
                    {product.rating} ({product.reviewCount || 0} reviews)
                  </span>
                </div>
              )}
            </div>

            {/* Price */}
            <div className='bg-gray-50 border border-gray-200 rounded-lg p-4'>
              <div className='flex items-center gap-3'>
                {hasDiscount ? (
                  <>
                    <span className='text-4xl font-bold text-blue-600'>
                      EGP {(product.discountPrice as number).toFixed(2)}
                    </span>
                    <span className='text-2xl text-gray-400 line-through'>
                      EGP {product.price.toFixed(2)}
                    </span>
                    <Badge className='bg-red-600 text-white hover:bg-red-700'>
                      -{discount}%
                    </Badge>
                  </>
                ) : (
                  <span className='text-4xl font-bold text-gray-900'>
                    EGP {product.price.toFixed(2)}
                  </span>
                )}
              </div>

              {/* Stock Status */}
              <div className='mt-3 flex items-center gap-2 text-sm'>
                {product.available && product.stock ? (
                  <>
                    <CheckCircle className='w-4 h-4 text-green-600' />
                    <span className='text-green-700 font-medium'>
                      In Stock ({product.stock} available)
                    </span>
                  </>
                ) : (
                  <span className='text-red-600 font-medium'>Out of Stock</span>
                )}
              </div>
            </div>

            {/* Description */}
            {product.description && (
              <div className='text-gray-700 leading-relaxed'>
                {product.description}
              </div>
            )}

            {/* Quantity Selector */}
            <div className='flex items-center gap-4'>
              <span className='text-sm font-medium text-gray-700'>
                Quantity:
              </span>
              <div className='flex items-center border border-gray-300 rounded-lg'>
                <button
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className='p-2 hover:bg-gray-100'
                  disabled={quantity <= 1}>
                  <Minus className='w-4 h-4' />
                </button>
                <span className='px-6 py-2 border-x border-gray-300 min-w-[60px] text-center'>
                  {quantity}
                </span>
                <button
                  onClick={() => setQuantity(quantity + 1)}
                  className='p-2 hover:bg-gray-100'
                  disabled={
                    !product.available || quantity >= (product.stock || 0)
                  }>
                  <Plus className='w-4 h-4' />
                </button>
              </div>
            </div>

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

            {/* Action Buttons */}
            <div className='flex gap-3'>
              <Button
                size='lg'
                className='flex-1 bg-blue-600 hover:bg-blue-700 text-white h-14 text-lg'
                onClick={handleAddToCart}
                disabled={!product.available || !allVariantsSelected}>
                <ShoppingCart className='mr-2 w-5 h-5' />
                Add to Cart
              </Button>

              {showWishlist && (
                <Button
                  size='lg'
                  variant='outline'
                  className='border-2 border-gray-300 hover:border-blue-600 hover:text-blue-600 h-14'
                  onClick={handleAddToWishlist}>
                  <Heart className='w-5 h-5' />
                </Button>
              )}
            </div>

            {/* Trust Signals */}
            <div className='grid grid-cols-3 gap-4 pt-4 border-t border-gray-200'>
              <div className='text-center'>
                <Truck className='w-6 h-6 text-blue-600 mx-auto mb-2' />
                <p className='text-xs text-gray-600'>Free Shipping</p>
              </div>
              <div className='text-center'>
                <Shield className='w-6 h-6 text-blue-600 mx-auto mb-2' />
                <p className='text-xs text-gray-600'>Secure Payment</p>
              </div>
              <div className='text-center'>
                <RotateCcw className='w-6 h-6 text-blue-600 mx-auto mb-2' />
                <p className='text-xs text-gray-600'>Easy Returns</p>
              </div>
            </div>
          </div>
        </div>

        {/* Product Details Section */}
        <div className='mt-12 lg:mt-16'>
          <div className='border-b border-gray-200'>
            <h2 className='text-2xl font-bold text-gray-900 pb-4'>
              Product Details
            </h2>
          </div>

          <div className='grid md:grid-cols-2 gap-8 mt-8'>
            {/* Description */}
            {product.longDescription && (
              <div>
                <h3 className='text-lg font-semibold text-gray-900 mb-3'>
                  Description
                </h3>
                <p className='text-gray-700 leading-relaxed'>
                  {product.longDescription}
                </p>
              </div>
            )}

            {/* Specifications */}
            {product.specifications && product.specifications.length > 0 && (
              <div>
                <h3 className='text-lg font-semibold text-gray-900 mb-3'>
                  Specifications
                </h3>
                <div className='space-y-2'>
                  {product.specifications.map((spec, idx) => (
                    <div
                      key={idx}
                      className='flex justify-between py-2 border-b border-gray-200 last:border-0'>
                      <span className='text-gray-600'>{spec.label}</span>
                      <span className='text-gray-900 font-medium'>
                        {spec.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Related Products */}
        {relatedProducts && relatedProducts.length > 0 && (
          <div className='mt-16'>
            <HomeFeaturedProducts
              title='You May Also Like'
              products={relatedProducts}
              showViewAllButton={false}
            />
          </div>
        )}
      </div>
    </div>
  );
}

ProductPageClassic.displayName = "ProductPageClassic";
