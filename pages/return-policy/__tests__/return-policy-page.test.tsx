// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { DEFAULT_HOMEPAGE_CONTENT, type HomepageContent } from "#root/shared/types/homepage-content";

/** /return-policy keeps rendering the CMS policy, now able to hold refund terms. */

let homepageContent: HomepageContent = DEFAULT_HOMEPAGE_CONTENT;
const defaultPolicy = DEFAULT_HOMEPAGE_CONTENT.returnPolicy as NonNullable<HomepageContent["returnPolicy"]>;
vi.mock("vike-react/usePageContext", () => ({ usePageContext: () => ({ urlPathname: "/" }) }));
vi.mock("vike-react/useData", () => ({ useData: () => ({ homepageContent }) }));
vi.mock("#root/frontend/contexts/LayoutSettingsContext", () => ({
  useLayoutSettings: () => ({ header: { navbarStyle: "minimal" } }),
}));
vi.mock("#root/lib/i18n/MinimalI18nContext", () => ({
  useMinimalI18n: () => ({ t: (k: string) => k, locale: "en", dir: "ltr" }),
}));

const { Page } = await import("../+Page");

beforeEach(() => {
  homepageContent = DEFAULT_HOMEPAGE_CONTENT;
});

describe("/return-policy", () => {
  it("renders the owner-approved policy by default", () => {
    const { container } = render(<Page />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Returns");
    expect(container.textContent).toContain("Eligible orders can be returned within 14 days.");
    expect(container.textContent).toContain(
      "contact Percé for a return even outside the standard 14-day window",
    );
    // No refund wording is invented.
    expect(container.textContent).not.toMatch(/refund/i);
  });

  it("renders a Returns & Refunds policy written in the CMS, keeping line breaks", () => {
    homepageContent = {
      ...DEFAULT_HOMEPAGE_CONTENT,
      returnPolicy: {
        ...defaultPolicy,
        title: "Returns & Refunds",
        detailSections: [{ title: "Refunds", body: "First paragraph.\nSecond paragraph." }],
      },
    };
    render(<Page />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Returns & Refunds");
    const body = screen.getByText(/First paragraph\./);
    expect(body.textContent).toBe("First paragraph.\nSecond paragraph.");
    expect(body.className).toContain("whitespace-pre-line");
  });

  it("says it is unavailable when switched off", () => {
    homepageContent = {
      ...DEFAULT_HOMEPAGE_CONTENT,
      returnPolicy: { ...defaultPolicy, enabled: false },
    };
    render(<Page />);
    expect(screen.getByText("This page is not available yet")).toBeTruthy();
  });
});
