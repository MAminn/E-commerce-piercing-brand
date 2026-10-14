// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { evaluateBundleSelection } from "#root/shared/bundles/evaluate";
import { formatMoney } from "#root/shared/pricing/format-money";

const evaluateSelection = vi.fn();
const addBundle = vi.fn();

vi.mock("#root/shared/trpc/client", () => ({
  trpc: { bundle: { evaluateSelection: { query: (input: unknown) => evaluateSelection(input) } } },
}));
vi.mock("#root/lib/context/CartContext", () => ({ useCart: () => ({ addBundle }) }));
vi.mock("#root/frontend/contexts/TrackingContext", () => ({ useTracking: () => ({ trackEvent: () => {} }) }));
vi.mock("#root/components/ui/cart-toast", () => ({ showCartToast: () => {}, flyToCart: () => {} }));
vi.mock("vike-react/usePageContext", () => ({ usePageContext: () => ({ urlPathname: "/bundles/pick-your-6" }) }));

import { BundleBuilder } from "../BundleBuilder";
import { MinimalI18nProvider } from "#root/lib/i18n/MinimalI18nContext";

const flat = { id: "c-flat", name: "Flat Back", slug: "flat-back" };
const nose = { id: "c-nose", name: "Nose", slug: "nose" };
const fake = { id: "c-fake", name: "Fake Piercings", slug: "fake-piercings" };

const product = (id: string, name: string, price: number, categories: (typeof flat)[], stock = 5) => ({
  productId: id,
  sortOrder: 0,
  quantity: 1,
  name,
  slug: id,
  price,
  discountPrice: null,
  stock,
  imageUrl: `${id}.webp`,
  deleted: false,
  hidden: false,
  source: "manual",
  optionGroups: [],
  selectedOptions: null,
  unitPrice: price,
  purchasable: true,
  categories,
});

const pool = [
  product("00000000-0000-4000-8000-000000000001", "Mini Flower Stud", 120, [flat]),
  product("00000000-0000-4000-8000-000000000002", "Crystal L-Shape Stud", 80, [nose]),
  product("00000000-0000-4000-8000-000000000003", "Crystal Curved Barbell", 90, [flat, nose]),
  product("00000000-0000-4000-8000-000000000004", "Triple Band Star Ear Cuff", 175, [fake]),
  product("00000000-0000-4000-8000-000000000005", "Gold Seamless Hoop", 140, [flat]),
  product("00000000-0000-4000-8000-000000000006", "Opal Daith Ring", 160, [flat]),
  product("00000000-0000-4000-8000-000000000007", "Pearl Flat Back", 110, [flat]),
  product("00000000-0000-4000-8000-000000000008", "Sold Out Labret", 95, [flat], 0),
];

const campaign = {
  id: "00000000-0000-4000-8000-0000000000aa",
  title: "Pick Your 6",
  slug: "pick-your-6",
  subtitle: null,
  description: null,
  badgeText: null,
  imageId: null,
  imageUrl: null,
  heroImageUrl: null,
  type: "build_your_stack",
  isActive: true,
  state: "live",
  availability: "available",
  requiredQuantity: 6,
  unitCount: 6,
  pricingType: "percentage_discount",
  tiers: [{ id: "tier-6", quantity: 6, price: null, discountPercent: 15, availability: "available", valueRange: null }],
  fixedBundlePrice: null,
  regularValue: null,
  savings: null,
  valueRange: null,
  allowDuplicates: false,
  maxPerProduct: null,
  isRepeatable: false,
  offerStacking: "exclusive",
  freeShipping: true,
  sortOrder: 0,
  startsAt: null,
  endsAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  categoryIds: [],
  eligibleProductCount: pool.length,
  eligibleProducts: pool,
  eligibilityMode: "manual",
  eligibilityCategoryIds: [],
  eligibilityMinPrice: null,
  eligibilityMaxPrice: null,
  manualProductCount: pool.length,
  dynamicProductCount: 0,
} as never;

const renderBuilder = (locale: "en" | "ar" = "en") =>
  render(
    <MinimalI18nProvider ssrLocale={locale}>
      <BundleBuilder campaign={campaign} reload={async () => {}} />
    </MinimalI18nProvider>,
  );

