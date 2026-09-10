/**
 * @legacy
 * Legacy Template System (v1)
 * - Fully preserved for admin preview
 * - Not used in frontend rendering
 * - Used as a design asset library
 */

import type React from "react";
import { useState, useEffect } from "react";
import {
  Star,
  Heart,
  ShoppingCart,
  Minus,
  Plus,
  Truck,
  Shield,
  RotateCcw,
  ZoomIn,
  Share2,
  ArrowRight,
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

interface ModernProductTemplateProps {
  data: ProductTemplateData;
  onUpdateData?: (updates: Partial<ProductTemplateData>) => void;
}

const reviewFormSchema = z.object({
  userName: z.string().min(2, "Name must be at least 2 characters").max(50),
  rating: z.number().min(1).max(5),
  comment: z.string().min(3, "Review must be at least 3 characters").max(500),
});

type ReviewFormValues = z.infer<typeof reviewFormSchema>;

const ModernProductTemplate: React.FC<ModernProductTemplateProps> = ({
  data,
  onUpdateData,
}) => {
  const { addItem } = useCart();
  const { toast } = useToast();
  const [isVisible, setIsVisible] = useState(false);
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  const form = useForm<ReviewFormValues>({
    resolver: zodResolver(reviewFormSchema),
    defaultValues: {
      userName: "",
      rating: 5,
      comment: "",
    },
  });

  useEffect(() => {
    setIsVisible(true);
  }, []);

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

  const toggleZoom = () => {
    updateLocalData({ isZoomed: !templateData.isZoomed });
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

  const onSubmitReview = async (values: ReviewFormValues) => {
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
        const reviewsResult = await trpc.product.getReviews.query({
          productId: templateData.product.id,
        });
        if (reviewsResult.success) {
          const updatedReviews = reviewsResult.result.reviews.map((review) => ({
            ...review,
            createdAt: review.createdAt.toISOString(),
          }));
          updateLocalData({
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
      <div className='flex justify-center items-center min-h-screen bg-white'>
        <div className='w-12 h-12 rounded-full border-4 border-gray-200 border-t-gray-900 animate-spin'></div>
      </div>
    );
  }

  if (templateData.error) {
    return (
      <div className='flex justify-center items-center min-h-screen bg-white'>
        <div className='text-center bg-white p-8 border border-gray-200 rounded-none'>
          <div className='w-16 h-16 bg-gray-100 rounded-none flex items-center justify-center mx-auto mb-4'>
            <span className='text-2xl text-gray-600'>😞</span>
          </div>
          <h2 className='text-2xl font-light text-gray-900 mb-4'>
            Product Not Found
          </h2>
          <p className='text-gray-600 font-light'>{templateData.error}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`min-h-screen bg-white transition-opacity duration-1000 ${
        isVisible ? "opacity-100" : "opacity-0"
      }`}>
      <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8'>
        <div className='grid grid-cols-1 lg:grid-cols-2 gap-12'>
          {/* Product Images */}
          <div className='space-y-6'>
            <div className='relative group'>
              <div
                className={`aspect-square bg-white border border-gray-200 rounded-none overflow-hidden transition-all duration-500 ${
                  templateData.isZoomed ? "scale-110" : "hover:border-gray-300"
                }`}>
                <img
                  src={currentImage}
                  alt={templateData.product.name}
                  className='w-full h-full object-cover transition-transform duration-700 hover:scale-105'
                />
              </div>
              <button
                type='button'
                onClick={toggleZoom}
                className='absolute top-4 right-4 bg-white border border-gray-200 p-3 rounded-none hover:bg-gray-50 transition-all duration-200 opacity-0 group-hover:opacity-100'>
                <ZoomIn className='h-5 w-5 text-gray-700' />
              </button>
              <button
                type='button'
                className='absolute top-4 left-4 bg-white border border-gray-200 p-3 rounded-none hover:bg-gray-50 transition-all duration-200 opacity-0 group-hover:opacity-100'>
                <Share2 className='h-5 w-5 text-gray-700' />
              </button>
            </div>

            {templateData.product.images &&
              templateData.product.images.length > 1 && (
                <div className='grid grid-cols-4 gap-3'>
                  {templateData.product.images.map((image, index) => (
                    <button
                      type='button'
                      key={image.url}
                      onClick={() => handleImageChange(index)}
                      className={`aspect-square bg-white border rounded-none overflow-hidden transition-all duration-300 ${
                        index === templateData.currentImageIndex
                          ? "border-gray-900 border-2"
                          : "border-gray-200 hover:border-gray-300"
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
          <div className='space-y-8'>
            <div className='bg-white border border-gray-200 rounded-none p-8'>
              <div className='mb-6'>
                <div className='flex items-center space-x-2 mb-3'>
                  <span className='bg-gray-100 text-gray-900 text-xs font-medium px-3 py-1 rounded-none border border-gray-200'>
                    {templateData.product.categoryName}
                  </span>
                </div>
                <h1 className='text-4xl font-light text-gray-900 leading-tight'>
                  {templateData.product.name}
                </h1>
              </div>

              {/* Price */}
              <div className='flex items-center space-x-3 mb-6'>
                {discountPrice ? (
                  <>
                    <span className='text-4xl font-light text-gray-900'>
                      EGP {discountPrice}
                    </span>
                    <span className='text-2xl text-gray-400 line-through font-light'>
                      EGP {price}
                    </span>
                    <span className='bg-gray-900 text-white text-sm font-medium px-3 py-1 rounded-none'>
                      {Math.round(((price - discountPrice) / price) * 100)}% OFF
                    </span>
                  </>
                ) : (
                  <span className='text-4xl font-light text-gray-900'>
                    EGP {price}
                  </span>
                )}
              </div>

              {/* Reviews */}
              <div className='flex items-center space-x-3 mb-6'>
                <div className='flex items-center bg-gray-50 border border-gray-200 px-3 py-2 rounded-none'>
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={"skeleton"}
                      className={`h-5 w-5 ${
                        i < Math.floor(templateData.reviewStats.averageRating)
                          ? "text-gray-900 fill-current"
                          : "text-gray-300"
                      }`}
                    />
                  ))}
                  <span className='ml-2 text-sm font-medium text-gray-700'>
                    {templateData.reviewStats.averageRating.toFixed(1)}
                  </span>
                </div>
                <span className='text-sm text-gray-600 font-light'>
                  ({templateData.reviewStats.totalReviews} reviews)
                </span>
              </div>

              {/* Description */}
              <div className='mb-8'>
                <h3 className='text-xl font-medium text-gray-900 mb-3'>
                  Description
                </h3>
                <p className='text-gray-600 leading-relaxed font-light'>
                  {templateData.product.description}
                </p>
              </div>

              {/* Variants */}
              {templateData.product.variants?.map((variant) => (
                <div key={variant.name} className='mb-6'>
                  <h4 className='text-lg font-medium text-gray-900 mb-3'>
                    {variant.name}
                  </h4>
                  <div className='flex flex-wrap gap-3'>
                    {variant.values.map((value) => (
                      <button
                        type='button'
                        key={value}
                        onClick={() => handleOptionChange(variant.name, value)}
                        className={`px-6 py-3 text-sm font-medium border rounded-none transition-all duration-200 ${
                          templateData.selectedOptions[variant.name] === value
                            ? "border-gray-900 bg-gray-900 text-white"
                            : "border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50"
                        }`}>
                        {value}
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              {/* Quantity */}
              <div className='mb-8'>
                <h4 className='text-lg font-medium text-gray-900 mb-3'>
                  Quantity
                </h4>
                <div className='flex items-center space-x-4'>
                  <div className='flex items-center bg-gray-50 border border-gray-200 rounded-none overflow-hidden'>
                    <button
                      type='button'
                      onClick={() =>
                        handleQuantityChange(templateData.quantity - 1)
                      }
                      disabled={templateData.quantity <= 1}
                      className='p-3 hover:bg-gray-100 disabled:opacity-50 transition-colors duration-200'>
                      <Minus className='h-5 w-5' />
                    </button>
                    <span className='px-6 py-3 text-lg font-medium bg-white border-l border-r border-gray-200'>
                      {templateData.quantity}
                    </span>
                    <button
                      type='button'
                      onClick={() =>
                        handleQuantityChange(templateData.quantity + 1)
                      }
                      disabled={
                        templateData.quantity >= templateData.product.stock
                      }
                      className='p-3 hover:bg-gray-100 disabled:opacity-50 transition-colors duration-200'>
                      <Plus className='h-5 w-5' />
                    </button>
                  </div>
                  <span className='text-sm text-gray-500 bg-gray-50 border border-gray-200 px-3 py-2 rounded-none font-light'>
                    {templateData.product.stock} available
                  </span>
                </div>
              </div>

              {/* Add to Cart */}
              <div className='flex space-x-4 mb-8'>
                <button
                  type='button'
                  onClick={handleAddToCart}
                  disabled={
                    !templateData.product.available ||
                    templateData.isAddingToCart
                  }
                  className='flex-1 bg-gray-900 text-white px-8 py-4 rounded-none hover:bg-gray-800 disabled:opacity-50 flex items-center justify-center space-x-3 font-medium text-lg border border-gray-900 transition-all duration-200 group'>
                  <ShoppingCart className='h-6 w-6' />
                  <span>
                    {templateData.isAddingToCart ? "Adding..." : "Add to Cart"}
                  </span>
                  <ArrowRight className='h-5 w-5 group-hover:translate-x-1 transition-transform duration-200' />
                </button>
                <button
                  type='button'
                  onClick={handleWishlistToggle}
                  className='p-4 bg-white border border-gray-200 rounded-none hover:border-gray-300 hover:bg-gray-50 transition-all duration-200 group'>
                  <Heart className='h-6 w-6 text-gray-400 group-hover:text-red-500' />
                </button>
              </div>

              {/* Features */}
              <div className='grid grid-cols-1 gap-4'>
                <div className='flex items-center space-x-4 p-4 bg-gray-50 border border-gray-200 rounded-none'>
                  <div className='bg-gray-900 p-2 rounded-none'>
                    <Truck className='h-6 w-6 text-white' />
                  </div>
                  <div>
                    <p className='font-medium text-gray-900'>Free Shipping</p>
                    <p className='text-sm text-gray-600 font-light'>
                      On orders over EGP 50
                    </p>
                  </div>
                </div>
                <div className='flex items-center space-x-4 p-4 bg-gray-50 border border-gray-200 rounded-none'>
                  <div className='bg-gray-900 p-2 rounded-none'>
                    <Shield className='h-6 w-6 text-white' />
                  </div>
                  <div>
                    <p className='font-medium text-gray-900'>2-Year Warranty</p>
                    <p className='text-sm text-gray-600 font-light'>
                      Full coverage included
                    </p>
                  </div>
                </div>
                <div className='flex items-center space-x-4 p-4 bg-gray-50 border border-gray-200 rounded-none'>
                  <div className='bg-gray-900 p-2 rounded-none'>
                    <RotateCcw className='h-6 w-6 text-white' />
                  </div>
                  <div>
                    <p className='font-medium text-gray-900'>30-Day Returns</p>
                    <p className='text-sm text-gray-600 font-light'>
                      Hassle-free policy
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Reviews Section */}
        <div className='mt-20'>
          <div className='bg-white border border-gray-200 rounded-none p-8'>
            <h2 className='text-2xl font-medium text-gray-900 mb-8'>
              Customer Reviews
            </h2>

            {/* Review Form */}
            <div className='bg-gray-50 border border-gray-200 rounded-none p-6 mb-8'>
              <h3 className='text-xl font-medium text-gray-900 mb-6'>
                Write a Review
              </h3>
              <Form {...form}>
                <form
                  onSubmit={form.handleSubmit(onSubmitReview)}
                  className='space-y-6'>
                  <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                    <FormField
                      control={form.control}
                      name='userName'
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className='text-gray-900 font-medium'>
                            Your Name
                          </FormLabel>
                          <FormControl>
                            <Input
                              placeholder='Enter your name'
                              className='border-gray-200 rounded-none focus:border-gray-900 bg-white'
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
                          <FormLabel className='text-gray-900 font-medium'>
                            Rating
                          </FormLabel>
                          <FormControl>
                            <div className='flex items-center space-x-2'>
                              {[1, 2, 3, 4, 5].map((rating) => (
                                <button
                                  key={rating}
                                  type='button'
                                  onClick={() => field.onChange(rating)}
                                  className='p-1 hover:scale-110 transition-transform duration-200'>
                                  <Star
                                    className={`h-6 w-6 ${
                                      rating <= field.value
                                        ? "text-gray-900 fill-current"
                                        : "text-gray-300 hover:text-gray-400"
                                    }`}
                                  />
                                </button>
                              ))}
                              <span className='ml-2 text-sm text-gray-600 font-light'>
                                ({field.value} star
                                {field.value !== 1 ? "s" : ""})
                              </span>
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name='comment'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className='text-gray-900 font-medium'>
                          Your Review
                        </FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder='Share your thoughts about this product...'
                            className='border-gray-200 rounded-none focus:border-gray-900 bg-white min-h-[120px] resize-none'
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type='submit'
                    disabled={isSubmittingReview}
                    className='bg-gray-900 text-white hover:bg-gray-800 rounded-none border border-gray-900 px-8 py-3 font-medium transition-all duration-200'>
                    {isSubmittingReview ? "Submitting..." : "Submit Review"}
                  </Button>
                </form>
              </Form>
            </div>

            {templateData.reviews.length === 0 ? (
              <div className='text-center py-16'>
                <div className='w-20 h-20 bg-gray-100 rounded-none flex items-center justify-center mx-auto mb-4'>
                  <span className='text-3xl'>💭</span>
                </div>
                <h3 className='text-xl font-medium text-gray-900 mb-2'>
                  No Reviews Yet
                </h3>
                <p className='text-gray-600 font-light'>
                  Be the first to review this product!
                </p>
              </div>
            ) : (
              <div className='space-y-8'>
                {templateData.reviews.map((review) => (
                  <div
                    key={review.id}
                    className='bg-gray-50 border border-gray-200 rounded-none p-6'>
                    <div className='flex items-center justify-between mb-4'>
                      <div className='flex items-center space-x-3'>
                        <div className='w-10 h-10 bg-gray-900 rounded-none flex items-center justify-center'>
                          <span className='text-white font-medium'>
                            {review.userName.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <span className='font-medium text-gray-900'>
                            {review.userName}
                          </span>
                          <div className='flex items-center mt-1'>
                            {[...Array(5)].map((_, i) => (
                              <Star
                                key={"skeleton"}
                                className={`h-4 w-4 ${
                                  i < review.rating
                                    ? "text-gray-900 fill-current"
                                    : "text-gray-300"
                                }`}
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                      <span className='text-sm text-gray-500 bg-white border border-gray-200 px-3 py-1 rounded-none font-light'>
                        {new Date(review.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <p className='text-gray-700 leading-relaxed font-light'>
                      {review.comment}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Related Products */}
        {templateData.relatedProducts &&
          templateData.relatedProducts.length > 0 && (
            <div className='mt-20'>
              <div className='bg-white border border-gray-200 rounded-none p-8'>
                <h2 className='text-2xl font-medium text-gray-900 mb-8'>
                  You Might Also Like
                </h2>
                <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8'>
                  {templateData.relatedProducts.map((product) => (
                    <div key={product.id} className='group cursor-pointer'>
                      <div className='aspect-square bg-gray-100 border border-gray-200 rounded-none overflow-hidden mb-4 group-hover:border-gray-300 transition-all duration-300'>
                        <img
                          src={
                            product.imageUrl ||
                            product.images?.[0]?.url ||
                            "/placeholder-product.jpg"
                          }
                          alt={product.name}
                          className='w-full h-full object-cover group-hover:scale-105 transition-transform duration-300'
                        />
                      </div>
                      <h3 className='font-medium text-gray-900 mb-2 group-hover:text-gray-700 transition-colors duration-200'>
                        {product.name}
                      </h3>
                      <p className='text-sm text-gray-500 mb-3 font-light'>
                        {product.categoryName}
                      </p>
                      <div className='flex items-center space-x-2'>
                        {product.discountPrice ? (
                          <>
                            <span className='font-medium text-gray-900'>
                              EGP {product.discountPrice}
                            </span>
                            <span className='text-sm text-gray-400 line-through font-light'>
                              EGP {product.price}
                            </span>
                          </>
                        ) : (
                          <span className='font-medium text-gray-900'>
                            EGP {product.price}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
      </div>
    </div>
  );
};

export default ModernProductTemplate;
