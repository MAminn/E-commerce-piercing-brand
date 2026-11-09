// @vitest-environment jsdom
import { act, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Upsells on Percé's product page (`product-perce` → ProductPagePremium, the
 * template production runs), end to end through the real CartProvider: the
 * block under the purchase controls, the post-add sheet, and the rules that
 * keep them from repeating themselves or guessing a variant.
 *
 * Ported from Mach's components/template-system/mach/upsell/__tests__/
 * product-upsells.test.tsx — same cases, re-pointed at the Percé page, plus
 * Percé-specific ones (option price modifiers, existing toast behaviour).
 * Network calls the cart makes are stubbed; the cart logic is the real one.
 */

const toast = vi.fn();
vi.mock("#root/components/ui/cart-toast", () => ({
  showCartToast: (...args: unknown[]) => toast(...args),
  flyToCart: () => {},
}));
vi.mock("#root/lib/hooks/useWishlist", () => ({
  useWishlist: () => ({ toggle: () => {}, isWishlisted: () => false }),
}));
const trackEvent = vi.fn();
vi.mock("#root/frontend/contexts/TrackingContext", () => ({
  useTracking: () => ({ trackEvent }),
}));
// Every procedure answers "no data" — the cart and promo layer treat that as
// empty. Product-page copy answers an empty object, categories an empty list.
vi.mock("#root/shared/trpc/client", () => {
  const proc = () => ({
    query: async () => ({ success: false }),
    mutate: async () => ({ success: false }),
  });
  const ns = () => new Proxy({}, { get: () => proc() });
  return {
    trpc: new Proxy(
      {},
      {
        get: (_t, key) =>
          key === "category"
            ? new Proxy({}, { get: () => ({ query: async () => ({ success: true, result: [] }) }) })
            : key === "settings"
            ? new Proxy(
                {},
                {
                  get: (_s, k) =>
                    k === "getProductPageContent"
                      ? { query: async () => ({ success: true, result: {} }) }
                      : proc(),
                },
              )
            : ns(),
      },
    ),
  };
});

import { CartProvider, useCart } from "#root/lib/context/CartContext";
import { MinimalI18nProvider } from "#root/lib/i18n/MinimalI18nContext";
import { ProductPagePremium } from "#root/components/template-system/productPage/ProductPagePremium";
import type { ProductPageProduct } from "#root/components/template-system/productPage/ProductPageModernSplit";
import {
  resolvePurchasableLinePrice,
  resolveSelectedOptions,
  toPurchasableOptionGroups,
} from "#root/shared/products/options";
import type { ProductUpsells, UpsellProduct } from "../types";
import { productPageUpsellProps, type UpsellResponse } from "../productPageUpsellProps";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

class NoopIO {
  observe() {}
  disconnect() {}
  unobserve() {}
  takeRecords() {
    return [];
  }
}

const MAIN = {
  id: "hoop",
  slug: "seamless-ring-8mm",
  name: "Seamless Ring 8mm",
  price: 250,
  discountPrice: null,
  stock: 10,
  available: true,
  description: "A ring.",
  images: [{ url: "/uploads/hoop.webp", isPrimary: true }],
  imageUrl: "/uploads/hoop.webp",
  categoryName: "Ear",
  specifications: [],
  variants: [],
} as unknown as ProductPageProduct;

const MAIN_WITH_OPTIONS = {
  ...MAIN,
  variants: [
    {
      name: "Colour",
      values: [
        { value: "Silver", priceModifier: 0 },
        { value: "Gold", priceModifier: 30 },
      ],
    },
  ],
} as unknown as ProductPageProduct;

function up(id: string, over: Partial<UpsellProduct> = {}): UpsellProduct {
  return {
    id,
    slug: id,
    name: id.toUpperCase(),
    price: 400,
    discountPrice: 350,
    stock: 5,
    available: true,
    imageUrl: `/uploads/${id}.webp`,
    categoryName: "Ear",
    variantCount: 0,
    requiresOptions: false,
    ...over,
  };
}

