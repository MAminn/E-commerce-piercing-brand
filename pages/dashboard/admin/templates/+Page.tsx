import type React from "react";
import { useState, Suspense } from "react";
import { Button } from "#root/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#root/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#root/components/ui/select";
import { Badge } from "#root/components/ui/badge";
import {
  Monitor,
  Palette,
  CheckCircle,
  ExternalLink,
  Layers,
  Sparkles,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useTemplate } from "#root/frontend/contexts/TemplateContext";
import {
  getAvailableTemplates,
  getTemplateMetadata,
  getTemplateComponent,
  type TemplateCategory,
} from "#root/frontend/components/template/templateRegistry";

// Import ProductCardTemplatePreview component
import { ProductCardTemplatePreview } from "#root/components/template/ProductCardTemplatePreview";

// Import new template system
import {
  templateConfig,
  type TemplateCategory as NewTemplateCategory,
  getTemplateIds,
  getTemplateComponent as getNewTemplateComponent,
} from "#root/components/template-system/templateConfig";

import { TemplateSelector } from "#root/components/template/TemplateSelector";
import { TemplateCardGrid } from "#root/components/template/TemplateCardGrid";
import { TemplateCard } from "#root/components/template/TemplateCard";
import { getTemplatesByCategory } from "#root/components/template-system";

// Template preview component
const TemplatePreview: React.FC<{
  templateId: string;
  isActive: boolean;
  category: TemplateCategory;
}> = ({ templateId, isActive, category }) => {
  const TemplateComponent = getTemplateComponent(category, templateId);

  if (!TemplateComponent) {
    return (
      <div className='w-full h-48 bg-gray-100 rounded-lg flex items-center justify-center text-gray-500'>
        Preview not available
      </div>
    );
  }

  return (
    <div className='relative w-full h-48 bg-white rounded-lg border overflow-hidden'>
      <div className='transform scale-[0.2] origin-top-left w-[500%] h-[500%]'>
        <Suspense
          fallback={
            <div className='w-full h-full bg-gray-100 animate-pulse flex items-center justify-center'>
              Loading preview...
            </div>
          }>
          <TemplateComponent />
        </Suspense>
      </div>
      {isActive && (
        <div className='absolute top-2 right-2'>
          <Badge variant='default' className='bg-green-500'>
            <CheckCircle className='w-3 h-3 mr-1' />
            Active
          </Badge>
        </div>
      )}
    </div>
  );
};

