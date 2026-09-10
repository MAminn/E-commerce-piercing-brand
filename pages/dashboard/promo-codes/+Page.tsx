import { useState, useEffect, lazy, Suspense } from "react";
import { useData } from "vike-react/useData";
import type { PromoCodesPageData } from "./+data";
import { trpc } from "#root/shared/trpc/client";
import { toast } from "sonner";

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "#root/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#root/components/ui/table";
import { Button } from "#root/components/ui/button";
import { Badge } from "#root/components/ui/badge";
import { PlusCircle, Edit, Trash2, TicketPercent, Loader2 } from "lucide-react";
import { Input } from "#root/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#root/components/ui/select";
import { useDebounce } from "use-debounce";
import { usePageContext } from "vike-react/usePageContext";
import { ErrorSection } from "#root/components/dashboard/ErrorSection";
import { navigate } from "vike/client/router";
import { Pagination } from "#root/components/utils/Pagination";

// Define PromoCode type
type PromoCodeStatus =
  | "active"
  | "inactive"
  | "expired"
  | "exhausted"
  | "scheduled";
type PromoCodeSortBy =
  | "createdAt"
  | "code"
  | "status"
  | "endDate"
  | "startDate"
  | "discountValue";
type PromoCodeSortOrder = "asc" | "desc";

type PromoCode = {
  id: string;
  code: string;
  description: string | null;
  discountType: "percentage" | "fixed_amount";
  discountValue: number;
  status: PromoCodeStatus;
  startDate: Date | string | null;
  endDate: Date | string | null;
  usageLimit: number | null;
  usedCount: number;
  usageLimitPerUser: number | null;
  minPurchaseAmount: number | null;
  appliesToAllProducts: boolean;
  createdBy: string | null;
  createdAt: Date | string;
  updatedAt: Date | string | null;
  applicableProductIds: string[];
  applicableCategoryIds: string[];
};

// Lazy load the form component
const PromoCodeForm = lazy(() =>
  import("./components").then((mod) => ({ default: mod.PromoCodeForm }))
);

// Placeholder for form loader
function PromoCodeFormLoader() {
  return (
    <div className='p-6 flex justify-center items-center'>
      <Loader2 className='h-8 w-8 animate-spin text-primary' />
      <p className='ml-2'>Loading form...</p>
    </div>
  );
}

