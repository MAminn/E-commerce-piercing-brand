// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The recent-order toast's timing engine and rendering, with the feed stubbed
 * at the tRPC boundary. Mach shipped this engine without a component test;
 * these pin the behaviours the port has to keep: first delay, auto-hide,
 * interval, one card at a time, the per-session cap, dismissal, the route
 * gate and the empty states.
 */

let pathname = "/";
vi.mock("vike-react/usePageContext", () => ({
  usePageContext: () => ({ urlPathname: pathname }),
}));

const getPublicFeed = vi.fn();
vi.mock("#root/shared/trpc/client", () => ({
  trpc: { socialProof: { getPublicFeed: { query: () => getPublicFeed() } } },
}));

import { SocialProofToast } from "../SocialProofToast";
import { MinimalI18nProvider } from "#root/lib/i18n/MinimalI18nContext";
import { SOCIAL_PROOF_KEYS } from "#root/lib/social-proof-session";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CONFIG = {
  enabled: true,
  firstDelaySeconds: 5,
  displayDurationSeconds: 6,
  intervalSeconds: 12,
  maxPerSession: 5,
  showRelativeTime: true,
};

function event(n: number, over: Record<string, unknown> = {}) {
  return {
    eventKey: `sp_${n}`,
    displayName: `Customer${n} M.`,
    location: "Cairo",
    productId: `00000000-0000-7000-8000-00000000000${n}`,
    productSlug: `piece-${n}`,
    productName: `Piece ${n}`,
    productImageUrl: `/uploads/piece-${n}.webp`,
    occurredAt: new Date(Date.now() - 4 * 60_000).toISOString(),
    ...over,
  };
}

