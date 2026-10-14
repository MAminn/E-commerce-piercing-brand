// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";

/**
 * /offers is public. Signed-out and signed-in visitors see the same live set
 * offers and the same public promo codes, each with a direct CTA into the
 * matching builder — there is no "Sign in to reveal" wall any more.
 */
const tier = (quantity: number, discountPercent: number) => ({
  id: `t${quantity}`,
  quantity,
  price: null,
  discountPercent,
  availability: "available",
  valueRange: null,
});
const set = (slug: string, title: string, quantity: number, percent: number, freeShipping: boolean) => ({
  id: `00000000-0000-4000-8000-00000000000${quantity}`,
  slug,
  title,
  subtitle: null,
  badgeText: null,
  heroImageUrl: null,
  type: "build_your_stack",
  pricingType: "percentage_discount",
  freeShipping,
  availability: "available",
  requiredQuantity: quantity,
  unitCount: quantity,
  tiers: [tier(quantity, percent)],
  fixedBundlePrice: null,
  regularValue: null,
  savings: null,
  valueRange: null,
  eligibleProductCount: 40,
});

const SETS = [set("pick-your-3", "Pick Your 3", 3, 20, false), set("pick-your-6", "Pick Your 6", 6, 15, true)];
const CODES = [
  { id: "c3", code: "PICK3", description: null, discountType: "percentage", discountValue: 20, minPurchaseAmount: null, freeShipping: false, eligibleMinQuantity: 3, eligibleMaxQuantity: 3 },
  { id: "c6", code: "PICK6", description: null, discountType: "percentage", discountValue: 15, minPurchaseAmount: null, freeShipping: true, eligibleMinQuantity: 6, eligibleMaxQuantity: 6 },
  { id: "w", code: "WELCOME10", description: null, discountType: "percentage", discountValue: 10, minPurchaseAmount: 500, freeShipping: false, eligibleMinQuantity: null, eligibleMaxQuantity: null },
];

const listLive = vi.fn();
vi.mock("#root/shared/trpc/client", () => ({
  trpc: {
    bundle: { listLive: { query: (input: unknown) => listLive(input) } },
    offer: { listActive: { query: async () => ({ success: true, result: [] }) } },
    promoCode: { listPublic: { query: async () => ({ success: true, result: CODES }) } },
    settings: { subscribeNewsletter: { mutate: async () => ({ success: true }) } },
  },
}));
vi.mock("#root/frontend/contexts/LayoutSettingsContext", () => ({
  useLayoutSettings: () => ({ header: { navbarStyle: "minimal" } }),
}));
vi.mock("#root/lib/context/CartContext", () => ({ useCart: () => ({ appliedOffers: [] }) }));
vi.mock("vike-react/usePageContext", () => ({ usePageContext: () => ({ urlPathname: "/offers" }) }));

import OffersPage from "../+Page";
import { AuthContext } from "#root/context/AuthContext.js";
import { MinimalI18nProvider } from "#root/lib/i18n/MinimalI18nContext";

const signedIn = { id: "u1", role: "user", email: "a@example.test", name: "A" } as never;

const renderAs = (session: unknown, locale: "en" | "ar" = "en") =>
  render(
    <MinimalI18nProvider ssrLocale={locale}>
      <AuthContext.Provider value={{ session: session as never, logout: () => {} }}>
        <OffersPage />
      </AuthContext.Provider>
    </MinimalI18nProvider>,
  );

beforeEach(() => {
  cleanup();
  localStorage.clear();
  listLive.mockReset();
  listLive.mockResolvedValue({ success: true, result: SETS });
});

describe.each([
  ["signed out", null],
  ["signed in", signedIn],
])("Offers page — %s", (_label, session) => {
  it("shows Pick Your 3 / Pick Your 6 with their real terms and a Build this set CTA", async () => {
    renderAs(session);
    const sets = await screen.findByTestId("offers-sets");
    const three = within(sets).getByText("Pick Your 3").closest("article")!;
    const six = within(sets).getByText("Pick Your 6").closest("article")!;
    expect(within(three).getByTestId("set-offer-headline").textContent).toBe("20% off");
    expect(within(three).queryByTestId("set-offer-free-shipping")).toBeNull();
    expect(within(three).getByText("Choose exactly 3 individual pieces.")).toBeTruthy();
    expect(within(six).getByTestId("set-offer-headline").textContent).toBe("15% off");
    expect(within(six).getByTestId("set-offer-free-shipping").textContent).toBe("+ free shipping");
    const cta = within(six).getByRole("link", { name: /Build this set/ });
    expect(cta.getAttribute("href")).toBe("/bundles/pick-your-6");
    // Only Pick Your Set campaigns are requested for this block.
    expect(listLive).toHaveBeenCalledWith({ type: "build_your_stack" });
  });

  it("shows every public promo code — no sign-in wall", async () => {
    renderAs(session);
    const codes = await screen.findByTestId("offers-codes");
    expect(within(codes).getByText("PICK3")).toBeTruthy();
    expect(within(codes).getByText("PICK6")).toBeTruthy();
    expect(screen.queryByText(/Sign in to reveal/i)).toBeNull();
    expect(screen.queryByText(/Create a free account to view/i)).toBeNull();
  });

  it("each set code links straight to its builder; other codes link to the shop", async () => {
    renderAs(session);
    const codes = await screen.findByTestId("offers-codes");
    const card = (code: string) => codes.querySelector(`[data-promo-code="${code}"]`) as HTMLElement;
    expect(within(card("PICK3")).getByRole("link").getAttribute("href")).toBe("/bundles/pick-your-3");
    expect(within(card("PICK6")).getByRole("link").getAttribute("href")).toBe("/bundles/pick-your-6");
    expect(within(card("PICK6")).getByText(/15% off \+ free shipping — exactly 6 pieces/)).toBeTruthy();
    expect(within(card("WELCOME10")).getByRole("link").getAttribute("href")).toBe("/shop");
  });
});

describe("Offers page — account stays optional", () => {
  it("signed out: a quiet sign-in note, never a gate", async () => {
    renderAs(null);
    await screen.findByTestId("offers-codes");
    expect(screen.getByTestId("offers-account-note").textContent).toContain("wishlist");
  });

  it("signed in: no sign-in prompt at all", async () => {
    renderAs(signedIn);
    await screen.findByTestId("offers-codes");
    expect(screen.queryByTestId("offers-account-note")).toBeNull();
  });

  it("still renders the codes when the set request fails", async () => {
    listLive.mockRejectedValue(new Error("network"));
    renderAs(null);
    await waitFor(() => expect(screen.getByTestId("offers-codes")).toBeTruthy());
    expect(screen.queryByTestId("offers-sets")).toBeNull();
  });

  it("speaks Arabic", async () => {
    renderAs(null, "ar");
    const sets = await screen.findByTestId("offers-sets");
    expect(within(sets).getAllByText("كوّني هذا الطقم").length).toBe(2);
    expect(screen.getByText("كوّني طقمك ووفّري أكثر.")).toBeTruthy();
  });
});