function upsellsOf(items: UpsellProduct[], over: Partial<ProductUpsells> = {}): ProductUpsells {
  return { items, limit: 2, productPage: true, postAdd: true, source: "random", ...over };
}

let setUpsellsExternal: (u: ProductUpsells | undefined) => void = () => {};

/**
 * Stands in for the product route: real cart, and the same `onAddToCart`
 * contract and line-price rule as pages/featured/products/@productId.
 */
function Page({
  initialUpsells,
  product = MAIN,
  refuseMainAdd = false,
}: {
  initialUpsells?: ProductUpsells;
  product?: ProductPageProduct;
  refuseMainAdd?: boolean;
}) {
  const { addItem, items } = useCart();
  const [upsells, setUpsells] = useState(initialUpsells);
  setUpsellsExternal = setUpsells;
  return (
    <>
      <output data-testid='cart'>{JSON.stringify(items)}</output>
      <ProductPagePremium
        product={product}
        upsells={upsells}
        onAddToCart={(p, opts, qty) => {
          if (refuseMainAdd) return false;
          const base = Number(p.discountPrice ?? p.price);
          const resolved = resolveSelectedOptions(toPurchasableOptionGroups(p.variants ?? []), opts);
          const linePrice = resolved.ok ? resolvePurchasableLinePrice(base, resolved.priceModifier) : base;
          return addItem(
            { id: p.id, name: p.name, price: linePrice, stock: p.stock, available: true },
            qty ?? 1,
            resolved.ok ? resolved.selectedOptions : opts ?? {},
          );
        }}
      />
    </>
  );
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  toast.mockClear();
  trackEvent.mockClear();
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = NoopIO;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = "";
});

async function render(ui: ReactNode) {
  await act(async () => {
    root.render(
      <MinimalI18nProvider ssrLocale='en'>
        <CartProvider>{ui}</CartProvider>
      </MinimalI18nProvider>,
    );
  });
}

type Line = {
  id: string;
  quantity: number;
  price: number;
  originalPrice?: number;
  selectedOptions: Record<string, string>;
};
const cart = (): Line[] => JSON.parse(document.querySelector("[data-testid=cart]")!.textContent || "[]");
const block = () => document.querySelector("[data-testid=product-upsell-block]");
const blockIds = () =>
  [...(block()?.querySelectorAll("[data-upsell-item]") ?? [])].map((el) => el.getAttribute("data-upsell-item"));
const sheet = () => document.querySelector("[data-testid=post-add-upsell]");
const sheetIds = () =>
  [...(sheet()?.querySelectorAll("[data-upsell-item]") ?? [])].map((el) => el.getAttribute("data-upsell-item"));
const button = (scope: ParentNode | null, label: RegExp) =>
  [...(scope?.querySelectorAll("button") ?? [])].find((b) => label.test(b.textContent ?? "")) as
    | HTMLButtonElement
    | undefined;
const addToBag = () => document.querySelector("[data-add-to-cart]") as HTMLButtonElement;

async function click(el: Element) {
  await act(async () => {
    (el as HTMLElement).click();
  });
}

