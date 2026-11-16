// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dialog, DialogContent, DialogTitle } from "#root/components/ui/dialog";
import { type AdminOrderItem, OrderItemsList, OrderItemsTable } from "../OrderItemsPanel";

/**
 * Order details: each line's thumbnail opens the full-size image in a nested
 * preview that closes on ×, Escape and a click outside the image — without
 * closing the Order Details modal it opens over. Lines without an image keep
 * the plain initial placeholder and offer no preview.
 */

const items: AdminOrderItem[] = [
  { id: "i1", productId: "p1", name: "Clicker Ring", quantity: 1, price: "150.00", discountPrice: null, productImage: "/uploads/clicker.webp" },
  { id: "i2", productId: "p2", name: "Flat Back Stud", quantity: 2, price: "80.00", discountPrice: null, productImage: "/uploads/stud.webp" },
  { id: "i3", productId: "p3", name: "No Photo Piece", quantity: 1, price: "50.00", discountPrice: null, productImage: null },
];

const previewDialog = () => screen.queryByRole("dialog", { name: "Image preview" });

function Harness({ layout }: { layout: "table" | "list" }) {
  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent aria-describedby={undefined}>
        <DialogTitle>Order Details</DialogTitle>
        {layout === "table" ? <OrderItemsTable items={items} bundles={[]} /> : <OrderItemsList items={items} bundles={[]} />}
      </DialogContent>
    </Dialog>
  );
}

describe.each(["table", "list"] as const)("order item image preview (%s layout)", (layout) => {
  it("opens the exact image of the thumbnail clicked", async () => {
    const user = userEvent.setup();
    render(<Harness layout={layout} />);
    for (const item of items.filter((i) => i.productImage)) {
      await user.click(screen.getByRole("button", { name: `Preview image of ${item.name}` }));
      const dialog = previewDialog();
      expect(dialog).not.toBeNull();
      // Above the mobile details Sheet (z-[10001]); at z-50 it opened unseen behind it.
      expect(dialog!.className).toContain("z-[10002]");
      const img = within(dialog!).getByRole("img");
      expect(img.getAttribute("src")).toBe(item.productImage);
      expect(img.getAttribute("alt")).toBe(item.name);
      await user.keyboard("{Escape}");
      expect(previewDialog()).toBeNull();
    }
  });

  it("closes on ×, outside click and Escape while Order Details stays open", async () => {
    const user = userEvent.setup();
    render(<Harness layout={layout} />);
    const details = screen.getByRole("dialog", { name: "Order Details" });
    const open = () => user.click(screen.getByRole("button", { name: "Preview image of Clicker Ring" }));

    await open();
    await user.click(screen.getByRole("button", { name: "Close preview" }));
    expect(previewDialog()).toBeNull();

    await open();
    await user.click(previewDialog()!); // the backdrop area around the image
    expect(previewDialog()).toBeNull();

    await open();
    await user.click(within(previewDialog()!).getByRole("img")); // the image itself keeps it open
    expect(previewDialog()).not.toBeNull();
    await user.keyboard("{Escape}");
    expect(previewDialog()).toBeNull();

    expect(screen.getByRole("dialog", { name: "Order Details" })).toBe(details);
  });

  it("offers no preview for a line without an image", () => {
    render(<Harness layout={layout} />);
    expect(screen.queryByRole("button", { name: "Preview image of No Photo Piece" })).toBeNull();
    expect(screen.getByText("N")).toBeTruthy();
  });
});
