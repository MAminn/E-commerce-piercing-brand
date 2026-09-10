import type React from "react";
import { useState, useEffect, Suspense } from "react";
import { usePageContext } from "vike-react/usePageContext";
import {
  getTemplateComponent,
  getTemplateMetadata,
  type TemplateCategory,
} from "#root/frontend/components/template/templateRegistry";
import { TemplateProvider } from "#root/frontend/contexts/TemplateContext";
import { Loader2, ArrowLeft, Monitor, Smartphone, Tablet } from "lucide-react";
import { Button } from "#root/components/ui/button";
import { Badge } from "#root/components/ui/badge";
import { Card, CardContent } from "#root/components/ui/card";

type ViewportSize = "desktop" | "tablet" | "mobile";

const VIEWPORT_CONFIGS = {
  desktop: { width: "100%", height: "100vh", icon: Monitor },
  tablet: { width: "768px", height: "1024px", icon: Tablet },
  mobile: { width: "375px", height: "667px", icon: Smartphone },
};

export default function TemplatePreviewPage() {
  const pageContext = usePageContext();
  const [viewport, setViewport] = useState<ViewportSize>("desktop");
  const [isLoading, setIsLoading] = useState(true);

  // Get URL parameters
  const urlParams = new URLSearchParams(pageContext.urlParsed.search || "");
  const category = (urlParams.get("category") || "home") as TemplateCategory;
  const templateId = urlParams.get("templateId") || "default";

  const TemplateComponent = getTemplateComponent(category, templateId);
  const metadata = getTemplateMetadata(category, templateId);

  useEffect(() => {
    // Simulate loading time for better UX
    const timer = setTimeout(() => setIsLoading(false), 500);
    return () => clearTimeout(timer);
  }, []);

  if (!TemplateComponent) {
    return (
      <div className='min-h-screen flex items-center justify-center bg-gray-50'>
        <Card className='p-8 text-center max-w-md'>
          <CardContent>
            <h1 className='text-2xl font-bold text-red-600 mb-4'>
              Template Not Found
            </h1>
            <p className='text-gray-600 mb-6'>
              The template "{templateId}" in category "{category}" could not be
              loaded.
            </p>
            <Button onClick={() => window.close()} variant='outline'>
              <ArrowLeft className='w-4 h-4 mr-2' />
              Close Preview
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className='min-h-screen flex items-center justify-center bg-gray-50'>
        <div className='text-center'>
          <Loader2 className='w-8 h-8 animate-spin mx-auto mb-4 text-blue-600' />
          <p className='text-gray-600'>Loading template preview...</p>
        </div>
      </div>
    );
  }

  const currentConfig = VIEWPORT_CONFIGS[viewport];

  return (
    <div className='min-h-screen bg-gray-100'>
      {/* Header Controls */}
      <div className='bg-white border-b border-gray-200 p-4'>
        <div className='flex items-center justify-between max-w-7xl mx-auto'>
          <div className='flex items-center space-x-4'>
            <Button onClick={() => window.close()} variant='outline' size='sm'>
              <ArrowLeft className='w-4 h-4 mr-2' />
              Close
            </Button>
            <div>
              <h1 className='text-lg font-semibold'>
                {metadata?.name || templateId} Preview
              </h1>
              <p className='text-sm text-gray-500'>
                Category: {category} • Template: {templateId}
              </p>
            </div>
          </div>

          {/* Viewport Controls */}
          <div className='flex items-center space-x-2'>
            <span className='text-sm text-gray-600 mr-2'>Viewport:</span>
            {Object.entries(VIEWPORT_CONFIGS).map(([key, config]) => {
              const Icon = config.icon;
              return (
                <Button
                  key={key}
                  variant={viewport === key ? "primary" : "outline"}
                  size='sm'
                  onClick={() => setViewport(key as ViewportSize)}
                  className='flex items-center space-x-1'>
                  <Icon className='w-4 h-4' />
                  <span className='capitalize'>{key}</span>
                </Button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Template Preview */}
      <div className='p-4'>
        <div
          className='mx-auto'
          style={{
            width: currentConfig.width,
            maxWidth: "100%",
          }}>
          <div
            className='bg-white shadow-lg rounded-lg overflow-hidden'
            style={{
              width: currentConfig.width,
              height: viewport === "desktop" ? "auto" : currentConfig.height,
              minHeight:
                viewport === "desktop" ? "100vh" : currentConfig.height,
              margin: "0 auto",
            }}>
            <TemplateProvider>
              <Suspense
                fallback={
                  <div className='flex items-center justify-center h-64'>
                    <Loader2 className='w-8 h-8 animate-spin text-blue-600' />
                  </div>
                }>
                <TemplateComponent />
              </Suspense>
            </TemplateProvider>
          </div>
        </div>
      </div>

      {/* Footer Info */}
      <div className='fixed bottom-4 right-4'>
        <Badge variant='secondary' className='bg-white/90 backdrop-blur-sm'>
          {metadata?.description || "Template Preview"}
        </Badge>
      </div>
    </div>
  );
}