describe("product-page upsell block", () => {
  it("renders the configured number of recommendations, at the price paid", async () => {
    await render(<Page initialUpsells={upsellsOf([up("chain"), up("stud"), up("cuff")])} />);
    expect(blockIds()).toEqual(["chain", "stud"]);
    // Percé cards show the price paid only — the discount price here.
    expect(block()!.textContent).toMatch(/EGP\s350/);
    expect(block()!.textContent).not.toMatch(/EGP\s400/);
    // Storefront `sm` buttons: 36px drawn, 44px hit area.
    expect(button(block(), /Add/)!.className).toContain("before:-inset-y-1");
  });

  it("is absent when the product page placement is off, or there is nothing to show", async () => {
    await render(<Page initialUpsells={upsellsOf([up("chain")], { productPage: false })} />);
    expect(block()).toBeNull();
    await act(async () => setUpsellsExternal(upsellsOf([])));
    expect(block()).toBeNull();
    await act(async () => setUpsellsExternal(undefined));
    expect(block()).toBeNull();
  });

  it("uses the manual heading for a curated list and a neutral one for random", async () => {
    await render(<Page initialUpsells={upsellsOf([up("chain")], { source: "manual" })} />);
    expect(block()!.textContent).toContain("Frequently bought together");
    await act(async () => setUpsellsExternal(upsellsOf([up("chain")])));
    expect(block()!.textContent).toContain("Add to your order");
  });

  it("adds through the real cart at the charged price, then shows Added", async () => {
    await render(<Page initialUpsells={upsellsOf([up("chain"), up("stud")])} />);
    await click(button(block(), /Add/)!);
    expect(cart()).toEqual([
      expect.objectContaining({ id: "chain", quantity: 1, price: 350, originalPrice: 400, selectedOptions: {} }),
    ]);
    expect(trackEvent).toHaveBeenCalledTimes(1);
    // The product page block confirms with Percé's own add-to-bag toast.
    expect(toast).toHaveBeenCalledTimes(1);
    expect(block()!.querySelector("[data-upsell-item=chain]")!.textContent).toContain("Added");
    // The block does not reshuffle under the shopper's thumb.
    expect(blockIds()).toEqual(["chain", "stud"]);
  });

  it("ignores rapid repeat presses — one unit, not two", async () => {
    await render(<Page initialUpsells={upsellsOf([up("chain")])} />);
    const add = button(block(), /Add/)!;
    await act(async () => {
      add.click();
      add.click();
      add.click();
    });
    expect(cart()).toHaveLength(1);
    expect(cart()[0]!.quantity).toBe(1);
  });

  it("never guesses a variant: products with options link to their page", async () => {
    await render(
      <Page
        initialUpsells={upsellsOf([
          up("hoop-set", { variantCount: 2, requiresOptions: true }),
          up("stud", { variantCount: undefined, requiresOptions: undefined }),
        ])}
      />,
    );
    const withOptions = block()!.querySelector("[data-upsell-item=hoop-set]")!;
    expect(button(withOptions, /Add/)).toBeUndefined();
    const link = withOptions.querySelector('a[aria-label^="Choose options"]') as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/shop/hoop-set");
    // Unknown option state is treated the same way.
    expect(button(block()!.querySelector("[data-upsell-item=stud]"), /Add/)).toBeUndefined();
    expect(cart()).toEqual([]);
  });

  it("never offers a sold-out product an add button", async () => {
    await render(<Page initialUpsells={upsellsOf([up("chain", { stock: 0, available: false })])} />);
    expect(button(block(), /Add/)).toBeUndefined();
  });

  it("leaves out products already in the bag when it is chosen", async () => {
    localStorage.setItem(
      "cart",
      JSON.stringify([{ id: "chain", name: "CHAIN", price: 350, stock: 5, quantity: 1, selectedOptions: {} }]),
    );
    await render(<Page />);
    await act(async () => setUpsellsExternal(upsellsOf([up("chain"), up("stud"), up("cuff")])));
    expect(blockIds()).toEqual(["stud", "cuff"]);
  });

  it("refuses an add the cart's stock gate refuses, without touching the bag", async () => {
    localStorage.setItem(
      "cart",
      JSON.stringify([{ id: "other", name: "OTHER", price: 100, stock: 5, quantity: 1, selectedOptions: {} }]),
    );
    await render(<Page initialUpsells={upsellsOf([up("chain", { stock: 0.5 as never })])} />);
    await click(button(block(), /Add/)!);
    expect(cart().map((l) => l.id)).toEqual(["other"]);
    expect(button(block(), /Unavailable/)).toBeDefined();
    expect(trackEvent).not.toHaveBeenCalled();
  });
});

