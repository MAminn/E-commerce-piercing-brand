import { useEffect, useState } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "#root/components/ui/dialog";
import { Input } from "#root/components/ui/input.jsx";
import { Tabs, TabsList, TabsTrigger } from "#root/components/ui/tabs";
import type { Data } from "./+data";
import { useData } from "vike-react/useData";
import { ErrorSection } from "#root/components/dashboard/ErrorSection";
import { ProductForm } from "./components";
import type { FileMetadata } from "./components";
import { trpc } from "#root/shared/trpc/client";
import { toast } from "sonner";
import { usePageContext } from "vike-react/usePageContext";
import { useDebounce } from "use-debounce";
import { z } from "zod";
import { Pagination } from "#root/components/utils/Pagination";
import { navigate } from "vike/client/router";

// Define product form schema type to match server expectations
type ProductFormSchema = {
  name: string;
  description: string;
  price: number;
  discountPrice?: number | null;
  stock: number;
  imageId: string;
  productImages?: FileMetadata[];
  categoryId: string;
  categoryIds: string[];
  variants?: { name: string; values: string[] }[];
};

interface Product {
  id: number;
  name: string;
  price: number;
  discountPrice?: number | null;
  stock: number;
  imageUrl?: string;
  isOutOfStock: boolean;
}

// Type definition for product image from API
interface ProductImageResponse {
  productId: string;
  fileId: string;
  isPrimary: boolean;
  diskname: string;
}

