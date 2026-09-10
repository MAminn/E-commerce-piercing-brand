/**
 * @legacy
 * Legacy Template System (v1)
 * - Fully preserved for admin preview
 * - Not used in frontend rendering
 * - Used as a design asset library
 */

import type React from "react";
import { useState } from "react";
import {
  Star,
  Heart,
  ShoppingCart,
  Minus,
  Plus,
  Truck,
  Shield,
  RotateCcw,
} from "lucide-react";
import type { ProductTemplateData } from "../../templateRegistry";
import { useCart } from "#root/lib/context/CartContext";
import { trpc } from "#root/shared/trpc/client";
import { Button } from "#root/components/ui/button";
import { Input } from "#root/components/ui/input";
import { Textarea } from "#root/components/ui/textarea";
import { useToast } from "#root/components/ui/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "#root/components/ui/form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#root/components/ui/card";

interface DefaultProductTemplateProps {
  data: ProductTemplateData;
  onUpdateData?: (updates: Partial<ProductTemplateData>) => void;
}

const reviewFormSchema = z.object({
  userName: z.string().min(2, "Name must be at least 2 characters").max(50),
  rating: z.number().min(1).max(5),
  comment: z.string().min(3, "Review must be at least 3 characters").max(500),
});

type ReviewFormValues = z.infer<typeof reviewFormSchema>;

