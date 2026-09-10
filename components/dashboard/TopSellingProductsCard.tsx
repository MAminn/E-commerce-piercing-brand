import { useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "#root/components/ui/card.jsx";
import { Input } from "#root/components/ui/input";
import { ArrowUpRight, Search, TrendingUp } from "lucide-react";
import { Link } from "#root/components/utils/Link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#root/components/ui/table";

interface TopSellingProduct {
  id: string;
  name: string;
  price: number;
  sold: number;
  revenue: number;
  vendorName?: string;
}

interface TopSellingProductsCardProps {
  products: TopSellingProduct[];
  isLoading: boolean;
  error: string | null;
  showVendor?: boolean;
}

const TABLE_MAX_HEIGHT = "max-h-[240px]";

export const TopSellingProductsCard = ({
  products,
  isLoading,
  error,
  showVendor = false,
}: TopSellingProductsCardProps) => {
  const [search, setSearch] = useState("");

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return products;
    return products.filter((product) =>
      product.name.toLowerCase().includes(query),
    );
  }, [products, search]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <div className='flex items-center'>
            <TrendingUp className='h-5 w-5 text-muted-foreground mr-2' />
            <CardTitle className='text-lg font-medium'>
              Top Selling Products
            </CardTitle>
          </div>
          <CardDescription>Loading top products...</CardDescription>
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
          <div className='flex items-center'>
            <TrendingUp className='h-5 w-5 text-red-500 mr-2' />
            <CardTitle className='text-lg font-medium'>
              Top Selling Products
            </CardTitle>
          </div>
          <CardDescription className='text-red-500'>
            Failed to load top products
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

  if (products.length === 0) {
    return (
      <Card>
        <CardHeader>
          <div className='flex items-center'>
            <TrendingUp className='h-5 w-5 text-muted-foreground mr-2' />
            <CardTitle className='text-lg font-medium'>
              Top Selling Products
            </CardTitle>
          </div>
          <CardDescription>Products with highest sales</CardDescription>
        </CardHeader>
        <CardContent>
          <div className='h-48 flex items-center justify-center'>
            <p className='text-muted-foreground'>
              No product sales data available
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className='space-y-3'>
        <div className='flex items-center'>
          <TrendingUp className='h-5 w-5 text-muted-foreground mr-2' />
          <CardTitle className='text-lg font-medium'>
            Top Selling Products
          </CardTitle>
        </div>
        <CardDescription>
          {products.length} sold product{products.length === 1 ? "" : "s"} by
          units sold
        </CardDescription>
        <div className='relative'>
          <Search className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder='Search products...'
            className='pl-9'
          />
        </div>
      </CardHeader>
      <CardContent>
        <div className={`overflow-y-auto ${TABLE_MAX_HEIGHT}`}>
          <Table>
            <TableHeader className='sticky top-0 bg-card z-10'>
              <TableRow>
                <TableHead>Product</TableHead>
                {showVendor && <TableHead>Vendor</TableHead>}
                <TableHead>Price</TableHead>
                <TableHead>Sold</TableHead>
                <TableHead>Revenue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProducts.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={showVendor ? 5 : 4}
                    className='text-center text-muted-foreground py-8'>
                    No products match &ldquo;{search}&rdquo;
                  </TableCell>
                </TableRow>
              ) : (
                filteredProducts.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell className='font-medium'>{product.name}</TableCell>
                    {showVendor && (
                      <TableCell>{product.vendorName || "N/A"}</TableCell>
                    )}
                    <TableCell>{product.price.toFixed(2)} EGP</TableCell>
                    <TableCell>{product.sold}</TableCell>
                    <TableCell className='font-semibold'>
                      {product.revenue.toFixed(2)} EGP
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        {search.trim() && filteredProducts.length > 0 && (
          <p className='mt-2 text-xs text-muted-foreground'>
            Showing {filteredProducts.length} of {products.length} products
          </p>
        )}
      </CardContent>
      <CardFooter className='border-t px-6 py-4'>
        <Link
          href='/dashboard/products'
          className='flex items-center text-blue-600 text-sm'>
          View all products
          <ArrowUpRight className='h-4 w-4 ml-1' />
        </Link>
      </CardFooter>
    </Card>
  );
};
