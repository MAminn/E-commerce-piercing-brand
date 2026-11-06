// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRef } from "react";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("#root/shared/trpc/client", () => ({ trpc: { bundle: { evaluateSelection: { query: vi.fn() } } } }));
vi.mock("#root/lib/context/CartContext", () => ({ useCart: () => ({ addBundle: vi.fn() }) }));
vi.mock("#root/frontend/contexts/TrackingContext", () => ({ useTracking: () => ({ trackEvent: () => {} }) }));
vi.mock("#root/components/ui/cart-toast", () => ({ showCartToast: () => {}, flyToCart: () => {} }));
vi.mock("vike-react/usePageContext", () => ({ usePageContext: () => ({ urlPathname: "/bundles/ready-set-ear" }) }));

import { BundleCampaignCard } from "../BundleCampaignCard";
import { CuratedStackDetail } from "../CuratedStackDetail";
import { usePublishSetBarHeight, useSetPanelInView } from "../set-bar";
import { MinimalI18nProvider } from "#root/lib/i18n/MinimalI18nContext";

const piece = (id: string, name: string, unitPrice: number, quantity = 1) => ({
  productId: id,
  sortOrder: 0,
  quantity,
  name,
  slug: id,
  price: unitPrice,
  discountPrice: null,
  stock: 5,
  imageUrl: null,
  deleted: false,
  hidden: false,
  source: "manual",
  optionGroups: [],
  selectedOptions: null,
  unitPrice,
  purchasable: true,
  categories: [],
});

const readySet = {
  id: "c1",
  slug: "ready-set-ear",
  title: "Ready set — ear",
  subtitle: "Two pieces, one price.",
  description: null,
  badgeText: null,
  heroImageUrl: null,
  type: "curated_stack",
  pricingType: "fixed_total",
  freeShipping: false,
  availability: "available",
  requiredQuantity: 3,
  unitCount: 3,
  tiers: [{ id: "t", quantity: 3, price: 230, discountPercent: null, availability: "available", valueRange: null }],
  fixedBundlePrice: 230,
  regularValue: 280,
  savings: 50,
  valueRange: null,
  eligibleProductCount: 2,
  eligibleProducts: [piece("a", "Flat back stud", 120), piece("b", "Threadless labret", 80, 2)],
};

const withI18n = (node: React.ReactNode) => <MinimalI18nProvider>{node}</MinimalI18nProvider>;
const renderDetail = (campaign: Record<string, unknown> = readySet) =>
  render(withI18n(<CuratedStackDetail campaign={campaign as never} reload={async () => {}} />));

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute("style");
  document.documentElement.removeAttribute("data-set-panel-in-view");
});

describe("Ready Set: one price", () => {
  it("states the set price once, with no saving, no struck price and no piece prices", () => {
    const { container } = renderDetail();
    const text = container.textContent ?? "";
    expect(text).toContain("Set price");
    expect(text.match(/EGP\s*230/g)).toHaveLength(1);
    expect(text).not.toMatch(/you save|save|separately|EGP\s*280|EGP\s*50\b|EGP\s*120|EGP\s*80/i);
    expect(container.innerHTML).not.toContain("line-through");
  });

  it("still counts a repeated piece, as the bag does", () => {
    const { container } = renderDetail();
    expect(container.textContent).toContain("×2");
    expect(container.textContent).not.toContain("×1");
  });

  it("warns when a set costs more than its pieces — the one comparison worth stating", () => {
    const { container } = renderDetail({ ...readySet, regularValue: 200, savings: -30 });
    expect(container.textContent).toContain("This set costs more than buying its pieces separately");
  });

  it("the price panel sits on the window's bottom edge on phones, with no room left for a bottom nav", () => {
    renderDetail();
    const panel = screen.getByTestId("curated-price-panel");
    expect(panel.className).toContain("bottom-0");
    expect(panel.getAttribute("style") ?? "").not.toContain("4rem");
  });
});

describe("Set cards: one price", () => {
  it("a Ready Set card states its price and pieces, nothing it would save", () => {
    const { container } = render(withI18n(<BundleCampaignCard campaign={readySet as never} />));
    const text = container.textContent ?? "";
    expect(text).toMatch(/EGP\s*230/);
    expect(text).toContain("3 pieces");
    expect(text).not.toMatch(/save|separately|EGP\s*280|EGP\s*50\b/i);
  });

  it("a fixed Pick Your Set card does not compare against the pieces bought separately", () => {
    const campaign = {
      ...readySet,
      type: "build_your_stack",
      tiers: [
        { id: "a", quantity: 3, price: 270, discountPercent: null, availability: "available", valueRange: null },
        { id: "b", quantity: 6, price: 480, discountPercent: null, availability: "available", valueRange: null },
      ],
      valueRange: { min: 325, max: 900 },
    };
    const { container } = render(withI18n(<BundleCampaignCard campaign={campaign as never} />));
    const text = container.textContent ?? "";
    expect(text).toMatch(/From EGP\s*270/);
    expect(text).not.toMatch(/separately|EGP\s*325/i);
  });

  it("a percentage card keeps its discount: that is the offer, not a saving line", () => {
    const campaign = {
      ...readySet,
      type: "build_your_stack",
      pricingType: "percentage_discount",
      fixedBundlePrice: null,
      tiers: [{ id: "a", quantity: 6, price: null, discountPercent: 20, availability: "available", valueRange: null }],
    };
    const { container } = render(withI18n(<BundleCampaignCard campaign={campaign as never} />));
    expect(container.textContent).toContain("20% off");
  });
});

describe("set-bar: sharing the bottom of the window", () => {
  function Bar({ fixed, panel = false }: { fixed: boolean; panel?: boolean }) {
    const ref = useRef<HTMLDivElement>(null);
    usePublishSetBarHeight(ref);
    useSetPanelInView(panel ? ref : { current: null });
    return <div ref={ref} style={{ position: fixed ? "fixed" : "static" }} />;
  }

  const stubHeight = (height: number) =>
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ height } as DOMRect);

  it("publishes a fixed bar's height, so the bag bar stacks above it and the page reserves it", () => {
    const spy = stubHeight(72.4);
    const view = render(<Bar fixed />);
    expect(document.documentElement.style.getPropertyValue("--perce-set-bar-h")).toBe("73px");
    view.unmount();
    expect(document.documentElement.style.getPropertyValue("--perce-set-bar-h")).toBe("");
    spy.mockRestore();
  });

  it("publishes nothing for a panel in the page's flow", () => {
    const spy = stubHeight(200);
    render(<Bar fixed={false} />);
    expect(document.documentElement.style.getPropertyValue("--perce-set-bar-h")).toBe("0px");
    spy.mockRestore();
  });

  it("marks the document only while the inline panel is on screen", () => {
    let report: (entries: { isIntersecting: boolean }[]) => void = () => {};
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(callback: typeof report) {
          report = callback;
        }
        observe() {}
        disconnect() {}
      },
    );
    const view = render(<Bar fixed={false} panel />);
    const root = document.documentElement;
    expect(root.hasAttribute("data-set-panel-in-view")).toBe(false);
    report([{ isIntersecting: true }]);
    expect(root.hasAttribute("data-set-panel-in-view")).toBe(true);
    report([{ isIntersecting: false }]);
    expect(root.hasAttribute("data-set-panel-in-view")).toBe(false);
    report([{ isIntersecting: true }]);
    view.unmount();
    expect(root.hasAttribute("data-set-panel-in-view")).toBe(false);
  });
});
