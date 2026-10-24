// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";

/**
 * The /cart page before and after the saved cart is read, through the REAL
 * CartProvider and the live `cart-modern` template. Only tRPC and the
 * template selection are stubbed.
 *
 *   • the server render (no effects) and the first client render show a
 *     loading skeleton — never "Your cart is empty" / Continue shopping —
 *     because an unread cart is not an empty one;
 *   • a cart that really is empty still says so once read;
 *   • every line's image and name link to its product page, by product id,
 *     never by the composite line key that carries the selected options;
 *   • the pieces of a set link to their own product pages;
 *   • a saved promo code and an applied offer still show;
 *   • the mobile sticky checkout bar sits on top of the bottom nav.
 */
const promoValidate = vi.fn();
const offerEvaluate = vi.fn();

vi.mock("#root/shared/trpc/client", () => ({
  trpc: {
    shipping: {
      quote: {
        query: async () => ({
          success: true,
          result: {
            mode: "zones",
            quote: {
              available: false,
              provider: "rules",
              reason: "destination_required",
              governorateCode: null,
              governorateName: null,
            },
          },
        }),
      },
    },
    bundle: {
      evaluateSelection: { query: async () => ({ success: true, result: { ok: true, bundle: { freeShipping: false } } }) },
    },
    offer: {
      evaluate: { query: (input: unknown) => offerEvaluate(input) },
      listActive: { query: async () => ({ success: true, result: [] }) },
    },
    cartCapture: { sync: { mutate: async () => ({ success: true }) } },
    promoCode: { validate: { query: (input: unknown) => promoValidate(input) } },
  },
}));
vi.mock("#root/frontend/contexts/TemplateContext", () => ({
  useTemplate: () => ({ getTemplateId: () => "cart-modern" }),
}));
vi.mock("vike-react/usePageContext", () => ({ usePageContext: () => ({ urlPathname: "/cart" }) }));
vi.mock("vike/client/router", () => ({ navigate: () => {} }));
vi.mock("#root/lib/hooks/useWishlist", () => ({ useWishlist: () => ({ items: [] }) }));

import CartPage from "../+Page";
import { CartProvider } from "#root/lib/context/CartContext";
import { MinimalI18nProvider } from "#root/lib/i18n/MinimalI18nContext";

const PRODUCT_ID = "01a0aaaa-0000-7000-8000-000000000001";
const line = (overrides: Record<string, unknown> = {}) => ({
  id: PRODUCT_ID,
  name: "Star Helix Stud",
  price: 150,
  quantity: 2,
  stock: 10,
  available: true,
  imageUrl: "/uploads/star.webp",
  categoryName: "Ear",
  selectedOptions: { Gauge: "16G" },
  ...overrides,
});
const setPiece = (id: string, name: string) => ({
  productId: id,
  name,
  quantity: 1,
  unitPrice: 100,
  imageUrl: `/uploads/${id}.webp`,
  selectedOptions: {},
  categoryName: null,
  stock: 5,
});
const PICK3 = {
  instanceId: "inst-pick3",
  campaignId: "camp-pick3",
  campaignSlug: "pick3",
  campaignTitle: "PICK3",
  requiredQuantity: 3,
  bundlePrice: 255,
  regularTotal: 300,
  offerStacking: "exclusive",
  isRepeatable: false,
  freeShipping: false,
  addedAt: "2026-10-14T10:00:00.000Z",
  items: [
    setPiece("01a0bbbb-0000-7000-8000-000000000001", "Piece A"),
    setPiece("01a0bbbb-0000-7000-8000-000000000002", "Piece B"),
    setPiece("01a0bbbb-0000-7000-8000-000000000003", "Piece C"),
  ],
};

const seed = (opts: { items?: unknown[]; bundles?: unknown[]; promoCode?: unknown }) => {
  localStorage.setItem("cart", JSON.stringify(opts.items ?? []));
  localStorage.setItem("cartBundles", JSON.stringify(opts.bundles ?? []));
  if (opts.promoCode) localStorage.setItem("promoCode", JSON.stringify(opts.promoCode));
};

const tree = () => (
  <MinimalI18nProvider ssrLocale='en'>
    <CartProvider>
      <CartPage />
    </CartProvider>
  </MinimalI18nProvider>
);

beforeEach(() => {
  localStorage.clear();
  promoValidate.mockReset();
  promoValidate.mockResolvedValue({ success: false, error: "Invalid code" });
  offerEvaluate.mockReset();
  offerEvaluate.mockResolvedValue({ success: true, result: [] });
});
afterEach(cleanup);

describe("cart before the saved cart is read", () => {
  it("server render shows the loading skeleton, never a false empty cart", () => {
    seed({ items: [line()] });
    const html = renderToString(tree());
    expect(html).toContain('data-testid="cart-loading"');
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toMatch(/Your cart is empty/i);
    expect(html).not.toMatch(/Continue shopping/i);
    // The page heading is real on the first paint; only the count waits.
    expect(html).toContain("Your cart");
  });
});

