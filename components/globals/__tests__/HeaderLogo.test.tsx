import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LayoutSettingsContext } from "#root/frontend/contexts/LayoutSettingsContext";
import {
  DEFAULT_LAYOUT_SETTINGS,
  type LayoutSettings,
} from "#root/shared/types/layout-settings";

vi.mock("vike-react/usePageContext", () => ({
  usePageContext: () => ({ urlPathname: "/" }),
}));

import { HeaderLogo } from "../HeaderLogo";

function render(
  overrides: Partial<LayoutSettings["header"]> = {},
  variant?: "desktop" | "mobile" | "responsive",
) {
  const settings: LayoutSettings = {
    ...DEFAULT_LAYOUT_SETTINGS,
    header: { ...DEFAULT_LAYOUT_SETTINGS.header, ...overrides },
  };
  return renderToStaticMarkup(
    createElement(
      LayoutSettingsContext.Provider,
      { value: settings },
      createElement(HeaderLogo, { textClassName: "logo-text", variant }),
    ),
  );
}

describe("HeaderLogo", () => {
  it("uses the uploaded logo image when there is one, even with a text logo set", () => {
    const html = render({
      logoUrl: "/uploads/layout/header-logo-1.png",
      logoText: "something else",
    });
    expect(html).toContain('src="/uploads/layout/header-logo-1.png"');
    expect(html).not.toContain(">something else<");
    // No filter and no backing box on the image.
    expect(html).not.toMatch(/filter|bg-/);
  });

  it("names the image logo for screen readers", () => {
    expect(render({ logoUrl: "/uploads/layout/l.png" })).toContain('alt="Percé"');
  });

  it("falls back to exactly “Percé” with no image and no text logo", () => {
    const html = render({ logoUrl: "", logoText: "" });
    expect(html).not.toContain("<img");
    expect(html).toContain(">Percé</a>");
  });

  it("shows the admin text logo exactly as typed", () => {
    expect(render({ logoText: "PeRcé" })).toContain(">PeRcé</a>");
  });

  it("responsive variant carries both CMS sizes (mobile below lg, desktop from lg)", () => {
    const html = render(
      {
        logoUrl: "/uploads/layout/l.png",
        logoSize: { desktopWidth: 140, desktopMaxHeight: 48, mobileWidth: 100, mobileMaxHeight: 36 },
      },
      "responsive",
    );
    expect(html).toContain("--logo-w:100px");
    expect(html).toContain("--logo-h:36px");
    expect(html).toContain("--logo-w-lg:140px");
    expect(html).toContain("--logo-h-lg:48px");
    expect(html).toContain("lg:w-(--logo-w-lg)");
  });

  it("treats whitespace-only fields as empty", () => {
    const html = render({ logoUrl: "  ", logoText: "   " });
    expect(html).not.toContain("<img");
    expect(html).toContain(">Percé</a>");
  });
});
