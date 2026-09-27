// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { HomepageLegalPageContent } from "#root/shared/types/homepage-content";

let navbarStyle = "minimal";
vi.mock("#root/frontend/contexts/LayoutSettingsContext", () => ({
  useLayoutSettings: () => ({ header: { navbarStyle } }),
}));
let mockLocale: "en" | "ar" = "en";
vi.mock("#root/lib/i18n/MinimalI18nContext", () => ({
  useMinimalI18n: () => ({
    t: (k: string) => k,
    locale: mockLocale,
    dir: mockLocale === "ar" ? "rtl" : "ltr",
  }),
}));

const { LegalPageRoute } = await import("../LegalPage");

const page: HomepageLegalPageContent = {
  enabled: true,
  title: "Privacy policy",
  titleAr: "سياسة الخصوصية",
  lastUpdated: "Last updated 1 March 2027",
  intro: "What this website collects.",
  introAr: "",
  sections: [
    { title: "Orders", titleAr: "الطلبات", body: "Name and address.\nUsed to deliver.", bodyAr: "" },
    { title: "Emails", body: "Order emails." },
  ],
};

beforeEach(() => {
  navbarStyle = "minimal";
  mockLocale = "en";
});

describe("LegalPageRoute", () => {
  it("renders a published page in the Percé shell", () => {
    const { container } = render(<LegalPageRoute content={page} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Privacy policy");
    expect(screen.getByText("Last updated 1 March 2027")).toBeTruthy();
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "Orders",
      "Emails",
    ]);
    expect(container.querySelector(".minimal-template")).not.toBeNull();
  });

  it("falls back to English wherever the Arabic text is empty", () => {
    mockLocale = "ar";
    const { container } = render(<LegalPageRoute content={page} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("سياسة الخصوصية");
    expect(screen.getByText("What this website collects.")).toBeTruthy();
    expect(screen.getByText("الطلبات")).toBeTruthy();
    expect(container.querySelector("[dir='rtl']")).not.toBeNull();
  });

  it("says the page is not available while it is unpublished", () => {
    render(<LegalPageRoute content={null} />);
    expect(screen.getByText("This page is not available yet")).toBeTruthy();
    expect(screen.queryByRole("heading")).toBeNull();
  });

  it("does not exist outside the Percé shell, like /return-policy", () => {
    navbarStyle = "classic";
    render(<LegalPageRoute content={page} />);
    expect(screen.getByText("Page not found")).toBeTruthy();
  });
});
