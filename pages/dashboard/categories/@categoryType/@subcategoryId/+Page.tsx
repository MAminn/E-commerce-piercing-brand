import { Link } from "#root/components/utils/Link";
import { ArrowLeft, Package } from "lucide-react";
import { Button } from "#root/components/ui/button";
import { usePageContext } from "vike-react/usePageContext";

/**
 * Subcategory detail page — redirects to products filtered by this category.
 * Full product-subcategory assignment UI is planned for Phase 2.
 */
export default function SubcategoryProducts() {
  const pageContext = usePageContext();
  const { urlPathname } = pageContext;
  const pathParts = urlPathname.split("/");
  const categoryType = pathParts[pathParts.length - 2] || "";
  const subcategoryId = pathParts[pathParts.length - 1] || "";

  return (
    <div className='p-6 w-full h-full mx-auto'>
      <div className='flex items-center mb-6'>
        <Button variant='ghost' asChild className='mr-2'>
          <Link href={`/dashboard/categories/${categoryType}`}>
            <ArrowLeft className='h-4 w-4 mr-2' />
            Back to Subcategories
          </Link>
        </Button>
      </div>
      <div className='text-center py-12'>
        <h2 className='text-2xl font-bold mb-2'>View Products</h2>
        <p className='text-slate-500 mb-6'>
          View and manage products assigned to this subcategory.
        </p>
        <Button asChild>
          <Link href={`/dashboard/products?categoryId=${subcategoryId}`}>
            <Package className='h-4 w-4 mr-2' />
            View Products
          </Link>
        </Button>
      </div>
    </div>
  );
}
