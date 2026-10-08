// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MultiFileUploadInput } from "../MultiFileUpload";
import { Dialog, DialogContent, DialogTitle } from "#root/components/ui/dialog";

/**
 * Thumbnail click-to-preview in the admin Edit Product dialog.
 *
 * The preview is a nested Radix dialog, so it must close on ×, backdrop and
 * Escape WITHOUT dismissing the Edit Product dialog it opens over. Remove is
 * a sibling of the preview trigger, so it must keep removing the image and
 * never open the preview.
 *
 * The component sits inside the product <form>, where a <button> without a
 * type defaults to type="submit": every image-management control must be
 * type="button" or clicking it also submits (and saves) the product.
 */

const images = [
  { id: "a", url: "/uploads/a.jpg", isPrimary: true },
  { id: "b", url: "/uploads/b.jpg", isPrimary: false },
  { id: "c", url: "/uploads/c.jpg", isPrimary: false },
];

function Harness({
  onChange,
  onSubmit = vi.fn(),
}: {
  onChange: (v: typeof images) => void;
  onSubmit?: () => void;
}) {
  // Fresh copies per render: removeFile sets isPrimary on the surviving
  // first image in place, which would otherwise leak between tests.
  const [value, setValue] = useState(() => images.map((img) => ({ ...img })));
  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent aria-describedby={undefined}>
        <DialogTitle>Edit Product</DialogTitle>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          <MultiFileUploadInput
            name="productImages"
            id="productImages"
            value={value}
            onChange={(v) => {
              onChange(v as typeof images);
              setValue(v as typeof images);
            }}
          />
          <button type="submit">Submit product</button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// The ◀ / ▶ order controls are icon-only, so find them by their icon.
const arrowButton = (dir: "left" | "right", thumbIndex: number) => {
  const icons = document.querySelectorAll(`svg.lucide-chevron-${dir}`);
  const button = icons[thumbIndex]?.closest("button");
  if (!button) throw new Error(`no ${dir} arrow for thumbnail ${thumbIndex}`);
  return button;
};

const previewDialog = () =>
  screen.queryByRole("dialog", { name: "Image preview" });

describe("MultiFileUploadInput image preview", () => {
  it("opens the exact image clicked, for every thumbnail", async () => {
    const user = userEvent.setup();
    render(<Harness onChange={vi.fn()} />);

    for (const [i, img] of images.entries()) {
      await user.click(
        screen.getByRole("button", { name: `Preview product image ${i + 1}` })
      );
      const dialog = previewDialog();
      expect(dialog).not.toBeNull();
      expect(within(dialog!).getByRole("img").getAttribute("src")).toBe(img.url);
      await user.keyboard("{Escape}");
      expect(previewDialog()).toBeNull();
    }
  });

  it("closes on ×, backdrop and Escape while Edit Product stays open", async () => {
    const user = userEvent.setup();
    render(<Harness onChange={vi.fn()} />);
    const editDialog = screen.getByRole("dialog", { name: "Edit Product" });
    const open = () =>
      user.click(
        screen.getByRole("button", { name: "Preview product image 2" })
      );

    await open();
    await user.click(screen.getByRole("button", { name: "Close preview" }));
    expect(previewDialog()).toBeNull();
    expect(editDialog.isConnected).toBe(true);

    await open();
    // The full-screen content layer around the image is the backdrop area.
    await user.click(previewDialog()!);
    expect(previewDialog()).toBeNull();
    expect(editDialog.isConnected).toBe(true);

    await open();
    await user.keyboard("{Escape}");
    expect(previewDialog()).toBeNull();
    expect(screen.getByRole("dialog", { name: "Edit Product" })).toBe(
      editDialog
    );
  });

  it("does not close when clicking the image itself", async () => {
    const user = userEvent.setup();
    render(<Harness onChange={vi.fn()} />);
    await user.click(
      screen.getByRole("button", { name: "Preview product image 1" })
    );
    await user.click(within(previewDialog()!).getByRole("img"));
    expect(previewDialog()).not.toBeNull();
  });

  it("Remove still removes the image and never opens the preview", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    const removeButtons = screen.getAllByRole("button", { name: /Remove/ });
    await user.click(removeButtons[1]!);

    expect(previewDialog()).toBeNull();
    expect(onChange).toHaveBeenLastCalledWith([images[0], images[2]]);
    expect(screen.getAllByRole("img")).toHaveLength(2);
  });
});

describe("MultiFileUploadInput controls never submit the parent form", () => {
  it("control: the harness does detect a real submit", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Harness onChange={vi.fn()} onSubmit={onSubmit} />);
    await user.click(screen.getByRole("button", { name: "Submit product" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("opening the preview from a thumbnail does not submit", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Harness onChange={vi.fn()} onSubmit={onSubmit} />);
    await user.click(
      screen.getByRole("button", { name: "Preview product image 2" })
    );
    expect(previewDialog()).not.toBeNull();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("closing the preview with × does not submit", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Harness onChange={vi.fn()} onSubmit={onSubmit} />);
    await user.click(
      screen.getByRole("button", { name: "Preview product image 1" })
    );
    await user.click(screen.getByRole("button", { name: "Close preview" }));
    expect(previewDialog()).toBeNull();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("Remove does not submit", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} onSubmit={onSubmit} />);
    await user.click(screen.getAllByRole("button", { name: /Remove/ })[0]!);
    expect(onChange).toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("Set as Primary does not submit", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} onSubmit={onSubmit} />);
    // Thumbnail "b" is the first non-primary image, so it owns the first one.
    await user.click(
      screen.getAllByRole("button", { name: "Set as Primary" })[0]!
    );
    expect(onChange).toHaveBeenLastCalledWith([
      { ...images[0], isPrimary: false },
      { ...images[1], isPrimary: true },
      { ...images[2], isPrimary: false },
    ]);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("the ◀ / ▶ order arrows do not submit", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} onSubmit={onSubmit} />);

    await user.click(arrowButton("right", 0));
    expect(onChange).toHaveBeenLastCalledWith([images[1], images[0], images[2]]);

    await user.click(arrowButton("left", 2));
    expect(onChange).toHaveBeenLastCalledWith([images[1], images[2], images[0]]);

    expect(onSubmit).not.toHaveBeenCalled();
  });
});
