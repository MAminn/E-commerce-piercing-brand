/**
 * @legacy
 * Legacy Template System (v1)
 * - Fully preserved for admin preview
 * - Not used in frontend rendering
 * - Used as a design asset library
 */

import React, { useState } from "react";
import { Link } from "#root/components/utils/Link";
import { Button } from "#root/components/ui/button";
import { Badge } from "#root/components/ui/badge";
import { Heart, ShoppingCart, Eye, Star } from "lucide-react";
import { useToast } from "#root/components/ui/use-toast";
import { useCart } from "#root/lib/context/CartContext";
import type { ProductCardTemplateData } from "../../templateRegistry";

interface ModernProductCardTemplateProps {
  data?: ProductCardTemplateData;
  onUpdateData?: (updates: Partial<ProductCardTemplateData>) => void;
}

const ModernProductCardTemplate: React.FC<ModernProductCardTemplateProps> = ({
  data,
  onUpdateData,
}) => {
  const { toast } = useToast();
  const { addItem } = useCart();
  const [isHovered, setIsHovered] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  // Use provided data or default values
  const product = data?.product || {
    id: "",
    name: "Product Name",
    price: 0,
    images: [],
    imageUrl: "",
    available: true,
    categoryName: "",
  };
  const showAddToCart = data?.showAddToCart ?? true;
  const showQuickView = data?.showQuickView ?? true;
  const showWishlist = data?.showWishlist ?? true;

  const handleAddToCart = () => {
    if (!product) return;

    addItem(
      {
        id: product.id,
        name: product.name,
        price:
          typeof product.price === "string"
            ? Number.parseFloat(product.price)
            : product.price,
        imageUrl: product.imageUrl || product.images?.[0]?.url || "",
        stock: 10, // Default stock if not provided
        available: product.available,
        categoryId: "",
        categoryName: product.categoryName || "",
      },
      1,
      {},
    );

    toast({
      title: "Added to cart",
      description: `${product.name} has been added to your cart.`,
    });
  };

  const handleQuickView = () => {
    // In a real implementation, this would open a quick view modal
    // For the template, we'll just update the data to simulate this
    onUpdateData?.({ isQuickViewOpen: true });
  };

  const handleToggleWishlist = () => {
    // In a real implementation, this would toggle the wishlist status
    // For the template, we'll just update the data to simulate this
    onUpdateData?.({ isInWishlist: !data?.isInWishlist });
  };

  // Function to cycle through product images on hover
  const cycleImages = React.useCallback(() => {
    if (product.images && product.images.length > 1) {
      const timer = setInterval(() => {
        setCurrentImageIndex((prevIndex) =>
          prevIndex === (product.images?.length ?? 0) - 1 ? 0 : prevIndex + 1,
        );
      }, 2000);

      return () => clearInterval(timer);
    }
  }, [product.images]);

  // Set up image cycling on hover
  React.useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    if (isHovered && product.images && product.images.length > 1) {
      timer = setTimeout(cycleImages, 500) as unknown as ReturnType<
        typeof setTimeout
      >;
    }

    return () => {
      if (timer) clearTimeout(timer);
      setCurrentImageIndex(0);
    };
  }, [isHovered, product.images, cycleImages]);

  // Generate random rating for demo purposes
  const rating = React.useMemo(() => {
    return (Math.floor(Math.random() * 10) + 35) / 10; // Random rating between 3.5 and 5.0
  }, []);

  return (
    <div
      className='group relative bg-white rounded-none border border-gray-200 hover:border-gray-300 transition-all duration-300 overflow-hidden'
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}>
      {/* Product Image */}
      <div className='relative aspect-[4/5] overflow-hidden bg-gray-50'>
        <Link href={`/shop/${product.id}`}>
          <img
            src={
              data?.displayImageUrl ||
              product.imageUrl ||
              "/assets/placeholder-product.png"
            }
            alt={product.name}
            className='w-full h-full object-cover transition-all duration-300 ease-in-out group-hover:scale-102'
            style={{ objectPosition: "center" }}
            loading='lazy'
            onLoad={data?.handleImageLoad}
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.onerror = null;
              target.src = "/assets/placeholder-product.png";
            }}
          />
        </Link>

        {/* Discount badge intentionally hidden — Anchor A brand positioning.
            Pricing logic and discount data are unchanged; only the visual overlay
            is suppressed on the product card. */}
        {/*
          Discount Badge (originally rendered here — kept commented for easy re-enable):

          {product.discountPrice && product.price && (
            <Badge className='absolute top-3 left-3 bg-gray-900 text-white rounded-none px-3 py-1 text-xs font-medium border border-gray-900'>
              {Math.round(
                ((Number.parseFloat(product.price.toString()) -
                  Number.parseFloat(product.discountPrice.toString())) /
                  Number.parseFloat(product.price.toString())) *
                  100,
              )}
              % OFF
            </Badge>
          )}
        */}

        {/* New Badge - Show for products less than 14 days old */}
        {/* {product.dateAdded && 
          new Date(product.dateAdded).getTime() > Date.now() - 14 * 24 * 60 * 60 * 1000 && (
          <Badge className="absolute top-3 right-3 bg-emerald-500 hover:bg-emerald-600 rounded-full px-3 py-1 text-xs font-medium">
            NEW
          </Badge>
        )} */}

        {/* Wishlist Button - Always visible */}
        {/* {showWishlist && (
          <Button
            size="icon"
            variant="ghost"
            className={`absolute top-3 ${product.dateAdded && new Date(product.dateAdded).getTime() > Date.now() - 14 * 24 * 60 * 60 * 1000 ? 'right-16' : 'right-3'} h-8 w-8 rounded-full bg-white/80 hover:bg-white ${
              data?.isInWishlist ? 'text-red-500' : 'text-gray-600'
            }`}
            onClick={handleToggleWishlist}
          >
            <Heart className="h-4 w-4" fill={data?.isInWishlist ? 'currentColor' : 'none'} />
          </Button>
        )} */}

        {/* Action Buttons */}
        <div
          className={`absolute bottom-0 left-0 right-0 flex justify-between items-center p-3 bg-white/95 border-t border-gray-200 transition-all duration-300 ${
            isHovered
              ? "translate-y-0 opacity-100"
              : "translate-y-full opacity-0"
          }`}>
          {showAddToCart && (
            <Button
              size='sm'
              className='bg-gray-900 text-white hover:bg-gray-800 rounded-none px-4 border border-gray-900'
              onClick={handleAddToCart}>
              <ShoppingCart className='h-4 w-4 mr-2' />
              Add to Cart
            </Button>
          )}

          {showQuickView && (
            <Button
              size='icon'
              variant='ghost'
              className='h-8 w-8 rounded-none bg-gray-50 hover:bg-gray-100 text-gray-800 border border-gray-200'
              onClick={handleQuickView}>
              <Eye className='h-4 w-4' />
            </Button>
          )}
        </div>
      </div>

      {/* Product Info */}
      <div className='p-4'>
        {/* Product Name */}
        <Link href={`/product/${product.id}`}>
          <h3 className='font-medium text-gray-900 mb-1.5 line-clamp-2 hover:text-gray-700 transition-colors'>
            {product.name}
          </h3>
        </Link>

        {/* Rating */}
        <div className='flex items-center mb-2'>
          <div className='flex items-center'>
            {[1, 2, 3, 4, 5].map((star) => (
              <Star
                key={star}
                className={`h-3.5 w-3.5 ${
                  star <= Math.floor(rating)
                    ? "text-gray-900 fill-gray-900"
                    : "text-gray-300"
                }`}
              />
            ))}
          </div>
          <span className='text-xs text-gray-600 ml-1 font-light'>
            {rating.toFixed(1)}
          </span>
        </div>

        {/* Price */}
        <div className='flex items-center gap-2'>
          {product.discountPrice ? (
            <>
              <span className='font-medium text-gray-900'>
                {product.discountPrice} EGP
              </span>
              <span className='text-sm text-gray-500 line-through font-light'>
                {product.price} EGP
              </span>
            </>
          ) : (
            <span className='font-medium text-gray-900'>
              {product.price} EGP
            </span>
          )}
        </div>

        {/* Color options placeholder */}
        <div className='mt-3 flex items-center gap-1'>
          <div className='w-4 h-4 rounded-none border border-gray-300 bg-blue-500' />
          <div className='w-4 h-4 rounded-none border border-gray-300 bg-red-500' />
          <div className='w-4 h-4 rounded-none border border-gray-300 bg-green-500' />
        </div>
      </div>
    </div>
  );
};

export default ModernProductCardTemplate;
