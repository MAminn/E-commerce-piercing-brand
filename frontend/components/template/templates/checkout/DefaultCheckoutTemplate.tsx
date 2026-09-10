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
  Check,
  CreditCard,
  Home,
  Loader2,
  Phone,
  ShoppingBag,
  Truck,
  User,
  Tag,
  X,
} from "lucide-react";
import { useCart } from "#root/lib/context/CartContext";
import { trpc } from "#root/shared/trpc/client";
import type {
  TemplateData,
  CheckoutTemplateData,
  CheckoutItem,
} from "../../templateRegistry";

interface DefaultCheckoutTemplateProps {
  data?: TemplateData;
}

const DefaultCheckoutTemplate: React.FC<DefaultCheckoutTemplateProps> = ({
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
      <div className='container mx-auto p-4 max-w-4xl'>
        <Card className='mb-8'>
          <CardHeader className='bg-green-50 border-b'>
            <div className='flex items-center gap-3'>
              <div className='h-10 w-10 rounded-full bg-green-500 flex items-center justify-center'>
                <Check className='text-white h-6 w-6' />
              </div>
              <div>
                <CardTitle className='text-xl'>Order Confirmed!</CardTitle>
                <p className='text-sm text-gray-500'>
                  Order #{localOrderDetails.id}
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className='pt-6 px-6'>
            <div className='space-y-6'>
              <div>
                <h3 className='font-semibold flex items-center gap-2 mb-3'>
                  <User className='h-4 w-4' />
                  Customer Information
                </h3>
                <div className='grid grid-cols-1 md:grid-cols-2 gap-4 pl-6'>
                  <div>
                    <p className='text-sm text-gray-500'>Name</p>
                    <p>{localOrderDetails.customerInfo.fullName}</p>
                  </div>
                  <div>
                    <p className='text-sm text-gray-500'>Phone</p>
                    <p>{localOrderDetails.customerInfo.phoneNumber}</p>
                  </div>
                  <div>
                    <p className='text-sm text-gray-500'>Email</p>
                    <p>
                      {localOrderDetails.customerInfo.email || "Not provided"}
                    </p>
                  </div>
                </div>
              </div>

              <Separator />

              <div>
                <h3 className='font-semibold flex items-center gap-2 mb-3'>
                  <Home className='h-4 w-4' />
                  Shipping Address
                </h3>
                <div className='pl-6'>
                  <p>{localOrderDetails.customerInfo.address}</p>
                  <p>
                    {localOrderDetails.customerInfo.city},{" "}
                    {localOrderDetails.customerInfo.state}{" "}
                    {localOrderDetails.customerInfo.postalCode}
                  </p>
                  <p>{localOrderDetails.customerInfo.country}</p>
                </div>
              </div>

              <Separator />

              <div>
                <h3 className='font-semibold flex items-center gap-2 mb-3'>
                  <ShoppingBag className='h-4 w-4' />
                  Order Items
                </h3>
                <div className='space-y-3 pl-6'>
                  {localOrderDetails.items.map((item) => (
                    <div
                      key={`${item.id}-${JSON.stringify(item.selectedOptions)}`}
                      className='flex justify-between items-center py-2 border-b border-gray-100 last:border-b-0'>
                      <div className='flex items-center gap-3'>
                        <div className='w-12 h-12 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0'>
                          {item.imageUrl ? (
                            <img
                              src={item.imageUrl}
                              alt={item.name}
                              className='w-full h-full object-cover'
                            />
                          ) : (
                            <div className='w-full h-full flex items-center justify-center text-gray-400'>
                              <ShoppingBag className='h-6 w-6' />
                            </div>
                          )}
                        </div>
                        <div>
                          <p className='font-medium'>{item.name}</p>
                          <p className='text-sm text-gray-500'>
                            Qty: {item.quantity}
                          </p>
                          {Object.keys(item.selectedOptions).length > 0 && (
                            <div className='flex gap-2 mt-1'>
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
                          )}
                        </div>
                      </div>
                      <p className='font-medium'>
                        EGP {(item.price * item.quantity).toFixed(2)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              <div>
                <h3 className='font-semibold mb-3'>Order Summary</h3>
                <div className='space-y-2 pl-6'>
                  <div className='flex justify-between'>
                    <span>Subtotal:</span>
                    <span>EGP {localOrderDetails.subtotal.toFixed(2)}</span>
                  </div>
                  {localOrderDetails.discount &&
                    localOrderDetails.discount > 0 && (
                      <div className='flex justify-between text-green-600'>
                        <span>Discount:</span>
                        <span>
                          -EGP {localOrderDetails.discount.toFixed(2)}
                        </span>
                      </div>
                    )}
                  <div className='flex justify-between'>
                    <span>Shipping:</span>
                    <span>EGP {localOrderDetails.shipping.toFixed(2)}</span>
                  </div>

                  <Separator />
                  <div className='flex justify-between font-semibold text-lg'>
                    <span>Total:</span>
                    <span>EGP {localOrderDetails.total.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
          <CardFooter className='flex gap-4'>
            <Link href='/shop'>
              <Button variant='outline' className='flex items-center gap-2'>
                <Home className='h-4 w-4' />
                Continue Shopping
              </Button>
            </Link>
            <Link href='/dashboard/orders'>
              <Button className='flex items-center gap-2'>
                <Truck className='h-4 w-4' />
                Track Order
              </Button>
            </Link>
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className='container mx-auto p-4 max-w-4xl'>
        <Card className='text-center py-12'>
          <CardContent>
            <ShoppingBag className='mx-auto h-16 w-16 text-gray-400 mb-4' />
            <h2 className='text-2xl font-semibold mb-2'>Your cart is empty</h2>
            <p className='text-gray-600 mb-6'>
              Add some items to your cart before proceeding to checkout.
            </p>
            <Link href='/shop'>
              <Button className='flex items-center gap-2 mx-auto'>
                <ArrowLeft className='h-4 w-4' />
                Continue Shopping
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className='container mx-auto p-4 max-w-6xl'>
      <div className='mb-6'>
        <Link
          href='/cart'
          className='inline-flex items-center gap-2 text-blue-600 hover:text-blue-800'>
          <ArrowLeft className='h-4 w-4' />
          Back to Cart
        </Link>
      </div>

      <div className='grid grid-cols-1 lg:grid-cols-3 gap-8'>
        {/* Checkout Form */}
        <div className='lg:col-span-2'>
          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2'>
                <CreditCard className='h-5 w-5' />
                Checkout Information
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className='space-y-6'>
                {/* Customer Information */}
                <div>
                  <h3 className='font-semibold flex items-center gap-2 mb-4'>
                    <User className='h-4 w-4' />
                    Customer Information
                  </h3>
                  <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                    <div>
                      <Label htmlFor='fullName'>Full Name *</Label>
                      <Input
                        id='fullName'
                        name='fullName'
                        value={localFormData.fullName}
                        onChange={handleInputChange}
                        required
                        placeholder='Enter your full name'
                      />
                    </div>
                    <div>
                      <Label htmlFor='phoneNumber'>Phone Number *</Label>
                      <Input
                        id='phoneNumber'
                        name='phoneNumber'
                        value={localFormData.phoneNumber}
                        onChange={handleInputChange}
                        required
                        placeholder='Enter your phone number'
                      />
                    </div>
                    <div className='md:col-span-2'>
                      <Label htmlFor='email'>Email Address</Label>
                      <Input
                        id='email'
                        name='email'
                        type='email'
                        value={localFormData.email}
                        onChange={handleInputChange}
                        placeholder='Enter your email address'
                      />
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Shipping Information */}
                <div>
                  <h3 className='font-semibold flex items-center gap-2 mb-4'>
                    <Home className='h-4 w-4' />
                    Shipping Address
                  </h3>
                  <div className='space-y-4'>
                    <div>
                      <Label htmlFor='address'>Street Address *</Label>
                      <Input
                        id='address'
                        name='address'
                        value={localFormData.address}
                        onChange={handleInputChange}
                        required
                        placeholder='Enter your street address'
                      />
                    </div>
                    <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                      <div>
                        <Label htmlFor='city'>City *</Label>
                        <Input
                          id='city'
                          name='city'
                          value={localFormData.city}
                          onChange={handleInputChange}
                          required
                          placeholder='Enter your city'
                        />
                      </div>
                      <div>
                        <Label htmlFor='state'>State/Province</Label>
                        <Input
                          id='state'
                          name='state'
                          value={localFormData.state}
                          onChange={handleInputChange}
                          placeholder='Enter your state/province'
                        />
                      </div>
                    </div>
                    <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                      <div>
                        <Label htmlFor='postalCode'>Postal Code</Label>
                        <Input
                          id='postalCode'
                          name='postalCode'
                          value={localFormData.postalCode}
                          onChange={handleInputChange}
                          placeholder='Enter your postal code'
                        />
                      </div>
                      <div>
                        <Label htmlFor='country'>Country</Label>
                        <Input
                          id='country'
                          name='country'
                          value={localFormData.country}
                          onChange={handleInputChange}
                          placeholder='Enter your country'
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Order Notes */}
                <div>
                  <Label htmlFor='notes'>Order Notes (Optional)</Label>
                  <Textarea
                    id='notes'
                    name='notes'
                    value={localFormData.notes}
                    onChange={handleInputChange}
                    placeholder='Any special instructions for your order...'
                    rows={3}
                  />
                </div>

                <Button
                  type='submit'
                  className='w-full'
                  disabled={localIsSubmitting}>
                  {localIsSubmitting ? (
                    <>
                      <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                      Processing Order...
                    </>
                  ) : (
                    <>
                      <CreditCard className='mr-2 h-4 w-4' />
                      Place Order
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Order Summary */}
        <div className='lg:col-span-1'>
          <OrderSummary
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
  );
};

function OrderSummary({
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
    <Card className='sticky top-4'>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <ShoppingBag className='h-5 w-5' />
          Order Summary
        </CardTitle>
      </CardHeader>
      <CardContent className='space-y-4'>
        {/* Items */}
        <div className='space-y-3'>
          {items.map((item) => {
            const displayPrice = item.discountPrice || item.price;
            const hasDiscount =
              item.discountPrice &&
              Number(item.discountPrice) < Number(item.price);
            const optionsKey = JSON.stringify(item.selectedOptions);

            return (
              <div key={`${item.id}-${optionsKey}`} className='flex gap-3'>
                <div className='w-12 h-12 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0'>
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      className='w-full h-full object-cover'
                    />
                  ) : (
                    <div className='w-full h-full flex items-center justify-center text-gray-400'>
                      <ShoppingBag className='h-6 w-6' />
                    </div>
                  )}
                </div>
                <div className='flex-1 min-w-0'>
                  <h4 className='font-medium text-sm truncate'>{item.name}</h4>
                  <p className='text-xs text-gray-500'>Qty: {item.quantity}</p>
                  {Object.keys(item.selectedOptions).length > 0 && (
                    <div className='flex flex-wrap gap-1 mt-1'>
                      {Object.entries(item.selectedOptions).map(
                        ([key, value]) => (
                          <span
                            key={key}
                            className='text-xs bg-gray-100 px-1 py-0.5 rounded'>
                            {key}: {value}
                          </span>
                        ),
                      )}
                    </div>
                  )}
                  <div className='flex items-center gap-2 mt-1'>
                    {hasDiscount && (
                      <span className='text-xs text-gray-400 line-through'>
                        EGP {item.price.toFixed(2)}
                      </span>
                    )}
                    <span className='text-sm font-medium'>
                      EGP {(Number(displayPrice) * item.quantity).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <Separator />

        {/* Promo Code */}
        {promoCode && (
          <div className='flex items-center justify-between p-3 bg-green-50 rounded-lg'>
            <div className='flex items-center gap-2'>
              <Tag className='h-4 w-4 text-green-600' />
              <span className='text-sm font-medium text-green-800'>
                {promoCode.code}
              </span>
            </div>
            <span className='text-sm text-green-600'>
              -
              {promoCode.discountType === "percentage"
                ? `${promoCode.discountValue}%`
                : `EGP ${promoCode.discountValue}`}
            </span>
          </div>
        )}

        {/* Totals */}
        <div className='space-y-2'>
          <div className='flex justify-between text-sm'>
            <span>Subtotal:</span>
            <span>EGP {subtotal.toFixed(2)}</span>
          </div>
          {discount > 0 && (
            <div className='flex justify-between text-sm text-green-600'>
              <span>Discount:</span>
              <span>-EGP {discount.toFixed(2)}</span>
            </div>
          )}
          <div className='flex justify-between text-sm'>
            <span>Shipping:</span>
            <span>EGP {shipping.toFixed(2)}</span>
          </div>
          <Separator />
          <div className='flex justify-between font-semibold'>
            <span>Total:</span>
            <span>EGP {total.toFixed(2)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default DefaultCheckoutTemplate;
