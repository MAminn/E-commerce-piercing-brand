import { Link } from "#root/components/utils/Link";
import { Button } from "#root/components/ui/button.jsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "#root/components/ui/card.jsx";
import {
  ArrowUpRight,
  ChevronRight,
  DollarSign,
  Package,
  ShoppingBag,
  ShoppingCart,
  Store,
  Truck,
  Users,
  AlertTriangle,
  PackageOpen,
  TrendingUp,
  Clipboard,
  Clock,
  BarChart3,
  CircleAlert,
  Grid,
  Star,
  Palette,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#root/components/ui/table";
import { Badge } from "#root/components/ui/badge";
import { useRole } from "#root/lib/context/RoleContext";

import type { Product } from "#root/lib/mock-data/products";
import type { Order } from "#root/lib/mock-data/orders";
import { useData } from "vike-react/useData";
import type { Data } from "./+data";
import { ErrorSection } from "#root/components/dashboard/ErrorSection";

// Import all dashboard components from index file
import {
  OrderStatsCard,
  ProductStatsCard,
  TopSellingProductsCard,
  RevenueStatsCard,
  useAnalytics,
} from "#root/components/dashboard";

export default function Dashboard() {
  const { userRole } = useRole();

  return (
    <div className='p-6'>
      <div className='flex justify-between items-center mb-6'>
        <div>
          <h1 className='text-2xl font-bold tracking-tight'>
            Dashboard Overview
          </h1>
          <p className='text-muted-foreground'>
            Platform-wide metrics and store management
          </p>
        </div>
      </div>

      {userRole === "admin" ? (
        <AdminDashboard />
      ) : (
        <ErrorSection error='Dashboard access is restricted to administrators in single-shop mode' />
      )}
    </div>
  );
}

function AdminDashboard() {
  const fetchData = useData<Data>();
  const analytics = useAnalytics("admin");

  if (!fetchData.success) {
    return <ErrorSection error={fetchData.error} />;
  }

  const data = fetchData.result;
  const pendingOrdersCount = analytics.orderStats.data?.pending || 0;
  const outOfStockCount = analytics.productStats.data?.outOfStock || 0;

  return (
    <div className='space-y-6'>
      {(pendingOrdersCount > 0 || outOfStockCount > 0) && (
        <Card className='bg-orange-50 border-orange-200 dark:bg-orange-900/20 dark:border-orange-800'>
          <CardHeader>
            <div className='flex items-center'>
              <AlertTriangle className='h-5 w-5 text-orange-500 mr-2' />
              <CardTitle className='text-lg font-medium'>
                Attention Required
              </CardTitle>
            </div>
            <CardDescription>Items that need your attention</CardDescription>
          </CardHeader>
          <CardContent className='p-4'>
            <ul className='space-y-3'>
              {pendingOrdersCount > 0 && (
                <li className='flex items-center text-sm'>
                  <CircleAlert className='h-4 w-4 text-blue-600 mr-2' />
                  <span>{pendingOrdersCount} orders awaiting processing</span>
                  <Link
                    href='/dashboard/orders'
                    className='ml-auto text-blue-600'>
                    View
                  </Link>
                </li>
              )}
              {outOfStockCount > 0 && (
                <li className='flex items-center text-sm'>
                  <CircleAlert className='h-4 w-4 text-red-600 mr-2' />
                  <span>{outOfStockCount} products out of stock</span>
                  <Link
                    href='/dashboard/products'
                    className='ml-auto text-blue-600'>
                    Check
                  </Link>
                </li>
              )}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
        <ProductStatsCard
          productStats={
            analytics?.productStats?.data || {
              total: 0,
              outOfStock: 0,
              lowStock: 0,
              newThisWeek: 0,
            }
          }
          isLoading={analytics?.productStats?.isLoading || false}
          error={analytics?.productStats?.error || null}
        />

        <Card>
          <CardContent className='p-6'>
            <div className='flex items-center justify-between'>
              <div>
                <p className='text-sm font-medium text-muted-foreground'>
                  Website Templates
                </p>
                <p className='text-3xl font-bold'>Active</p>
              </div>
              <div className='h-12 w-12 rounded-full bg-purple-100 dark:bg-purple-900 flex items-center justify-center'>
                <Palette className='h-6 w-6 text-purple-600 dark:text-purple-300' />
              </div>
            </div>
            <div className='mt-4 flex items-center text-sm'>
              <Badge
                variant='outline'
                className='bg-blue-100 text-blue-800 hover:bg-blue-100'>
                Customization Ready
              </Badge>
              <Button
                variant='ghost'
                size='sm'
                className='ml-auto flex items-center text-blue-600 hover:text-blue-800'
                onClick={() => {
                  // Template management functionality will be added here
                  alert("Template management coming soon!");
                }}>
                Manage
                <ChevronRight className='h-4 w-4 ml-1' />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* <RevenueStatsCard
          totalRevenue={analytics.totalRevenue.data || 0}
          percentChange={8}
          timeFrame="last month"
          isLoading={analytics.totalRevenue.isLoading}
          error={analytics.totalRevenue.error}
        /> */}

        {/* <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Total Customers
                </p>
                <p className="text-3xl font-bold">2,845</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-orange-100 dark:bg-orange-900 flex items-center justify-center">
                <Users className="h-6 w-6 text-orange-600 dark:text-orange-300" />
              </div>
            </div>
            <div className="mt-4 flex items-center text-sm">
              <Badge
                variant="outline"
                className="bg-green-100 text-green-800 hover:bg-green-100"
              >
                +5 new this week
              </Badge>
            </div>
          </CardContent>
        </Card> */}
      </div>

      <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
        <OrderStatsCard
          orderStats={
            analytics?.orderStats?.data || {
              pending: 0,
              processing: 0,
              shipped: 0,
              delivered: 0,
              cancelled: 0,
            }
          }
          isLoading={analytics?.orderStats?.isLoading || false}
          error={analytics?.orderStats?.error || null}
        />

        <RevenueStatsCard
          totalRevenue={analytics?.totalRevenue?.data || 0}
          isLoading={analytics?.totalRevenue?.isLoading || false}
          error={analytics?.totalRevenue?.error || null}
        />
      </div>

      {/* <div className="grid grid-cols-1 gap-6">
        <TopSellingProductsCard
          products={analytics.topSellingProducts.data}
          isLoading={analytics.topSellingProducts.isLoading}
          error={analytics.topSellingProducts.error}
          showVendor={false}
        />
      </div> */}
    </div>
  );
}
