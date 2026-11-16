// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * The Edit Order "Add product" picker: catalogue search by name or SKU, exact
 * variant selection (struck-through values unavailable), quantity capped by
 * stock, and the picked line handed back to the draft — nothing is saved here.
 */

const searchQuery = vi.fn();
vi.mock("#root/shared/trpc/client", () => ({
  trpc: { order: { searchProductsForEdit: { query: (input: unknown) => searchQuery(input) } } },
}));

const { AddProductDialog } = await import("../AddProductDialog");

const catalog = [
  {
    id: "hoop",
    name: "Seamless Hoop",
    internalCode: "HP-01",
    catalogueNo: 12,
    image: "/uploads/hoop.webp",
    price: 80,
    discountPrice: null,
    effectivePrice: 80,
    stock: 3,
    optionGroups: [
      {
        name: "Color",
        values: [
          { value: "Gold", priceModifier: 20, available: true },
          { value: "Silver", priceModifier: 0, available: true },
          { value: "Rose", priceModifier: 0, available: false },
        ],
      },
    ],
    purchasable: true,
  },
  {
    id: "stud",
    name: "Flat Back Stud",
    internalCode: null,
    catalogueNo: null,
    image: null,
    price: 200,
    discountPrice: 150,
    effectivePrice: 150,
    stock: 10,
    optionGroups: [],
    purchasable: true,
  },
  {
    id: "gone",
    name: "Sold Out Bar",
    internalCode: null,
    catalogueNo: null,
    image: null,
    price: 30,
    discountPrice: null,
    effectivePrice: 30,
    stock: 0,
    optionGroups: [],
    purchasable: true,
  },
];

beforeEach(() => {
  searchQuery.mockReset();
  searchQuery.mockImplementation(async ({ query }: { query: string }) => ({
    success: true,
    result: catalog.filter(
      (p) => query === "" || p.name.toLowerCase().includes(query.toLowerCase()) || p.internalCode?.toLowerCase().includes(query.toLowerCase()),
    ),
  }));
});

const resultButton = (name: string) =>
  screen.getAllByTestId("add-product-result").find((b) => within(b).queryByText(name)) as HTMLButtonElement;

describe("AddProductDialog", () => {
  it("lists the catalogue, searches by SKU and disables out-of-stock products", async () => {
    const user = userEvent.setup();
    render(<AddProductDialog open onOpenChange={() => {}} onAdd={vi.fn()} />);

    await screen.findByText("Seamless Hoop");
    expect(searchQuery).toHaveBeenLastCalledWith({ query: "", limit: 20 });
    expect(resultButton("Sold Out Bar").disabled).toBe(true);
    expect(within(resultButton("Sold Out Bar")).getByText("Out of stock")).toBeTruthy();
    // Sale price shown struck through next to the regular one.
    expect(within(resultButton("Flat Back Stud")).getByText("150.00 EGP")).toBeTruthy();

    await user.type(screen.getByRole("textbox", { name: "Search products by name or SKU" }), "hp-01");
    await waitFor(() => expect(searchQuery).toHaveBeenLastCalledWith({ query: "hp-01", limit: 20 }));
    await waitFor(() => expect(screen.queryByText("Flat Back Stud")).toBeNull());
    expect(screen.getByText("Seamless Hoop")).toBeTruthy();
  });

  it("requires the exact variant, prices it with its modifier and caps quantity at stock", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    const onOpenChange = vi.fn();
    render(<AddProductDialog open onOpenChange={onOpenChange} onAdd={onAdd} />);

    await user.click(await screen.findByText("Seamless Hoop"));
    const add = screen.getByRole("button", { name: "Add to order" }) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    expect(screen.getByTestId("add-product-unit-price").textContent).toBe("Choose options");
    expect((screen.getByRole("button", { name: "Rose" }) as HTMLButtonElement).disabled).toBe(true);

    const gold = screen.getByRole("button", { name: /Gold/ });
    expect(gold.getAttribute("aria-pressed")).toBe("false");
    await user.click(gold);
    expect(gold.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("add-product-unit-price").textContent).toBe("100.00 EGP");
    expect(add.disabled).toBe(false);

    const more = screen.getByRole("button", { name: "Increase quantity" }) as HTMLButtonElement;
    await user.click(more);
    await user.click(more);
    expect(more.disabled).toBe(true); // stock 3
    expect((screen.getByRole("spinbutton", { name: "Quantity" }) as HTMLInputElement).value).toBe("3");

    await user.click(add);
    expect(onAdd).toHaveBeenCalledWith({
      productId: "hoop",
      name: "Seamless Hoop",
      internalCode: "HP-01",
      image: "/uploads/hoop.webp",
      selectedOptions: { Color: "Gold" },
      quantity: 3,
      unitPrice: 100,
      stock: 3,
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("adds a simple product at its sale price and shows the merge hint", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    const mergeHint = vi.fn(() => "already on the order");
    render(<AddProductDialog open onOpenChange={() => {}} onAdd={onAdd} mergeHint={mergeHint} />);

    await user.click(await screen.findByText("Flat Back Stud"));
    expect(screen.getByTestId("add-product-unit-price").textContent).toBe("150.00 EGP");
    expect(screen.getByText("already on the order")).toBeTruthy();
    expect(mergeHint).toHaveBeenLastCalledWith({ productId: "stud", selectedOptions: null, unitPrice: 150, quantity: 1 });

    await user.click(screen.getByRole("button", { name: "Add to order" }));
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ productId: "stud", selectedOptions: null, unitPrice: 150, quantity: 1 }));
  });

  it("shows a search failure instead of an empty list", async () => {
    searchQuery.mockResolvedValue({ success: false, error: "Admin access required" });
    render(<AddProductDialog open onOpenChange={() => {}} onAdd={vi.fn()} />);
    expect(await screen.findByText("Admin access required")).toBeTruthy();
  });
});