export default function Products() {
  const pageContext = usePageContext();
  const session = pageContext.clientSession;

  const initialData = useData<Data>();
  const [lastFetchDate, setLastFetchDate] = useState(new Date());
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [productImages, setProductImages] = useState<FileMetadata[]>([]);
  const [isLoadingImages, setIsLoadingImages] = useState(false);
  const [newProduct, setNewProduct] = useState<Product>({
    id: 0,
    name: "",
    price: 0,
    stock: 0,
    isOutOfStock: false,
  });
  const [search, setSearch] = useState(
    pageContext.urlParsed.search.search || ""
  );
  const [searchQueryValue] = useDebounce(search, 1000);
  const [sortBy, setSortBy] = useState<string>(
    pageContext.urlParsed.search.sortBy || "name"
  );
  const [selectedProductCategories, setSelectedProductCategories] = useState<
    string[]
  >([]);

  if (!initialData.success) {
    return <ErrorSection error={initialData.error} />;
  }

  const {
    products: productsData,
    categories,
    vendors,
    categoryId,
    totalPages,
    currentPage,
    limit,
  } = initialData;

  const selectedProductData = productsData.find(
    ({ product }) => product.id === selectedProduct
  );

  const handlePageChange = (page: number) => {
    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.set("page", String(page));
    if (!currentUrl.searchParams.has("limit")) {
      currentUrl.searchParams.set("limit", String(limit));
    }
    navigate(currentUrl.pathname + currentUrl.search);
  };

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(event.target.value);
  };

  const handleSortChange = (value: string) => {
    setSortBy(value);
    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.set("sortBy", value);
    currentUrl.searchParams.set("page", "1");
    navigate(currentUrl.pathname + currentUrl.search);
  };

  useEffect(() => {
    const currentSearchInUrl = pageContext.urlParsed.search.search || "";

    if (searchQueryValue !== currentSearchInUrl) {
      const currentUrl = new URL(window.location.href);
      if (searchQueryValue) {
        currentUrl.searchParams.set("search", searchQueryValue);
      } else {
        currentUrl.searchParams.delete("search");
      }
      currentUrl.searchParams.set("page", "1");

      const timer = setTimeout(() => {
        navigate(currentUrl.pathname + currentUrl.search);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [searchQueryValue, pageContext.urlParsed.search.search]);

  useEffect(() => {
    if (selectedProduct && isEditModalOpen) {
      console.log("Loading data for product:", selectedProduct);

      // Clear previous data
      setProductImages([]);
      setSelectedProductCategories([]);
      setIsLoadingImages(true);

      // Loading sequence - First load categories, then load images
      const loadData = async () => {
        try {
          // Step 1: Load categories
          console.log("Step 1: Loading categories");
          const categoryResult = await trpc.product.getCategories.query({
            productId: selectedProduct,
          });

          if (categoryResult.success && categoryResult.result.length > 0) {
            const categoryIds = categoryResult.result.map((c) => c.id);
            console.log("Loaded category IDs:", categoryIds);
            setSelectedProductCategories(categoryIds);
          } else {
            console.error(
              "No categories found or failed to load:",
              categoryResult
            );
            setSelectedProductCategories([]);
          }

          // Step 2: Load images
          console.log("Step 2: Loading images");
          const imagesResult = await trpc.product.getProductImages.query({
            productId: selectedProduct,
          });

          if (imagesResult.success && imagesResult.result.length > 0) {
            const images = imagesResult.result.map((img) => ({
              id: img.fileId,
              url: `/uploads/${img.diskname}`,
              diskname: img.diskname,
              isPrimary: img.isPrimary,
            }));

            console.log("Successfully loaded images:", images);
            setProductImages(images);
          } else {
            console.log("No images found, using fallback:", imagesResult);

            // Fallback to main image if available
            if (selectedProductData?.file) {
              const fallbackImage = {
                id: selectedProductData.file.id,
                url: `/uploads/${selectedProductData.file.diskname}`,
                diskname: selectedProductData.file.diskname,
                isPrimary: true,
              };
              console.log("Using fallback image:", fallbackImage);
              setProductImages([fallbackImage]);
            } else {
              console.log("No fallback image available");
              setProductImages([]);
            }
          }
        } catch (error) {
          console.error("Error loading product data:", error);
          toast.error("Error loading product data");

          // Set fallback data on error
          setSelectedProductCategories([]);

          if (selectedProductData?.file) {
            setProductImages([
              {
                id: selectedProductData.file.id,
                url: `/uploads/${selectedProductData.file.diskname}`,
                diskname: selectedProductData.file.diskname,
                isPrimary: true,
              },
            ]);
          } else {
            setProductImages([]);
          }
        } finally {
          setIsLoadingImages(false);
        }
      };

      loadData();
    } else {
      setProductImages([]);
      setSelectedProductCategories([]);
    }
  }, [selectedProduct, isEditModalOpen, selectedProductData]);

  const handleAddSuccess = () => {
    setIsAddModalOpen(false);
    toast.success("Product added successfully!");
    navigate(window.location.href);
  };

  const handleDeleteProduct = async (id: string) => {
    const res = await trpc.product.delete.mutate({ id });
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    toast.success("Product deleted successfully!");
    navigate(window.location.href);
  };

  const handleEditSuccess = () => {
    setIsEditModalOpen(false);
    setSelectedProduct(null);
    toast.success("Product updated successfully!");
    navigate(window.location.href);
  };

  return (
    <div className='p-4 md:p-6'>
      <Card>
        <CardHeader className='flex flex-row items-center justify-between'>
          <div className='flex flex-col gap-2 w-full justify-center items-center'>
            <CardTitle>Products</CardTitle>
            <CardDescription>Manage your products</CardDescription>
          </div>
          <Button onClick={() => setIsAddModalOpen(true)}>Add Product</Button>
        </CardHeader>
        <CardContent>
          <div className='mb-4 flex items-center justify-center space-x-4'>
            <Input
              placeholder='Search products...'
              value={search}
              onChange={handleSearchChange}
              className='max-w-sm'
            />
            <Tabs value={sortBy} onValueChange={handleSortChange}>
              <TabsList>
                <TabsTrigger value='name'>Name</TabsTrigger>
                <TabsTrigger value='price'>Price</TabsTrigger>
                <TabsTrigger value='discountPrice'>Discount Price</TabsTrigger>
                <TabsTrigger value='stock'>Stock</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Image</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Discount Price</TableHead>
                <TableHead>Stock</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {productsData.map(({ product, file }) => (
                <TableRow key={product.id}>
                  <TableCell>
                    <img
                      src={
                        file ? `/uploads/${file.diskname}` : "/placeholder.svg"
                      }
                      alt={product.name}
                      width={64}
                      height={64}
                      className='rounded-md object-cover'
                    />
                  </TableCell>
                  <TableCell>{product.name}</TableCell>
                  <TableCell>{product.price} EGP</TableCell>
                  <TableCell>
                    {product.discountPrice
                      ? `${product.discountPrice} EGP`
                      : "-"}
                  </TableCell>
                  <TableCell>{product.stock}</TableCell>
                  <TableCell>
                    <div className='flex flex-col gap-0.5'>
                      <span>
                        {product.stock === 0 ? "Out of Stock" : "In Stock"}
                      </span>
                      {product.hidden && (
                        <span className='text-xs text-amber-600'>Hidden</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={() => {
                        setSelectedProduct(product.id);
                        setIsEditModalOpen(true);
                      }}
                      className='mr-2'>
                      Edit
                    </Button>
                    <Button
                      variant='destructive'
                      size='sm'
                      onClick={() => handleDeleteProduct(product.id)}>
                      Delete
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className='mt-6 flex justify-center'>
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={handlePageChange}
            />
          </div>
        </CardContent>
      </Card>
      <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
        <DialogContent className='sm:max-w-[600px]'>
          <DialogHeader>
            <DialogTitle>Add New Product</DialogTitle>
          </DialogHeader>
          <ProductForm
            initialValues={{}}
            onSuccess={handleAddSuccess}
            categories={categories}
            vendors={vendors}
            isLoading={false}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className='sm:max-w-[600px]'>
          <DialogHeader>
            <DialogTitle>Edit Product</DialogTitle>
          </DialogHeader>
          {selectedProductData && (
            <ProductForm
              key={`edit-product-${selectedProduct}-${Date.now()}`}
              initialValues={{
                ...selectedProductData.product,
                price: Number(selectedProductData.product.price),
                discountPrice: selectedProductData.product.discountPrice
                  ? Number(selectedProductData.product.discountPrice)
                  : null,
                inspiredBy: selectedProductData.product.inspiredBy ?? undefined,
                sortOrder: selectedProductData.product.sortOrder ?? undefined,
                hidden: selectedProductData.product.hidden ?? false,
                imageId: selectedProductData.file?.id ?? "",
                productImages: productImages,
                categoryIds: selectedProductCategories,
                categoryId:
                  selectedProductCategories.length > 0
                    ? selectedProductCategories[0]
                    : selectedProductData.product.categoryId || "",
                variants: selectedProductData.variants.map((v) => ({
                  name: v.name,
                  values: v.values,
                })),
              }}
              onSuccess={handleEditSuccess}
              categories={categories}
              vendors={vendors}
              isLoading={isLoadingImages}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
