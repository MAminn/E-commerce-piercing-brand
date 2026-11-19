// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ShippingPolicyFacts } from "#root/shared/shipping/shipping-policy";

vi.mock("vike-react/usePageContext", () => ({ usePageContext: () => ({ urlPathname: "/" }) }));
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

const { ShippingPolicyRoute } = await import("../ShippingPolicyPage");

const delivery = "Cairo: 3–4 days. Alexandria: 3–5 days. Other available governorates: 5–7 days.";
const facts: ShippingPolicyFacts = {
  fee: { kind: "by_governorate" },
  freeShippingMinimum: 800.01,
  unavailableGovernorates: [
    { code: "QNA", nameEn: "Qena", nameAr: "قنا" },
    { code: "ASW", nameEn: "Aswan", nameAr: "أسوان" },
    { code: "RSA", nameEn: "Red Sea", nameAr: "البحر الأحمر" },
    { code: "NVL", nameEn: "New Valley", nameAr: "الوادي الجديد" },
  ],
  deliveryText: { en: delivery, ar: delivery },
  cashOnDelivery: true,
};

beforeEach(() => {
  navbarStyle = "minimal";
  mockLocale = "en";
});

describe("/shipping-policy", () => {
  it("renders every section from the live facts", () => {
    const { container } = render(<ShippingPolicyRoute facts={facts} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Shipping policy");
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "Delivery fees",
      "Where we deliver",
      "Delivery times",
      "Payment",
    ]);
    const text = container.textContent ?? "";
    expect(text).toContain("depends on your governorate");
    expect(text).toMatch(/after discounts, is EGP\s800\.01 or more/);
    expect(screen.getByTestId("unavailable-governorates").textContent).toBe(
      "QenaAswanRed SeaNew Valley",
    );
    expect(text).toContain(delivery);
    expect(text).toContain("Cash on delivery is available");
    expect(screen.getByRole("link", { name: "Contact us" }).getAttribute("href")).toBe("/contact");
  });

  it("leaves out what the settings do not say", () => {
    const { container } = render(
      <ShippingPolicyRoute
        facts={{
          ...facts,
          freeShippingMinimum: null,
          deliveryText: null,
          cashOnDelivery: false,
          unavailableGovernorates: [],
        }}
      />,
    );
    const text = container.textContent ?? "";
    expect(text).not.toContain("Delivery times");
    expect(text).not.toContain("Cash on delivery");
    expect(text).not.toMatch(/free/i);
    expect(text).toContain("We deliver to every governorate in Egypt.");
  });

  it("states a single fee as an amount", () => {
    const { container } = render(
      <ShippingPolicyRoute facts={{ ...facts, fee: { kind: "single", amount: 70 } }} />,
    );
    expect(container.textContent).toMatch(/Delivery costs EGP\s70 per order/);
  });

  it("renders in Arabic", () => {
    mockLocale = "ar";
    const { container } = render(<ShippingPolicyRoute facts={facts} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("سياسة الشحن");
    expect(screen.getByTestId("unavailable-governorates").textContent).toContain("البحر الأحمر");
    expect(container.querySelector("[dir='rtl']")).not.toBeNull();
  });

  it("says it is unavailable when the settings could not be read", () => {
    render(<ShippingPolicyRoute facts={null} />);
    expect(screen.getByText("This page is not available yet")).toBeTruthy();
  });

  it("does not exist outside the Percé shell", () => {
    navbarStyle = "default";
    render(<ShippingPolicyRoute facts={facts} />);
    expect(screen.getByText("Page not found")).toBeTruthy();
  });
});
