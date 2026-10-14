// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";

/**
 * The cart's item count and shipping row, through the REAL CartProvider, the
 * real /cart page + cart templates and the real mobile bottom nav. Only the
 * network (tRPC) and the template selection are stubbed.
 *
 *   • the count is product UNITS — a PICK6 alone is 6, never "0 items" —
 *     and the title, the bottom-nav badge and useCart().totalItems (what
 *     every header badge renders) always agree;
 *   • a valid PICK6 makes the cart say shipping "Free" / "مجاني" before any
 *     governorate is chosen; a broken (5/6) set, a PICK3 or a plain cart keep
 *     "Calculated at checkout".
 */
let templateId = "cart-minimal";
/** Server answer for bundle.evaluateSelection: a set qualifies only when complete. */
const evaluateSelection = vi.fn();

vi.mock("#root/shared/trpc/client", () => ({
  trpc: {
    shipping: {
      quote: {
        // Zones mode with no governorate yet — the cart's real situation.
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
    bundle: { evaluateSelection: { query: (input: unknown) => evaluateSelection(input) } },
    offer: {
      evaluate: { query: async () => ({ success: true, result: [] }) },
      listActive: { query: async () => ({ success: true, result: [] }) },
    },
    cartCapture: { sync: { mutate: async () => ({ success: true }) } },
    promoCode: { validate: { query: async () => ({ success: false }) } },
  },
}));
vi.mock("#root/frontend/contexts/TemplateContext", () => ({
  useTemplate: () => ({ getTemplateId: () => templateId }),
}));
vi.mock("vike-react/usePageContext", () => ({ usePageContext: () => ({ urlPathname: "/cart" }) }));
vi.mock("vike/client/router", () => ({ navigate: () => {} }));
vi.mock("#root/lib/hooks/useWishlist", () => ({ useWishlist: () => ({ items: [] }) }));

import CartPage from "../+Page";
import { CartProvider, useCart } from "#root/lib/context/CartContext";
import { MinimalI18nProvider } from "#root/lib/i18n/MinimalI18nContext";
import { MinimalMobileBottomNav } from "#root/components/template-system/minimal/MinimalMobileBottomNav";

const piece = (id: string, price = 100) => ({
  productId: id,
  name: `Piece ${id}`,
  quantity: 1,
  unitPrice: price,
  imageUrl: null,
  selectedOptions: {},
  categoryName: null,
  stock: 5,
});
const set = (slug: string, required: number, pieces: number, freeShipping: boolean) => ({
  instanceId: `inst-${slug}`,
  campaignId: `camp-${slug}`,
  campaignSlug: slug,
  campaignTitle: slug.toUpperCase(),
  requiredQuantity: required,
  bundlePrice: pieces * 85,
  regularTotal: pieces * 100,
  offerStacking: "exclusive",
  isRepeatable: false,
  freeShipping,
  addedAt: "2026-10-14T10:00:00.000Z",
  items: Array.from({ length: pieces }, (_, i) => piece(`${slug}-${i}`)),
});
const PICK6 = () => set("pick6", 6, 6, true);
const PICK3 = () => set("pick3", 3, 3, false);
const loose = (quantity: number) => ({
  id: "loose-1",
  name: "Loose Stud",
  price: 120,
  quantity,
  stock: 10,
  available: true,
  imageUrl: null,
  categoryId: "c",
  categoryName: "Ear",
});

function TotalItemsProbe() {
  // Navbar, EditorialNavbar, MinimalNavbar, NoirNavbar and StickyCartBar all
  // render exactly this value as their badge.
  return <output data-testid="header-badge">{useCart().totalItems}</output>;
}

const seed = (opts: { bundles?: unknown[]; items?: unknown[] }) => {
  localStorage.setItem("cartBundles", JSON.stringify(opts.bundles ?? []));
  localStorage.setItem("cart", JSON.stringify(opts.items ?? []));
};

const renderCart = (locale: "en" | "ar" = "en") =>
  render(
    <MinimalI18nProvider ssrLocale={locale}>
      <CartProvider>
        <TotalItemsProbe />
        <CartPage />
        <MinimalMobileBottomNav />
      </CartProvider>
    </MinimalI18nProvider>,
  );

const titleCount = () => screen.getByRole("heading", { level: 1 }).textContent ?? "";
const bottomNavBadge = () => {
  const cartTab = within(screen.getByRole("navigation", { name: "Bottom navigation" })).getByRole("link", {
    name: /cart|السلة/i,
  });
  return cartTab.querySelector("span.rounded-full")?.textContent ?? "";
};
const shippingRow = () => screen.getAllByTestId("shipping-line")[0]!.textContent ?? "";

beforeEach(() => {
  localStorage.clear();
  evaluateSelection.mockReset();
  evaluateSelection.mockImplementation(async (input: { items: { quantity: number }[] }) => {
    const units = input.items.reduce((s, i) => s + i.quantity, 0);
    const complete = units === 6 || units === 3;
    // Only the 6-piece set carries free shipping.
    return complete
      ? { success: true, result: { ok: true, bundle: { freeShipping: units === 6 } } }
      : { success: true, result: { ok: false } };
  });
});
afterEach(cleanup);

describe.each(["cart-minimal", "cart-modern"])("cart item count (%s)", (template) => {
  beforeEach(() => {
    templateId = template;
  });

  it("PICK6 only → 6 everywhere, never 0", async () => {
    seed({ bundles: [PICK6()] });
    renderCart();
    await waitFor(() => expect(titleCount()).toMatch(/\(6 items\)/i));
    expect(screen.getByTestId("header-badge").textContent).toBe("6");
    expect(bottomNavBadge()).toBe("6");
  });

  it("PICK6 + a loose piece ×2 → 8 everywhere", async () => {
    seed({ bundles: [PICK6()], items: [loose(2)] });
    renderCart();
    await waitFor(() => expect(titleCount()).toMatch(/\(8 items\)/i));
    expect(screen.getByTestId("header-badge").textContent).toBe("8");
    expect(bottomNavBadge()).toBe("8");
  });

  it("a loose piece ×2 → 2; ×1 → singular", async () => {
    seed({ items: [loose(2)] });
    const view = renderCart();
    await waitFor(() => expect(titleCount()).toMatch(/\(2 items\)/i));
    expect(screen.getByTestId("header-badge").textContent).toBe("2");
    expect(bottomNavBadge()).toBe("2");
    view.unmount();

    seed({ items: [loose(1)] });
    renderCart();
    await waitFor(() => expect(titleCount()).toMatch(/\(1 item\)/i));
  });

  it("Arabic wording is correct and never a bare '( ITEM )'", async () => {
    seed({ bundles: [PICK6()], items: [loose(2)] });
    renderCart("ar");
    await waitFor(() => expect(titleCount()).toContain("(8 قطع)"));
    expect(titleCount()).not.toMatch(/item/i);
    expect(bottomNavBadge()).toBe("8");
  });
});

describe.each(["cart-minimal", "cart-modern"])("cart shipping row (%s)", (template) => {
  beforeEach(() => {
    templateId = template;
  });

  it("a valid PICK6 → Free, before any governorate is chosen", async () => {
    seed({ bundles: [PICK6()] });
    renderCart();
    await waitFor(() => expect(shippingRow()).toMatch(/Free/));
    expect(shippingRow()).not.toMatch(/Calculated at checkout/);
  });

  it("Arabic → مجاني", async () => {
    seed({ bundles: [PICK6()] });
    renderCart("ar");
    await waitFor(() => expect(shippingRow()).toContain("مجاني"));
  });

  it("a PICK6 that is now 5/6 loses free shipping (the server re-check says so)", async () => {
    const broken = PICK6();
    broken.items = broken.items.slice(0, 5);
    seed({ bundles: [broken] });
    renderCart();
    await waitFor(() => expect(evaluateSelection).toHaveBeenCalled());
    await waitFor(() => expect(shippingRow()).toMatch(/Calculated at checkout/));
    expect(shippingRow()).not.toMatch(/Free/);
  });

  it("PICK3 → not free", async () => {
    seed({ bundles: [PICK3()] });
    renderCart();
    await waitFor(() => expect(evaluateSelection).toHaveBeenCalled());
    await waitFor(() => expect(shippingRow()).toMatch(/Calculated at checkout/));
  });

  it("a normal cart → Calculated at checkout (unchanged)", async () => {
    seed({ items: [loose(2)] });
    renderCart();
    await waitFor(() => expect(shippingRow()).toMatch(/Calculated at checkout/));
  });
});
