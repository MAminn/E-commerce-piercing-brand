/**
 * @legacy
 * Legacy Template System (v1)
 * - Fully preserved for admin preview
 * - Not used in frontend rendering
 * - Used as a design asset library
 */

import { Footer } from "#root/components/globals/Footer";
import { Link } from "#root/components/utils/Link";
import { Badge } from "#root/components/ui/badge";
import { Button } from "#root/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "#root/components/ui/card";
import { Input } from "#root/components/ui/input";
import { Separator } from "#root/components/ui/separator";
import {
  CreditCard,
  Minus,
  Plus,
  ShoppingBag,
  Tag,
  Trash2,
  Truck,
  ArrowRight,
  CheckCircle,
} from "lucide-react";
import type React from "react";
import { useState, useEffect } from "react";
import { useCart } from "#root/lib/context/CartContext";
import type { TemplateData, CartTemplateData } from "../../templateRegistry";

interface ModernCartTemplateProps {
  data?: TemplateData;
}

export const ModernCartTemplate: React.FC<ModernCartTemplateProps> = ({
  data,
}) => {
  // Type guard to ensure we have cart data
  const cartData = data as CartTemplateData | undefined;

  // Use cart context for actual functionality
  const {
    items: contextItems,
    removeItem: contextRemoveItem,
    updateQuantity: contextUpdateQuantity,
    totalItems: contextTotalItems,
    subtotal: contextSubtotal,
    discount: contextDiscount,
    total: contextTotal,
    promoCode: contextPromoCode,
    applyPromoCode: contextApplyPromoCode,
    removePromoCode: contextRemovePromoCode,
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

  const [promoCodeInput, setPromoCodeInput] = useState("");
  const [appliedPromo, setAppliedPromo] = useState(promoCode?.code || "");
  const [localDiscount, setLocalDiscount] = useState(discount);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  const updateQuantity = (id: string, newQuantity: number) => {
    if (newQuantity <= 0) {
      removeItem(id);
      return;
    }
    // Use context function if available, otherwise do nothing (preview mode)
    if (contextUpdateQuantity) {
      const item = items.find((item) => item.id === id);
      if (item) {
        contextUpdateQuantity(id, newQuantity, item.selectedOptions);
      }
    }
  };

  const removeItem = (id: string) => {
    // Use context function if available, otherwise do nothing (preview mode)
    if (contextRemoveItem) {
      contextRemoveItem(id);
    }
  };

  const applyPromoCode = () => {
    // Use context function if available, otherwise do nothing (preview mode)
    if (contextApplyPromoCode && promoCodeInput) {
      contextApplyPromoCode(promoCodeInput);
      setAppliedPromo(promoCodeInput);
      setPromoCodeInput("");
    }
  };

  const removePromoCodeHandler = () => {
    // Use context function if available, otherwise do nothing (preview mode)
    if (contextRemovePromoCode) {
      contextRemovePromoCode();
    }
    setAppliedPromo("");
    setLocalDiscount(0);
  };

  if (cartData?.isLoading) {
    return (
      <div className='min-h-screen bg-white flex items-center justify-center'>
        <div className='animate-spin rounded-full h-12 w-12 border-2 border-gray-200 border-t-gray-900'></div>
      </div>
    );
  }

  return (
    <div
      className={`min-h-screen bg-gray-50 transition-opacity duration-700 ${
        isVisible ? "opacity-100" : "opacity-0"
      }`}>
      {/* Header Section */}
      <div className='relative bg-white border-b border-gray-100'>
        <div className='absolute inset-0 bg-gradient-to-r from-gray-50/50 to-transparent'></div>
        <div className='relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8'>
          <div className='flex items-center justify-between'>
            <div className='space-y-2'>
              <div className='flex items-center space-x-2'>
                <div className='px-3 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded-full uppercase tracking-wider'>
                  YOUR CART
                </div>
              </div>
              <h1 className='text-3xl font-light text-gray-900 tracking-tight'>
                Shopping Cart
              </h1>
            </div>
            <div className='text-right'>
              <div className='text-2xl font-light text-gray-900'>
                {items.length}
              </div>
              <div className='text-sm text-gray-500'>
                {items.length === 1 ? "item" : "items"}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8'>
        {items.length === 0 ? (
          <div className='text-center py-24'>
            <div className='max-w-md mx-auto'>
              <div className='w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6'>
                <ShoppingBag className='h-10 w-10 text-gray-400' />
              </div>
              <h2 className='text-2xl font-light text-gray-900 mb-4'>
                Your cart is empty
              </h2>
              <p className='text-gray-600 mb-8'>
                Discover our latest collections and find something you love.
              </p>
              <Link href='/products'>
                <Button className='bg-gray-900 hover:bg-gray-800 text-white px-8 py-3 rounded-none transition-colors duration-200'>
                  Explore Products
                  <ArrowRight className='ml-2 h-4 w-4' />
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          <div className='grid grid-cols-1 lg:grid-cols-3 gap-8'>
            {/* Cart Items */}
            <div className='lg:col-span-2 space-y-6'>
              <div className='bg-white border border-gray-200 overflow-hidden'>
                <div className='border-b border-gray-100 px-6 py-4'>
                  <h3 className='text-lg font-medium text-gray-900'>
                    Items in your cart
                  </h3>
                </div>
                <div className='divide-y divide-gray-100'>
                  {items.map((item, index) => (
                    <div
                      key={item.id}
                      className='p-6 hover:bg-gray-50 transition-all duration-200 group'>
                      <div className='flex items-start space-x-6'>
                        <div className='flex-shrink-0'>
                          <div className='relative overflow-hidden bg-gray-100'>
                            <img
                              src={item.imageUrl || ""}
                              alt={item.name}
                              className='h-24 w-24 object-cover transition-transform duration-300 group-hover:scale-105'
                            />
                          </div>
                        </div>
                        <div className='flex-1 min-w-0'>
                          <h3 className='text-lg font-medium text-gray-900 mb-2'>
                            {item.name}
                          </h3>
                          <div className='flex flex-wrap gap-2 mb-3'>
                            {Object.entries(item.selectedOptions || {}).map(
                              ([key, value]) => (
                                <span
                                  key={key}
                                  className='px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded'>
                                  {key}: {value}
                                </span>
                              ),
                            )}
                            <span className='px-2 py-1 bg-gray-900 text-white text-xs rounded'>
                              {item.categoryName}
                            </span>
                          </div>
                          <p className='text-xl font-light text-gray-900'>
                            EGP {item.price.toFixed(2)}
                          </p>
                        </div>
                        <div className='flex items-center space-x-4'>
                          <div className='flex items-center border border-gray-200 bg-white'>
                            <button
                              type='button'
                              onClick={() =>
                                updateQuantity(item.id, item.quantity - 1)
                              }
                              className='h-10 w-10 flex items-center justify-center hover:bg-gray-50 transition-colors duration-200'>
                              <Minus className='h-4 w-4 text-gray-600' />
                            </button>
                            <span className='w-12 text-center font-medium text-gray-900'>
                              {item.quantity}
                            </span>
                            <button
                              type='button'
                              onClick={() =>
                                updateQuantity(item.id, item.quantity + 1)
                              }
                              className='h-10 w-10 flex items-center justify-center hover:bg-gray-50 transition-colors duration-200'>
                              <Plus className='h-4 w-4 text-gray-600' />
                            </button>
                          </div>
                          <button
                            type='button'
                            onClick={() => removeItem(item.id)}
                            className='h-10 w-10 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all duration-200 rounded'>
                            <Trash2 className='h-4 w-4' />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Promo Code */}
              <div className='bg-white border border-gray-200'>
                <div className='border-b border-gray-100 px-6 py-4'>
                  <h3 className='text-lg font-medium text-gray-900 flex items-center space-x-2'>
                    <Tag className='h-5 w-5 text-gray-600' />
                    <span>Promo Code</span>
                  </h3>
                </div>
                <div className='p-6'>
                  {appliedPromo ? (
                    <div className='flex items-center justify-between bg-gray-50 p-4 border border-gray-200'>
                      <div className='flex items-center space-x-3'>
                        <div className='w-8 h-8 bg-gray-900 rounded-full flex items-center justify-center'>
                          <CheckCircle className='h-4 w-4 text-white' />
                        </div>
                        <div>
                          <p className='font-medium text-gray-900'>
                            Code Applied: {appliedPromo}
                          </p>
                          <p className='text-gray-600 text-sm'>
                            You saved EGP {discount.toFixed(2)}
                          </p>
                        </div>
                      </div>
                      <button
                        type='button'
                        onClick={removePromoCodeHandler}
                        className='text-gray-500 hover:text-gray-700 text-sm transition-colors duration-200'>
                        Remove
                      </button>
                    </div>
                  ) : (
                    <div className='flex space-x-3'>
                      <Input
                        placeholder='Enter promo code'
                        value={promoCodeInput}
                        onChange={(e) => setPromoCodeInput(e.target.value)}
                        className='flex-1 border-gray-200 focus:border-gray-900 focus:ring-0 rounded-none'
                      />
                      <Button
                        onClick={applyPromoCode}
                        className='bg-gray-900 hover:bg-gray-800 text-white px-6 rounded-none transition-colors duration-200'>
                        Apply
                      </Button>
                    </div>
                  )}
                  <p className='text-sm text-gray-500 mt-4'>
                    Try:{" "}
                    <code className='bg-gray-100 px-2 py-1 text-gray-700 font-mono text-xs'>
                      SAVE10
                    </code>{" "}
                    or{" "}
                    <code className='bg-gray-100 px-2 py-1 text-gray-700 font-mono text-xs'>
                      WELCOME20
                    </code>
                  </p>
                </div>
              </div>
            </div>

            {/* Order Summary */}
            <div className='lg:col-span-1'>
              <div className='bg-white border border-gray-200 sticky top-8'>
                <div className='border-b border-gray-100 px-6 py-4'>
                  <h3 className='text-lg font-medium text-gray-900 flex items-center space-x-2'>
                    <CreditCard className='h-5 w-5 text-gray-600' />
                    <span>Order Summary</span>
                  </h3>
                </div>
                <div className='p-6 space-y-4'>
                  <div className='space-y-4'>
                    <div className='flex justify-between'>
                      <span className='text-gray-600'>Subtotal</span>
                      <span className='font-medium text-gray-900'>
                        EGP {subtotal.toFixed(2)}
                      </span>
                    </div>
                    <div className='flex justify-between items-center'>
                      <div className='flex items-center space-x-2'>
                        <Truck className='h-4 w-4 text-gray-500' />
                        <span className='text-gray-600'>Shipping</span>
                      </div>
                      <span className='font-medium text-gray-900'>
                        {shipping === 0 ? (
                          <span className='text-gray-900'>FREE</span>
                        ) : (
                          `EGP ${shipping.toFixed(2)}`
                        )}
                      </span>
                    </div>
                    {discount > 0 && (
                      <div className='flex justify-between'>
                        <span className='text-gray-600'>Discount</span>
                        <span className='font-medium text-gray-900'>
                          -EGP {discount.toFixed(2)}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className='border-t border-gray-100 pt-4'>
                    <div className='flex justify-between text-lg'>
                      <span className='font-medium text-gray-900'>Total</span>
                      <span className='font-medium text-gray-900'>
                        EGP {total.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {subtotal < 100 && (
                    <div className='bg-gray-50 p-4 border border-gray-200 mt-4'>
                      <p className='text-sm text-gray-700'>
                        <span className='font-medium'>Free shipping</span> on
                        orders over EGP 100. Add{" "}
                        <span className='font-medium'>
                          EGP {(100 - subtotal).toFixed(2)}
                        </span>{" "}
                        more to qualify.
                      </p>
                    </div>
                  )}

                  <div className='space-y-3 mt-6'>
                    <Link href='/checkout'>
                      <Button className='w-full bg-gray-900 hover:bg-gray-800 text-white py-3 rounded-none transition-colors duration-200'>
                        Proceed to Checkout
                        <ArrowRight className='ml-2 h-4 w-4' />
                      </Button>
                    </Link>
                    <Link href='/shop'>
                      <Button
                        variant='outline'
                        className='w-full border-gray-300 text-gray-700 hover:bg-gray-50 py-3 rounded-none transition-colors duration-200'>
                        Continue Shopping
                      </Button>
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
};

export default ModernCartTemplate;
