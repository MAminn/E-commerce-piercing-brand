/**
 * @legacy
 * Legacy Template System (v1)
 * - Fully preserved for admin preview
 * - Not used in frontend rendering
 * - Used as a design asset library
 */

import type React from "react";
import { Suspense } from "react";
import {
  getTemplateComponent,
  type TemplateCategory,
  type TemplateData,
} from "./templateRegistry";

// Template data interfaces are now imported from templateRegistry

interface TemplateRendererProps {
  category: TemplateCategory;
  templateId: string;
  data?: TemplateData;
  fallback?: React.ComponentType;
  fallbackComponent?: (args: {
    error: Error;
    templateId: string;
  }) => React.ReactElement;
  onDataUpdate?: (updates: Partial<TemplateData>) => void;
}

// Simple fallback component
const DefaultFallback: React.FC = () => (
  <div className='p-8 text-center'>
    <h2 className='text-xl font-semibold mb-2'>Template Not Found</h2>
    <p className='text-gray-600'>The requested template could not be loaded.</p>
  </div>
);

// Simple loading component
const TemplateLoader: React.FC = () => (
  <div className='p-8 text-center'>
    <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto'></div>
    <p className='mt-2 text-gray-600'>Loading template...</p>
  </div>
);

const TemplateRenderer: React.FC<TemplateRendererProps> = ({
  category,
  templateId,
  data,
  fallback: FallbackComponent = DefaultFallback,
  onDataUpdate,
}) => {
  // Get the template component for the specified category and template ID
  const TemplateComponent = getTemplateComponent(category, templateId);

  if (!TemplateComponent) {
    return <FallbackComponent />;
  }

  return (
    <Suspense fallback={<TemplateLoader />}>
      <TemplateComponent data={data} onUpdateData={onDataUpdate} />
    </Suspense>
  );
};

export default TemplateRenderer;
