/**
 * @legacy
 * Legacy Template System (v1)
 * - Fully preserved for admin preview
 * - Not used in frontend rendering
 * - Used as a design asset library
 */

import { useState, useEffect, useCallback } from "react";
import type { TRPCClientErrorLike } from "@trpc/client";
import { trpc } from "#root/shared/trpc/client";
import { getCartSessionToken } from "#root/lib/cart-session";
import {
  Loader2,
  ArrowLeft,
  ShoppingCart,
  Store,
  Star,
  StarHalf,
  ChevronRight,
  ChevronLeft,
  ZoomIn,
  Heart,
  Minus,
  Plus,
  Clock,
} from "lucide-react";
import { Button } from "#root/components/ui/button";
import { Badge } from "#root/components/ui/badge";
import { Link } from "#root/components/utils/Link";
import { useToast } from "#root/components/ui/use-toast";
import { useCart } from "#root/lib/context/CartContext";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "#root/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "#root/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "#root/components/ui/form";
import { Input } from "#root/components/ui/input";
import { Textarea } from "#root/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { ProductByIdResult } from "#root/backend/products/get-product-by-id/service";
import { ErrorSection } from "#root/components/dashboard/ErrorSection";
import type { Product as CartProductType } from "#root/lib/mock-data/products";

interface Variant {
  name: string;
  values: string[];
}

interface Product
  extends Omit<ProductByIdResult, "price" | "images" | "imagesCombined"> {
  id: string;
  price: number | string;
  discountPrice: number | null;
  images?: { url: string; isPrimary?: boolean }[];
}

interface Review {
  id: string;
  userName: string;
  rating: number;
  comment: string;
  createdAt: string;
}

interface ReviewStats {
  averageRating: number;
  totalReviews: number;
}

interface ProductDetailProps {
  productId: string;
}

const reviewFormSchema = z.object({
  userName: z.string().min(2, "Name must be at least 2 characters").max(50),
  rating: z.number().min(1).max(5),
  comment: z.string().min(3, "Review must be at least 3 characters").max(500),
});

type ReviewFormValues = z.infer<typeof reviewFormSchema>;

