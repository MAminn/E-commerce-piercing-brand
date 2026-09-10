/**
 * @legacy
 * Legacy Template System (v1)
 * - Fully preserved for admin preview
 * - Not used in frontend rendering
 * - Used as a design asset library
 */

import type React from "react";
import { useState, useEffect } from "react";
import { Button } from "#root/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "#root/components/ui/card";
import { Input } from "#root/components/ui/input";
import { Label } from "#root/components/ui/label";
import { Separator } from "#root/components/ui/separator";
import { Textarea } from "#root/components/ui/textarea";
import { useToast } from "#root/components/ui/use-toast";
import { Link } from "#root/components/utils/Link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle,
  CreditCard,
  Home,
  Loader2,
  Phone,
  ShoppingBag,
  Truck,
  User,
  Tag,
  X,
  Shield,
  Star,
  Clock,
} from "lucide-react";
import { useCart } from "#root/lib/context/CartContext";
import { trpc } from "#root/shared/trpc/client";
import type {
  TemplateData,
  CheckoutTemplateData,
  CheckoutItem,
} from "../../templateRegistry";

interface ModernCheckoutTemplateProps {
  data?: TemplateData;
}

const ModernCheckoutTemplate: React.FC<ModernCheckoutTemplateProps> = ({
  data,
}) => {
  // Type guard to ensure we have checkout data
  const checkoutData = data as CheckoutTemplateData | undefined;
  const {
    clearCart,
    items: contextItems,
    totalItems: contextTotalItems,
    subtotal: contextSubtotal,
    discount: contextDiscount,
    total: contextTotal,
    promoCode: contextPromoCode,
    shipping: contextShipping,
  } = useCart();
  const { toast } = useToast();

  // Use provided data or fallback to context data
  const items = checkoutData?.items || contextItems;
  const totalItems = checkoutData?.totalItems ?? contextTotalItems;
  const subtotal = checkoutData?.subtotal ?? contextSubtotal;
  const discount = checkoutData?.discount ?? contextDiscount;
  const shipping = checkoutData?.shipping ?? contextShipping;
  const total = checkoutData?.total ?? contextTotal;
  const promoCode = checkoutData?.promoCode ?? contextPromoCode;
  const formData = checkoutData?.formData || {
    fullName: "",
    phoneNumber: "",
    postalCode: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    state: "",
    zipCode: "",
    country: "",
    notes: "",
    paymentMethod: "credit_card",
    cardNumber: "",
    expiryDate: "",
    cvv: "",
    nameOnCard: "",
    billingAddress: "",
    billingCity: "",
    billingState: "",
    billingPostalCode: "",
    billingCountry: "",
    sameAsShipping: true,
    specialInstructions: "",
  };
  const isSubmitting = checkoutData?.isSubmitting || false;
  const showOrderConfirmation = checkoutData?.showOrderConfirmation || false;
  const orderDetails = checkoutData?.orderDetails || null;
  const isLoading = checkoutData?.isLoading || false;
  const error = checkoutData?.error || null;

  const [localFormData, setLocalFormData] = useState(formData);
  const [localIsSubmitting, setLocalIsSubmitting] = useState(isSubmitting);
  const [localShowOrderConfirmation, setLocalShowOrderConfirmation] = useState(
    showOrderConfirmation,
  );
  const [localOrderDetails, setLocalOrderDetails] = useState(orderDetails);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    setLocalFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (localIsSubmitting) return;

    setLocalIsSubmitting(true);

    if (
      !localFormData.fullName ||
      !localFormData.phoneNumber ||
      !localFormData.address ||
      !localFormData.city
    ) {
      toast({
        title: "Missing information",
        description:
          "Please fill in all required fields (Name, Phone, Address, City).",
      });
      setLocalIsSubmitting(false);
      return;
    }

    try {
      const orderItems = items.map((item) => ({
        productId: item.id,
        quantity: item.quantity,
      }));

      const orderData = {
        customerName: localFormData.fullName,
        customerEmail: localFormData.email || "not-provided@example.com",
        customerPhone: localFormData.phoneNumber,
        shippingAddress: localFormData.address,
        shippingCity: localFormData.city,
        shippingState: localFormData.state,
        shippingPostalCode: localFormData.postalCode,
        shippingCountry: localFormData.country,
        items: orderItems,
        notes: localFormData.notes,
        promoCodeId: promoCode?.id,
      };

      const result = await trpc.order.create.mutate(orderData);

      if (!result.success) {
        throw new Error(result.error || "Failed to create order");
      }

      const orderResult = result.result;
      setLocalOrderDetails({
        id:
          typeof orderResult.id === "string"
            ? Number.parseInt(orderResult.id, 10)
            : orderResult.id,
        date: new Date().toISOString(),
        customerInfo: {
          fullName: localFormData.fullName,
          phoneNumber: localFormData.phoneNumber,
          email: localFormData.email,
          address: localFormData.address,
          city: localFormData.city,
          state: localFormData.state,
          postalCode: localFormData.postalCode,
          country: localFormData.country,
        },
        items: items as CheckoutItem[],
        subtotal: subtotal,
        shipping: shipping,
        discount: discount,
        total: total,
        status: "pending",
        promoCode: promoCode || undefined,
        notes: localFormData.notes,
      });

      setLocalShowOrderConfirmation(true);
      clearCart();
      localStorage.setItem("cart", JSON.stringify([]));
    } catch (error) {
      console.error("Error creating order:", error);
      toast({
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to create your order. Please try again.",
      });
    } finally {
      setLocalIsSubmitting(false);
    }
  };

  if (localShowOrderConfirmation && localOrderDetails) {
    return (
      <div
        className={`min-h-screen bg-white transition-opacity duration-1000 ${
          isVisible ? "opacity-100" : "opacity-0"
        }`}>
        <div className='container mx-auto p-4 max-w-4xl'>
          <div className='relative'>
            <Card className='relative bg-white border border-gray-200 rounded-none overflow-hidden'>
              <CardHeader className='bg-gray-900 text-white relative overflow-hidden'>
                <div className='relative flex items-center gap-4'>
                  <div className='h-16 w-16 rounded-none bg-white/10 flex items-center justify-center'>
                    <CheckCircle className='text-white h-8 w-8' />
                  </div>
                  <div>
                    <CardTitle className='text-3xl font-light'>
                      Order Confirmed
                    </CardTitle>
                    <p className='text-gray-300 text-lg font-light'>
                      Order #{localOrderDetails.id}
                    </p>
                    <div className='flex items-center gap-2 mt-2'>
                      <Clock className='h-4 w-4' />
                      <span className='text-sm text-gray-300 font-light'>
                        Estimated delivery: 3-5 business days
                      </span>
                    </div>
                  </div>
                </div>
              </CardHeader>

              <CardContent className='p-8'>
                <div className='space-y-8'>
                  {/* Customer Information */}
                  <div className='bg-gray-50 border border-gray-200 rounded-none p-6'>
                    <h3 className='font-medium text-xl flex items-center gap-3 mb-6 text-gray-900 border-b border-gray-200 pb-3'>
                      <div className='p-2 bg-gray-100 rounded-none'>
                        <User className='h-5 w-5 text-gray-900' />
                      </div>
                      Customer Information
                    </h3>
                    <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                      <div className='bg-white border border-gray-200 rounded-none p-4'>
                        <p className='text-sm font-medium text-gray-500 mb-1'>
                          Name
                        </p>
                        <p className='text-lg font-light text-gray-900'>
                          {localOrderDetails.customerInfo.fullName}
                        </p>
                      </div>
                      <div className='bg-white border border-gray-200 rounded-none p-4'>
                        <p className='text-sm font-medium text-gray-500 mb-1'>
                          Phone
                        </p>
                        <p className='text-lg font-light text-gray-900'>
                          {localOrderDetails.customerInfo.phoneNumber}
                        </p>
                      </div>
                      <div className='bg-white border border-gray-200 rounded-none p-4 md:col-span-2'>
                        <p className='text-sm font-medium text-gray-500 mb-1'>
                          Email
                        </p>
                        <p className='text-lg font-light text-gray-900'>
                          {localOrderDetails.customerInfo.email ||
                            "Not provided"}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Shipping Address */}
                  <div className='bg-gray-50 border border-gray-200 rounded-none p-6'>
                    <h3 className='font-medium text-xl flex items-center gap-3 mb-6 text-gray-900 border-b border-gray-200 pb-3'>
                      <div className='p-2 bg-gray-100 rounded-none'>
                        <Home className='h-5 w-5 text-gray-900' />
                      </div>
                      Shipping Address
                    </h3>
                    <div className='bg-white border border-gray-200 rounded-none p-6'>
                      <div className='space-y-2'>
                        <p className='text-lg font-light text-gray-900'>
                          {localOrderDetails.customerInfo.address}
                        </p>
                        <p className='text-gray-600 font-light'>
                          {localOrderDetails.customerInfo.city},{" "}
                          {localOrderDetails.customerInfo.state}
                          {" "}
                          {localOrderDetails.customerInfo.postalCode}
                        </p>
                        <p className='text-gray-600 font-light'>
                          {localOrderDetails.customerInfo.country}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Order Items */}
                  <div className='bg-gray-50 border border-gray-200 rounded-none p-6'>
                    <h3 className='font-medium text-xl flex items-center gap-3 mb-6 text-gray-900 border-b border-gray-200 pb-3'>
                      <div className='p-2 bg-gray-100 rounded-none'>
                        <ShoppingBag className='h-5 w-5 text-gray-900' />
                      </div>
                      Order Items
                    </h3>
                    <div className='space-y-4'>
                      {localOrderDetails.items.map((item) => (
                        <div
                          key={`${item.id}-${JSON.stringify(
                            item.selectedOptions,
                          )}`}
                          className='bg-white border border-gray-200 rounded-none p-4'>
                          <div className='flex items-center gap-4'>
                            <div className='w-16 h-16 bg-gray-100 rounded-none overflow-hidden flex-shrink-0'>
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
                            <div className='flex-1'>
                              <h4 className='font-medium text-lg text-gray-900'>
                                {item.name}
                              </h4>
                              <p className='text-gray-600 font-light'>
                                Quantity: {item.quantity}
                              </p>
                              {Object.keys(item.selectedOptions).length > 0 && (
                                <div className='flex flex-wrap gap-2 mt-2'>
                                  {Object.entries(item.selectedOptions).map(
                                    ([key, value]) => (
                                      <span
                                        key={key}
                                        className='bg-gray-100 text-gray-800 px-3 py-1 rounded-none text-sm font-medium border border-gray-200'>
                                        {key}: {value}
                                      </span>
                                    ),
                                  )}
                                </div>
                              )}
                            </div>
                            <div className='text-right'>
                              <p className='text-2xl font-light text-gray-900'>
                                EGP {(item.price * item.quantity).toFixed(2)}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Order Summary */}
                  <div className='bg-gray-50 border border-gray-200 rounded-none p-6'>
                    <h3 className='font-medium text-xl mb-6 text-gray-900 border-b border-gray-200 pb-3'>
                      Order Summary
                    </h3>
                    <div className='bg-white border border-gray-200 rounded-none p-6'>
                      <div className='space-y-4'>
                        <div className='flex justify-between text-lg'>
                          <span className='text-gray-600 font-light'>
                            Subtotal:
                          </span>
                          <span className='font-light'>
                            EGP {localOrderDetails.subtotal.toFixed(2)}
                          </span>
                        </div>
                        {localOrderDetails.discount &&
                          localOrderDetails.discount > 0 && (
                            <div className='flex justify-between text-lg text-gray-900'>
                              <span className='font-light'>Discount:</span>
                              <span className='font-light'>
                                -EGP {localOrderDetails.discount.toFixed(2)}
                              </span>
                            </div>
                          )}
                        <div className='flex justify-between text-lg'>
                          <span className='text-gray-600 font-light'>
                            Shipping:
                          </span>
                          <span className='font-light'>
                            EGP {localOrderDetails.shipping.toFixed(2)}
                          </span>
                        </div>
                        <Separator className='my-4' />
                        <div className='flex justify-between text-2xl font-medium text-gray-900 border-t border-gray-200 pt-4'>
                          <span>Total:</span>
                          <span>EGP {localOrderDetails.total.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>

              <CardFooter className='p-8 bg-white border-t border-gray-200'>
                <div className='flex flex-col sm:flex-row gap-4 w-full'>
                  <Link href='/shop' className='flex-1'>
                    <Button
                      variant='outline'
                      className='w-full h-12 text-lg font-light border border-gray-300 rounded-none hover:bg-gray-50'>
                      <Home className='h-5 w-5 mr-2' />
                      Continue Shopping
                    </Button>
                  </Link>
                  <Link href='/dashboard/orders' className='flex-1'>
                    <Button className='w-full h-12 text-lg font-light bg-gray-900 hover:bg-gray-800 rounded-none'>
                      <Truck className='h-5 w-5 mr-2' />
                      Track Order
                    </Button>
                  </Link>
                </div>
              </CardFooter>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div
        className={`min-h-screen bg-white transition-opacity duration-1000 ${
          isVisible ? "opacity-100" : "opacity-0"
        } flex items-center justify-center`}>
        <div className='container mx-auto p-4 max-w-2xl'>
          <Card className='text-center py-16 bg-white border border-gray-200 rounded-none'>
            <CardContent>
              <div className='mb-8'>
                <div className='w-24 h-24 mx-auto bg-gray-100 rounded-none flex items-center justify-center mb-6'>
                  <ShoppingBag className='h-12 w-12 text-gray-900' />
                </div>
                <h2 className='text-3xl font-light mb-4 text-gray-900'>
                  Your cart is empty
                </h2>
                <p className='text-gray-600 text-lg font-light mb-8'>
                  Add some amazing items to your cart before proceeding to
                  checkout.
                </p>
              </div>
              <Link href='/'>
                <Button className='h-12 px-8 text-lg font-light bg-gray-900 hover:bg-gray-800 rounded-none'>
                  <ArrowLeft className='h-5 w-5 mr-2' />
                  Start Shopping
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`min-h-screen bg-white transition-opacity duration-1000 ${
        isVisible ? "opacity-100" : "opacity-0"
      }`}>
      <div className='container mx-auto p-4 max-w-7xl'>
        <div className='mb-8'>
          <Link
            href='/cart'
            className='inline-flex items-center gap-2 text-gray-900 hover:text-gray-600 font-light text-lg transition-colors duration-300'>
            <ArrowLeft className='h-5 w-5' />
            Back to Cart
          </Link>
        </div>

        <div className='grid grid-cols-1 lg:grid-cols-3 gap-8'>
          {/* Checkout Form */}
          <div className='lg:col-span-2'>
            <div className='bg-white border border-gray-200 rounded-none overflow-hidden'>
              <div className='bg-gray-900 text-white relative overflow-hidden'>
                <div className='absolute inset-0 bg-gradient-to-r from-gray-800 to-gray-900 opacity-50' />

                <div className='relative p-6'>
                  <h1 className='flex items-center gap-3 text-2xl font-light'>
                    <div className='p-2 bg-white/10 rounded-none'>
                      <CreditCard className='h-6 w-6' />
                    </div>
                    Secure Checkout
                  </h1>
                  <div className='flex items-center gap-2 mt-2'>
                    <Shield className='h-4 w-4' />
                    <span className='text-gray-300 font-light'>
                      SSL Encrypted & Secure
                    </span>
                  </div>
                </div>
              </div>

              <div className='p-8'>
                <form onSubmit={handleSubmit} className='space-y-8'>
                  {/* Customer Information */}
                  <div className='bg-gray-50 border border-gray-200 rounded-none p-6'>
                    <h3 className='font-medium text-xl flex items-center gap-3 mb-6 text-gray-900 border-b border-gray-200 pb-3'>
                      <div className='p-2 bg-gray-100 rounded-none'>
                        <User className='h-5 w-5 text-gray-900' />
                      </div>
                      Customer Information
                    </h3>
                    <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                      <div>
                        <Label
                          htmlFor='fullName'
                          className='text-sm font-medium text-gray-700 mb-2 block'>
                          Full Name *
                        </Label>
                        <Input
                          id='fullName'
                          name='fullName'
                          value={localFormData.fullName}
                          onChange={handleInputChange}
                          required
                          placeholder='Enter your full name'
                          className='h-12 border border-gray-300 rounded-none focus:border-gray-900 focus:ring-0 transition-colors duration-300'
                        />
                      </div>
                      <div>
                        <Label
                          htmlFor='phoneNumber'
                          className='text-sm font-medium text-gray-700 mb-2 block'>
                          Phone Number *
                        </Label>
                        <Input
                          id='phoneNumber'
                          name='phoneNumber'
                          value={localFormData.phoneNumber}
                          onChange={handleInputChange}
                          required
                          placeholder='Enter your phone number'
                          className='h-12 border border-gray-300 rounded-none focus:border-gray-900 focus:ring-0 transition-colors duration-300'
                        />
                      </div>
                      <div className='md:col-span-2'>
                        <Label
                          htmlFor='email'
                          className='text-sm font-medium text-gray-700 mb-2 block'>
                          Email Address
                        </Label>
                        <Input
                          id='email'
                          name='email'
                          type='email'
                          value={localFormData.email}
                          onChange={handleInputChange}
                          placeholder='Enter your email address'
                          className='h-12 border border-gray-300 rounded-none focus:border-gray-900 focus:ring-0 transition-colors duration-300'
                        />
                      </div>
                    </div>
                  </div>

                  {/* Shipping Information */}
                  <div className='bg-gray-50 border border-gray-200 rounded-none p-6'>
                    <h3 className='font-medium text-xl flex items-center gap-3 mb-6 text-gray-900 border-b border-gray-200 pb-3'>
                      <div className='p-2 bg-gray-100 rounded-none'>
                        <Home className='h-5 w-5 text-gray-900' />
                      </div>
                      Shipping Address
                    </h3>
                    <div className='space-y-6'>
                      <div>
                        <Label
                          htmlFor='address'
                          className='text-sm font-medium text-gray-700 mb-2 block'>
                          Street Address *
                        </Label>
                        <Input
                          id='address'
                          name='address'
                          value={localFormData.address}
                          onChange={handleInputChange}
                          required
                          placeholder='Enter your street address'
                          className='h-12 border border-gray-300 rounded-none focus:border-gray-900 focus:ring-0 transition-colors duration-300'
                        />
                      </div>
                      <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                        <div>
                          <Label
                            htmlFor='city'
                            className='text-sm font-medium text-gray-700 mb-2 block'>
                            City *
                          </Label>
                          <Input
                            id='city'
                            name='city'
                            value={localFormData.city}
                            onChange={handleInputChange}
                            required
                            placeholder='Enter your city'
                            className='h-12 border border-gray-300 rounded-none focus:border-gray-900 focus:ring-0 transition-colors duration-300'
                          />
                        </div>
                        <div>
                          <Label
                            htmlFor='state'
                            className='text-sm font-medium text-gray-700 mb-2 block'>
                            State/Province
                          </Label>
                          <Input
                            id='state'
                            name='state'
                            value={localFormData.state}
                            onChange={handleInputChange}
                            placeholder='Enter your state/province'
                            className='h-12 border border-gray-300 rounded-none focus:border-gray-900 focus:ring-0 transition-colors duration-300'
                          />
                        </div>
                      </div>
                      <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                        <div>
                          <Label
                            htmlFor='postalCode'
                            className='text-sm font-medium text-gray-700 mb-2 block'>
                            Postal Code
                          </Label>
                          <Input
                            id='postalCode'
                            name='postalCode'
                            value={localFormData.postalCode}
                            onChange={handleInputChange}
                            placeholder='Enter your postal code'
                            className='h-12 border border-gray-300 rounded-none focus:border-gray-900 focus:ring-0 transition-colors duration-300'
                          />
                        </div>
                        <div>
                          <Label
                            htmlFor='country'
                            className='text-sm font-medium text-gray-700 mb-2 block'>
                            Country
                          </Label>
                          <Input
                            id='country'
                            name='country'
                            value={localFormData.country}
                            onChange={handleInputChange}
                            placeholder='Enter your country'
                            className='h-12 border border-gray-300 rounded-none focus:border-gray-900 focus:ring-0 transition-colors duration-300'
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Order Notes */}
                  <div className='bg-gray-50 border border-gray-200 rounded-none p-6'>
                    <Label
                      htmlFor='notes'
                      className='text-sm font-medium text-gray-700 mb-2 block'>
                      Order Notes (Optional)
                    </Label>
                    <Textarea
                      id='notes'
                      name='notes'
                      value={localFormData.notes}
                      onChange={handleInputChange}
                      placeholder='Any special instructions for your order...'
                      rows={4}
                      className='border border-gray-300 rounded-none focus:border-gray-900 focus:ring-0 resize-none transition-colors duration-300'
                    />
                  </div>

                  <Button
                    type='submit'
                    className='w-full h-14 text-lg font-light bg-gray-900 hover:bg-gray-800 rounded-none transition-colors duration-300'
                    disabled={localIsSubmitting}>
                    {localIsSubmitting ? (
                      <>
                        <Loader2 className='mr-3 h-6 w-6 animate-spin' />
                        Processing Your Order...
                      </>
                    ) : (
                      <>
                        <Shield className='mr-3 h-6 w-6' />
                        Place Secure Order
                        <ArrowRight className='ml-3 h-6 w-6' />
                      </>
                    )}
                  </Button>
                </form>
              </div>
            </div>
          </div>

          {/* Order Summary */}
          <div className='lg:col-span-1'>
            <ModernOrderSummary
              items={items as CheckoutItem[]}
              subtotal={subtotal}
              shipping={shipping}
              discount={discount}
              total={total}
              promoCode={promoCode}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

function ModernOrderSummary({
  items,
  subtotal,
  shipping,
  discount = 0,
  total,
  promoCode,
}: {
  items: CheckoutItem[];
  subtotal: number;
  shipping: number;
  discount?: number;
  total: number;
  promoCode?: {
    id: string;
    code: string;
    discountType: "percentage" | "fixed_amount";
    discountValue: number;
  } | null;
}) {
  return (
    <div className='sticky top-4 bg-white border border-gray-200 rounded-none overflow-hidden'>
      <div className='bg-gray-900 text-white relative overflow-hidden'>
        <div className='absolute inset-0 bg-gradient-to-r from-gray-800 to-gray-900 opacity-50' />
        <div className='relative p-6'>
          <h2 className='flex items-center gap-3 text-xl font-light'>
            <div className='p-2 bg-white/10 rounded-none'>
              <ShoppingBag className='h-5 w-5' />
            </div>
            Order Summary
          </h2>
        </div>
      </div>

      <div className='p-6 space-y-6'>
        {/* Items */}
        <div className='space-y-4'>
          {items.map((item) => {
            const displayPrice = item.discountPrice || item.price;
            const hasDiscount =
              item.discountPrice &&
              Number(item.discountPrice) < Number(item.price);
            const optionsKey = JSON.stringify(item.selectedOptions);

            return (
              <div
                key={`${item.id}-${optionsKey}`}
                className='bg-gray-50 border border-gray-200 rounded-none p-4'>
                <div className='flex gap-4'>
                  <div className='w-16 h-16 bg-white border border-gray-200 rounded-none overflow-hidden flex-shrink-0'>
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
                    <h4 className='font-medium text-gray-900 truncate'>
                      {item.name}
                    </h4>
                    <p className='text-sm text-gray-600 font-light'>
                      Qty: {item.quantity}
                    </p>
                    {Object.keys(item.selectedOptions).length > 0 && (
                      <div className='flex flex-wrap gap-1 mt-2'>
                        {Object.entries(item.selectedOptions).map(
                          ([key, value]) => (
                            <span
                              key={key}
                              className='text-xs bg-gray-100 text-gray-800 px-2 py-1 rounded-none font-medium border border-gray-200'>
                              {key}: {value}
                            </span>
                          ),
                        )}
                      </div>
                    )}
                    <div className='flex items-center gap-2 mt-2'>
                      {hasDiscount && (
                        <span className='text-sm text-gray-400 line-through'>
                          EGP {item.price.toFixed(2)}
                        </span>
                      )}
                      <span className='font-medium text-gray-900'>
                        EGP {(Number(displayPrice) * item.quantity).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Promo Code */}
        {promoCode && (
          <div className='bg-gray-50 border border-gray-200 rounded-none p-4'>
            <div className='flex items-center justify-between'>
              <div className='flex items-center gap-3'>
                <div className='p-2 bg-gray-100 rounded-none'>
                  <Tag className='h-4 w-4 text-gray-900' />
                </div>
                <span className='font-medium text-gray-900'>
                  {promoCode.code}
                </span>
              </div>
              <span className='font-medium text-gray-900'>
                -
                {promoCode.discountType === "percentage"
                  ? `${promoCode.discountValue}%`
                  : `EGP ${promoCode.discountValue}`}
              </span>
            </div>
          </div>
        )}

        <div className='border-t border-gray-200 my-6' />

        {/* Totals */}
        <div className='space-y-4'>
          <div className='flex justify-between text-lg'>
            <span className='text-gray-600 font-light'>Subtotal:</span>
            <span className='font-light'>EGP {subtotal.toFixed(2)}</span>
          </div>
          {discount > 0 && (
            <div className='flex justify-between text-lg text-gray-900'>
              <span className='font-light'>Discount:</span>
              <span className='font-light'>-EGP {discount.toFixed(2)}</span>
            </div>
          )}
          <div className='flex justify-between text-lg'>
            <span className='text-gray-600 font-light'>Shipping:</span>
            <span className='font-light'>EGP {shipping.toFixed(2)}</span>
          </div>

          <div className='bg-gray-50 border  rounded-none p-4 border-t border-gray-200'>
            <div className='flex justify-between text-2xl font-medium'>
              <span className='text-gray-900'>Total:</span>
              <span className='text-gray-900'>EGP {total.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Trust Indicators */}
        <div className='bg-gray-50 border border-gray-200 rounded-none p-4'>
          <div className='flex items-center justify-center gap-4 text-sm text-gray-600'>
            <div className='flex items-center gap-1'>
              <Shield className='h-4 w-4 text-gray-900' />
              <span className='font-light'>Secure</span>
            </div>
            <div className='flex items-center gap-1'>
              <Star className='h-4 w-4 text-gray-900' />
              <span className='font-light'>Trusted</span>
            </div>
            <div className='flex items-center gap-1'>
              <Truck className='h-4 w-4 text-gray-900' />
              <span className='font-light'>Fast Delivery</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ModernCheckoutTemplate;
