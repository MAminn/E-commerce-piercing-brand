/**
 * @legacy
 * Legacy Template System (v1)
 * - Fully preserved for admin preview
 * - Not used in frontend rendering
 * - Used as a design asset library
 */

import type React from "react";
import { useState } from "react";
import { Link } from "#root/components/utils/Link";
import { Button } from "#root/components/ui/button";
import { Badge } from "#root/components/ui/badge";
import { Heart, ShoppingCart, Eye } from "lucide-react";
import { useToast } from "#root/components/ui/use-toast";
import type { ProductCardTemplateData } from "../../templateRegistry";
import { useCart } from "#root/lib/context/CartContext";

interface DefaultProductCardTemplateProps {
  data?: ProductCardTemplateData;
  onUpdateData?: (updates: Partial<ProductCardTemplateData>) => void;
}

const DefaultProductCardTemplate: React.FC<DefaultProductCardTemplateProps> = ({
  data,
  onUpdateData,
}) => {
  const { toast } = useToast();
  const { addItem } = useCart();
  const [isHovered, setIsHovered] = useState(false);

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

  const productLink = `/shop/${product.id}`;

  return (
    <div
      className='group relative bg-white rounded-lg border overflow-hidden transition-all duration-300 hover:shadow-md'
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}>
      {/* Product Image */}
      <div className='relative aspect-square overflow-hidden'>
        <Link href={productLink}>
          <img
            src={
              data?.displayImageUrl ||
              product.images?.[0]?.url ||
              product.imageUrl ||
              "/assets/placeholder-product.png"
            }
            alt={product.name}
            className='w-full h-full object-cover transition-transform duration-500 group-hover:scale-105'
            loading='lazy'
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.onerror = null;
              target.src = "/assets/placeholder-product.png";
            }}
            onLoad={data?.handleImageLoad}
          />
        </Link>

        {/* Discount badge intentionally hidden — Anchor A brand positioning.
            Pricing logic and discount data are unchanged; only the visual overlay
            is suppressed on the product card. */}
        {/*
          Discount Badge (originally rendered here — kept commented for easy re-enable):

          {product.discountPrice && product.price && (
            <Badge className='absolute top-2 left-2 bg-red-500 hover:bg-red-600'>
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

        {/* Action Buttons */}
        <div
          className={`absolute bottom-0 left-0 right-0 flex justify-center gap-2 p-2 bg-white/90 transition-all duration-300 ${
            isHovered
              ? "translate-y-0 opacity-100"
              : "translate-y-full opacity-0"
          }`}>
          {showAddToCart && (
            <Button
              size='sm'
              variant='outline'
              className='flex-1 h-9'
              onClick={handleAddToCart}>
              <ShoppingCart className='h-4 w-4 mr-2' />
              Add
            </Button>
          )}

          {showQuickView && (
            <Button
              size='icon'
              variant='outline'
              className='h-9 w-9'
              onClick={handleQuickView}>
              <Eye className='h-4 w-4' />
            </Button>
          )}

          {showWishlist && (
            <Button
              size='icon'
              variant='outline'
              className={`h-9 w-9 ${
                data?.isInWishlist ? "text-red-500 border-red-500" : ""
              }`}
              onClick={handleToggleWishlist}>
              <Heart
                className='h-4 w-4'
                fill={data?.isInWishlist ? "currentColor" : "none"}
              />
            </Button>
          )}
        </div>
      </div>

      {/* Product Info */}
      <div className='p-4'>
        {/* Product Name */}
        <Link href={productLink}>
          <h3 className='font-medium text-gray-900 mb-1 line-clamp-2 hover:text-primary transition-colors'>
            {product.name}
          </h3>
        </Link>

        {/* Price */}
        <div className='flex items-center gap-2'>
          {product.discountPrice ? (
            <>
              <span className='font-semibold text-primary'>
                {product.discountPrice} EGP
              </span>
              <span className='text-sm text-gray-500 line-through'>
                {product.price} EGP
              </span>
            </>
          ) : (
            <span className='font-semibold text-primary'>
              {product.price} EGP
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default DefaultProductCardTemplate;