/** The grid tile (li) for a product, by its visible name. */
const tile = (name: string) => {
  const grid = screen.getByTestId("bundle-grid");
  const label = within(grid).getByText(name);
  return label.closest("li") as HTMLElement;
};
const addButton = (name: string) => within(tile(name)).getByRole("button", { name: /^(add|selected)$/i });
const text = (testId: string) => screen.getByTestId(testId).textContent ?? "";
const isDisabled = (el: HTMLElement) => (el as HTMLButtonElement).disabled;

/** What the shared evaluator says for a selection — the figures the UI must show. */
const shared = (names: string[]) =>
  evaluateBundleSelection(
    {
      type: "build_your_stack",
      requiredQuantity: 6,
      pricingType: "percentage_discount",
      fixedBundlePrice: null,
      allowDuplicates: false,
      maxPerProduct: null,
      isRepeatable: false,
      tiers: [{ id: "tier-6", quantity: 6, price: null, discountPercent: 15 }],
      eligibleProductIds: pool.map((p) => p.productId),
    },
    names.map((n) => {
      const p = pool.find((x) => x.name === n)!;
      return { productId: p.productId, quantity: 1, unitPrice: p.price };
    }),
  );

const SIX = [
  "Mini Flower Stud",
  "Crystal L-Shape Stud",
  "Crystal Curved Barbell",
  "Triple Band Star Ear Cuff",
  "Gold Seamless Hoop",
  "Opal Daith Ring",
];

beforeEach(() => {
  cleanup();
  localStorage.clear();
  document.cookie = "";
  evaluateSelection.mockReset();
  addBundle.mockReset();
});

