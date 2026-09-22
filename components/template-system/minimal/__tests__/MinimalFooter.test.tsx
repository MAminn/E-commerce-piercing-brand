import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LayoutSettingsContext } from "#root/frontend/contexts/LayoutSettingsContext";
import {
  DEFAULT_LAYOUT_SETTINGS,
  type LayoutSettings,
} from "#root/shared/types/layout-settings";

// The footer only needs the current path from the page context.
let currentPath = "/";
vi.mock("vike-react/usePageContext", () => ({
  usePageContext: () => ({ urlPathname: currentPath }),
}));
// Newsletter submit is never exercised here; keep the module free of a
// real HTTP client and of sonner's DOM-bound toaster.
vi.mock("#root/shared/trpc/client", () => ({ trpc: {} }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { MinimalFooter } from "../MinimalFooter";

function render(overrides: Partial<LayoutSettings["footer"]> = {}, path = "/") {
  currentPath = path;
  const settings: LayoutSettings = {
    ...DEFAULT_LAYOUT_SETTINGS,
    footer: { ...DEFAULT_LAYOUT_SETTINGS.footer, ...overrides },
  };
  return renderToStaticMarkup(
    createElement(
      LayoutSettingsContext.Provider,
      { value: settings },
      createElement(MinimalFooter),
    ),
  );
}

describe("MinimalFooter newsletter block", () => {
  it("renders the signup when footer.showNewsletter is true", () => {
    const html = render({ showNewsletter: true });
    expect(html).toContain("Join the list");
    expect(html).toContain('type="email"');
  });

  it("hides the whole signup when footer.showNewsletter is false", () => {
    const html = render({ showNewsletter: false });
    expect(html).not.toContain("Join the list");
    expect(html).not.toContain('type="email"');
  });

  it("still hides the duplicate signup on /offers regardless of the switch", () => {
    const html = render({ showNewsletter: true }, "/offers");
    expect(html).not.toContain("Join the list");
  });

  it("ships no offer language in the signup copy", () => {
    const html = render({ showNewsletter: true });
    expect(html).not.toMatch(/offers/i);
    expect(html).not.toContain("in your inbox");
  });
});

describe("MinimalFooter default links and copy", () => {
  it("links no Offers page by default", () => {
    const html = render();
    expect(html).not.toContain('href="/offers"');
    expect(html).not.toContain(">Offers<");
  });

  it("keeps the approved default shop and help links", () => {
    const html = render();
    for (const href of ["/shop", "/shop?section=newarrivals", "/bundles", "/contact", "/account"]) {
      expect(html, `expected a link to ${href}`).toContain(`href="${href}"`);
    }
  });
});
