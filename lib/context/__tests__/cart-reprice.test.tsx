// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, waitFor } from "@testing-library/react";
/**
 * Saved bags are re-priced from the live catalogue, through the REAL
 * CartProvider: a bag kept in the browser holds the prices from when each
 * piece was added, and checkout charges the live price — so the bag must
 * show the live price (and the live sale) before the shopper orders.
 */
const live = new Map<string, { id: string; price: string; discountPrice: string | null }>();
const getByIds = vi.fn(async ({ ids }: { ids: string[] }) => ({
  success: true,
  result: ids.flatMap((id) => {
    const row = live.get(id);
    return row ? [row] : [];
  }),
}));
vi.mock("#root/shared/trpc/client", () => ({
  trpc: {
    product: {
      getByIds: { query: (input: { ids: string[] }) => getByIds(input) },
      getById: { query: async () => ({ success: false }) },
    },
    shipping: { quote: { query: async () => ({ success: false }) } },
    bundle: { evaluateSelection: { query: async () => ({ success: false }) } },
    offer: { evaluate: { query: async () => ({ success: true, result: [] }) } },
    cartCapture: { sync: { mutate: async () => ({ success: true }) } },
    promoCode: { validate: { query: async () => ({ success: false }) } },
  },
}));
import { CartProvider, useCart } from "#root/lib/context/CartContext";

let latest: ReturnType<typeof useCart> | null = null;
function Probe() {
  latest = useCart();
  return null;
}
const line = (id: string, price: number, originalPrice?: number) => ({
  id,
  name: `Piece ${id}`,
  price,
  originalPrice,
  stock: 10,
  quantity: 1,
  selectedOptions: {},
});
const mount = () => render(<CartProvider><Probe /></CartProvider>);
const cart = () => {
  if (!latest) throw new Error("CartProvider not mounted");
  return latest;
};
const byId = (id: string) => {
  const found = cart().items.find((i) => i.id === id);
  if (!found) throw new Error(`no line ${id}`);
  return found;
};

beforeEach(() => {
  live.clear();
  getByIds.mockClear();
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  latest = null;
});

describe("cart re-pricing", () => {
  it("a sale that started after the piece was added: the bag shows the sale price and the struck regular price", async () => {
    localStorage.setItem("cart", JSON.stringify([line("a", 120)]));
    live.set("a", { id: "a", price: "120.00", discountPrice: "96.00" });
    mount();
    await waitFor(() => expect(byId("a").price).toBe(96));
    expect(byId("a").originalPrice).toBe(120);
    expect(cart().subtotal).toBe(96);
    expect(JSON.parse(localStorage.getItem("cart") ?? "[]")[0]).toMatchObject({ price: 96, originalPrice: 120 });
    expect(cart().pricesUpdating).toBe(false);
  });

  it("a sale that ended (discount removed in the dashboard): regular price, no strike", async () => {
    localStorage.setItem("cart", JSON.stringify([line("b", 96, 120)]));
    live.set("b", { id: "b", price: "120.00", discountPrice: null });
    mount();
    await waitFor(() => expect(byId("b").price).toBe(120));
    expect(byId("b").originalPrice).toBeUndefined();
  });

  it("a misconfigured discount (at or above the price) is not a sale", async () => {
    localStorage.setItem("cart", JSON.stringify([line("c", 100)]));
    live.set("c", { id: "c", price: "120.00", discountPrice: "130.00" });
    mount();
    await waitFor(() => expect(byId("c").price).toBe(120));
    expect(byId("c").originalPrice).toBeUndefined();
  });

  it("a product no longer in the catalogue is left as it is (checkout refuses it)", async () => {
    localStorage.setItem("cart", JSON.stringify([line("gone", 80), line("d", 150)]));
    live.set("d", { id: "d", price: "150.00", discountPrice: "75.00" });
    mount();
    await waitFor(() => expect(byId("d").price).toBe(75));
    expect(byId("gone")).toMatchObject({ price: 80 });
  });

  it("already-current lines are not rewritten, and concurrent callers share one request", async () => {
    localStorage.setItem("cart", JSON.stringify([line("e", 96, 120)]));
    live.set("e", { id: "e", price: "120.00", discountPrice: "96.00" });
    mount();
    await waitFor(() => expect(getByIds).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(cart().pricesUpdating).toBe(false));
    const before = cart().items;
    await act(async () => {
      await Promise.all([cart().refreshPrices(), cart().refreshPrices()]);
    });
    expect(getByIds).toHaveBeenCalledTimes(2); // one more, shared by both callers
    expect(cart().items).toBe(before); // same array: nothing changed, nothing re-saved
  });

  it("a failed request keeps the saved lines and clears the updating flag", async () => {
    localStorage.setItem("cart", JSON.stringify([line("f", 120)]));
    getByIds.mockRejectedValueOnce(new Error("offline"));
    mount();
    await waitFor(() => expect(getByIds).toHaveBeenCalled());
    await waitFor(() => expect(cart().pricesUpdating).toBe(false));
    expect(byId("f").price).toBe(120);
  });
});