function feed(events: unknown[], config: Partial<typeof CONFIG> = {}) {
  getPublicFeed.mockResolvedValue({ success: true, result: { config: { ...CONFIG, ...config }, events } });
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  sessionStorage.clear();
  localStorage.clear();
  getPublicFeed.mockReset();
  pathname = "/";
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

async function mount() {
  await act(async () => {
    root.render(
      <MinimalI18nProvider ssrLocale='en'>
        <SocialProofToast />
      </MinimalI18nProvider>,
    );
  });
  // Let the feed promise resolve.
  await act(async () => {
    await Promise.resolve();
  });
}

async function advance(seconds: number) {
  await act(async () => {
    vi.advanceTimersByTime(seconds * 1000);
  });
}

const cards = () => [...container.querySelectorAll("[data-testid=social-proof-card]")];

describe("SocialProofToast timing", () => {
  it("waits the first delay, shows one card, hides it after the display duration", async () => {
    feed([event(1), event(2)]);
    await mount();
    expect(cards()).toHaveLength(0);
    await advance(4.9);
    expect(cards()).toHaveLength(0);
    await advance(0.2);
    expect(cards()).toHaveLength(1);
    expect(cards()[0]!.textContent).toContain("Piece 1");
    await advance(6);
    // Exit transition, then unmount.
    await advance(0.4);
    expect(cards()).toHaveLength(0);
  });

  it("shows the next order after the interval — never two cards at once", async () => {
    feed([event(1), event(2), event(3)]);
    await mount();
    let maxOnScreen = 0;
    const seen: string[] = [];
    // Third card starts at 5 + (6 + 0.3 + 12) × 2 ≈ 41.6s.
    for (let s = 0; s < 120; s++) {
      await advance(0.5);
      maxOnScreen = Math.max(maxOnScreen, cards().length);
      const text = cards()[0]?.textContent ?? "";
      const name = /Piece \d/.exec(text)?.[0];
      if (name && !seen.includes(name)) seen.push(name);
    }
    expect(maxOnScreen).toBe(1);
    expect(seen).toEqual(["Piece 1", "Piece 2", "Piece 3"]);
  });

  it("second card appears interval seconds after the first one leaves", async () => {
    feed([event(1), event(2)]);
    await mount();
    await advance(5 + 6 + 0.3); // first shown, hidden, exit done
    expect(cards()).toHaveLength(0);
    await advance(11.9);
    expect(cards()).toHaveLength(0);
    await advance(0.2);
    expect(cards()[0]!.textContent).toContain("Piece 2");
  });

  it("never repeats an order to reach the session cap, and the cap carries across pages", async () => {
    feed([event(1), event(2)], { maxPerSession: 5 });
    await mount();
    await advance(120);
    expect(sessionStorage.getItem(SOCIAL_PROOF_KEYS.shownCount)).toBe("2");
    // A fresh mount (next page view) has nothing left to show.
    act(() => root.unmount());
    root = createRoot(container);
    await mount();
    await advance(120);
    expect(cards()).toHaveLength(0);
  });

  it("never repeats a displayed first name, including after navigation", async () => {
    feed([
      event(1, { displayName: "سارة" }),
      event(2, { displayName: "سارة" }),
      event(3, { displayName: "مريم" }),
    ], { maxPerSession: 8 });
    await mount();
    await advance(120);
    expect(sessionStorage.getItem(SOCIAL_PROOF_KEYS.shownCount)).toBe("2");
    expect(JSON.parse(sessionStorage.getItem(SOCIAL_PROOF_KEYS.shownNames)!)).toEqual([
      "سارة",
      "مريم",
    ]);

    act(() => root.unmount());
    root = createRoot(container);
    feed([
      event(4, { displayName: "  سارة " }),
      event(5, { displayName: "نور" }),
    ], { maxPerSession: 8 });
    await mount();
    await advance(120);
    expect(sessionStorage.getItem(SOCIAL_PROOF_KEYS.shownCount)).toBe("3");
  });

  it("dismissal hides the card and silences the rest of the session", async () => {
    feed([event(1), event(2)]);
    await mount();
    await advance(5.1);
    const close = container.querySelector("button[aria-label='Dismiss recent order notifications']") as HTMLButtonElement;
    await act(async () => close.click());
    expect(cards()).toHaveLength(0);
    expect(sessionStorage.getItem(SOCIAL_PROOF_KEYS.suppressed)).toBe("true");
    await advance(120);
    expect(cards()).toHaveLength(0);
  });
});

describe("SocialProofToast content and gates", () => {
  it("renders only the sanitised fields and links to the product", async () => {
    feed([event(1)]);
    await mount();
    await advance(5.1);
    const card = cards()[0]!;
    expect(card.textContent).toContain("Recent order");
    expect(card.textContent).toContain("Customer1 M. in Cairo just ordered");
    expect(card.textContent).toContain("4 min ago");
    expect(card.querySelector("a")!.getAttribute("href")).toBe("/shop/piece-1");
    // The close control is not inside the link.
    expect(card.querySelector("a button")).toBeNull();
  });

  it("capitalises only the name and the place, never the sentence", async () => {
    feed([event(1, { displayName: "sara k.", location: "giza" })]);
    await mount();
    await advance(5.1);
    const caps = [...cards()[0]!.querySelectorAll(".capitalize")].map((el) => el.textContent);
    expect(caps).toEqual(["sara k.", "giza"]);
  });

  it("omits location and time when the admin has them off, and copes with no image", async () => {
    feed([event(1, { location: null, productImageUrl: null })], { showRelativeTime: false });
    await mount();
    await advance(5.1);
    const card = cards()[0]!;
    expect(card.textContent).toContain("Customer1 M. just ordered");
    expect(card.textContent).not.toContain(" in ");
    expect(card.textContent).not.toContain("ago");
    expect(card.querySelector("img")).toBeNull();
  });

  it("shows nothing with no recent orders, when disabled, or when the feed fails", async () => {
    feed([]);
    await mount();
    await advance(60);
    expect(cards()).toHaveLength(0);

    act(() => root.unmount());
    root = createRoot(container);
    feed([event(1)], { enabled: false });
    await mount();
    await advance(60);
    expect(cards()).toHaveLength(0);

    act(() => root.unmount());
    root = createRoot(container);
    getPublicFeed.mockRejectedValue(new Error("offline"));
    await mount();
    await advance(60);
    expect(cards()).toHaveLength(0);
  });

  it.each(["/checkout", "/cart", "/account", "/orders", "/dashboard/orders"])(
    "never fetches or shows on %s",
    async (route) => {
      pathname = route;
      feed([event(1)]);
      await mount();
      await advance(60);
      expect(getPublicFeed).not.toHaveBeenCalled();
      expect(cards()).toHaveLength(0);
    },
  );

  it("renders Arabic copy for Arabic visitors", async () => {
    // The storefront's stored locale choice (what the language toggle sets).
    localStorage.setItem("minimal-template-locale", "ar");
    feed([event(1)]);
    await act(async () => {
      root.render(
        <MinimalI18nProvider ssrLocale='ar'>
          <SocialProofToast />
        </MinimalI18nProvider>,
      );
    });
    await act(async () => {
      await Promise.resolve();
    });
    await advance(5.1);
    const text = cards()[0]!.textContent ?? "";
    expect(text).toContain("طلب حديث");
    expect(text).toContain("طلب جديد من Customer1 M. في Cairo");
    expect(text).toContain("منذ 4 دقيقة");
  });
});
