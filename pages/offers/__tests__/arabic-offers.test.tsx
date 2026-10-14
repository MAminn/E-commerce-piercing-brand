// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

/**
 * /offers in Arabic: headings, the Pick Your Set cards, the promo-code
 * section (copy button, terms, CTA) and the automatic-offer cards carry no
 * English interface text. Campaign titles, code names and offer names are
 * merchant content and stay as stored.
 */
vi.mock("#root/shared/trpc/client", () => ({
  trpc: {
    bundle: {
      listLive: {
        query: async () => ({
          success: true,
          result: [
            {
              id: "id-pick6",
              slug: "pick-your-6",
              title: "Pick Your 6",
              subtitle: null,
              badgeText: null,
              heroImageUrl: null,
              type: "build_your_stack",
              pricingType: "percentage_discount",
              freeShipping: true,
              availability: "available",
              requiredQuantity: 6,
              unitCount: 6,
              tiers: [{ id: "t6", quantity: 6, price: null, discountPercent: 15, availability: "available", valueRange: null }],
              fixedBundlePrice: null,
              regularValue: null,
              savings: null,
              valueRange: null,
              eligibleProductCount: 40,
            },
          ],
        }),
      },
    },
    offer: {
      listActive: {
        query: async () => ({
          success: true,
          result: [
            {
              id: "o1",
              name: "Weekend Treat",
              description: null,
              condition: { type: "quantity_threshold", minQuantity: 2 },
              reward: { type: "free_shipping" },
            },
          ],
        }),
      },
    },
    promoCode: {
      listPublic: {
        query: async () => ({
          success: true,
          result: [
            {
              id: "pc6",
              code: "PICK6",
              description: null,
              discountType: "percentage",
              discountValue: 15,
              minPurchaseAmount: null,
              freeShipping: true,
              eligibleMinQuantity: 6,
              eligibleMaxQuantity: 6,
            },
          ],
        }),
      },
    },
    settings: { subscribeNewsletter: { mutate: async () => ({ success: true }) } },
  },
}));
vi.mock("#root/lib/context/CartContext", () => ({ useCart: () => ({ appliedOffers: [] }) }));
vi.mock("#root/frontend/contexts/LayoutSettingsContext", () => ({
  useLayoutSettings: () => ({ header: { navbarStyle: "minimal" } }),
}));
vi.mock("vike-react/usePageContext", () => ({ usePageContext: () => ({ urlPathname: "/offers" }) }));

import OffersPage from "../+Page";
import { MinimalI18nProvider } from "#root/lib/i18n/MinimalI18nContext";

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("/offers in Arabic", () => {
  it("shows sets, codes and offers with Arabic interface copy only", async () => {
    render(
      <MinimalI18nProvider ssrLocale='ar'>
        <OffersPage />
      </MinimalI18nProvider>,
    );
    await waitFor(() => expect(screen.getAllByText("PICK6").length).toBeGreaterThan(0));
    await waitFor(() => expect(screen.getByText("Weekend Treat")).toBeTruthy());

    const body = document.body.textContent ?? "";
    expect(body).toContain("كوّني هذا الطقم"); // set + code CTA "Build this set"
    expect(body).toContain("خصم 15%");
    expect(body).toContain("+ شحن مجاني");

    let rest = body;
    for (const content of ["Pick Your 6", "PICK6", "Weekend Treat"]) rest = rest.split(content).join(" ");
    for (const el of document.body.querySelectorAll("[aria-label],[placeholder]")) {
      rest += ` ${el.getAttribute("aria-label") ?? ""} ${el.getAttribute("placeholder") ?? ""}`.split("PICK6").join(" ");
    }
    expect(rest.replace(/EGP|ج\.م\.?/g, " ")).not.toMatch(/[A-Za-z]{2,}/);
  });
});
