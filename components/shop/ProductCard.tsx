/**
 * @legacy
 * Legacy Template System (v1)
 * - Fully preserved for admin preview
 * - Not used in frontend rendering
 * - Used as a design asset library
 */

import { useState, useMemo, memo } from "react";
import { Link } from "#root/components/utils/Link";
import { Button } from "#root/components/ui/button";
import { Badge } from "#root/components/ui/badge";
import { ShoppingCart, Store, Eye } from "lucide-react";
import { useToast } from "#root/components/ui/use-toast";
import { useCart } from "#root/lib/context/CartContext";
import { getProductUrl } from "#root/lib/utils/route-helpers";
import TemplateRenderer from "#root/frontend/components/template/TemplateRenderer";
import { useTemplate } from "#root/frontend/contexts/TemplateContext";
import type { ProductCardTemplateData } from "#root/frontend/components/template/templateRegistry";

// Extend the ProductCardTemplateData interface to include all the properties we need
declare module "#root/frontend/components/template/templateRegistry" {
  interface ProductCardTemplateData {
    setIsAddingToCart?: (isAdding: boolean) => void;
    setIsHovered?: (isHovered: boolean) => void;
    imageLoaded?: boolean;
    setImageLoaded?: (loaded: boolean) => void;
    handleAddToCart?: (e: React.MouseEvent) => void;
    getDisplayImageUrl?: () => string;
    formattedPrice?: string;
    hasImage?: boolean;
    displayImageUrl?: string;
    handleImageLoad?: () => void;
  }
}

interface ProductImage {
  url: string;
  isPrimary?: boolean;
}

interface Product {
  id: string;
  slug?: string | null;
  name: string;
  price: number | string;
  discountPrice?: number | string | null;
  imageUrl?: string | null;
  images?: ProductImage[];
  available: boolean;
  categoryName?: string | null;
  categories?: { id: string; name: string }[];
}

interface ProductCardProps {
  product: Product;
  showVendor?: boolean;
  showImage?: boolean;
  imageSize?: "small" | "medium" | "large";
  className?: string;
}

// Memoize the entire component for better performance
export const ProductCard = memo(
  ({
    product,
    showVendor = false,
    showImage = true,
    imageSize = "medium",
    className = "",
  }: ProductCardProps) => {
    const [isAddingToCart, setIsAddingToCart] = useState(false);
    const [isHovered, setIsHovered] = useState(false);
    const [imageLoaded, setImageLoaded] = useState(false);
    const { toast } = useToast();
    const { addItem } = useCart();
    const { getActiveTemplate } = useTemplate();
    const activeTemplate = getActiveTemplate("productCard");

    // Memoize the add to cart handler to prevent unnecessary re-renders
    const handleAddToCart = useMemo(
      () => (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (!product.available) return;

        setIsAddingToCart(true);
        try {
          addItem(
            {
              id: product.id,
              name: product.name,
              price:
                product.discountPrice !== undefined &&
                product.discountPrice !== null &&
                product.discountPrice !== ""
                  ? typeof product.discountPrice === "number"
                    ? product.discountPrice
                    : Number(product.discountPrice)
                  : typeof product.price === "number"
                  ? product.price
                  : Number(product.price),
              imageUrl: getDisplayImageUrl(),
              stock: 100, // Assuming available products have stock
            },
            1, // quantity
            {} // selectedOptions
          );
        } catch (error) {
          console.error("Error adding to cart:", error);
          toast({
            title: "Error",
            description: "Failed to add item to cart. Please try again.",
            variant: "destructive",
          });
        } finally {
          setIsAddingToCart(false);
        }
      },
      [product, addItem, toast]
    );

    // Memoize image URL calculation
    const getDisplayImageUrl = useMemo(
      () => (): string => {
        // If we have multiple images, find the primary one or use the first
        if (product.images && product.images.length > 0) {
          const primaryImage = product.images.find((img) => img.isPrimary);
          const imageToUse = primaryImage || product.images[0];

          if (imageToUse?.url) {
            if (imageToUse.url.startsWith("http")) {
              return imageToUse.url;
            }

            if (imageToUse.url.startsWith("/uploads/")) {
              return imageToUse.url;
            }

            if (imageToUse.url.startsWith("/assets/")) {
              return imageToUse.url;
            }

            return `/uploads/${imageToUse.url}`;
          }
        }

        // Fallback to legacy imageUrl if available
        if (product.imageUrl) {
          if (product.imageUrl.startsWith("http")) {
            return product.imageUrl;
          }

          if (product.imageUrl.startsWith("/uploads/")) {
            return product.imageUrl;
          }

          if (product.imageUrl.startsWith("/assets/")) {
            return product.imageUrl;
          }

          return `/uploads/${product.imageUrl}`;
        }

        // Default placeholder
        return "/assets/placeholder-product.png";
      },
      [product.images, product.imageUrl]
    );

    // Memoize expensive calculations
    const formattedPrice = useMemo(
      () =>
        typeof product.price === "number"
          ? product.price.toFixed(2)
          : Number(product.price).toFixed(2),
      [product.price]
    );

    const hasImage = useMemo(
      () => !!(product.images?.length || product.imageUrl),
      [product.images, product.imageUrl]
    );
    const displayImageUrl = useMemo(
      () => getDisplayImageUrl(),
      [getDisplayImageUrl]
    );

    // Handle image load event
    const handleImageLoad = () => {
      setImageLoaded(true);
    };

    // Prepare template data
    const templateData: ProductCardTemplateData = {
      product,
      showVendor,
      isAddingToCart,
      setIsAddingToCart,
      isHovered,
      setIsHovered,
      imageLoaded,
      setImageLoaded,
      handleAddToCart,
      getDisplayImageUrl,
      formattedPrice,
      hasImage,
      displayImageUrl,
      handleImageLoad,
    };

    // Use template renderer with the active template
    return (
      <TemplateRenderer
        category='productCard'
        templateId={activeTemplate}
        data={templateData}
      />
    );
  }
);

ProductCard.displayName = "ProductCard";

ProductCard.displayName = "ProductCard";