export default function AdminTemplatesPage() {
  const { getActiveTemplate, switchTemplate } = useTemplate();
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] =
    useState<TemplateCategory>("home");

  // Page type selector state - controls what templates are shown
  const [selectedPageType, setSelectedPageType] =
    useState<NewTemplateCategory>("landing");
  const [isLegacyExpanded, setIsLegacyExpanded] = useState(false);

  // Get available templates for selected category
  const availableTemplates = getAvailableTemplates(selectedCategory);

  const handleSwitchTemplate = (templateId: string) => {
    switchTemplate(selectedCategory, templateId);
    setSelectedTemplate(null);
  };

  // Get current active template for the selected category
  const currentActiveTemplate = getActiveTemplate(selectedCategory);

  // Page type options for the primary selector
  const pageTypes: {
    value: NewTemplateCategory;
    label: string;
    description: string;
  }[] = [
    {
      value: "landing",
      label: "Landing Page",
      description: "Main marketing/landing page layout",
    },
    {
      value: "home",
      label: "Home Page",
      description: "Homepage with featured products and sections",
    },
    {
      value: "productPage",
      label: "Product Detail Page",
      description: "Individual product pages",
    },
    {
      value: "categoryPage",
      label: "Category Pages",
      description: "Product category pages with filtering",
    },
    {
      value: "searchResults",
      label: "Search Results Pages",
      description: "Search results layout",
    },
    {
      value: "sorting",
      label: "Shop Page (All Products)",
      description: "Main shop page with product browsing and sorting",
    },
    {
      value: "cartPage",
      label: "Shopping Cart",
      description: "Shopping cart page",
    },
    {
      value: "checkoutPage",
      label: "Checkout Process",
      description: "Checkout flow pages",
    },
  ];

  const categories: {
    value: TemplateCategory;
    label: string;
    description: string;
  }[] = [
    {
      value: "home",
      label: "Home Page",
      description: "Main landing page templates",
    },
    {
      value: "men",
      label: "Men's Collection",
      description: "Men's product page templates",
    },
    {
      value: "women",
      label: "Women's Collection",
      description: "Women's product page templates",
    },
    {
      value: "brands",
      label: "Shop (All Products)",
      description: "Product listing page templates",
    },
    {
      value: "products",
      label: "Products",
      description: "Product listing page templates",
    },
    {
      value: "product",
      label: "Product Detail",
      description: "Individual product page templates",
    },
    {
      value: "cart",
      label: "Shopping Cart",
      description: "Shopping cart page templates",
    },
    {
      value: "checkout",
      label: "Checkout",
      description: "Checkout process page templates",
    },
    {
      value: "sorting",
      label: "Sorting",
      description: "Product sorting and filtering templates",
    },
    {
      value: "productCard",
      label: "Product Card",
      description: "Individual product card templates",
    },
  ];

  // Get the current page type info
  const currentPageType = pageTypes.find((pt) => pt.value === selectedPageType);

  return (
    <div className='container mx-auto p-6 space-y-6'>
      {/* Dynamic Title with Integrated Page Type Selector */}
      <div className='flex items-center gap-3 pb-4 border-b'>
        <h1 className='text-2xl font-semibold text-gray-900'>Templates</h1>
        <span className='text-2xl text-gray-400'>→</span>
        <Select
          value={selectedPageType}
          onValueChange={(value: NewTemplateCategory) =>
            setSelectedPageType(value)
          }>
          <SelectTrigger className='w-[280px] border-0 shadow-none text-2xl font-semibold text-primary p-0 h-auto focus:ring-0'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {pageTypes.map((pageType) => (
              <SelectItem key={pageType.value} value={pageType.value}>
                <div className='flex flex-col py-1'>
                  <span className='font-medium'>{pageType.label}</span>
                  <span className='text-xs text-muted-foreground'>
                    {pageType.description}
                  </span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Currently Active Template */}
      <div className='space-y-3'>
        <h2 className='text-sm font-medium text-gray-700'>
          Currently Active Template
        </h2>
        {(() => {
          const { getTemplateId, setTemplate } = useTemplate();
          const activeTemplateId = getTemplateId(selectedPageType);
          const templates = getTemplatesByCategory(selectedPageType);
          const activeTemplate = templates.find(
            (t) => t.id === activeTemplateId,
          );

          if (!activeTemplate) return null;

          const getTemplateDescription = (templateId: string): string => {
            const descriptionMap: Record<string, Record<string, string>> = {
              landing: {
                "landing-modern":
                  "Blue gradient hero with modern cards and premium feel",
                "landing-classic":
                  "Traditional eCommerce layout optimized for conversions",
                "landing-editorial":
                  "Luxury storytelling design with large imagery",
                "landing-minimal":
                  "Clean typography-first approach for premium brands",
              },
              home: {
                "featured-products-modern":
                  "Modern grid layout with featured product sections",
                "home-modern-v2":
                  "Enhanced modern homepage with categories and features",
              },
              productPage: {
                "product-classic":
                  "Traditional product page optimized for conversions",
                "product-editorial":
                  "Luxury storytelling layout for premium products",
                "product-technical":
                  "Specs-first design for technical products",
                "product-minimal":
                  "Clean, distraction-free product presentation",
                "product-modern-split": "Modern split-screen layout (legacy)",
              },
              categoryPage: {
                "category-grid-classic":
                  "Standard grid with sidebar filters and sorting",
                "category-hero-split": "Hero image with split content sections",
                "category-minimal":
                  "Clean layout with focus on product imagery",
                "category-showcase":
                  "Featured products with highlighted bestsellers",
                "category-grid-with-filters":
                  "Classic grid with advanced filtering (legacy)",
              },
              sorting: {
                "sorting-minimal": "Clean product grid with essential sorting",
              },
              cartPage: {
                "cart-modern": "Clean shopping cart with item management",
              },
              checkoutPage: {
                "checkout-modern": "Multi-step checkout with order summary",
              },
              searchResults: {
                "search-results-grid":
                  "Standard search layout with sidebar filters",
                "search-results-minimal":
                  "Clean, typography-first search results",
              },
            };
            return (
              descriptionMap[selectedPageType]?.[templateId] ||
              "Professional template for your store"
            );
          };

          return (
            <div className='max-w-sm'>
              <Card className='ring-2 ring-primary border-primary shadow-md bg-primary/5 pointer-events-none'>
                <CardHeader className='pb-3'>
                  <div className='flex items-start justify-between gap-3'>
                    <div className='flex-1 min-w-0'>
                      <CardTitle className='text-base font-semibold'>
                        {activeTemplate.label}
                      </CardTitle>
                      <CardDescription className='mt-1 text-xs line-clamp-1'>
                        {getTemplateDescription(activeTemplate.id)}
                      </CardDescription>
                    </div>
                    <Badge
                      variant='default'
                      className='bg-green-500 hover:bg-green-600 shrink-0 text-xs'>
                      <CheckCircle className='w-3 h-3 mr-1' />
                      Active
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className='space-y-3'>
                  <div className='relative w-full h-36 bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg overflow-hidden border border-gray-200'>
                    <div className='w-full h-full flex items-center justify-center'>
                      <CheckCircle className='w-8 h-8 text-green-500' />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          );
        })()}
      </div>

      {/* Available Templates */}
      <div className='space-y-3'>
        <h2 className='text-sm font-medium text-gray-700'>
          Available Templates
        </h2>
        {(() => {
          const { getTemplateId, setTemplate } = useTemplate();
          const activeTemplateId = getTemplateId(selectedPageType);
          const templates = getTemplatesByCategory(selectedPageType);
          const availableTemplates = templates.filter(
            (t) => t.id !== activeTemplateId,
          );

          const getTemplateDescription = (templateId: string): string => {
            const descriptionMap: Record<string, Record<string, string>> = {
              landing: {
                "landing-modern":
                  "Blue gradient hero with modern cards and premium feel",
                "landing-classic":
                  "Traditional eCommerce layout optimized for conversions",
                "landing-editorial":
                  "Luxury storytelling design with large imagery",
                "landing-minimal":
                  "Clean typography-first approach for premium brands",
              },
              home: {
                "featured-products-modern":
                  "Modern grid layout with featured product sections",
                "home-modern-v2":
                  "Enhanced modern homepage with categories and features",
              },
              productPage: {
                "product-classic":
                  "Traditional product page optimized for conversions",
                "product-editorial":
                  "Luxury storytelling layout for premium products",
                "product-technical":
                  "Specs-first design for technical products",
                "product-minimal":
                  "Clean, distraction-free product presentation",
                "product-modern-split": "Modern split-screen layout (legacy)",
              },
              categoryPage: {
                "category-grid-classic":
                  "Standard grid with sidebar filters and sorting",
                "category-hero-split": "Hero image with split content sections",
                "category-minimal":
                  "Clean layout with focus on product imagery",
                "category-showcase":
                  "Featured products with highlighted bestsellers",
                "category-grid-with-filters":
                  "Classic grid with advanced filtering (legacy)",
              },
              sorting: {
                "sorting-minimal": "Clean product grid with essential sorting",
              },
              cartPage: {
                "cart-modern": "Clean shopping cart with item management",
              },
              checkoutPage: {
                "checkout-modern": "Multi-step checkout with order summary",
              },
              searchResults: {
                "search-results-grid":
                  "Standard search layout with sidebar filters",
                "search-results-minimal":
                  "Clean, typography-first search results",
              },
            };
            return (
              descriptionMap[selectedPageType]?.[templateId] ||
              "Professional template for your store"
            );
          };

          if (availableTemplates.length === 0) {
            return (
              <div className='text-center py-8 text-muted-foreground'>
                <p>No other templates available for this page type.</p>
              </div>
            );
          }

          // Preview handler - opens template in new tab with query param
          const handlePreview = (templateId: string) => {
            // Map page types to preview URLs
            const previewUrls: Record<NewTemplateCategory, string> = {
              landing: "/",
              home: "/",
              productPage: "/products/classic-white-sneakers",
              categoryPage: "/categories/men",
              searchResults: "/search?q=shoes",
              sorting: "/shop",
              cartPage: "/cart",
              checkoutPage: "/checkout",
            };

            const baseUrl = previewUrls[selectedPageType] || "/";
            const previewUrl = `${baseUrl}?templatePreview=${templateId}`;
            window.open(previewUrl, "_blank");
          };

          return (
            <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6'>
              {availableTemplates.map((template) => (
                <TemplateCard
                  key={template.id}
                  id={template.id}
                  label={template.label}
                  description={getTemplateDescription(template.id)}
                  category={selectedPageType}
                  isActive={false}
                  onSelect={(templateId) =>
                    setTemplate(selectedPageType, templateId)
                  }
                  onPreview={handlePreview}
                />
              ))}
            </div>
          );
        })()}
      </div>

      {/* LEGACY TEMPLATE SYSTEM (V1) - Collapsible */}
      <Card className='border-muted bg-muted/20 mt-12'>
        <CardHeader
          className='cursor-pointer hover:bg-muted/30 transition-colors'
          onClick={() => setIsLegacyExpanded(!isLegacyExpanded)}>
          <CardTitle className='flex items-center space-x-2'>
            {isLegacyExpanded ? (
              <ChevronDown className='w-4 h-4 text-muted-foreground' />
            ) : (
              <ChevronRight className='w-4 h-4 text-muted-foreground' />
            )}
            <span className='text-sm font-normal text-muted-foreground'>
              Legacy (Maintained for backward compatibility)
            </span>
          </CardTitle>
        </CardHeader>
        {isLegacyExpanded && (
          <CardContent className='space-y-6'>
            <div className='flex items-center gap-4'>
              <div className='flex items-center gap-2'>
                <Layers className='h-4 w-4' />
                <Select
                  value={selectedCategory}
                  onValueChange={(value: TemplateCategory) =>
                    setSelectedCategory(value)
                  }>
                  <SelectTrigger className='w-[200px]'>
                    <SelectValue placeholder='Select category' />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category.value} value={category.value}>
                        <div className='flex flex-col'>
                          <span>{category.label}</span>
                          <span className='text-xs text-muted-foreground'>
                            {category.description}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className='flex items-center space-x-2'>
                <Monitor className='w-5 h-5 text-muted-foreground' />
                <span className='text-sm text-muted-foreground'>
                  Active:{" "}
                  {getTemplateMetadata(selectedCategory, currentActiveTemplate)
                    ?.name || "Unknown"}
                </span>
              </div>
            </div>

            {/* Current Active Template */}
            <Card>
              <CardHeader>
                <CardTitle className='flex items-center space-x-2'>
                  <Palette className='w-5 h-5' />
                  <span>Currently Active Template</span>
                </CardTitle>
                <CardDescription>
                  This template is currently being used for the selected
                  category
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
                  <div className='space-y-4'>
                    <div>
                      <h3 className='text-lg font-semibold'>
                        {getTemplateMetadata(
                          selectedCategory,
                          currentActiveTemplate,
                        )?.name || "Unknown Template"}
                      </h3>
                      <p className='text-muted-foreground'>
                        {getTemplateMetadata(
                          selectedCategory,
                          currentActiveTemplate,
                        )?.description || "No description available"}
                      </p>
                    </div>
                    <Badge variant='default' className='bg-green-500'>
                      <CheckCircle className='w-3 h-3 mr-1' />
                      Active
                    </Badge>
                  </div>
                  <div>
                    <TemplatePreview
                      templateId={currentActiveTemplate}
                      isActive={true}
                      category={selectedCategory}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Available Templates */}
            <Card>
              <CardHeader>
                <CardTitle>Available Templates</CardTitle>
                <CardDescription>
                  Choose from the available templates for the selected category
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
                  {availableTemplates.map((template) => {
                    const isActive = template.id === currentActiveTemplate;

                    return (
                      <Card
                        key={template.id}
                        className={`cursor-pointer transition-all hover:shadow-md ${
                          isActive ? "ring-2 ring-primary" : ""
                        }`}>
                        <CardHeader className='pb-3'>
                          <div className='flex items-center justify-between'>
                            <CardTitle className='text-lg'>
                              {template.name}
                            </CardTitle>
                            {isActive && (
                              <Badge variant='default' className='bg-green-500'>
                                <CheckCircle className='w-3 h-3 mr-1' />
                                Active
                              </Badge>
                            )}
                          </div>
                          <CardDescription>
                            {template.description}
                          </CardDescription>
                        </CardHeader>
                        <CardContent className='space-y-4'>
                          {selectedCategory === "productCard" ? (
                            <ProductCardTemplatePreview
                              templateId={template.id}
                              isActive={isActive}
                            />
                          ) : (
                            <TemplatePreview
                              templateId={template.id}
                              isActive={isActive}
                              category={selectedCategory}
                            />
                          )}
                          {selectedCategory === "productCard" ? (
                            <div className='flex space-x-2'>
                              <Button
                                variant={isActive ? "secondary" : "outline"}
                                size='sm'
                                className='flex-1'
                                onClick={() =>
                                  handleSwitchTemplate(template.id)
                                }
                                disabled={isActive}>
                                {isActive
                                  ? "Currently Active"
                                  : "Switch to This Template"}
                              </Button>
                            </div>
                          ) : (
                            <div className='flex space-x-2'>
                              <Button
                                variant='outline'
                                size='sm'
                                className='flex-1'
                                onClick={() => {
                                  const previewUrl = `/template-preview?category=${selectedCategory}&templateId=${template.id}`;
                                  window.open(previewUrl, "_blank");
                                }}>
                                <ExternalLink className='w-4 h-4 mr-2' />
                                Preview
                              </Button>
                              <Button
                                variant={isActive ? "secondary" : "outline"}
                                size='sm'
                                className='flex-1'
                                onClick={() =>
                                  handleSwitchTemplate(template.id)
                                }
                                disabled={isActive}>
                                {isActive
                                  ? "Currently Active"
                                  : "Switch to This Template"}
                              </Button>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
