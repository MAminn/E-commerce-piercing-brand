import { PreviewHost } from "../previews/PreviewHost";
import { mockHomepageContent } from "../previews/mockData";
import { LandingTemplateNoir } from "./LandingTemplateNoir";

/**
 * Admin preview for the Noir landing template — real template render
 * with mock data (same pattern as LandingPreviews). previewMode keeps
 * the <html data-noir-chrome> side effect off inside the dashboard.
 */
export function LandingNoirPreview() {
  return (
    <PreviewHost>
      <LandingTemplateNoir content={mockHomepageContent} previewMode />
    </PreviewHost>
  );
}