export const ProductDetail = ({ productId }: ProductDetailProps) => {
  const [product, setProduct] = useState<ProductByIdResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [selectedOptions, setSelectedOptions] = useState<
    Record<string, string>
  >({});
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewStats, setReviewStats] = useState<ReviewStats>({
    averageRating: 0,
    totalReviews: 0,
  });
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const { toast } = useToast();
  const { addItem } = useCart();
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isZoomed, setIsZoomed] = useState(false);

  const form = useForm<ReviewFormValues>({
    resolver: zodResolver(reviewFormSchema),
    defaultValues: {
      userName: "",
      rating: 5,
      comment: "",
    },
  });

  useEffect(() => {
    async function fetchProductDetails() {
      if (!productId) {
        setError("Invalid Product ID");
        setLoading(false);
        return;
      }

      console.log(`Fetching details for productId: ${productId}`);
      setLoading(true);
      setError(null);

      try {
        const result = await trpc.product.getById.query({
          productId: productId,
        });

        if (result.success && result.result) {
          console.log("Successfully fetched product details:", result.result);
          const fetchedProductData = result.result;

          setProduct(fetchedProductData);

          if (
            fetchedProductData.variants &&
            fetchedProductData.variants.length > 0
          ) {
            const initialOptions: Record<string, string> = {};
            for (const variant of fetchedProductData.variants) {
              if (variant.values.length > 0 && variant.values[0]) {
                initialOptions[variant.name] = variant.values[0];
              }
            }
            setSelectedOptions(initialOptions);
          }
        } else {
          console.error(
            "Failed to fetch product:",
            result.success === false ? result.error : "No result data"
          );
          // Final simplified error message
          setError("Product not found or could not be loaded.");
          setProduct(null);
        }
      } catch (err) {
        // Type the error
        console.error("Error fetching product:", err);
        // Simplify catch block error message
        setError("An error occurred while loading the product details.");
        setProduct(null);
      } finally {
        setLoading(false);
      }
    }

    async function fetchReviews() {
      if (!productId) return;

      try {
        const result = await trpc.product.getReviews.query({ productId });
        if (result.success) {
          setReviews(
            result.result.reviews.map((review) => ({
              ...review,
              createdAt: review.createdAt.toISOString(),
            }))
          );
          setReviewStats({
            averageRating: result.result.averageRating,
            totalReviews: result.result.totalReviews,
          });
        }
      } catch (err) {
        console.error("Error fetching reviews:", err);
      }
    }

    fetchProductDetails();
    fetchReviews();
  }, [productId]);

  // Abandoned-browse capture — fire-and-forget, must never affect the
  // product page itself. New/separate effect from the fetch above so a
  // capture failure can't touch product-loading state.
  useEffect(() => {
    if (!product) return;
    const imageUrl =
      product.imagesCombined && product.imagesCombined.length > 0
        ? product.imagesCombined.find((img) => img.isPrimary)?.url ||
          product.imagesCombined[0]?.url
        : undefined;
    trpc.cartCapture.recordProductView
      .mutate({
        sessionToken: getCartSessionToken(),
        productId: product.id,
        productName: product.name,
        productImageUrl: imageUrl,
      })
      .catch(() => {});
  }, [product]);

  const handleAddToCart = () => {
    if (!product || !product.available) {
      toast({ title: "Product unavailable", variant: "destructive" });
      return;
    }

    if (quantity > product.stock) {
      toast({
        title: "Out of Stock",
        description: `Only ${product.stock} items available. Please reduce quantity.`,
        variant: "destructive",
      });
      return;
    }

    const variantKey =
      product.variants && product.variants.length > 0
        ? product.variants.map((v) => selectedOptions[v.name] || "").join("-")
        : null;

    if (product.variants && product.variants.length > 0) {
      for (const variant of product.variants) {
        if (!selectedOptions[variant.name]) {
          toast({
            title: "Missing Option",
            description: `Please select an option for ${variant.name}.`,
            variant: "destructive",
          });
          return;
        }
      }
    }

    setIsAddingToCart(true);

    const productDataForCart: CartProductType = {
      id: product.id,
      name: product.name,
      price: product.discountPrice
        ? Number(product.discountPrice)
        : Number(product.price),
      stock: product.stock,
      imageUrl:
        product.imagesCombined && product.imagesCombined.length > 0
          ? product.imagesCombined.find((img) => img.isPrimary)?.url ||
            product.imagesCombined[0]?.url
          : undefined,
      categoryName: product.categoryName || undefined,
    };

    try {
      const success = addItem(productDataForCart, quantity, selectedOptions);

      if (success) {
        toast({
          title: "Added to Cart!",
          description: `${quantity} x ${product.name} ${
            variantKey ? `(${variantKey})` : ""
          } added.`,
        });
      } else {
        toast({
          title: "Could not add to cart",
          description: "Item might be out of stock or quantity unavailable.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error adding item:", error);
      toast({
        title: "Error",
        description: "An unexpected error occurred.",
        variant: "destructive",
      });
    } finally {
      setIsAddingToCart(false);
    }
  };

  const onSubmitReview = async (values: ReviewFormValues) => {
    if (!productId) return;

    setIsSubmittingReview(true);
    try {
      const result = await trpc.product.createReview.mutate({
        productId,
        userName: values.userName,
        rating: values.rating,
        comment: values.comment,
      });

      if (result.success) {
        toast({
          title: "Review submitted",
          description: "Thank you for your feedback!",
        });
        form.reset();

        const reviewsResult = await trpc.product.getReviews.query({
          productId,
        });
        if (reviewsResult.success) {
          setReviews(
            reviewsResult.result.reviews.map((review) => ({
              ...review,
              createdAt: review.createdAt.toISOString(),
            }))
          );
          setReviewStats({
            averageRating: reviewsResult.result.averageRating,
            totalReviews: reviewsResult.result.totalReviews,
          });
        }
      } else {
        toast({
          title: "Error",
          description: result.error || "Failed to submit review",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error submitting review:", error);
      toast({
        title: "Error",
        description: "Failed to submit your review. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const handleOptionChange = (variantName: string, value: string) => {
    setSelectedOptions((prev) => ({
      ...prev,
      [variantName]: value,
    }));
  };

  const handleQuantityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number.parseInt(e.target.value, 10);
    if (!Number.isNaN(value) && value > 0 && value <= (product?.stock || 1)) {
      setQuantity(value);
    }
  };

  const nextImage = useCallback(() => {
    if (!product?.images?.length) return;
    const maxIndex = product.images.length - 1;
    setCurrentImageIndex((current) => (current >= maxIndex ? 0 : current + 1));
  }, [product]);

  const prevImage = useCallback(() => {
    if (!product?.images?.length) return;
    const maxIndex = product.images.length - 1;
    setCurrentImageIndex((current) => (current <= 0 ? maxIndex : current - 1));
  }, [product]);

  useEffect(() => {
    if (product) {
      setCurrentImageIndex(0);
    }
  }, [product]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (product?.images && product.images.length > 1) {
        if (e.key === "ArrowLeft") {
          prevImage();
        } else if (e.key === "ArrowRight") {
          nextImage();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [product, prevImage, nextImage]);

  const toggleZoom = () => {
    setIsZoomed(!isZoomed);
  };

  if (loading) {
    return (
      <div className='container flex items-center justify-center min-h-[60vh]'>
        <Loader2 className='h-10 w-10 animate-spin text-accent-lb' />
        <span className='ml-3'>Loading product...</span>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className='container flex flex-col items-center justify-center min-h-[60vh] py-8'>
        <h2 className='text-2xl font-bold text-red-500 mb-2'>Error</h2>
        <p className='text-gray-600'>{error || "Product not found"}</p>
        <Button
          onClick={() => window.history.back()}
          className='mt-4'
          variant='outline'>
          <ArrowLeft className='mr-2 h-4 w-4' /> Go Back
        </Button>
      </div>
    );
  }

  const renderRatingStars = (rating: number) => {
    const stars = [];
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;

    for (let i = 0; i < fullStars; i++) {
      stars.push(
        <Star
          key={`full-${i}`}
          className='fill-yellow-400 text-yellow-400 h-4 w-4'
        />
      );
    }

    if (hasHalfStar) {
      stars.push(
        <StarHalf
          key='half'
          className='fill-yellow-400 text-yellow-400 h-4 w-4'
        />
      );
    }

    const emptyStars = 5 - stars.length;
    for (let i = 0; i < emptyStars; i++) {
      stars.push(<Star key={`empty-${i}`} className='text-gray-300 h-4 w-4' />);
    }

    return stars;
  };

  const displayImages = product.imagesCombined || [];
  const currentImageUrl =
    displayImages[currentImageIndex]?.url || "/placeholder.svg";

  const selectedVariantKey =
    product?.variants && product.variants.length > 0
      ? product.variants.map((v) => selectedOptions[v.name] || "").join("-")
      : "default";

  if (!product) {
    return <ErrorSection error={error || "Product data is unavailable."} />;
  }

  return (
    <div className='container mx-auto px-4 py-8 max-w-6xl'>
      <div className='flex flex-col md:flex-row gap-8'>
        <div className='md:w-1/2 space-y-4'>
          <div className='mb-6'>
            <div className='relative rounded-lg overflow-hidden bg-gray-100 border border-gray-200'>
              {product.images && product.images.length > 1 && (
                <>
                  <button
                    type='button'
                    onClick={prevImage}
                    className='absolute left-2 top-1/2 transform -translate-y-1/2 p-2 bg-white/80 hover:bg-white rounded-full shadow-md z-20 transition-all'
                    aria-label='Previous image'>
                    <ChevronLeft
                      className='h-6 w-6 text-gray-700'
                      aria-hidden='true'
                    />
                  </button>
                  <button
                    type='button'
                    onClick={nextImage}
                    className='absolute right-2 top-1/2 transform -translate-y-1/2 p-2 bg-white/80 hover:bg-white rounded-full shadow-md z-20 transition-all'
                    aria-label='Next image'>
                    <ChevronRight
                      className='h-6 w-6 text-gray-700'
                      aria-hidden='true'
                    />
                  </button>
                </>
              )}

              <button
                type='button'
                className='w-full aspect-square flex items-center justify-center overflow-hidden cursor-zoom-in bg-transparent border-0 p-0'
                onClick={toggleZoom}
                aria-label='Zoom product image'>
                {product.images && product.images.length > 0 ? (
                  <img
                    src={currentImageUrl}
                    alt={product.name}
                    className={`w-full h-full object-contain transition-transform duration-300 ${
                      isZoomed ? "scale-110" : "scale-100"
                    }`}
                    onError={(e) => {
                      e.currentTarget.src = "/placeholder.jpg";
                      e.currentTarget.onerror = null;
                    }}
                  />
                ) : (
                  <div className='w-full h-64 flex items-center justify-center bg-gray-100'>
                    <ZoomIn className='h-10 w-10 text-gray-400' />
                  </div>
                )}

                {isZoomed && (
                  <div className='absolute inset-0 bg-white/10 backdrop-blur-sm flex items-center justify-center z-10'>
                    <ZoomIn className='text-white h-8 w-8' />
                  </div>
                )}
              </button>
            </div>

            {product.images && product.images.length > 1 && (
              <div className='mt-2 flex justify-center'>
                <span className='text-sm bg-gray-100 px-3 py-1 rounded-full'>
                  {currentImageIndex + 1} / {product.images.length}
                </span>
              </div>
            )}

            {product.images && product.images.length > 1 && (
              <div className='mt-4'>
                <div className='grid grid-cols-5 sm:grid-cols-6 gap-2'>
                  {product.images.map((img, i) => (
                    <button
                      key={`gallery-${img.url}-${i}`}
                      type='button'
                      onClick={() => setCurrentImageIndex(i)}
                      className={`relative rounded border overflow-hidden aspect-square ${
                        i === currentImageIndex
                          ? "border-accent-lb ring-2 ring-accent-lb/30"
                          : "border-gray-200 hover:border-accent-lb/50"
                      }`}>
                      <img
                        src={img.url}
                        alt={`${product.name} - view ${i + 1}`}
                        className='w-full h-full object-cover'
                        onError={(e) => {
                          e.currentTarget.src = "/placeholder.jpg";
                          e.currentTarget.onerror = null;
                        }}
                      />
                      {i === currentImageIndex && (
                        <div className='absolute inset-0 bg-accent-lb/10 border-2 border-accent-lb'></div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className='md:w-1/2 space-y-6'>
          <div>
            <div className='flex flex-wrap gap-1 mb-2'>
              {product.categories && product.categories.length > 0
                ? product.categories.map((cat) => (
                    <Badge
                      key={cat.id}
                      className={
                        cat.id === product.categoryId
                          ? "bg-accent-lb/20 text-accent-lb hover:bg-accent-lb/30"
                          : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                      }>
                      {cat.name}
                    </Badge>
                  ))
                : product.categoryName && (
                    <Badge className='bg-accent-lb/20 text-accent-lb hover:bg-accent-lb/30'>
                      {product.categoryName}
                    </Badge>
                  )}
            </div>
            <h1 className='text-3xl font-bold text-gray-900 mb-2'>
              {product.name}
            </h1>
          </div>

          <div className='flex items-center gap-4'>
            {product.discountPrice ? (
              <div className='flex flex-col'>
                <span className='text-lg text-gray-500 line-through'>
                  {typeof product.price === "number"
                    ? product.price.toFixed(2)
                    : Number.parseFloat(product.price as string).toFixed(
                        2
                      )}{" "}
                  EGP
                </span>
                <span className='text-3xl font-bold text-red-600'>
                  {typeof product.discountPrice === "number"
                    ? product.discountPrice.toFixed(2)
                    : Number.parseFloat(
                        product.discountPrice as string
                      ).toFixed(2)}{" "}
                  EGP
                </span>
              </div>
            ) : (
              <span className='text-3xl font-bold text-gray-900'>
                {typeof product.price === "number"
                  ? product.price.toFixed(2)
                  : Number.parseFloat(product.price as string).toFixed(2)}{" "}
                EGP
              </span>
            )}

            {product.stock <= 10 && product.stock > 0 && (
              <span className='text-orange-500 text-sm'>
                Only {product.stock} left
              </span>
            )}
            {product.stock <= 0 && (
              <Badge
                variant='outline'
                className='text-gray-500 border-gray-300'>
                Out of Stock
              </Badge>
            )}
          </div>

          {product.rating !== undefined && product.rating > 0 ? (
            <div className='flex items-center gap-1'>
              {renderRatingStars(product.rating)}
              <span className='text-sm text-gray-600'>
                ({product.reviewCount ?? 0} reviews)
              </span>
            </div>
          ) : (
            <span className='text-sm text-gray-500'>No reviews yet</span>
          )}

          <div className='prose prose-sm max-w-none text-gray-600'>
            <p>{product.description || "No description available."}</p>
          </div>

          {product.variants && product.variants.length > 0 && (
            <div className='space-y-4'>
              {product.variants.map((variant: Variant) => (
                <div key={variant.name}>
                  <h3 className='text-sm font-medium text-gray-900 mb-2'>
                    {variant.name}
                  </h3>
                  <div className='flex flex-wrap gap-2'>
                    {variant.values.map((value: string) => (
                      <button
                        key={value}
                        type='button'
                        onClick={() => handleOptionChange(variant.name, value)}
                        className={`px-3 py-1 border rounded-md text-sm font-medium transition-all
                          ${
                            selectedOptions[variant.name] === value
                              ? "bg-accent-lb text-white border-accent-lb"
                              : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                          }`}>
                        {value}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className='pt-4 flex flex-col sm:flex-row items-center gap-4'>
            <div className='w-full sm:w-auto'>
              <label htmlFor='quantity' className='sr-only'>
                Quantity
              </label>
              <div className='flex border border-gray-300 rounded-md w-full'>
                <button
                  type='button'
                  className='px-3 py-2 text-gray-600 hover:bg-gray-100 focus:outline-none'
                  onClick={() => quantity > 1 && setQuantity(quantity - 1)}>
                  -
                </button>
                <input
                  type='number'
                  id='quantity'
                  name='quantity'
                  min='1'
                  max={product.stock || 1}
                  className='flex-1 text-center border-x border-gray-300 focus:outline-none'
                  value={quantity}
                  onChange={handleQuantityChange}
                />
                <button
                  type='button'
                  className='px-3 py-2 text-gray-600 hover:bg-gray-100 focus:outline-none'
                  onClick={() =>
                    quantity < (product?.stock || 1) &&
                    setQuantity(quantity + 1)
                  }>
                  +
                </button>
              </div>
            </div>

            <Button
              onClick={handleAddToCart}
              disabled={isAddingToCart || product.stock <= 0}
              className='w-full sm:w-auto bg-accent-lb hover:bg-[#021E43] transition-colors min-w-[180px]'
              size='lg'>
              <ShoppingCart className='h-5 w-5 mr-2' />
              {isAddingToCart ? "Adding..." : "Add to Cart"}
            </Button>
          </div>

          <div className='border-t border-gray-200 pt-6 mt-6'>
            <dl className='grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2'>
              {product.stock !== undefined && (
                <div className='border-b border-gray-200 pb-3'>
                  <dt className='text-sm font-medium text-gray-500'>
                    Availability
                  </dt>
                  <dd className='mt-1 text-sm text-gray-900'>
                    {product.stock > 0
                      ? `In stock (${product.stock})`
                      : "Out of stock"}
                  </dd>
                </div>
              )}
              {product.categoryName && (
                <div className='border-b border-gray-200 pb-3'>
                  <dt className='text-sm font-medium text-gray-500'>
                    Categories
                  </dt>
                  <dd className='mt-1 text-sm text-gray-900'>
                    <div className='flex flex-col gap-1'>
                      {product.categories && product.categories.length > 0 ? (
                        product.categories.map((cat) => (
                          <span
                            key={cat.id}
                            className={
                              cat.id === product.categoryId
                                ? "font-medium"
                                : "text-gray-600"
                            }>
                            {cat.name}
                          </span>
                        ))
                      ) : (
                        <span>{product.categoryName}</span>
                      )}
                    </div>
                  </dd>
                </div>
              )}
            </dl>
          </div>
        </div>
      </div>

      <div className='mt-12'>
        <Tabs defaultValue='reviews' className='w-full '>
          <TabsList className='w-full justify-start mb-6 bg-transparent border-b'>
            <TabsTrigger value='reviews' className='text-lg'>
              Reviews ({reviewStats.totalReviews})
            </TabsTrigger>
          </TabsList>
          <TabsContent value='reviews' className='pt-4'>
            <div className='grid grid-cols-1 md:grid-cols-3 gap-6'>
              <div className='md:col-span-1'>
                <Card className='border-accent-lb/20 px-4'>
                  <CardHeader>
                    <CardTitle>Write a Review</CardTitle>
                    <CardDescription>
                      Share your thoughts about this product
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Form {...form}>
                      <form
                        onSubmit={form.handleSubmit(onSubmitReview)}
                        className='space-y-4'>
                        <FormField
                          control={form.control}
                          name='userName'
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Your Name</FormLabel>
                              <FormControl>
                                <Input
                                  placeholder='Enter your name'
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name='rating'
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Rating</FormLabel>
                              <FormControl>
                                <div className='flex gap-2'>
                                  {[1, 2, 3, 4, 5].map((star) => (
                                    <Button
                                      key={star}
                                      type='button'
                                      variant='outline'
                                      size='sm'
                                      onClick={() => field.onChange(star)}
                                      className={
                                        field.value >= star
                                          ? "bg-yellow-400 border-yellow-400 hover:bg-yellow-500 hover:border-yellow-500"
                                          : ""
                                      }>
                                      <Star
                                        className={
                                          field.value >= star
                                            ? "fill-white text-white"
                                            : "text-gray-300"
                                        }
                                      />
                                    </Button>
                                  ))}
                                </div>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name='comment'
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Your Review</FormLabel>
                              <FormControl>
                                <Textarea
                                  placeholder='Share your experience with this product'
                                  className='min-h-[100px]'
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <Button
                          type='submit'
                          className='w-full bg-accent-lb hover:bg-accent-db'
                          disabled={isSubmittingReview}>
                          {isSubmittingReview
                            ? "Submitting..."
                            : "Submit Review"}
                        </Button>
                      </form>
                    </Form>
                  </CardContent>
                </Card>
              </div>

              <div className='md:col-span-2'>
                {reviews.length === 0 ? (
                  <div className='text-center py-12 bg-gray-50 rounded-lg'>
                    <h3 className='text-xl font-semibold mb-2'>
                      No Reviews Yet
                    </h3>
                    <p className='text-gray-500 mb-4'>
                      Be the first to review this product
                    </p>
                  </div>
                ) : (
                  <div className='space-y-6'>
                    {reviews.map((review) => (
                      <Card key={review.id} className='border-gray-200 px-4'>
                        <CardHeader className='pb-2'>
                          <div className='flex justify-between items-center'>
                            <CardTitle className='text-lg font-semibold'>
                              {review.userName}
                            </CardTitle>
                            <div className='flex'>
                              {renderRatingStars(review.rating)}
                            </div>
                          </div>
                          <CardDescription className='text-xs'>
                            {new Date(review.createdAt).toLocaleDateString()}
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <p className='text-gray-700'>{review.comment}</p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};
