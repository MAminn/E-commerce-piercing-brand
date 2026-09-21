import { Card, CardContent } from "#root/components/ui/card.jsx";
import { Badge } from "#root/components/ui/badge.jsx";
import { DollarSign } from "lucide-react";
import { formatMoneyCompact } from "#root/shared/pricing/format-money";

interface RevenueStatsProps {
  totalRevenue: number;
  percentChange?: number;
  timeFrame?: string;
  isLoading: boolean;
  error: string | null;
}

export const RevenueStatsCard = ({
  totalRevenue,
  percentChange,
  timeFrame = "last month",
  isLoading,
  error,
}: RevenueStatsProps) => {
  if (isLoading) {
    return (
      <Card>
        <CardContent className='p-6'>
          <div className='h-24 flex items-center justify-center'>
            <p>Loading revenue statistics...</p>
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
                Total Revenue
              </p>
              <p className='text-red-500'>Failed to load</p>
            </div>
            <div className='h-12 w-12 rounded-full bg-red-100 dark:bg-red-900 flex items-center justify-center'>
              <DollarSign className='h-6 w-6 text-red-600 dark:text-red-300' />
            </div>
          </div>
          <div className='mt-4 flex items-center text-sm'>
            <p className='text-red-500'>{error}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Compact above a thousand (EGP 12.4K), exact below.
  // Ensure totalRevenue is a valid finite number for SSR safety
  const safeRevenue = Number.isFinite(totalRevenue) ? totalRevenue : 0;
  const formattedRevenue = formatMoneyCompact(safeRevenue);

  return (
    <Card>
      <CardContent className='p-6'>
        <div className='flex items-center justify-between'>
          <div>
            <p className='text-sm font-medium text-muted-foreground'>
              Total Revenue
            </p>
            <p className='text-3xl font-bold'>{formattedRevenue}</p>
          </div>
          <div className='h-12 w-12 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center'>
            <DollarSign className='h-6 w-6 text-green-600 dark:text-green-300' />
          </div>
        </div>
        {percentChange !== undefined && (
          <div className='mt-4 flex items-center text-sm'>
            <Badge
              variant='outline'
              className={`${
                percentChange >= 0
                  ? "bg-green-100 text-green-800 hover:bg-green-100"
                  : "bg-red-100 text-red-800 hover:bg-red-100"
              }`}>
              {percentChange >= 0 ? "+" : ""}
              {percentChange}% from {timeFrame}
            </Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
