// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  normalizeUpsellSettings,
  type UpsellSettings,
} from "#root/shared/upsell/config";
import { UpsellSettingsCard } from "../UpsellSettingsCard";

/**
 * The Upsells card must make the shipped default — off — obvious, and turning
 * it on must actually save `enabled: true`.
 */

let stored: Partial<UpsellSettings> | null = null;
const updateSettings = vi.fn(async (input: UpsellSettings) => {
  stored = input;
  return { success: true as const, result: normalizeUpsellSettings(input) };
});

vi.mock("#root/shared/trpc/client", () => ({
  trpc: {
    upsell: {
      // Server behaviour: a missing row normalises over the defaults.
      getSettings: {
        query: async () => ({ success: true, result: normalizeUpsellSettings(stored) }),
      },
      updateSettings: { mutate: (input: UpsellSettings) => updateSettings(input) },
    },
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  stored = null;
  updateSettings.mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function renderCard() {
  await act(async () => {
    root.render(<UpsellSettingsCard />);
  });
}

const q = (sel: string) => container.querySelector(sel);
const switchState = (id: string) => q(`#${id}`)!.getAttribute("aria-checked");

describe("UpsellSettingsCard", () => {
  it("shows a fresh store (no saved config) as Off, with every placement locked", async () => {
    await renderCard();
    expect(q("[data-testid=upsell-status-badge]")!.textContent).toBe("Off");
    expect(q("[data-testid=upsell-off-notice]")).not.toBeNull();
    expect(switchState("upsellEnabled")).toBe("false");
    expect(q("#upsellProductPage")!.hasAttribute("disabled")).toBe(true);
    expect(q("#upsellPostAdd")!.hasAttribute("disabled")).toBe(true);
  });

  it("enabling and saving stores enabled: true and flips the status to On", async () => {
    await renderCard();
    await act(async () => {
      (q("#upsellEnabled") as HTMLButtonElement).click();
    });
    // Not live until saved.
    expect(q("[data-testid=upsell-status-badge]")!.textContent).toBe("Off");

    const save = [...container.querySelectorAll("button")].find((b) =>
      /Save Upsell Settings/.test(b.textContent ?? ""),
    )!;
    await act(async () => {
      save.click();
    });

    expect(updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true, productPageEnabled: true, postAddEnabled: true }),
    );
    expect(q("[data-testid=upsell-status-badge]")!.textContent).toBe("On");
    expect(q("[data-testid=upsell-off-notice]")).toBeNull();
  });

  it("an owner who already enabled it sees On", async () => {
    stored = { enabled: true };
    await renderCard();
    expect(q("[data-testid=upsell-status-badge]")!.textContent).toBe("On");
    expect(q("[data-testid=upsell-off-notice]")).toBeNull();
  });
});
