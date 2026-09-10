import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "#root/components/ui/card.jsx";
import { ArrowUpRight, Package, PackageOpen } from "lucide-react";
import { Link } from "#root/components/utils/Link";
import { Badge } from "#root/components/ui/badge.jsx";

interface ProductStatsData {
  total: number;
  outOfStock: number;
  lowStock: number;
  newThisWeek: number;
}

interface ProductStatsCardProps {
  productStats: ProductStatsData;
  isLoading: boolean;
  error: string | null;
}

export const ProductStatsCard = ({
  productStats,
  isLoading,
  error,
}: ProductStatsCardProps) => {
  if (isLoading) {
    return (
      <Card>
        <CardContent className='p-6'>
          <div className='h-24 flex items-center justify-center'>
            <p>Loading product statistics...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className='border-red-200'>
        <CardContent className='p-6'>
          <div className='flex items-center justify-between'>
            <div>
              <p className='text-sm font-medium text-muted-foreground'>
                Total Products
              </p>
              <p className='text-red-500'>Failed to load</p>
            </div>
            <div className='h-12 w-12 rounded-full bg-red-100 dark:bg-red-900 flex items-center justify-center'>
              <Package className='h-6 w-6 text-red-600 dark:text-red-300' />
            </div>
          </div>
          <div className='mt-4 flex items-center text-sm'>
            <p className='text-red-500'>{error}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className='p-6'>
        <div className='flex items-center justify-between'>
          <div>
            <p className='text-sm font-medium text-muted-foreground'>
              Total Products
            </p>
            <p className='text-3xl font-bold'>{productStats.total}</p>
          </div>
          <div className='h-12 w-12 rounded-full bg-purple-100 dark:bg-purple-900 flex items-center justify-center'>
            <Package className='h-6 w-6 text-purple-600 dark:text-purple-300' />
          </div>
        </div>
        <div className='mt-4 flex flex-wrap items-center gap-2 text-sm'>
          {productStats.outOfStock > 0 && (
            <Badge
              variant='outline'
              className='bg-red-100 text-red-800 hover:bg-red-100'>
              {productStats.outOfStock} out of stock
            </Badge>
          )}
          {productStats.lowStock > 0 && (
            <Badge
              variant='outline'
              className='bg-yellow-100 text-yellow-800 hover:bg-yellow-100'>
              {productStats.lowStock} low in stock
            </Badge>
          )}
          {productStats.newThisWeek > 0 && (
            <Badge
              variant='outline'
              className='bg-green-100 text-green-800 hover:bg-green-100'>
              +{productStats.newThisWeek} this week
            </Badge>
          )}
          <Link
            href='/dashboard/products'
            className='ml-auto flex items-center text-blue-600'>
            Manage
            <ArrowUpRight className='h-4 w-4 ml-1' />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
};