describe("Pick Your Set builder", () => {
  it("starts at 0 of 6 with the unlock promise, nothing shown as earned, CTA disabled", () => {
    renderBuilder();
    expect(text("bundle-progress-count")).toBe("0 of 6 selected");
    expect(text("bundle-progress-label")).toBe("Choose 6 pieces to unlock 15% off + free shipping");
    expect(screen.queryByTestId("bundle-percent-discount")).toBeNull();
    expect(screen.queryByTestId("bundle-you-save")).toBeNull();
    expect(text("bundle-shipping")).toBe("At checkout");
    expect(text("bundle-final-total")).toBe("—");
    expect(isDisabled(screen.getByTestId("bundle-add-to-bag"))).toBe(true);
    // Six empty slots in the tray.
    expect(within(screen.getByTestId("bundle-tray")).getAllByLabelText("Empty slot")).toHaveLength(6);
  });

  it("partway: counts, shows the pieces, and still does not claim the discount", async () => {
    const user = userEvent.setup();
    renderBuilder();
    for (const name of SIX.slice(0, 3)) await user.click(addButton(name));
    expect(text("bundle-progress-count")).toBe("3 of 6 selected");
    expect(text("bundle-progress-label")).toBe("Choose 3 more pieces to unlock 15% off + free shipping");
    expect(within(screen.getByTestId("bundle-tray")).getAllByRole("img")).toHaveLength(3);
    expect(within(screen.getByTestId("bundle-tray")).getAllByLabelText("Empty slot")).toHaveLength(3);
    expect(text("bundle-selected-subtotal")).toBe(formatMoney(120 + 80 + 90));
    expect(screen.queryByTestId("bundle-percent-discount")).toBeNull();
    expect(screen.queryByTestId("bundle-you-save")).toBeNull();
    expect(text("bundle-shipping")).toBe("At checkout");
    expect(isDisabled(screen.getByTestId("bundle-add-to-bag"))).toBe(true);
  });

  it("exactly 6: the shared engine's discount, total and saving, free shipping, CTA enabled", async () => {
    const user = userEvent.setup();
    renderBuilder();
    for (const name of SIX) await user.click(addButton(name));
    const expected = shared(SIX);
    expect(expected.qualifies).toBe(true);
    expect(text("bundle-progress-count")).toBe("6 of 6 selected");
    expect(text("bundle-percent-discount")).toContain(`−${formatMoney(expected.discountAmount!)}`);
    expect(text("bundle-percent-discount")).toContain("Discount (15%)");
    expect(text("bundle-final-total")).toBe(formatMoney(expected.bundleTotal!));
    expect(text("bundle-you-save")).toBe(`You save ${formatMoney(expected.discountAmount!)}`);
    expect(text("bundle-shipping")).toBe("Free");
    expect(isDisabled(screen.getByTestId("bundle-add-to-bag"))).toBe(false);
  });

  it("a full set blocks a 7th piece; the sold-out piece can never be added", async () => {
    const user = userEvent.setup();
    renderBuilder();
    for (const name of SIX) await user.click(addButton(name));
    expect(isDisabled(within(tile("Pearl Flat Back")).getByRole("button", { name: "Set full" }))).toBe(true);
    expect(isDisabled(within(tile("Sold Out Labret")).getAllByRole("button", { name: /sold out/i })[0]!)).toBe(true);
  });

  it("duplicates off: a second tap removes the piece instead of adding another", async () => {
    const user = userEvent.setup();
    renderBuilder();
    await user.click(addButton("Mini Flower Stud"));
    await user.click(addButton("Mini Flower Stud"));
    expect(text("bundle-progress-count")).toBe("0 of 6 selected");
  });

  it("the tray × removes a piece", async () => {
    const user = userEvent.setup();
    renderBuilder();
    await user.click(addButton("Mini Flower Stud"));
    await user.click(addButton("Crystal L-Shape Stud"));
    await user.click(within(screen.getByTestId("bundle-tray")).getByRole("button", { name: "Remove: Mini Flower Stud" }));
    expect(text("bundle-progress-count")).toBe("1 of 6 selected");
  });

  it("search narrows the grid by name; a picked piece stays picked when hidden", async () => {
    const user = userEvent.setup();
    renderBuilder();
    await user.click(addButton("Mini Flower Stud"));
    await user.type(screen.getByTestId("bundle-search"), "crystal");
    const names = within(screen.getByTestId("bundle-grid"))
      .getAllByRole("listitem")
      .map((li) => li.textContent);
    expect(names).toHaveLength(2);
    expect(names.join(" ")).toContain("Crystal L-Shape Stud");
    expect(names.join(" ")).toContain("Crystal Curved Barbell");
    expect(text("bundle-progress-count")).toBe("1 of 6 selected");

    await user.clear(screen.getByTestId("bundle-search"));
    await user.type(screen.getByTestId("bundle-search"), "necklace");
    expect(screen.getByTestId("bundle-no-matches")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Clear search and filters" }));
    expect(within(screen.getByTestId("bundle-grid")).getAllByRole("listitem")).toHaveLength(pool.length);
  });

  it("category chips come from the pool's real categories and filter the grid", async () => {
    const user = userEvent.setup();
    renderBuilder();
    const chips = within(screen.getByTestId("bundle-filters")).getAllByRole("button").map((b) => b.textContent);
    expect(chips).toEqual(["All", "Flat Back", "Nose", "Fake Piercings"]);
    await user.click(screen.getByRole("button", { name: "Nose" }));
    expect(within(screen.getByTestId("bundle-grid")).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Nose" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("marks a piece from a Fake Piercings category as 'No piercing needed'", () => {
    renderBuilder();
    expect(within(tile("Triple Band Star Ear Cuff")).getByText("No piercing needed")).toBeTruthy();
    expect(within(tile("Mini Flower Stud")).queryByText("No piercing needed")).toBeNull();
  });

  it("the server stays authoritative: Add set to bag re-checks, then adds what the server priced", async () => {
    const user = userEvent.setup();
    const expected = shared(SIX);
    evaluateSelection.mockResolvedValue({
      success: true,
      result: {
        ok: true,
        bundle: {
          campaignId: "00000000-0000-4000-8000-0000000000aa",
          campaignSlug: "pick-your-6",
          campaignTitle: "Pick Your 6",
          tierQuantity: 6,
          tierId: "tier-6",
          bundleTotal: expected.bundleTotal,
          offerStacking: "exclusive",
          isRepeatable: false,
          freeShipping: true,
          items: SIX.map((n) => {
            const p = pool.find((x) => x.name === n)!;
            return { productId: p.productId, name: p.name, quantity: 1, unitPrice: p.price, imageUrl: p.imageUrl, selectedOptions: {}, stock: p.stock };
          }),
        },
      },
    });
    addBundle.mockReturnValue({ success: true, instanceId: "inst-1" });
    renderBuilder();
    for (const name of SIX) await user.click(addButton(name));
    await user.click(screen.getByTestId("bundle-add-to-bag"));
    expect(evaluateSelection).toHaveBeenCalledTimes(1);
    const sent = evaluateSelection.mock.calls[0]![0] as { items: { productId: string; quantity: number }[]; expectedBundleTotal: number };
    expect(sent.items).toHaveLength(6);
    // Only ids + quantities (+ the total it was shown) leave the browser — no prices.
    expect(
      sent.items.every((i) => Object.entries(i).filter(([, v]) => v !== undefined).map(([k]) => k).sort().join() === "productId,quantity"),
    ).toBe(true);
    expect(sent.expectedBundleTotal).toBe(expected.bundleTotal);
    expect(addBundle).toHaveBeenCalledWith(expect.objectContaining({ bundlePrice: expected.bundleTotal, freeShipping: true }));
  });

  it("speaks Arabic", async () => {
    const user = userEvent.setup();
    renderBuilder("ar");
    expect(text("bundle-progress-count")).toBe("تم اختيار 0 من 6");
    expect(text("bundle-progress-label")).toBe("اختاري 6 قطع لتحصلي على خصم 15% + شحن مجاني");
    expect(screen.getByTestId("bundle-search").getAttribute("placeholder")).toBe("ابحثي عن قطعة");
    await user.click(within(tile("Mini Flower Stud")).getAllByRole("button")[1]!);
    expect(text("bundle-progress-label")).toBe("اختاري 5 قطع إضافية لتحصلي على خصم 15% + شحن مجاني");
  });
});

describe("Pick Your Set builder — Arabic core UI", () => {
  /** The visible text with product names, the campaign title and money removed. */
  const systemText = () => {
    let all = document.body.textContent ?? "";
    for (const name of [...pool.map((p) => p.name), "Pick Your 6", "Flat Back", "Nose", "Fake Piercings"]) {
      all = all.split(name).join(" ");
    }
    return all.replace(/EGP|ج\.م\.?/g, " ");
  };

  it("intro, filters, search, progress, pricing breakdown, saving and the sticky CTA are all Arabic", async () => {
    const user = userEvent.setup();
    renderBuilder("ar");
    expect(screen.getByText("كوّني طقمك")).toBeTruthy();
    expect(screen.getByTestId("bundle-search").getAttribute("placeholder")).toBe("ابحثي عن قطعة");
    expect(screen.getByRole("button", { name: "الكل" })).toBeTruthy();
    expect(text("bundle-progress-count")).toBe("تم اختيار 0 من 6");

    for (const name of SIX) await user.click(within(tile(name)).getAllByRole("button")[1]!);

    const expected = shared(SIX);
    const breakdown = text("bundle-breakdown");
    expect(breakdown).toContain("إجمالي القطع المختارة");
    expect(text("bundle-percent-discount")).toContain("الخصم (15%)");
    expect(breakdown).toContain("الشحن");
    expect(text("bundle-shipping")).toBe("مجاني");
    expect(breakdown).toContain("إجمالي الطقم");
    expect(text("bundle-final-total")).toBe(formatMoney(expected.bundleTotal!));
    expect(text("bundle-you-save")).toBe(`وفّرتِ ${formatMoney(expected.discountAmount!)}`);
    expect(text("bundle-progress-count")).toBe("تم اختيار 6 من 6");
    expect(within(screen.getByTestId("bundle-action-bar")).getByTestId("bundle-add-to-bag").textContent).toBe(
      "أضيفي الطقم إلى الحقيبة",
    );

    // Nothing of the interface is left in English — only catalogue content.
    expect(systemText()).not.toMatch(/[A-Za-z]{2,}/);
  });
});
