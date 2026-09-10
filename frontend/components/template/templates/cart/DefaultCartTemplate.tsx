/**
 * @legacy
 * Legacy Template System (v1)
 * - Fully preserved for admin preview
 * - Not used in frontend rendering
 * - Used as a design asset library
 */

import type React from "react";
import { useState } from "react";
import { Button } from "#root/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "#root/components/ui/card";
import { Separator } from "#root/components/ui/separator";
import { Link } from "#root/components/utils/Link";
import {
  ChevronRight,
  Minus,
  Plus,
  ShoppingBag,
  ShoppingCart,
  Trash2,
  Tag,
  Check,
  X,
} from "lucide-react";
import { useToast } from "#root/components/ui/use-toast";
import { Input } from "#root/components/ui/input";
import { Label } from "#root/components/ui/label";
import { Alert, AlertDescription } from "#root/components/ui/alert";
import { useCart } from "#root/lib/context/CartContext";
import type {
  TemplateData,
  CartTemplateData,
  CartItem,
} from "../../templateRegistry";

interface DefaultCartTemplateProps {
  data?: TemplateData;
}

const DefaultCartTemplate: React.FC<DefaultCartTemplateProps> = ({ data }) => {
  // Type guard to ensure we have cart data
  const cartData = data as CartTemplateData | undefined;

  // Use cart context for actual functionality
  const {
    items: contextItems,
    removeItem,
    updateQuantity,
    totalItems: contextTotalItems,
    subtotal: contextSubtotal,
    discount: contextDiscount,
    total: contextTotal,
    promoCode: contextPromoCode,
    applyPromoCode,
    removePromoCode,
    shipping: contextShipping,
  } = useCart();

  // Use provided data or fallback to context data
  const items = cartData?.items || contextItems;
  const totalItems = cartData?.totalItems ?? contextTotalItems;
  const subtotal = cartData?.subtotal ?? contextSubtotal;
  const discount = cartData?.discount ?? contextDiscount;
  const total = cartData?.total ?? contextTotal;
  const promoCode = cartData?.promoCode ?? contextPromoCode;
  const shipping = cartData?.shipping ?? contextShipping;
  const isLoading = cartData?.isLoading || false;
  const error = cartData?.error || null;

  const { toast } = useToast();
  const [processingCheckout, setProcessingCheckout] = useState(false);
  const [promoCodeInput, setPromoCodeInput] = useState("");
  const [applyingPromoCode, setApplyingPromoCode] = useState(false);
  const [promoCodeError, setPromoCodeError] = useState<string | null>(null);

  const handleUpdateQuantity = (
    itemId: string,
    newQuantity: number,
    selectedOptions: CartItem["selectedOptions"],
  ) => {
    if (newQuantity < 1) return;
    const success = updateQuantity(itemId, newQuantity, selectedOptions);
    if (!success) {
      toast({
        title: "Error",
        description: "Could not update quantity. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleRemoveItem = (
    itemId: string,
    selectedOptions: CartItem["selectedOptions"],
  ) => {
    removeItem(itemId, selectedOptions);
    toast({
      title: "Item removed",
      description: "The item has been removed from your cart.",
    });
  };

  const handleCheckout = () => {
    window.location.href = "/checkout";
  };

  const handleApplyPromoCode = async () => {
    if (!promoCodeInput.trim()) return;

    setApplyingPromoCode(true);
    setPromoCodeError(null);

    try {
      const result = await applyPromoCode(promoCodeInput.trim());
      if (result.success) {
        setPromoCodeInput("");
        toast({
          title: "Promo code applied!",
          description: result.message,
        });
      } else {
        // Show the specific reason from the server, not a generic message.
        setPromoCodeError(result.message);
      }
    } catch (error) {
      setPromoCodeError("Failed to apply promo code. Please try again.");
    } finally {
      setApplyingPromoCode(false);
    }
  };

  const handleRemovePromoCode = () => {
    removePromoCode();
    toast({
      title: "Promo code removed",
      description: "The promo code has been removed from your order.",
    });
  };

  if (isLoading) {
    return (
      <div className='container mx-auto p-4'>
        <div className='animate-pulse space-y-4'>
          <div className='h-8 bg-gray-200 rounded w-1/4'></div>
          <div className='grid grid-cols-1 lg:grid-cols-3 gap-8'>
            <div className='lg:col-span-2 space-y-4'>
              {[1, 2, 3].map((i) => (
                <div key={i} className='h-32 bg-gray-200 rounded'></div>
              ))}
            </div>
            <div className='h-64 bg-gray-200 rounded'></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className='container mx-auto p-4 text-center'>
        <Alert className='max-w-md mx-auto'>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className='container mx-auto p-4 text-center'>
        <Card className='max-w-md mx-auto'>
          <CardHeader>
            <ShoppingCart className='h-16 w-16 mx-auto text-gray-400 mb-4' />
            <CardTitle>Your cart is empty</CardTitle>
            <CardDescription>
              Looks like you haven't added anything to your cart yet.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className='w-full'>
              <Link href='/shop'>
                <ShoppingBag className='h-4 w-4 mr-2 ' />
                Continue Shopping
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className='container mx-auto p-4'>
      <div className='mb-6'>
        <h1 className='text-2xl font-bold mb-2'>Shopping Cart</h1>
        <p className='text-gray-600'>
          {totalItems} {totalItems === 1 ? "item" : "items"} in your cart
        </p>
      </div>

      <div className='grid grid-cols-1 lg:grid-cols-3 gap-8'>
        {/* Cart Items */}
        <div className='lg:col-span-2'>
          <div className='space-y-4'>
            {items.map((item) => {
              const displayPrice = item.price;
              const hasDiscount = item.price > displayPrice;
              const optionsKey = JSON.stringify(item.selectedOptions);

              return (
                <Card key={`${item.id}-${optionsKey}`} className='p-4'>
                  <div className='flex gap-4'>
                    <div className='w-20 h-20 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0'>
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt={item.name}
                          className='w-full h-full object-cover'
                        />
                      ) : (
                        <div className='w-full h-full flex items-center justify-center text-gray-400'>
                          <ShoppingBag className='h-8 w-8' />
                        </div>
                      )}
                    </div>

                    <div className='flex-1 min-w-0'>
                      <div className='flex justify-between items-start mb-2'>
                        <div>
                          <h3 className='font-semibold text-lg truncate'>
                            {item.name}
                          </h3>
                          <p className='text-xs text-gray-500'>
                            {item.categoryName}
                          </p>
                        </div>
                        <Button
                          variant='ghost'
                          size='sm'
                          onClick={() =>
                            handleRemoveItem(item.id, item.selectedOptions)
                          }
                          className='text-red-500 hover:text-red-700 hover:bg-red-50'>
                          <Trash2 className='h-4 w-4' />
                        </Button>
                      </div>

                      {/* Selected Options */}
                      {Object.keys(item.selectedOptions).length > 0 && (
                        <div className='mb-3'>
                          <div className='flex flex-wrap gap-2'>
                            {Object.entries(item.selectedOptions).map(
                              ([key, value]) => (
                                <span
                                  key={key}
                                  className='text-xs bg-gray-100 px-2 py-1 rounded'>
                                  {key}: {value}
                                </span>
                              ),
                            )}
                          </div>
                        </div>
                      )}

                      <div className='flex justify-between items-center'>
                        <div className='flex items-center gap-3'>
                          <Button
                            variant='outline'
                            size='sm'
                            onClick={() =>
                              handleUpdateQuantity(
                                item.id,
                                item.quantity - 1,
                                item.selectedOptions,
                              )
                            }
                            disabled={item.quantity <= 1}>
                            <Minus className='h-3 w-3' />
                          </Button>
                          <span className='font-medium min-w-[2rem] text-center'>
                            {item.quantity}
                          </span>
                          <Button
                            variant='outline'
                            size='sm'
                            onClick={() =>
                              handleUpdateQuantity(
                                item.id,
                                item.quantity + 1,
                                item.selectedOptions,
                              )
                            }
                            disabled={item.quantity >= item.stock}>
                            <Plus className='h-3 w-3' />
                          </Button>
                        </div>

                        <div className='text-right'>
                          <div className='flex items-center gap-2'>
                            {hasDiscount && (
                              <span className='text-sm text-gray-500 line-through'>
                                EGP {item.price.toFixed(2)}
                              </span>
                            )}
                            <span className='font-semibold'>
                              EGP {displayPrice.toFixed(2)}
                            </span>
                          </div>
                          <p className='text-xs text-gray-500'>
                            EGP {(displayPrice * item.quantity).toFixed(2)}{" "}
                            total
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Order Summary */}
        <div className='lg:col-span-1'>
          <Card className='sticky top-4'>
            <CardHeader>
              <CardTitle>Order Summary</CardTitle>
            </CardHeader>
            <CardContent className='space-y-4'>
              <div className='flex justify-between'>
                <span>Subtotal ({totalItems} items)</span>
                <span>EGP {subtotal.toFixed(2)}</span>
              </div>

              {/* Promo Code Section */}
              <div className='space-y-3'>
                <Label htmlFor='promo-code'>Promo Code</Label>
                {promoCode ? (
                  <div className='flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg'>
                    <div className='flex items-center gap-2'>
                      <Tag className='h-4 w-4 text-green-600' />
                      <span className='text-sm font-medium text-green-800'>
                        {promoCode.code}
                      </span>
                    </div>
                    <Button
                      variant='ghost'
                      size='sm'
                      onClick={handleRemovePromoCode}
                      className='text-green-600 hover:text-green-800 hover:bg-green-100'>
                      <X className='h-4 w-4' />
                    </Button>
                  </div>
                ) : (
                  <div className='space-y-2'>
                    <div className='flex gap-2'>
                      <Input
                        id='promo-code'
                        placeholder='Enter promo code'
                        value={promoCodeInput}
                        onChange={(e) => setPromoCodeInput(e.target.value)}
                        onKeyPress={(e) => {
                          if (e.key === "Enter") {
                            handleApplyPromoCode();
                          }
                        }}
                      />
                      <Button
                        variant='outline'
                        onClick={handleApplyPromoCode}
                        disabled={applyingPromoCode || !promoCodeInput.trim()}>
                        {applyingPromoCode ? (
                          <div className='animate-spin rounded-full h-4 w-4 border-b-2 border-gray-900'></div>
                        ) : (
                          "Apply"
                        )}
                      </Button>
                    </div>
                    {promoCodeError && (
                      <p className='text-sm text-red-600'>{promoCodeError}</p>
                    )}
                  </div>
                )}
              </div>

              {discount > 0 && (
                <div className='flex justify-between text-green-600'>
                  <span>Discount</span>
                  <span>-EGP {discount.toFixed(2)}</span>
                </div>
              )}

              <div className='flex justify-between'>
                <span>Shipping</span>
                <span>
                  {shipping === 0 ? "Free" : `EGP ${shipping.toFixed(2)}`}
                </span>
              </div>

              <Separator />

              <div className='flex justify-between text-lg font-semibold'>
                <span>Total</span>
                <span>EGP {total.toFixed(2)}</span>
              </div>
            </CardContent>
            <CardFooter>
              <Button
                className='w-full'
                size='lg'
                onClick={handleCheckout}
                disabled={processingCheckout || items.length === 0}>
                {processingCheckout ? (
                  <span className='flex items-center'>
                    <div className='animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2'></div>
                    Processing...
                  </span>
                ) : (
                  <span className='flex items-center'>
                    <ShoppingBag className='h-5 w-5 mr-2' />
                    Proceed to Checkout
                  </span>
                )}
              </Button>
            </CardFooter>
          </Card>

          <div className='mt-4 text-sm text-neutral-500'>
            <p className='mb-2'>We accept:</p>
            <div className='flex gap-2'>
              <div className='h-8 w-12 bg-neutral-200 rounded-md'></div>
              <div className='h-8 w-12 bg-neutral-200 rounded-md'></div>
              <div className='h-8 w-12 bg-neutral-200 rounded-md'></div>
              <div className='h-8 w-12 bg-neutral-200 rounded-md'></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DefaultCartTemplate;
