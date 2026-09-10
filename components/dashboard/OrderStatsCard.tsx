import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "#root/components/ui/card.jsx";
import { ArrowUpRight } from "lucide-react";
import { Link } from "#root/components/utils/Link";

interface OrderStatsData {
  pending: number;
  processing: number;
  shipped: number;
  delivered: number;
  cancelled: number;
}

interface OrderStatsCardProps {
  orderStats: OrderStatsData;
  isLoading: boolean;
  error: string | null;
}

export const OrderStatsCard = ({
  orderStats,
  isLoading,
  error,
}: OrderStatsCardProps) => {
  const totalOrders = Object.values(orderStats).reduce(
    (sum, count) => sum + count,
    0
  );

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className='text-lg font-medium'>Order Status</CardTitle>
          <CardDescription>Loading order statistics...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className='h-48 flex items-center justify-center'>
            <p>Loading...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className='border-red-200'>
        <CardHeader>
          <CardTitle className='text-lg font-medium'>Order Status</CardTitle>
          <CardDescription className='text-red-500'>
            Failed to load order statistics
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className='h-48 flex items-center justify-center'>
            <p className='text-red-500'>{error}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className='text-lg font-medium'>Order Status</CardTitle>
        <CardDescription>
          Distribution of orders by current status
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className='space-y-4 p-5'>
          <div className='space-y-2'>
            <div className='flex items-center justify-between text-sm'>
              <div className='flex items-center'>
                <div className='h-3 w-3 rounded-full bg-yellow-400 mr-2'></div>
                <p>Pending</p>
              </div>
              <p className='font-medium'>{orderStats.pending}</p>
            </div>
            <div className='h-2 w-full bg-yellow-100 rounded-full overflow-hidden'>
              <div
                className='h-full bg-yellow-400 rounded-full'
                style={{
                  width: `${
                    totalOrders > 0
                      ? (orderStats.pending / totalOrders) * 100
                      : 0
                  }%`,
                }}></div>
            </div>
          </div>

          <div className='space-y-2'>
            <div className='flex items-center justify-between text-sm'>
              <div className='flex items-center'>
                <div className='h-3 w-3 rounded-full bg-blue-400 mr-2'></div>
                <p>Processing</p>
              </div>
              <p className='font-medium'>{orderStats.processing}</p>
            </div>
            <div className='h-2 w-full bg-blue-100 rounded-full overflow-hidden'>
              <div
                className='h-full bg-blue-400 rounded-full'
                style={{
                  width: `${
                    totalOrders > 0
                      ? (orderStats.processing / totalOrders) * 100
                      : 0
                  }%`,
                }}></div>
            </div>
          </div>

          <div className='space-y-2'>
            <div className='flex items-center justify-between text-sm'>
              <div className='flex items-center'>
                <div className='h-3 w-3 rounded-full bg-purple-400 mr-2'></div>
                <p>Shipped</p>
              </div>
              <p className='font-medium'>{orderStats.shipped}</p>
            </div>
            <div className='h-2 w-full bg-purple-100 rounded-full overflow-hidden'>
              <div
                className='h-full bg-purple-400 rounded-full'
                style={{
                  width: `${
                    totalOrders > 0
                      ? (orderStats.shipped / totalOrders) * 100
                      : 0
                  }%`,
                }}></div>
            </div>
          </div>

          <div className='space-y-2'>
            <div className='flex items-center justify-between text-sm'>
              <div className='flex items-center'>
                <div className='h-3 w-3 rounded-full bg-green-400 mr-2'></div>
                <p>Delivered</p>
              </div>
              <p className='font-medium'>{orderStats.delivered}</p>
            </div>
            <div className='h-2 w-full bg-green-100 rounded-full overflow-hidden'>
              <div
                className='h-full bg-green-400 rounded-full'
                style={{
                  width: `${
                    totalOrders > 0
                      ? (orderStats.delivered / totalOrders) * 100
                      : 0
                  }%`,
                }}></div>
            </div>
          </div>

          <div className='space-y-2'>
            <div className='flex items-center justify-between text-sm'>
              <div className='flex items-center'>
                <div className='h-3 w-3 rounded-full bg-red-400 mr-2'></div>
                <p>Cancelled</p>
              </div>
              <p className='font-medium'>{orderStats.cancelled}</p>
            </div>
            <div className='h-2 w-full bg-red-100 rounded-full overflow-hidden'>
              <div
                className='h-full bg-red-400 rounded-full'
                style={{
                  width: `${
                    totalOrders > 0
                      ? (orderStats.cancelled / totalOrders) * 100
                      : 0
                  }%`,
                }}></div>
            </div>
          </div>
        </div>
      </CardContent>
      <CardFooter className='border-t px-6 py-4'>
        <Link
          href='/dashboard/orders'
          className='flex items-center text-blue-600 text-sm'>
          View all orders
          <ArrowUpRight className='h-4 w-4 ml-1' />
        </Link>
      </CardFooter>
    </Card>
  );
};
