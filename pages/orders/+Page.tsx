"use client";

import { useEffect, useState, useContext } from "react";
import { trpc } from "#root/shared/trpc/client";
import { AuthContext } from "#root/context/AuthContext";
import { Link } from "#root/components/utils/Link";
import { navigate } from "vike/client/router";
import {
  Package,
  Clock,
  Truck,
  CheckCircle,
  XCircle,
  ChevronRight,
  ShoppingBag,
  Loader2,
} from "lucide-react";
import { Button } from "#root/components/ui/button";
import { Badge } from "#root/components/ui/badge";

interface OrderItem {
  id: string;
  productId: string;
  quantity: number;
  price: string;
  discountPrice: string | null;
  name: string | null;
}

interface Order {
  id: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string;
  shippingAddress: string;
  shippingCity: string;
  shippingState: string | null;
  shippingCountry: string | null;
  subtotal: string;
  shipping: string;
  discount: string | null;
  total: string;
  status: string;
  notes: string | null;
  createdAt: string;
  items: OrderItem[];
}

const statusConfig: Record<
  string,
  { label: string; icon: React.ElementType; color: string; bg: string }
> = {
  pending: {
    label: "Pending",
    icon: Clock,
    color: "text-amber-700",
    bg: "bg-amber-50 border-amber-200",
  },
  processing: {
    label: "Processing",
    icon: Package,
    color: "text-blue-700",
    bg: "bg-blue-50 border-blue-200",
  },
  shipped: {
    label: "Shipped",
    icon: Truck,
    color: "text-purple-700",
    bg: "bg-purple-50 border-purple-200",
  },
  delivered: {
    label: "Delivered",
    icon: CheckCircle,
    color: "text-green-700",
    bg: "bg-green-50 border-green-200",
  },
  cancelled: {
    label: "Cancelled",
    icon: XCircle,
    color: "text-red-700",
    bg: "bg-red-50 border-red-200",
  },
};