describe("cart after the saved cart is read", () => {
  it("a really empty cart says so", async () => {
    render(tree());
    await waitFor(() => expect(screen.getByText(/Your cart is empty/i)).toBeTruthy());
    expect(screen.queryByTestId("cart-loading")).toBeNull();
  });

  it("a populated cart replaces the skeleton with its lines", async () => {
    seed({ items: [line()] });
    render(tree());
    await waitFor(() => expect(screen.getAllByText("Star Helix Stud").length).toBeGreaterThan(0));
    expect(screen.queryByTestId("cart-loading")).toBeNull();
    expect(screen.queryByText(/Your cart is empty/i)).toBeNull();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/\(2 items\)/i);
  });

  it("image and name link to the product page by product id, not the line key", async () => {
    seed({ items: [line()] });
    const { container } = render(tree());
    await waitFor(() => expect(screen.getAllByText("Star Helix Stud").length).toBeGreaterThan(0));

    const expected = `/shop/${PRODUCT_ID}`;
    // Name links (mobile + desktop rows) are real, focusable links.
    const nameLinks = screen.getAllByRole("link", { name: "Star Helix Stud" });
    expect(nameLinks.length).toBeGreaterThanOrEqual(1);
    for (const a of nameLinks) expect(a.getAttribute("href")).toBe(expected);

    // Image links duplicate the name: same href, out of the tab order.
    const imgs = Array.from(container.querySelectorAll('img[alt="Star Helix Stud"]'));
    expect(imgs.length).toBeGreaterThanOrEqual(1);
    for (const img of imgs) {
      const a = img.closest("a");
      expect(a?.getAttribute("href")).toBe(expected);
      expect(a?.getAttribute("tabindex")).toBe("-1");
    }

    // Nothing links to the composite "id|{options}" key.
    for (const a of Array.from(container.querySelectorAll("a[href]"))) {
      expect(a.getAttribute("href")).not.toContain("|");
      expect(a.getAttribute("href")).not.toContain("Gauge");
    }
  });

  it("set pieces link to their own product pages and the set stays one unit", async () => {
    seed({ bundles: [PICK3] });
    const { container } = render(tree());
    await waitFor(() => expect(screen.getByText("PICK3")).toBeTruthy());
    const group = container.querySelector('[data-bundle-instance="inst-pick3"]') as HTMLElement;
    for (const piece of PICK3.items) {
      // Image (alt) and name both link there; the image is out of the tab order.
      const links = within(group).getAllByRole("link", { name: piece.name });
      expect(links).toHaveLength(2);
      for (const link of links) expect(link.getAttribute("href")).toBe(`/shop/${piece.productId}`);
      expect(links.some((l) => l.getAttribute("tabindex") === "-1")).toBe(true);
    }
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/\(3 items\)/i);
  });

  it("a saved promo code still shows after hydration", async () => {
    promoValidate.mockResolvedValue({
      success: true,
      result: {
        id: "promo-1",
        code: "WELCOME5",
        discountType: "percentage",
        discountValue: 5,
        appliesToAllProducts: true,
        discountLabel: "5% off",
        eligibleProductIds: [PRODUCT_ID],
      },
    });
    seed({ items: [line()], promoCode: { code: "WELCOME5" } });
    render(tree());
    await waitFor(() => expect(screen.getByText("WELCOME5")).toBeTruthy());
    expect(screen.queryByTestId("cart-loading")).toBeNull();
  });

  it("an applied automatic offer still shows after hydration", async () => {
    offerEvaluate.mockResolvedValue({
      success: true,
      result: [
        {
          id: "offer-1",
          name: "Autumn offer",
          description: null,
          reward: { type: "fixed_off", amountOff: 20 },
          discountAmount: 20,
          freeShipping: false,
          label: "EGP 20 off",
        },
      ],
    });
    seed({ items: [line()] });
    render(tree());
    // The sticky bar states the saving (offer names sit behind its toggle).
    await waitFor(() => expect(screen.getByTestId("cart-sticky-checkout").textContent).toMatch(/Saving EGP\s?20\.00/));
    expect(offerEvaluate).toHaveBeenCalled();
    expect(screen.queryByTestId("cart-loading")).toBeNull();
  });

  it("the mobile sticky checkout bar rests on top of the bottom nav", async () => {
    seed({ items: [line()] });
    render(tree());
    const bar = await screen.findByTestId("cart-sticky-checkout");
    const bottom = bar.getAttribute("style") ?? "";
    expect(bottom).toContain("bottom");
    expect(bottom).toContain("4rem");
    expect(bottom).toContain("safe-area-inset-bottom");
    expect(bar.className).not.toContain("bottom-15");
  });
});
