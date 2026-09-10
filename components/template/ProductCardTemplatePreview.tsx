import React, { useState, useEffect } from "react";
import { Card, CardContent } from "#root/components/ui/card";
import TemplateRenderer from "#root/frontend/components/template/TemplateRenderer";
import { cn } from "#root/lib/utils";
import { Button } from "#root/components/ui/button";
import { Eye, RefreshCw } from "lucide-react";

interface ProductCardTemplatePreviewProps {
  templateId: string;
  isActive?: boolean;
  className?: string;
}

/**
 * A specialized preview component for product card templates in the admin dashboard
 * Displays the product card in a more visually appealing way with sample product data
 */
export function ProductCardTemplatePreview({
  templateId,
  isActive,
  className,
}: ProductCardTemplatePreviewProps) {
  // Sample product data for preview with realistic fashion product details
  const sampleProduct = {
    id: "sample-product-1",
    name: "Premium Cotton T-Shirt",
    slug: "premium-cotton-tshirt",
    description:
      "Luxurious cotton t-shirt with a comfortable fit and stylish design",
    price: "EGP 39.99",
    discountPrice: "EGP 29.99",
    imageUrl: "https://placehold.co/400x500/e2e8f0/1e293b?text=Premium+Tee",
    images: [
      {
        url: "https://placehold.co/400x500/e2e8f0/1e293b?text=Premium+Tee",
        isPrimary: true,
      },
      { url: "https://placehold.co/400x500/f8fafc/475569?text=Back+View" },
    ],
    rating: 4.8,
    reviewCount: 42,
    // Required fields for ProductCardTemplateData
    available: true,
    vendorId: "store",
    vendorName: "Our Store",
    categoryName: "Clothing",
    // Additional fields
    isNew: true,
    isFeatured: true,
    isOnSale: true,
  };

  // State for simulating hover and interaction
  const [isHovered, setIsHovered] = useState(false);
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(true);
  const [showHoverState, setShowHoverState] = useState(false);

  // Simulate hover effect for demo purposes
  useEffect(() => {
    if (showHoverState) {
      const interval = setInterval(() => {
        setIsHovered((prev) => !prev);
      }, 2000);
      return () => clearInterval(interval);
    }
    setIsHovered(false);
  }, [showHoverState]);

  // Handle add to cart simulation
  const handleAddToCart = () => {
    setIsAddingToCart(true);
    setTimeout(() => setIsAddingToCart(false), 1000);
  };

  // Template data for the product card that matches ProductCardTemplateData interface
  const templateData = {
    product: {
      id: sampleProduct.id,
      name: sampleProduct.name,
      price: sampleProduct.price,
      discountPrice: sampleProduct.discountPrice,
      imageUrl: sampleProduct.imageUrl,
      images: sampleProduct.images,
      available: sampleProduct.available,
      categoryName: sampleProduct.categoryName,
      vendorId: sampleProduct.vendorId,
      vendorName: sampleProduct.vendorName,
    },
    showVendor: false,
    showAddToCart: true,
    showQuickView: true,
    showWishlist: true,
    isAddingToCart,
    isHovered,
    isInWishlist: false,
    isQuickViewOpen: false,
    setIsHovered,
    setIsAddingToCart,
    imageLoaded,
    setImageLoaded,
  };

  return (
    <div
      className={cn(
        "p-6 bg-gradient-to-br from-gray-50 to-gray-100 rounded-md shadow-inner",
        className,
      )}>
      {/* Decorative elements to make the preview more visually appealing */}
      {/* <div className="relative overflow-hidden pointer-events-none opacity-10">
        <div className="absolute top-0 right-0 w-24 h-24 bg-primary rounded-full -mr-6 -mt-6"></div>
        <div className="absolute bottom-0 left-0 w-16 h-16 bg-secondary rounded-full -ml-4 -mb-4"></div>
      </div> */}

      <div className='flex flex-col items-center relative z-10'>
        {/* Product card preview with proper sizing and realistic environment */}
        <div className='relative'>
          {/* Simulated shopping environment background */}
          <div className='absolute -inset-6 bg-gradient-to-b from-gray-100 to-gray-200 rounded-xl -z-10 opacity-50'></div>

          {/* The actual product card */}
          <div
            className='w-72 transform transition-all duration-300 shadow-lg rounded-lg overflow-hidden'
            style={{
              transform: isHovered ? "scale(1.05)" : "scale(1)",
              boxShadow: isHovered
                ? "0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)"
                : "",
            }}>
            <TemplateRenderer
              category='productCard'
              templateId={templateId}
              data={templateData}
            />
          </div>

          {/* Status indicator */}
          {isActive && (
            <div className='absolute -top-2 -right-2 bg-green-500 text-white text-xs font-bold px-2 py-1 rounded-full shadow-md'>
              Active
            </div>
          )}
        </div>

        {/* Preview controls */}
        <div className='mt-6 flex items-center gap-3'>
          <Button
            size='sm'
            variant={showHoverState ? "primary" : "outline"}
            onClick={() => setShowHoverState(!showHoverState)}
            className='text-xs'>
            <Eye className='w-3.5 h-3.5 mr-1' />
            {showHoverState ? "Disable Hover" : "Enable Hover"}
          </Button>

          <Button
            size='sm'
            variant='outline'
            onClick={() => {
              setIsHovered(true);
              setTimeout(() => setIsHovered(false), 1000);
            }}
            className='text-xs'>
            <RefreshCw className='w-3.5 h-3.5 mr-1' />
            Refresh
          </Button>
        </div>

        {/* Preview label */}
        <div className='mt-3 text-center'>
          <span className='text-xs font-medium text-gray-500 bg-white px-2 py-1 rounded-full shadow-sm border border-gray-200'>
            {isHovered ? "Hover State Active" : "Product Card Preview"}
          </span>
        </div>
      </div>
    </div>
  );
}