export default function OrderHistoryPage() {
  const { session } = useContext(AuthContext);
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);

  useEffect(() => {
    if (!session) {
      navigate("/login");
      return;
    }

    trpc.order.view
      .query({ limit: 50, offset: 0 })
      .then((res: any) => {
        if (res.success) {
          setOrders(res.result?.items ?? []);
        } else {
          setError(res.error ?? "Failed to load orders");
        }
      })
      .catch((err: any) => {
        setError(err.message ?? "Something went wrong");
      })
      .finally(() => setIsLoading(false));
  }, [session]);

  if (!session) return null;

  if (isLoading) {
    return (
      <div className='min-h-screen bg-gray-50 flex items-center justify-center'>
        <Loader2 className='w-6 h-6 animate-spin text-gray-400' />
      </div>
    );
  }

  if (error) {
    return (
      <div className='min-h-screen bg-gray-50 flex items-center justify-center px-4'>
        <div className='text-center'>
          <p className='text-red-500 mb-4'>{error}</p>
          <Button onClick={() => window.location.reload()} variant='outline'>
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className='min-h-screen bg-gray-50 py-12 md:py-20 px-4'>
      <div className='max-w-3xl mx-auto'>
        {/* Header */}
        <div className='mb-8'>
          <h1 className='text-2xl md:text-3xl font-semibold text-gray-900'>
            My Orders
          </h1>
          <p className='text-gray-500 mt-1'>
            Track and manage your recent purchases
          </p>
        </div>

        {/* Empty state */}
        {orders.length === 0 ? (
          <div className='bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center'>
            <ShoppingBag className='w-12 h-12 text-gray-300 mx-auto mb-4' />
            <h2 className='text-lg font-medium text-gray-900 mb-2'>
              No orders yet
            </h2>
            <p className='text-gray-500 mb-6'>
              When you place an order, it will appear here.
            </p>
            <Button asChild className='bg-black text-white hover:bg-gray-800'>
              <Link href='/shop'>Start Shopping</Link>
            </Button>
          </div>
        ) : (
          <div className='space-y-4'>
            {orders.map((order) => {
              const status = (statusConfig[
                order.status as keyof typeof statusConfig
              ] ?? statusConfig.pending)!;
              const StatusIcon = status.icon;
              const isExpanded = expandedOrder === order.id;

              return (
                <div
                  key={order.id}
                  className='bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden'>
                  {/* Order header — clickable */}
                  <button
                    type='button'
                    onClick={() =>
                      setExpandedOrder(isExpanded ? null : order.id)
                    }
                    className='w-full p-5 flex items-center justify-between text-left hover:bg-gray-50/50 transition-colors'>
                    <div className='flex items-center gap-4 min-w-0'>
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${status.bg}`}>
                        <StatusIcon className={`w-5 h-5 ${status.color}`} />
                      </div>
                      <div className='min-w-0'>
                        <p className='text-sm font-medium text-gray-900'>
                          Order #{order.id.substring(0, 8).toUpperCase()}
                        </p>
                        <p className='text-xs text-gray-400 mt-0.5'>
                          {new Date(order.createdAt).toLocaleDateString(
                            "en-US",
                            {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            },
                          )}
                          {" · "}
                          {order.items.length} item
                          {order.items.length !== 1 ? "s" : ""}
                        </p>
                      </div>
                    </div>
                    <div className='flex items-center gap-4 shrink-0'>
                      <div className='text-right'>
                        <p className='text-sm font-semibold text-gray-900'>
                          {Number.parseFloat(order.total).toFixed(2)} EGP
                        </p>
                        <Badge
                          variant='outline'
                          className={`text-[10px] mt-1 ${status.color} ${status.bg}`}>
                          {status.label}
                        </Badge>
                      </div>
                      <ChevronRight
                        className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                      />
                    </div>
                  </button>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className='border-t border-gray-100 px-5 pb-5'>
                      {/* Items */}
                      <div className='mt-4 space-y-3'>
                        {order.items.map((item) => {
                          const price = item.discountPrice
                            ? Number.parseFloat(item.discountPrice)
                            : Number.parseFloat(item.price);
                          return (
                            <div
                              key={item.id}
                              className='flex items-center justify-between text-sm'>
                              <div className='flex items-center gap-2 min-w-0'>
                                <span className='text-gray-900 truncate'>
                                  {item.name ?? "Product"}
                                </span>
                                <span className='text-gray-400'>
                                  ×{item.quantity}
                                </span>
                              </div>
                              <span className='text-gray-700 shrink-0'>
                                {(price * item.quantity).toFixed(2)} EGP
                              </span>
                            </div>
                          );
                        })}
                      </div>

                      {/* Totals */}
                      <div className='mt-4 pt-3 border-t border-gray-50 space-y-1.5 text-sm'>
                        <div className='flex justify-between text-gray-500'>
                          <span>Subtotal</span>
                          <span>
                            {Number.parseFloat(order.subtotal).toFixed(2)} EGP
                          </span>
                        </div>
                        {order.discount && (
                          <div className='flex justify-between text-green-600'>
                            <span>Discount</span>
                            <span>
                              -{Number.parseFloat(order.discount).toFixed(2)}{" "}
                              EGP
                            </span>
                          </div>
                        )}
                        <div className='flex justify-between text-gray-500'>
                          <span>Shipping</span>
                          <span>
                            {Number.parseFloat(order.shipping).toFixed(2)} EGP
                          </span>
                        </div>
                        <div className='flex justify-between font-semibold text-gray-900 pt-1'>
                          <span>Total</span>
                          <span>
                            {Number.parseFloat(order.total).toFixed(2)} EGP
                          </span>
                        </div>
                      </div>

                      {/* Shipping info */}
                      <div className='mt-4 pt-3 border-t border-gray-50 text-sm text-gray-500'>
                        <p className='font-medium text-gray-700 mb-1'>
                          Shipping to
                        </p>
                        <p>
                          {order.shippingAddress}, {order.shippingCity}
                          {order.shippingState
                            ? `, ${order.shippingState}`
                            : ""}
                          {order.shippingCountry
                            ? ` — ${order.shippingCountry}`
                            : ""}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
