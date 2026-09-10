import type React from "react";
import { getTemplatesByCategory } from "#root/components/template-system";
import { useTemplate } from "#root/frontend/contexts/TemplateContext";
import type { TemplateCategory } from "#root/components/template-system/templateConfig";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#root/components/ui/card";
import { Label } from "#root/components/ui/label";
import { RadioGroup, RadioGroupItem } from "#root/components/ui/radio-group";
import { Badge } from "#root/components/ui/badge";

interface TemplateSelectorProps {
  category: TemplateCategory;
  label?: string;
  description?: string;
}

export function TemplateSelector({
  category,
  label,
  description,
}: TemplateSelectorProps) {
  const templates = getTemplatesByCategory(category);
  const { getTemplateId, setTemplate } = useTemplate();
  const selectedTemplateId = getTemplateId(category);

  const handleTemplateChange = (templateId: string) => {
    setTemplate(category, templateId);
  };

  // Capitalize category name for display
  const categoryName = category.charAt(0).toUpperCase() + category.slice(1);
  const defaultLabel = label || `Choose ${categoryName} Template`;
  const defaultDescription =
    description ||
    `Select a template for the ${categoryName.toLowerCase()} section`;

  if (templates.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{defaultLabel}</CardTitle>
          <CardDescription>{defaultDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className='text-sm text-muted-foreground'>
            No templates available for this category.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          {defaultLabel}
          <Badge variant='secondary' className='text-xs'>
            {templates.length} {templates.length === 1 ? "option" : "options"}
          </Badge>
        </CardTitle>
        <CardDescription>{defaultDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        <RadioGroup
          value={selectedTemplateId || undefined}
          onValueChange={handleTemplateChange}
          className='space-y-3'>
          {templates.map((template) => (
            <div
              key={template.id}
              className='flex items-start space-x-3 space-y-0'>
              <RadioGroupItem value={template.id} id={template.id} />
              <Label
                htmlFor={template.id}
                className='flex-1 cursor-pointer space-y-1'>
                <div className='font-medium'>{template.label}</div>
                <div className='text-xs text-muted-foreground font-mono'>
                  {template.id}
                </div>
              </Label>
            </div>
          ))}
        </RadioGroup>
      </CardContent>
    </Card>
  );
}