const DefaultProductTemplate: React.FC<DefaultProductTemplateProps> = ({
  data,
  onUpdateData,
}) => {
  const { addItem } = useCart();
  const { toast } = useToast();
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  const form = useForm<ReviewFormValues>({
    resolver: zodResolver(reviewFormSchema),
    defaultValues: {
      userName: "",
      rating: 5,
      comment: "",
    },
  });

  // Use provided data or fallback to empty state
  const templateData = data || {
    product: {
      id: "",
      name: "",
      description: "",
      price: 0,
      discountPrice: null,
      images: [],
      stock: 0,
      available: false,
      categoryId: "",
      categoryName: "",
      variants: [],
      specifications: {},
      features: [],
    },
    reviews: [],
    reviewStats: { averageRating: 0, totalReviews: 0 },
    relatedProducts: [],
    selectedOptions: {},
    quantity: 1,
    currentImageIndex: 0,
    isZoomed: false,
    isAddingToCart: false,
    isSubmittingReview: false,
    isLoading: false,
    error: null,
  };

  const updateLocalData = (updates: Partial<ProductTemplateData>) => {
    onUpdateData?.(updates);
  };

  const handleQuantityChange = (newQuantity: number) => {
    if (newQuantity >= 1 && newQuantity <= templateData.product.stock) {
      updateLocalData({ quantity: newQuantity });
    }
  };

  const handleOptionChange = (optionName: string, value: string) => {
    updateLocalData({
      selectedOptions: {
        ...templateData.selectedOptions,
        [optionName]: value,
      },
    });
  };

  const handleImageChange = (index: number) => {
    updateLocalData({ currentImageIndex: index });
  };

  const handleAddToCart = async () => {
    updateLocalData({ isAddingToCart: true });
    try {
      const success = addItem(
        {
          id: templateData.product.id,
          name: templateData.product.name,
          price:
            typeof templateData.product.price === "string"
              ? Number.parseFloat(templateData.product.price)
              : templateData.product.price,
          stock: templateData.product.stock,
          categoryName: templateData.product.categoryName,
          variants: templateData.product.variants,
          imageUrl:
            templateData.product.images &&
            templateData.product.images.length > 0
              ? templateData.product.images.find((img) => img.isPrimary)?.url ||
                templateData.product.images[0]?.url
              : undefined,
        },
        templateData.quantity,
        templateData.selectedOptions,
      );

      if (!success) {
        console.error(
          "Failed to add to cart: insufficient stock or invalid quantity",
        );
      }
    } catch (error) {
      console.error("Failed to add to cart:", error);
    } finally {
      updateLocalData({ isAddingToCart: false });
    }
  };

  const handleWishlistToggle = () => {
    // For now, just show an alert - this would typically integrate with a wishlist service
    alert("Wishlist functionality coming soon!");
  };

  const currentImage =
    templateData.product.images?.[templateData.currentImageIndex]?.url ||
    "/placeholder-product.jpg";
  const price =
    typeof templateData.product.price === "string"
      ? Number.parseFloat(templateData.product.price)
      : templateData.product.price;
  const discountPrice = templateData.product.discountPrice;

  if (templateData.isLoading) {
    return (
      <div className='flex justify-center items-center min-h-screen'>
        <div className='animate-spin rounded-full h-32 w-32 border-b-2 border-gray-900'></div>
      </div>
    );
  }

  if (templateData.error) {
    return (
      <div className='flex justify-center items-center min-h-screen'>
        <div className='text-center'>
          <h2 className='text-2xl font-bold text-gray-900 mb-4'>
            Product Not Found
          </h2>
          <p className='text-gray-600'>{templateData.error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8'>
      <div className='grid grid-cols-1 lg:grid-cols-2 gap-8'>
        {/* Product Images */}
        <div className='space-y-4'>
          <div className='aspect-square bg-gray-100 rounded-lg overflow-hidden'>
            <img
              src={currentImage}
              alt={templateData.product.name}
              className='w-full h-full object-cover'
            />
          </div>
          {templateData.product.images &&
            templateData.product.images.length > 1 && (
              <div className='grid grid-cols-4 gap-2'>
                {templateData.product.images.map((image, index) => (
                  <button
                    type='button'
                    onClick={() => handleImageChange(index)}
                    key={image.url}
                    className={`aspect-square bg-gray-100 rounded-lg overflow-hidden border-2 ${
                      index === templateData.currentImageIndex
                        ? "border-blue-500"
                        : "border-transparent"
                    }`}>
                    <img
                      src={image.url}
                      alt={`${templateData.product.name} ${index + 1}`}
                      className='w-full h-full object-cover'
                    />
                  </button>
                ))}
              </div>
            )}
        </div>

        {/* Product Details */}
        <div className='space-y-6'>
          <div>
            <h1 className='text-3xl font-bold text-gray-900'>
              {templateData.product.name}
            </h1>
            <p className='text-sm text-gray-500 mt-1'>
              {templateData.product.categoryName}
            </p>
          </div>

          {/* Price */}
          <div className='flex items-center space-x-2'>
            {discountPrice ? (
              <>
                <span className='text-3xl font-bold text-red-600'>
                  EGP {discountPrice}
                </span>
                <span className='text-xl text-gray-500 line-through'>
                  EGP {price}
                </span>
                <span className='bg-red-100 text-red-800 text-sm font-medium px-2 py-1 rounded'>
                  {Math.round(((price - discountPrice) / price) * 100)}% OFF
                </span>
              </>
            ) : (
              <span className='text-3xl font-bold text-gray-900'>
                EGP {price}
              </span>
            )}
          </div>

          {/* Reviews */}
          <div className='flex items-center space-x-2'>
            <div className='flex items-center'>
              {[...Array(5)].map((_, i) => (
                <Star
                  key={"skeleton"}
                  className={`h-5 w-5 ${
                    i < Math.floor(templateData.reviewStats.averageRating)
                      ? "text-yellow-400 fill-current"
                      : "text-gray-300"
                  }`}
                />
              ))}
            </div>
            <span className='text-sm text-gray-600'>
              {templateData.reviewStats.averageRating.toFixed(1)} (
              {templateData.reviewStats.totalReviews} reviews)
            </span>
          </div>

          {/* Description */}
          <div>
            <h3 className='text-lg font-medium text-gray-900 mb-2'>
              Description
            </h3>
            <p className='text-gray-600'>{templateData.product.description}</p>
          </div>

          {/* Variants */}
          {templateData.product.variants?.map((variant) => (
            <div key={variant.name}>
              <h4 className='text-sm font-medium text-gray-900 mb-2'>
                {variant.name}
              </h4>
              <div className='flex flex-wrap gap-2'>
                {variant.values.map((value) => (
                  <button
                    type='button'
                    key={value}
                    onClick={() => handleOptionChange(variant.name, value)}
                    className={`px-3 py-2 text-sm border rounded-md ${
                      templateData.selectedOptions[variant.name] === value
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-gray-300 text-gray-700 hover:border-gray-400"
                    }`}>
                    {value}
                  </button>
                ))}
              </div>
            </div>
          ))}

          {/* Quantity */}
          <div>
            <h4 className='text-sm font-medium text-gray-900 mb-2'>Quantity</h4>
            <div className='flex items-center space-x-3'>
              <button
                type='button'
                onClick={() => handleQuantityChange(templateData.quantity - 1)}
                disabled={templateData.quantity <= 1}
                className='p-2 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50'>
                <Minus className='h-4 w-4' />
              </button>
              <span className='text-lg font-medium'>
                {templateData.quantity}
              </span>
              <button
                type='button'
                onClick={() => handleQuantityChange(templateData.quantity + 1)}
                disabled={templateData.quantity >= templateData.product.stock}
                className='p-2 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50'>
                <Plus className='h-4 w-4' />
              </button>
              <span className='text-sm text-gray-500'>
                ({templateData.product.stock} available)
              </span>
            </div>
          </div>

          {/* Add to Cart */}
          <div className='flex space-x-4'>
            <button
              type='button'
              onClick={handleAddToCart}
              disabled={
                !templateData.product.available || templateData.isAddingToCart
              }
              className='flex-1 bg-blue-600 text-white px-6 py-3 rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center space-x-2'>
              <ShoppingCart className='h-5 w-5' />
              <span>
                {templateData.isAddingToCart ? "Adding..." : "Add to Cart"}
              </span>
            </button>
            <button
              type='button'
              onClick={handleWishlistToggle}
              className='p-3 border border-gray-300 rounded-md hover:bg-gray-50'>
              <Heart className='h-5 w-5' />
            </button>
          </div>

          {/* Features */}
          <div className='border-t pt-6'>
            <div className='grid grid-cols-1 gap-4'>
              <div className='flex items-center space-x-3'>
                <Truck className='h-5 w-5 text-gray-400' />
                <span className='text-sm text-gray-600'>
                  Free shipping on orders over EGP 50
                </span>
              </div>
              <div className='flex items-center space-x-3'>
                <Shield className='h-5 w-5 text-gray-400' />
                <span className='text-sm text-gray-600'>2-year warranty</span>
              </div>
              <div className='flex items-center space-x-3'>
                <RotateCcw className='h-5 w-5 text-gray-400' />
                <span className='text-sm text-gray-600'>
                  30-day return policy
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Reviews Section */}
      <div className='mt-16'>
        <h2 className='text-2xl font-bold text-gray-900 mb-8'>
          Customer Reviews
        </h2>

        {templateData.reviews.length === 0 ? (
          <div className='text-center py-12'>
            <h3 className='text-lg font-medium text-gray-900 mb-2'>
              No Reviews Yet
            </h3>
            <p className='text-gray-600'>
              Be the first to review this product!
            </p>
          </div>
        ) : (
          <div className='space-y-6'>
            {templateData.reviews.map((review) => (
              <div key={review.id} className='border-b border-gray-200 pb-6'>
                <div className='flex items-center justify-between mb-2'>
                  <div className='flex items-center space-x-2'>
                    <span className='font-medium text-gray-900'>
                      {review.userName}
                    </span>
                    <div className='flex items-center'>
                      {[...Array(5)].map((_, i) => (
                        <Star
                          key={"skeleton"}
                          className={`h-4 w-4 ${
                            i < review.rating
                              ? "text-yellow-400 fill-current"
                              : "text-gray-300"
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                  <span className='text-sm text-gray-500'>
                    {new Date(review.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <p className='text-gray-600'>{review.comment}</p>
              </div>
            ))}
          </div>
        )}

        {/* Review Form */}
        <div className='mt-12 pt-8 border-t border-gray-200'>
          <Card className='border-gray-200'>
            <CardHeader>
              <CardTitle className='text-xl font-bold text-gray-900'>
                Write a Review
              </CardTitle>
              <CardDescription className='text-gray-600'>
                Share your thoughts about this product
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form
                  onSubmit={form.handleSubmit(async (values) => {
                    setIsSubmittingReview(true);
                    try {
                      const result = await trpc.product.createReview.mutate({
                        productId: templateData.product.id,
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

                        // Fetch updated reviews from the database
                        const reviewsResult =
                          await trpc.product.getReviews.query({
                            productId: templateData.product.id,
                          });
                        if (reviewsResult.success && onUpdateData) {
                          const updatedReviews =
                            reviewsResult.result.reviews.map((review) => ({
                              ...review,
                              createdAt: review.createdAt.toISOString(),
                            }));
                          onUpdateData({
                            reviews: updatedReviews,
                            reviewStats: {
                              averageRating: reviewsResult.result.averageRating,
                              totalReviews: reviewsResult.result.totalReviews,
                            },
                          });
                        }
                      } else {
                        toast({
                          title: "Error",
                          description:
                            result.error || "Failed to submit review",
                          variant: "destructive",
                        });
                      }
                    } catch (error) {
                      console.error("Error submitting review:", error);
                      toast({
                        title: "Error",
                        description:
                          "Failed to submit your review. Please try again.",
                        variant: "destructive",
                      });
                    } finally {
                      setIsSubmittingReview(false);
                    }
                  })}
                  className='space-y-6'>
                  <FormField
                    control={form.control}
                    name='userName'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className='text-sm font-medium text-gray-700'>
                          Your Name
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder='Enter your name'
                            className='border-gray-300 focus:border-blue-500 focus:ring-blue-500'
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
                        <FormLabel className='text-sm font-medium text-gray-700'>
                          Rating
                        </FormLabel>
                        <FormControl>
                          <div className='flex gap-2'>
                            {[1, 2, 3, 4, 5].map((star) => (
                              <Button
                                key={star}
                                type='button'
                                variant='outline'
                                size='sm'
                                onClick={() => field.onChange(star)}
                                className={`p-2 ${
                                  field.value >= star
                                    ? "bg-yellow-400 border-yellow-400 hover:bg-yellow-500 hover:border-yellow-500"
                                    : "border-gray-300 hover:border-gray-400"
                                }`}>
                                <Star
                                  className={`h-4 w-4 ${
                                    field.value >= star
                                      ? "fill-white text-white"
                                      : "text-gray-300"
                                  }`}
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
                        <FormLabel className='text-sm font-medium text-gray-700'>
                          Your Review
                        </FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder='Share your experience with this product'
                            className='min-h-[100px] border-gray-300 focus:border-blue-500 focus:ring-blue-500'
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button
                    type='submit'
                    className='w-full bg-blue-600 hover:bg-blue-700 text-white'
                    disabled={isSubmittingReview}>
                    {isSubmittingReview ? "Submitting..." : "Submit Review"}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Related Products */}
      {templateData.relatedProducts &&
        templateData.relatedProducts.length > 0 && (
          <div className='mt-16'>
            <h2 className='text-2xl font-bold text-gray-900 mb-8'>
              Related Products
            </h2>
            <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6'>
              {templateData.relatedProducts.map((product) => (
                <div key={product.id} className='group'>
                  <div className='aspect-square bg-gray-100 rounded-lg overflow-hidden mb-4'>
                    <img
                      src={
                        product.imageUrl ||
                        product.images?.[0]?.url ||
                        "/placeholder-product.jpg"
                      }
                      alt={product.name}
                      className='w-full h-full object-cover group-hover:scale-105 transition-transform duration-200'
                    />
                  </div>
                  <h3 className='text-sm font-medium text-gray-900 mb-1'>
                    {product.name}
                  </h3>
                  <p className='text-xs text-gray-500 mb-2'>
                    {product.categoryName}
                  </p>
                  <div className='flex items-center space-x-2'>
                    {product.discountPrice ? (
                      <>
                        <span className='text-sm font-bold text-red-600'>
                          EGP {product.discountPrice}
                        </span>
                        <span className='text-xs text-gray-500 line-through'>
                          EGP {product.price}
                        </span>
                      </>
                    ) : (
                      <span className='text-sm font-bold text-gray-900'>
                        EGP {product.price}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
    </div>
  );
};

export default DefaultProductTemplate;
