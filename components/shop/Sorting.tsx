/**
 * @legacy
 * Legacy Template System (v1)
 * - Fully preserved for admin preview
 * - Not used in frontend rendering
 * - Used as a design asset library
 */

import { useEffect, useState, useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#root/components/ui/select";
import { Link } from "#root/components/utils/Link";
import { Badge } from "#root/components/ui/badge";
import { useToast } from "#root/components/ui/use-toast";
import { useCart } from "#root/lib/context/CartContext";
import { trpc } from "#root/shared/trpc/client";
import { getProductUrl } from "#root/lib/utils/route-helpers";
import { Loader2, FilterX, SlidersHorizontal } from "lucide-react";
import { ProductCard } from "./ProductCard";
import { Button } from "#root/components/ui/button";
import { Checkbox } from "#root/components/ui/checkbox";
import { formatCategoryName } from "#root/lib/utils";
import TemplateRenderer from "#root/frontend/components/template/TemplateRenderer";
import { useTemplate } from "#root/frontend/contexts/TemplateContext";
import type { SortingTemplateData } from "#root/frontend/components/template/templateRegistry";

// Define product interface to match what is expected by the ProductCard
interface SortableProduct {
  id: string;
  name: string;
  description: string | null;
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
}

interface Category {
  id: string;
  name: string;
  displayName?: string;
  slug?: string;
  imageId?: string | null;
  filename?: string | null;
  type?: string;
  productCount?: number;
}

interface SortingProps {
  categoryId?: string;
  categoryType?: string;
  categories?: Category[];
}

type SortCriteria =
  | "featured"
  | "name-asc"
  | "name-desc"
  | "price-asc"
  | "price-desc"
  | "date-asc"
  | "date-desc";

const Sorting: React.FC<SortingProps> = ({
  categoryId,
  categoryType,
  categories = [],
}: SortingProps) => {
  const [products, setProducts] = useState<SortableProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sortCriteria, setSortCriteria] = useState<SortCriteria>("featured");
  const [selectedPriceRange, setSelectedPriceRange] = useState("all");
  const [showFilters, setShowFilters] = useState(false);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const { toast } = useToast();
  const { getActiveTemplate } = useTemplate();
  const activeTemplate = getActiveTemplate("sorting");

  useEffect(() => {
    setIsLoading(true);
    setProducts([]); // Clear previous products on parameters change

    // If categoryType is specified, fetch products directly using the categoryType parameter
    if (categoryType) {
      trpc.product.search
        .query({
          categoryType,
          limit: 100,
          includeOutOfStock: true,
        })
        .then((res) => {
          if (res.success && res.result) {
            console.log(
              `${categoryType} products with description:`,
              res.result,
            );
            setProducts(
              res.result.items.map((item) => ({
                id: item.id,
                sku: item.id,
                name: item.name,
                description: item.description || "",
                price: Number(item.price),
                discountPrice: item.discountPrice
                  ? Number(item.discountPrice)
                  : null,
                stock: item.stock,
                imageUrl: item.imageUrl
                  ? item.imageUrl.startsWith("http")
                    ? item.imageUrl
                    : item.imageUrl.startsWith("/uploads/")
                      ? item.imageUrl
                      : `/uploads/${item.imageUrl}`
                  : undefined,
                images: item.images,
                categoryName: item.categoryName,
                categories: item.categories,
                available: item.stock > 0,
              })),
            );
          } else if (!res.success) {
            console.error(
              `Failed to fetch ${categoryType} products:`,
              res.error,
            );
            toast({
              title: "Error",
              description: "Failed to fetch products",
              variant: "destructive",
            });
          }
          setIsLoading(false);
        })
        .catch((err) => {
          console.error(
            `Exception while fetching ${categoryType} products:`,
            err,
          );
          setIsLoading(false);
        });
      return;
    }

    // Handle specific category
    if (categoryId) {
      trpc.product.search
        .query({
          categoryIds: [categoryId],
          limit: 100,
          includeOutOfStock: true,
        })
        .then((res) => {
          if (res.success && res.result) {
            console.log("Category search results:", res.result);
            setProducts(
              res.result.items.map((item) => ({
                id: item.id,
                sku: item.id,
                name: item.name,
                description: item.description || "",
                price: Number(item.price),
                discountPrice: item.discountPrice
                  ? Number(item.discountPrice)
                  : null,
                stock: item.stock,
                imageUrl: item.imageUrl
                  ? item.imageUrl.startsWith("http")
                    ? item.imageUrl
                    : item.imageUrl.startsWith("/uploads/")
                      ? item.imageUrl
                      : `/uploads/${item.imageUrl}`
                  : undefined,
                images: item.images,
                categoryName: item.categoryName,
                categories: item.categories,
                available: item.stock > 0,
              })),
            );
          } else if (!res.success) {
            console.error("Failed to fetch category products:", res.error);
            toast({
              title: "Error",
              description: "Failed to fetch products",
              variant: "destructive",
            });
          }
          setIsLoading(false);
        })
        .catch((err) => {
          console.error("Exception while fetching category products:", err);
          setIsLoading(false);
        });
      return;
    }

    // Single-shop mode: No vendor filtering

    // Fetch all products (no vendor filtering in single-shop mode)
    trpc.product.search
      .query({
        limit: 100,
        includeOutOfStock: true,
      })
      .then((res) => {
        if (res.success && res.result) {
          setProducts(
            res.result.items.map((item) => ({
              id: item.id,
              sku: item.id,
              name: item.name,
              description: item.description || "",
              price: Number(item.price),
              discountPrice: item.discountPrice
                ? Number(item.discountPrice)
                : null,
              stock: item.stock,
              imageUrl: item.imageUrl
                ? item.imageUrl.startsWith("http")
                  ? item.imageUrl
                  : item.imageUrl.startsWith("/uploads/")
                    ? item.imageUrl
                    : `/uploads/${item.imageUrl}`
                : undefined,
              images: item.images,
              categoryName: item.categoryName,
              categories: item.categories,
              available: item.stock > 0,
            })),
          );
        } else if (!res.success) {
          console.error("Failed to fetch all products:", res.error);
          toast({
            title: "Error",
            description: "Failed to fetch products",
            variant: "destructive",
          });
        }
        setIsLoading(false);
      })
      .catch((err) => {
        console.error("Exception while fetching all products:", err);
        setIsLoading(false);
      });
  }, [categoryId, categoryType, toast]);

  const toggleCategoryFilter = (categoryId: string) => {
    setSelectedCategories((prev) => {
      if (prev.includes(categoryId)) {
        return prev.filter((id) => id !== categoryId);
      }
      return [...prev, categoryId];
    });
  };

  const resetFilters = () => {
    setSelectedPriceRange("all");
    setSelectedCategories([]);
  };

  const filteredProducts = useMemo(() => {
    let filtered = [...products];

    // Apply category filters if any are selected
    if (selectedCategories.length > 0) {
      filtered = filtered.filter((product) => {
        // Check if the product belongs to any of the selected categories
        if (product.categories && product.categories.length > 0) {
          return product.categories.some((cat) =>
            selectedCategories.includes(cat.id),
          );
        }
        return false;
      });
    }

    // Price range filtering
    if (selectedPriceRange !== "all") {
      const [minStr, maxStr] = selectedPriceRange.split("-");
      const min = Number(minStr);
      const max = Number(maxStr);

      if (!Number.isNaN(min) && !Number.isNaN(max)) {
        filtered = products.filter((product) => {
          const price =
            product.discountPrice !== undefined &&
            product.discountPrice !== null
              ? typeof product.discountPrice === "number"
                ? product.discountPrice
                : Number(product.discountPrice)
              : typeof product.price === "number"
                ? product.price
                : Number(product.price);
          return price >= min && price <= max;
        });
      }
    }

    // Sorting
    switch (sortCriteria) {
      case "featured":
        break;
      case "name-asc":
        filtered.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "name-desc":
        filtered.sort((a, b) => b.name.localeCompare(a.name));
        break;
      case "price-asc":
        filtered.sort((a, b) => {
          const priceA =
            a.discountPrice !== undefined && a.discountPrice !== null
              ? typeof a.discountPrice === "number"
                ? a.discountPrice
                : Number(a.discountPrice) || 0
              : typeof a.price === "number"
                ? a.price
                : Number(a.price) || 0;
          const priceB =
            b.discountPrice !== undefined && b.discountPrice !== null
              ? typeof b.discountPrice === "number"
                ? b.discountPrice
                : Number(b.discountPrice) || 0
              : typeof b.price === "number"
                ? b.price
                : Number(b.price) || 0;
          return priceA - priceB;
        });
        break;
      case "price-desc":
        filtered.sort((a, b) => {
          const priceA =
            a.discountPrice !== undefined && a.discountPrice !== null
              ? typeof a.discountPrice === "number"
                ? a.discountPrice
                : Number(a.discountPrice) || 0
              : typeof a.price === "number"
                ? a.price
                : Number(a.price) || 0;
          const priceB =
            b.discountPrice !== undefined && b.discountPrice !== null
              ? typeof b.discountPrice === "number"
                ? b.discountPrice
                : Number(b.discountPrice) || 0
              : typeof b.price === "number"
                ? b.price
                : Number(b.price) || 0;
          return priceB - priceA;
        });
        break;
      case "date-asc":
        filtered.sort((a, b) => {
          const dateA = a.dateAdded
            ? new Date(a.dateAdded).getTime()
            : Date.now();
          const dateB = b.dateAdded
            ? new Date(b.dateAdded).getTime()
            : Date.now();
          return dateA - dateB;
        });
        break;
      case "date-desc":
        filtered.sort((a, b) => {
          const dateA = a.dateAdded
            ? new Date(a.dateAdded).getTime()
            : Date.now();
          const dateB = b.dateAdded
            ? new Date(b.dateAdded).getTime()
            : Date.now();
          return dateB - dateA;
        });
        break;
    }

    return filtered;
  }, [products, sortCriteria, selectedPriceRange, selectedCategories]);

  // Close the mobile filter modal when the window size changes
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setShowMobileFilters(false);
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleSortChange = (value: string) => {
    setSortCriteria(value as SortCriteria);
  };

  const handlePriceRangeChange = (value: string) => {
    setSelectedPriceRange(value);
  };

  // Prepare template data
  const templateData: SortingTemplateData = {
    products: filteredProducts,
    isLoading,
    showFilters,
    categories,
    selectedCategories,
    toggleCategoryFilter,
    resetFilters,
    sortCriteria,
    handleSortChange,
    selectedPriceRange,
    handlePriceRangeChange,
    showMobileFilters,
    setShowMobileFilters,
  };

  // Use template renderer with the active template
  return (
    <TemplateRenderer
      category='sorting'
      templateId={activeTemplate}
      data={templateData}
    />
  );
};

export default Sorting;