// Define better types for the product and category data structures
type ProductData = {
  product: {
    id: string;
    name: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

type CategoryData = {
  id: string;
  name: string;
  type?: string;
  [key: string]: unknown;
};

// Update transformation functions with proper types
const transformProducts = (
  productsData: ProductData[]
): { id: string; name: string }[] => {
  if (!productsData || !Array.isArray(productsData)) return [];

  return productsData.map((item) => ({
    id: item.product.id,
    name: item.product.name,
  }));
};

const transformCategories = (
  categoriesData: CategoryData[]
): { id: string; name: string; type: string }[] => {
  if (!categoriesData || !Array.isArray(categoriesData)) return [];

  return categoriesData.map((category) => ({
    id: category.id,
    name: category.name,
    type: category.type || "",
  }));
};

export default function PromoCodesPage() {
  const initialData = useData<PromoCodesPageData>();
  const pageContext = usePageContext();

  // Parse URL query parameters
  const [searchCode, setSearchCode] = useState(
    pageContext.urlParsed.search.promoSearch || ""
  );
  const [debouncedSearchCode] = useDebounce(searchCode, 500);
  const [statusFilter, setStatusFilter] = useState<PromoCodeStatus | "all">(
    (pageContext.urlParsed.search.promoStatus as PromoCodeStatus) || "all"
  );
  const [sortBy, setSortBy] = useState<PromoCodeSortBy>(
    (pageContext.urlParsed.search.promoSortBy as PromoCodeSortBy) || "createdAt"
  );
  const [sortOrder, setSortOrder] = useState<PromoCodeSortOrder>(
    (pageContext.urlParsed.search.promoSortOrder as PromoCodeSortOrder) ||
      "desc"
  );
  const [currentPage, setCurrentPage] = useState(
    Number.parseInt(pageContext.urlParsed.search.promoPage || "1", 10) || 1
  );
  const [isLoading, setIsLoading] = useState(false);
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState<string | null>(null);

  // For handling create/edit dialogs
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingPromoCodeId, setEditingPromoCodeId] = useState<string | null>(
    null
  );

  useEffect(() => {
    if (initialData.success) {
      setPromoCodes(initialData.promoCodesData?.items || []);
      setTotalPages(initialData.promoCodesData?.totalPages || 1);
    } else {
      setError(initialData.error || "Failed to load promo codes");
    }
  }, [initialData]);

  // Effect to update URL when filters change
  useEffect(() => {
    const searchParams = new URLSearchParams();
    if (debouncedSearchCode)
      searchParams.set("promoSearch", debouncedSearchCode);
    if (statusFilter && statusFilter !== "all")
      searchParams.set("promoStatus", statusFilter);
    if (sortBy) searchParams.set("promoSortBy", sortBy);
    if (sortOrder) searchParams.set("promoSortOrder", sortOrder);
    if (currentPage > 1) searchParams.set("promoPage", String(currentPage));

    navigate(`/dashboard/promo-codes?${searchParams.toString()}`, {
      keepScrollPosition: true,
    });

    // Fetch updated data
    fetchPromoCodes();
  }, [debouncedSearchCode, statusFilter, sortBy, sortOrder, currentPage]);

  const fetchPromoCodes = async () => {
    setIsLoading(true);
    try {
      const response = await trpc.promoCode.list.query({
        searchCode: debouncedSearchCode || undefined,
        status: statusFilter === "all" ? undefined : statusFilter,
        sortBy,
        sortOrder,
        page: currentPage,
        limit: 10,
      });

      if (response.success) {
        setPromoCodes(response.result.items || []);
        setTotalPages(response.result.totalPages || 1);
        setError(null);
      } else {
        setError(response.error || "Failed to fetch promo codes");
        toast.error(response.error || "Failed to fetch promo codes");
      }
    } catch (err) {
      console.error("Failed to fetch promo codes:", err);
      setError("Failed to fetch promo codes. Please try again.");
      toast.error("Failed to fetch promo codes");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateNew = () => {
    setEditingPromoCodeId(null);
    setIsFormOpen(true);
  };

  const handleEdit = (id: string) => {
    setEditingPromoCodeId(id);
    setIsFormOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this promo code?")) return;

    setIsLoading(true);
    try {
      await trpc.promoCode.delete.mutate({ id });
      toast.success("Promo code deleted successfully");
      fetchPromoCodes();
    } catch (err) {
      console.error("Failed to delete promo code:", err);
      toast.error("Failed to delete promo code");
    } finally {
      setIsLoading(false);
    }
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handleFormSuccess = () => {
    fetchPromoCodes();
    setIsFormOpen(false);
    setEditingPromoCodeId(null);
  };

  if (initialData.success === false) {
    return <ErrorSection error={initialData.error || "Unknown error"} />;
  }

  const promoCodeStatuses: PromoCodeStatus[] = [
    "active",
    "inactive",
    "expired",
    "exhausted",
    "scheduled",
  ];
  const sortableFields: PromoCodeSortBy[] = [
    "code",
    "status",
    "discountValue",
    "startDate",
    "endDate",
    "createdAt",
  ];

  return (
    <div className='p-4 md:p-6 space-y-6'>
      <Card>
        <CardHeader>
          <div className='flex flex-col md:flex-row justify-between items-start md:items-center gap-4'>
            <div>
              <CardTitle className='flex items-center'>
                <TicketPercent className='h-6 w-6 mr-2' />
                Manage Promo Codes
              </CardTitle>
              <CardDescription>
                Create, view, update, and delete promotional codes for your
                store.
              </CardDescription>
            </div>
            <Button onClick={handleCreateNew} className='w-full md:w-auto'>
              <PlusCircle className='mr-2 h-4 w-4' /> Create New Promo Code
            </Button>
          </div>
        </CardHeader>
        <CardContent className=' px-4'>
          {/* Filters and Search */}
          <div className='mb-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end'>
            <div className='space-y-1'>
              <label htmlFor='searchCode' className='text-sm font-medium'>
                Search Code
              </label>
              <Input
                id='searchCode'
                placeholder='Enter code...'
                value={searchCode}
                onChange={(e) => {
                  setSearchCode(e.target.value);
                  setCurrentPage(1);
                }}
                className='w-full'
              />
            </div>
            <div className='space-y-1'>
              <label htmlFor='statusFilter' className='text-sm font-medium'>
                Status
              </label>
              <Select
                value={statusFilter}
                onValueChange={(value) => {
                  setStatusFilter(value as PromoCodeStatus | "all");
                  setCurrentPage(1);
                }}>
                <SelectTrigger id='statusFilter' className='w-full'>
                  <SelectValue placeholder='Filter by status' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>All Statuses</SelectItem>
                  {promoCodeStatuses.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status.charAt(0).toUpperCase() + status.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className='space-y-1'>
              <label htmlFor='sortBy' className='text-sm font-medium'>
                Sort By
              </label>
              <Select
                value={sortBy}
                onValueChange={(value) => {
                  setSortBy(value as PromoCodeSortBy);
                  setCurrentPage(1);
                }}>
                <SelectTrigger id='sortBy' className='w-full'>
                  <SelectValue placeholder='Sort by field' />
                </SelectTrigger>
                <SelectContent>
                  {sortableFields.map((field) => (
                    <SelectItem key={field} value={field}>
                      {field.charAt(0).toUpperCase() +
                        field.slice(1).replace(/([A-Z])/g, " $1")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className='space-y-1'>
              <label htmlFor='sortOrder' className='text-sm font-medium'>
                Order
              </label>
              <Select
                value={sortOrder}
                onValueChange={(value) => {
                  setSortOrder(value as PromoCodeSortOrder);
                  setCurrentPage(1);
                }}>
                <SelectTrigger id='sortOrder' className='w-full'>
                  <SelectValue placeholder='Sort order' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='asc'>Ascending</SelectItem>
                  <SelectItem value='desc'>Descending</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {isLoading && promoCodes.length === 0 && (
            <div className='flex justify-center items-center py-10'>
              <Loader2 className='h-8 w-8 animate-spin text-primary' />
              <p className='ml-2'>Loading promo codes...</p>
            </div>
          )}
          {error && promoCodes.length === 0 && <ErrorSection error={error} />}
          {!isLoading && !error && promoCodes.length === 0 && (
            <div className='text-center py-10'>
              <TicketPercent className='h-16 w-16 mx-auto text-muted-foreground mb-4' />
              <h3 className='text-xl font-semibold'>No Promo Codes Found</h3>
              <p className='text-muted-foreground mb-4'>
                Try adjusting your filters or create a new promo code.
              </p>
              <Button onClick={handleCreateNew}>
                <PlusCircle className='mr-2 h-4 w-4' /> Create New Promo Code
              </Button>
            </div>
          )}
          {promoCodes.length > 0 && (
            <>
              <div className='overflow-x-auto'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Discount</TableHead>
                      <TableHead>Usage</TableHead>
                      <TableHead>Dates (Start - End)</TableHead>
                      <TableHead className='text-right'>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {promoCodes.map((promo) => (
                      <TableRow key={promo.id}>
                        <TableCell className='font-medium'>
                          {promo.code}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              promo.status === "active"
                                ? "default"
                                : promo.status === "scheduled"
                                ? "outline"
                                : "destructive"
                            }>
                            {promo.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {promo.discountValue}
                          {promo.discountType === "percentage"
                            ? "%"
                            : " (fixed)"}
                        </TableCell>
                        <TableCell>
                          {promo.usedCount} / {promo.usageLimit ?? "∞"}
                        </TableCell>
                        <TableCell>
                          {promo.startDate
                            ? new Date(promo.startDate).toLocaleDateString()
                            : "N/A"}{" "}
                          -{" "}
                          {promo.endDate
                            ? new Date(promo.endDate).toLocaleDateString()
                            : "N/A"}
                        </TableCell>
                        <TableCell className='text-right space-x-2'>
                          <Button
                            variant='outline'
                            size='sm'
                            onClick={() => handleEdit(promo.id)}>
                            <Edit className='h-4 w-4 mr-1' /> Edit
                          </Button>
                          <Button
                            variant='destructive'
                            size='sm'
                            onClick={() => handleDelete(promo.id)}>
                            <Trash2 className='h-4 w-4 mr-1' /> Delete
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className='mt-4'>
                  <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={handlePageChange}
                  />
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Form Dialog */}
      <Suspense fallback={<PromoCodeFormLoader />}>
        {isFormOpen && (
          <PromoCodeForm
            isOpen={isFormOpen}
            onClose={() => setIsFormOpen(false)}
            promoCodeId={editingPromoCodeId}
            onSuccess={handleFormSuccess}
            products={
              initialData.success
                ? transformProducts(initialData.productsData)
                : []
            }
            categories={
              initialData.success
                ? transformCategories(initialData.categoriesData)
                : []
            }
          />
        )}
      </Suspense>
    </div>
  );
}
