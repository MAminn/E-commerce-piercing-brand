// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { OptionGroup } from "../OptionGroup";
import { Stepper } from "../Stepper";
import { buttonClass } from "../Button";
import { VariantSelector } from "#root/components/shop/VariantSelector";

afterEach(cleanup);

function Colour({ initial = null as string | null }) {
  const [value, setValue] = useState<string | null>(initial);
  return (
    <OptionGroup
      label='Colour'
      value={value}
      onChange={setValue}
      options={[
        { value: "Gold", label: "Gold" },
        { value: "Rose", label: "Rose", disabled: true },
        { value: "Silver", label: "Silver" },
      ]}
    />
  );
}

describe("OptionGroup — a real radiogroup", () => {
  it("exposes radiogroup / radio / aria-checked / aria-disabled, named by its label", () => {
    render(<Colour initial='Gold' />);
    const group = screen.getByRole("radiogroup", { name: "Colour" });
    const radios = screen.getAllByRole("radio");
    expect(group).toBeTruthy();
    expect(radios.map((r) => r.getAttribute("aria-checked"))).toEqual(["true", "false", "false"]);
    expect(screen.getByRole("radio", { name: "Rose" }).getAttribute("aria-disabled")).toBe("true");
  });

  it("one tab stop: the checked option (or the first choosable one)", () => {
    render(<Colour />);
    expect(screen.getAllByRole("radio").map((r) => r.getAttribute("tabindex"))).toEqual(["0", "-1", "-1"]);
  });

  it("arrow keys move the choice and skip unavailable values", () => {
    render(<Colour initial='Gold' />);
    fireEvent.keyDown(screen.getByRole("radio", { name: "Gold" }), { key: "ArrowRight" });
    expect(screen.getByRole("radio", { name: "Silver" }).getAttribute("aria-checked")).toBe("true");
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: "Silver" }));
    fireEvent.keyDown(screen.getByRole("radio", { name: "Silver" }), { key: "Home" });
    expect(screen.getByRole("radio", { name: "Gold" }).getAttribute("aria-checked")).toBe("true");
  });

  it("an unavailable value cannot be chosen by click", () => {
    render(<Colour initial='Gold' />);
    fireEvent.click(screen.getByRole("radio", { name: "Rose" }));
    expect(screen.getByRole("radio", { name: "Gold" }).getAttribute("aria-checked")).toBe("true");
  });

  it("selection is not colour alone: the chosen option is filled, not just recoloured", () => {
    render(<Colour initial='Gold' />);
    expect(screen.getByRole("radio", { name: "Gold" }).className).toContain("bg-ink");
    expect(screen.getByRole("radio", { name: "Rose" }).className).toContain("line-through");
  });

  it("square: no radius anywhere", () => {
    const { container } = render(<Colour initial='Gold' />);
    expect(container.innerHTML).not.toMatch(/rounded/);
  });
});

describe("VariantSelector uses the radiogroup", () => {
  it("one radiogroup per option group, strikethrough values disabled", () => {
    const onChange = vi.fn();
    render(
      <VariantSelector
        variants={[{ name: "Colour", values: [{ value: "Gold" }, { value: "Silver" }] }]}
        selectedVariants={{}}
        onVariantChange={onChange}
        strikethroughMap={{ Colour: ["Silver"] }}
      />,
    );
    expect(screen.getByRole("radiogroup", { name: "Colour" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Silver" }).getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(screen.getByRole("radio", { name: "Gold" }));
    expect(onChange).toHaveBeenCalledWith("Colour", "Gold");
  });
});

describe("Stepper", () => {
  it("is a labelled group with labelled buttons and a live count", () => {
    const inc = vi.fn();
    render(
      <Stepper
        value={2}
        onDecrement={() => {}}
        onIncrement={inc}
        label='Quantity'
        decrementLabel='Decrease quantity'
        incrementLabel='Increase quantity'
      />,
    );
    expect(screen.getByRole("group", { name: "Quantity" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Increase quantity" }));
    expect(inc).toHaveBeenCalled();
    expect(screen.getByText("2").getAttribute("aria-live")).toBe("polite");
  });
});

describe("Button system", () => {
  it("lg is 52px, md 44px, sm 36px drawn with a 44px hit area", () => {
    expect(buttonClass({ size: "lg" })).toContain("h-13");
    expect(buttonClass({ size: "md" })).toContain("h-11");
    const sm = buttonClass({ size: "sm" });
    expect(sm).toContain("h-9");
    expect(sm).toContain("before:-inset-y-1");
  });

  it("no radius or shadow in any variant", () => {
    for (const variant of ["primary", "secondary", "text", "icon"] as const) {
      expect(buttonClass({ variant })).not.toMatch(/rounded|shadow/);
    }
  });
});
