/**
 * @legacy
 * Legacy Template System (v1)
 * - Fully preserved for admin preview
 * - Not used in frontend rendering
 * - Used as a design asset library
 */

import type React from "react";
import { Card } from "#root/components/ui/card";
import { Button } from "#root/components/ui/button";
import { Badge } from "#root/components/ui/badge";
import { Store, Loader2 } from "lucide-react";
import AnimatedContent from "#root/components/utils/AnimatedContent";
import { Link } from "#root/components/utils/Link";

interface Vendor {
  id: string;
  name: string;
  description: string | null;
  logoImagePath: string | null;
}

interface BrandsTemplateData {
  vendors: Vendor[];
  isLoading: boolean;
  error: string | null;
}

interface DefaultBrandsTemplateProps {
  data?: BrandsTemplateData;
}

// This is the default brands template that replicates the original page design
const DefaultBrandsTemplate: React.FC<DefaultBrandsTemplateProps> = ({
  data,
}) => {
  // Use provided data or fallback to empty state
  const templateData = data || {
    vendors: [],
    isLoading: false,
    error: null,
  };

  if (templateData.isLoading) {
    return (
      <div className='container flex items-center justify-center min-h-[60vh]'>
        <Loader2 className='h-10 w-10 animate-spin text-accent-lb' />
      </div>
    );
  }

  if (templateData.error) {
    return (
      <div className='container flex flex-col items-center justify-center min-h-[60vh] py-8'>
        <h2 className='text-2xl font-bold text-red-500 mb-2'>Error</h2>
        <p className='text-gray-600'>{templateData.error}</p>
      </div>
    );
  }

  return (
    <AnimatedContent
      className=' flex flex-col justify-center items-center'
      distance={25}
      direction='vertical'
      reverse={false}>
      <div className='container mx-auto py-12 px-4'>
        <div className='mb-12'>
          <h2 className='text-3xl font-bold text-center'>Shop Collection</h2>
          <div className='w-20 h-1 bg-accent-lb mx-auto mt-4 mb-6'></div>
          <p className='text-gray-600 max-w-3xl mx-auto text-center'>
            Browse our carefully curated selection of products, each offering
            exceptional quality.
          </p>
        </div>

        {templateData.vendors.length === 0 ? (
          <div className='text-center py-12 bg-gray-50 rounded-xl'>
            <Store className='mx-auto h-16 w-16 text-gray-400 mb-4' />
            <h3 className='text-xl font-semibold mb-2'>No products found</h3>
            <p className='text-gray-500 mb-6'>
              We'll be adding products to our collection soon.
            </p>
            <Button>
              <Link href='/products' className='text-white'>
                Browse Products
              </Link>
            </Button>
          </div>
        ) : (
          <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8'>
            {templateData.vendors.map((vendor) => (
              <Card
                key={vendor.id}
                className='h-full flex flex-col justify-between items-start overflow-hidden transition-all duration-300 hover:shadow-lg border-gray-100 group'>
                <div className='p-6 h-full flex flex-col justify-between items-start'>
                  <Link
                    href={`/featured/brands/@${vendor.id}`}
                    className='group flex flex-col h-fit'>
                    <div className='flex items-center gap-4 mb-4'>
                      <div className='w-20 h-20 bg-accent-lb/10 rounded-lg flex items-center justify-center overflow-hidden p-2'>
                        {vendor.logoImagePath ? (
                          <img
                            src={
                              vendor.logoImagePath.startsWith("http")
                                ? vendor.logoImagePath
                                : `/uploads/${vendor.logoImagePath}`
                            }
                            alt={vendor.name}
                            className='w-full h-full object-contain group-hover:scale-110 transition-transform duration-300'
                          />
                        ) : (
                          <Store className='h-10 w-10 text-accent-lb' />
                        )}
                      </div>
                      <div>
                        <h3 className='font-bold text-xl group-hover:text-accent-lb transition-colors'>
                          {vendor.name}
                        </h3>
                        <Badge variant='outline' className='mt-1'>
                          View Products
                        </Badge>
                      </div>
                    </div>
                  </Link>

                  {vendor.description && (
                    <p className='text-gray-600 line-clamp-3 mb-5'>
                      {vendor.description}
                    </p>
                  )}

                  <Link
                    href={`/featured/brands/@${vendor.id}`}
                    className='inline-block w-full'>
                    <Button
                      variant='outline'
                      className='w-full hover:bg-accent-lb hover:text-white transition-colors border-accent-lb/40'>
                      Browse Products
                    </Button>
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AnimatedContent>
  );
};

export default DefaultBrandsTemplate;
