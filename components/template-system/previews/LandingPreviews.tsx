import { PreviewHost } from "./PreviewHost";
import { mockHomepageContent } from "./mockData";

// Import the actual landing templates
import { LandingTemplateModern } from "#root/components/template-system/landing/LandingTemplateModern";
import { LandingTemplateClassic } from "#root/components/template-system/landing/LandingTemplateClassic";
import { LandingTemplateEditorial } from "#root/components/template-system/landing/LandingTemplateEditorial";
import { LandingTemplateMinimal } from "#root/components/template-system/landing/LandingTemplateMinimal";

/**
 * Landing template previews - REAL template rendering with mock data
 */

export function LandingModernPreview() {
  return (
    <PreviewHost>
      <LandingTemplateModern content={mockHomepageContent} />
    </PreviewHost>
  );
}

export function LandingClassicPreview() {
  return (
    <PreviewHost>
      <LandingTemplateClassic content={mockHomepageContent} />
    </PreviewHost>
  );
}

export function LandingEditorialPreview() {
  return (
    <PreviewHost>
      <LandingTemplateEditorial content={mockHomepageContent} />
    </PreviewHost>
  );
}

export function LandingMinimalPreview() {
  return (
    <PreviewHost>
      <LandingTemplateMinimal content={mockHomepageContent} />
    </PreviewHost>
  );
}
