import type React from "react";
import { Suspense } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#root/components/ui/card";
import { Button } from "#root/components/ui/button";
import { Badge } from "#root/components/ui/badge";
import { CheckCircle, Eye } from "lucide-react";
import type { TemplateCategory } from "#root/components/template-system";
import { getTemplateComponent } from "#root/components/template-system/templateConfig";

export interface TemplateCardProps {
  id: string;
  label: string;
  description?: string;
  thumbnail?: string;
  category: TemplateCategory;
  isActive: boolean;
  onSelect: (templateId: string) => void;
  onPreview?: (templateId: string) => void;
}

/**
 * TemplateCard Component
 *
 * Visual card-based selector for individual templates
 */
export function TemplateCard({
  id,
  label,
  description,
  thumbnail,
  category,
  isActive,
  onSelect,
  onPreview,
}: TemplateCardProps) {
  return (
    <Card
      className={`transition-all duration-200 ${
        isActive
          ? "ring-2 ring-primary border-primary shadow-md bg-primary/5"
          : "hover:shadow-lg hover:border-primary/50"
      }`}>
      <CardHeader className='pb-3'>
        <div className='flex items-start justify-between gap-3'>
          <div className='flex-1 min-w-0'>
            <CardTitle className='text-base font-semibold'>{label}</CardTitle>
            {description && (
              <CardDescription className='mt-1 text-xs line-clamp-1'>
                {description}
              </CardDescription>
            )}
          </div>
          {isActive && (
            <Badge
              variant='default'
              className='bg-green-500 hover:bg-green-600 shrink-0 text-xs'>
              <CheckCircle className='w-3 h-3 mr-1' />
              Active
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className='space-y-3'>
        {/* Live Template Preview - Using Preview Component */}
        <div className='relative w-full h-36 bg-white rounded-lg overflow-hidden border border-gray-200'>
          {(() => {
            const templateEntry = getTemplateComponent(category, id);
            const PreviewComponent = templateEntry?.previewComponent;

            if (!PreviewComponent) {
              return (
                <div className='w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100'>
                  <Eye className='w-8 h-8 text-gray-300' />
                </div>
              );
            }

            return (
              <div className='transform scale-[0.2] origin-top-left w-[500%] h-[500%] pointer-events-none'>
                <Suspense
                  fallback={
                    <div className='w-full h-full bg-gray-100 animate-pulse flex items-center justify-center'>
                      Loading preview...
                    </div>
                  }>
                  <PreviewComponent />
                </Suspense>
              </div>
            );
          })()}
          {isActive && (
            <div className='absolute top-2 right-2'>
              <Badge variant='default' className='bg-green-500'>
                <CheckCircle className='w-3 h-3 mr-1' />
                Active
              </Badge>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        {isActive ? (
          <Button variant='secondary' size='sm' className='w-full' disabled>
            Currently Active
          </Button>
        ) : onPreview ? (
          <div className='flex gap-2'>
            <Button
              variant='outline'
              size='sm'
              className='flex-1'
              onClick={(e) => {
                e.stopPropagation();
                onPreview(id);
              }}>
              <Eye className='w-3 h-3 mr-1.5' />
              Preview
            </Button>
            <Button
              variant='primary'
              size='sm'
              className='flex-1'
              onClick={(e) => {
                e.stopPropagation();
                onSelect(id);
              }}>
              Activate
            </Button>
          </div>
        ) : (
          <Button
            variant='primary'
            size='sm'
            className='w-full'
            onClick={(e) => {
              e.stopPropagation();
              onSelect(id);
            }}>
            Activate
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
