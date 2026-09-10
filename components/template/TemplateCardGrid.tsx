import type React from "react";
import { TemplateCard } from "./TemplateCard";
import {
  templateConfig,
  getTemplatesByCategory,
  type TemplateCategory,
} from "#root/components/template-system";
import { useTemplate } from "#root/frontend/contexts/TemplateContext";

export interface TemplateCardGridProps {
  category: TemplateCategory;
}

// Template descriptions for better UX
const getTemplateDescription = (
  category: TemplateCategory,
  templateId: string,
): string => {
  const descriptionMap: Record<string, Record<string, string>> = {
    landing: {
      "landing-modern": "Blue gradient hero with modern cards and premium feel",
      "landing-classic":
        "Traditional eCommerce layout optimized for conversions",
      "landing-editorial": "Luxury storytelling design with large imagery",
      "landing-minimal": "Clean typography-first approach for premium brands",
    },
    home: {
      "featured-products-modern":
        "Modern grid layout with featured product sections",
      "home-modern-v2": "Enhanced modern homepage with categories and features",
    },
    productPage: {
      "product-classic": "Traditional product page optimized for conversions",
      "product-editorial": "Luxury storytelling layout for premium products",
      "product-technical": "Specs-first design for technical products",
      "product-minimal": "Clean, distraction-free product presentation",
      "product-modern-split": "Modern split-screen layout (legacy)",
    },
    categoryPage: {
      "category-grid-classic": "Standard grid with sidebar filters and sorting",
      "category-hero-split": "Hero image with split content sections",
      "category-minimal": "Clean layout with focus on product imagery",
      "category-showcase": "Featured products with highlighted bestsellers",
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
      "search-results-grid": "Standard search layout with sidebar filters",
      "search-results-minimal": "Clean, typography-first search results",
    },
  };

  return (
    descriptionMap[category]?.[templateId] ||
    "Professional template for your store"
  );
};

/**
 * TemplateCardGrid Component
 *
 * Renders a responsive grid of template cards for a specific category
 */
export function TemplateCardGrid({ category }: TemplateCardGridProps) {
  const { getTemplateId, setTemplate } = useTemplate();

  // Get all templates for this category
  const templates = getTemplatesByCategory(category);

  // Get currently active template ID for this category
  const activeTemplateId = getTemplateId(category);

  // Handle template selection
  const handleSelectTemplate = (templateId: string) => {
    setTemplate(category, templateId);
  };

  // Handle template preview (not implemented yet)
  const handlePreviewTemplate = (templateId: string) => {
    // Preview functionality to be added in future update
    console.log(`Preview requested: ${category}/${templateId}`);
  };

  // If no templates available for this category
  if (!templates || templates.length === 0) {
    return (
      <div className='text-center py-8 text-muted-foreground'>
        <p>No templates available for this category yet.</p>
      </div>
    );
  }

  return (
    <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6'>
      {templates.map((template) => (
        <TemplateCard
          key={template.id}
          id={template.id}
          label={template.label}
          description={getTemplateDescription(category, template.id)}
          category={category}
          isActive={template.id === activeTemplateId}
          onSelect={handleSelectTemplate}
          onPreview={undefined} // Preview not available yet
        />
      ))}
    </div>
  );
}
