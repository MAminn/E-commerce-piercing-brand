// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { FooterSettings } from "#root/shared/types/layout-settings";

/**
 * /contact shows the same email / phone / optional address as the footer
 * (Dashboard > Layout Settings > Footer Contact Info) beside the form.
 */

let footer: Partial<FooterSettings> = {};
vi.mock("vike-react/useData", () => ({
  useData: () => ({ homepageContent: { contactBanner: null } }),
}));
vi.mock("vike-react/usePageContext", () => ({
  usePageContext: () => ({ urlPathname: "/contact" }),
}));
vi.mock("#root/frontend/contexts/LayoutSettingsContext", () => ({
  useLayoutSettings: () => ({ header: { navbarStyle: "minimal" }, footer }),
}));
let mockLocale: "en" | "ar" = "en";
vi.mock("#root/lib/i18n/MinimalI18nContext", () => ({
  useMinimalI18n: () => ({
    t: (k: string) => k,
    locale: mockLocale,
    dir: mockLocale === "ar" ? "rtl" : "ltr",
  }),
}));
vi.mock("#root/shared/trpc/client", () => ({ trpc: {} }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { Page } = await import("../+Page");

beforeEach(() => {
  mockLocale = "en";
  footer = {};
});

describe("Contact page details", () => {
  it("shows the configured email, phone and address with accessible links", () => {
    footer = {
      contactPhone: "01035790911",
      contactEmail: "hello@example.com",
      contactAddress: "12 Example St\nCairo",
    };
    render(<Page />);
    const details = screen.getByRole("group", { name: "Contact details" });
    const email = within(details).getByRole("link", { name: "hello@example.com" });
    expect(email.getAttribute("href")).toBe("mailto:hello@example.com");
    const phone = within(details).getByRole("link", { name: "01035790911" });
    expect(phone.getAttribute("href")).toBe("tel:01035790911");
    expect(within(details).getByText("Address")).toBeTruthy();
    expect(details.textContent).toContain("12 Example St\nCairo");
    // The form is still there beside it.
    expect(screen.getByRole("button", { name: /submit/i })).toBeTruthy();
  });

  it("hides the address when none is configured", () => {
    footer = { contactPhone: "01035790911", contactEmail: "hello@example.com", contactAddress: "" };
    render(<Page />);
    const details = screen.getByRole("group", { name: "Contact details" });
    expect(within(details).queryByText("Address")).toBeNull();
    expect(within(details).getAllByRole("link")).toHaveLength(2);
  });

  it("renders no details block when nothing is configured", () => {
    render(<Page />);
    expect(screen.queryByTestId("contact-details")).toBeNull();
    expect(screen.getByRole("button", { name: /submit/i })).toBeTruthy();
  });

  it("uses the Arabic address and labels in Arabic", () => {
    mockLocale = "ar";
    footer = { contactEmail: "hello@example.com", contactAddress: "12 Example St", contactAddressAr: "١٢ شارع المثال" };
    render(<Page />);
    const details = screen.getByRole("group", { name: "بيانات التواصل" });
    expect(within(details).getByText("العنوان")).toBeTruthy();
    expect(within(details).getByText("١٢ شارع المثال")).toBeTruthy();
  });
});