describe("post-add upsell sheet", () => {
  it("opens only after the main product was accepted by the cart", async () => {
    await render(<Page initialUpsells={upsellsOf([up("chain"), up("stud")])} />);
    expect(sheet()).toBeNull();
    await click(addToBag());
    expect(cart().map((l) => l.id)).toEqual(["hoop"]);
    expect(sheet()).not.toBeNull();
    expect(sheet()!.textContent).toContain("Added to bag");
    expect(sheet()!.textContent).toContain("Seamless Ring 8mm");
    expect(sheetIds()).toEqual(["chain", "stud"]);
    // The sheet is the confirmation; no second toast on top of it.
    expect(toast).not.toHaveBeenCalled();
  });

  it("does not open when the cart refuses the main product", async () => {
    await render(<Page refuseMainAdd initialUpsells={upsellsOf([up("chain")])} />);
    await click(addToBag());
    expect(sheet()).toBeNull();
    // Percé's existing behaviour for a refused add is unchanged (it toasts).
    expect(toast).toHaveBeenCalledTimes(1);
  });

  it("does not repeat an upsell already added from the product page — the next one replaces it", async () => {
    await render(<Page initialUpsells={upsellsOf([up("chain"), up("stud"), up("cuff")])} />);
    await click(button(block()!.querySelector("[data-upsell-item=chain]"), /Add/)!);
    await click(addToBag());
    expect(sheetIds()).toEqual(["stud", "cuff"]);
  });

  it("never opens empty: with nothing left to offer, the add is confirmed by the toast", async () => {
    await render(<Page initialUpsells={upsellsOf([up("chain")])} />);
    await click(button(block(), /Add/)!);
    toast.mockClear();
    await click(addToBag());
    expect(sheet()).toBeNull();
    expect(toast).toHaveBeenCalledTimes(1);
  });

  it("stays closed when the post-add placement is off", async () => {
    await render(<Page initialUpsells={upsellsOf([up("chain")], { postAdd: false })} />);
    await click(addToBag());
    expect(sheet()).toBeNull();
    expect(toast).toHaveBeenCalledTimes(1);
  });

  it("adds from the sheet without a toast and without reopening on cart changes", async () => {
    await render(<Page initialUpsells={upsellsOf([up("chain"), up("stud"), up("cuff")])} />);
    await click(addToBag());
    toast.mockClear();
    await click(button(sheet(), /^Add$/)!);
    expect(cart().map((l) => l.id)).toEqual(["hoop", "chain"]);
    expect(toast).not.toHaveBeenCalled();
    expect(sheet()!.querySelector("[data-upsell-item=chain]")!.textContent).toContain("Added");

    // Close, then change the cart from the block: the sheet must not come back.
    await click(button(sheet(), /Continue shopping/)!);
    expect(sheet()).toBeNull();
    await click(button(block()!.querySelector("[data-upsell-item=stud]"), /Add/)!);
    expect(cart().map((l) => l.id)).toEqual(["hoop", "chain", "stud"]);
    expect(sheet()).toBeNull();
  });

  it("links to the bag and checkout", async () => {
    await render(<Page initialUpsells={upsellsOf([up("chain")])} />);
    await click(addToBag());
    const hrefs = [...sheet()!.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/cart");
    expect(hrefs).toContain("/checkout");
  });

  it("is a bottom sheet on phones and a centred modal from sm up, above the header", async () => {
    await render(<Page initialUpsells={upsellsOf([up("chain")])} />);
    await click(addToBag());
    const el = sheet() as HTMLElement;
    const cls = el.className;
    expect(cls).toMatch(/(^|\s)inset-x-0(\s|$)/);
    expect(cls).toMatch(/(^|\s)bottom-0(\s|$)/);
    expect(cls).toContain("max-h-[88dvh]");
    expect(cls).toContain("sm:top-[50%]");
    expect(cls).toContain("sm:left-[50%]");
    expect(cls).toContain("sm:max-w-[460px]");
    // Square, flat Percé surface; on the overlay layer above the header.
    expect(cls).toContain("rounded-none");
    expect(cls).toContain("shadow-none");
    expect(el.style.zIndex).toBe("var(--perce-z-overlay)");
  });

  it("keeps the main add-to-cart behaviour: quantity reaches the cart line", async () => {
    await render(<Page initialUpsells={upsellsOf([up("chain")])} />);
    await click(document.querySelector('[aria-label="Increase quantity"]')!);
    await click(addToBag());
    expect(cart()).toEqual([expect.objectContaining({ id: "hoop", quantity: 2, price: 250, selectedOptions: {} })]);
    expect(sheet()!.textContent).toContain("2 ×");
  });

  it("shows the chosen configuration's price — the same price as the cart line", async () => {
    await render(<Page product={MAIN_WITH_OPTIONS} initialUpsells={upsellsOf([up("chain")])} />);
    const gold = [...document.querySelectorAll('[role="radio"]')].find((el) =>
      /Gold/.test(el.textContent ?? ""),
    )!;
    await click(gold);
    await click(addToBag());
    expect(cart()).toEqual([
      expect.objectContaining({ id: "hoop", price: 280, selectedOptions: { Colour: "Gold" } }),
    ]);
    expect(sheet()!.textContent).toContain("Colour: Gold");
    expect(sheet()!.textContent).toMatch(/EGP\s280/);
  });
});

/**
 * The page as the route builds it from the resolver's answer — so these pin
 * the shipped default (off) and the switch-on path end to end.
 */
describe("upsells off by default, on once enabled", () => {
  const CURATED = [up("chain"), up("stud")];

  function response(over: Partial<UpsellResponse>): UpsellResponse {
    return { enabled: true, productPage: true, postAdd: true, limit: 3, source: "random", items: [], ...over };
  }

  async function renderFrom(res: UpsellResponse | null) {
    const { upsells } = productPageUpsellProps(res, CURATED);
    await render(<Page initialUpsells={upsells} />);
  }

  // Exactly what the server answers for a store with no saved upsell_config.
  const OFF = response({ enabled: false, productPage: false, postAdd: false, source: "none" });

  it("OFF (no saved config): no block, no popup, the usual toast, curated list kept", async () => {
    expect(productPageUpsellProps(OFF, CURATED).curatedAddOns).toEqual(CURATED);
    await renderFrom(OFF);
    expect(block()).toBeNull();
    await click(addToBag());
    expect(cart().map((l) => l.id)).toEqual(["hoop"]);
    expect(sheet()).toBeNull();
    expect(toast).toHaveBeenCalledTimes(1);
  });

  it("OFF even if a response carried items: nothing is shown", async () => {
    await renderFrom({ ...OFF, items: [up("cuff")], productPage: true, postAdd: true });
    expect(block()).toBeNull();
    await click(addToBag());
    expect(sheet()).toBeNull();
  });

  it("an unreachable resolver behaves like OFF", async () => {
    expect(productPageUpsellProps(null, CURATED).curatedAddOns).toEqual(CURATED);
    await renderFrom(null);
    expect(block()).toBeNull();
    await click(addToBag());
    expect(sheet()).toBeNull();
  });

  it("ON, global random: block and popup, curated strip suppressed", async () => {
    expect(productPageUpsellProps(response({}), CURATED).curatedAddOns).toEqual([]);
    await renderFrom(response({ items: [up("cuff"), up("chain-2")] }));
    expect(blockIds()).toEqual(["cuff", "chain-2"]);
    await click(addToBag());
    expect(sheetIds()).toEqual(["cuff", "chain-2"]);
  });

  it("ON, manual: the curated list in order, drawn once", async () => {
    await renderFrom(response({ source: "manual", items: CURATED }));
    expect(blockIds()).toEqual(["chain", "stud"]);
    expect(block()!.textContent).toContain("Frequently bought together");
    await click(addToBag());
    expect(sheetIds()).toEqual(["chain", "stud"]);
  });

  it("ON, product disabled: no block, no popup", async () => {
    await renderFrom(response({ source: "none", items: [] }));
    expect(block()).toBeNull();
    await click(addToBag());
    expect(sheet()).toBeNull();
    expect(toast).toHaveBeenCalledTimes(1);
  });
});
