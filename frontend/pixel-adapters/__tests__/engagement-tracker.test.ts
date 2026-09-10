import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EngagementTracker } from "#root/frontend/pixel-adapters/engagement-tracker";

// ─── DOM Mocks ──────────────────────────────────────────────────────────────

function setupDomMocks() {
  if (typeof window === "undefined") {
    (globalThis as unknown as Record<string, unknown>).window = globalThis;
  }

  // Mock document
  const listeners: Record<string, Array<(...args: unknown[]) => void>> = {};
  const elements: HTMLElement[] = [];

  (globalThis as unknown as Record<string, unknown>).document = {
    visibilityState: "visible",
    addEventListener: vi.fn((type: string, handler: (...args: unknown[]) => void) => {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(handler);
    }),
    removeEventListener: vi.fn((type: string, handler: (...args: unknown[]) => void) => {
      if (listeners[type]) {
        listeners[type] = listeners[type].filter((h) => h !== handler);
      }
    }),
    createElement: vi.fn((tag: string) => {
      const el = {
        tagName: tag,
        style: { cssText: "", top: "" },
        dataset: {} as Record<string, string>,
        remove: vi.fn(),
      };
      elements.push(el as unknown as HTMLElement);
      return el;
    }),
    body: {
      appendChild: vi.fn(),
    },
    querySelectorAll: vi.fn(() => []),
    _listeners: listeners,
    _elements: elements,
  };

  return { listeners, elements };
}

// Mock IntersectionObserver
type IntersectionCallback = (entries: IntersectionObserverEntry[]) => void;

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];
  callback: IntersectionCallback;
  options: IntersectionObserverInit | undefined;
  observedElements: Element[] = [];

  constructor(callback: IntersectionCallback, options?: IntersectionObserverInit) {
    this.callback = callback;
    this.options = options;
    MockIntersectionObserver.instances.push(this);
  }

  observe(el: Element) {
    this.observedElements.push(el);
  }

  unobserve(_el: Element) {
    // no-op for tests
  }

  disconnect() {
    this.observedElements = [];
  }

  // Test helper: simulate intersection
  simulateEntries(entries: Partial<IntersectionObserverEntry>[]) {
    this.callback(entries as IntersectionObserverEntry[]);
  }
}

// Mock MutationObserver
class MockMutationObserver {
  static instances: MockMutationObserver[] = [];
  callback: MutationCallback;

  constructor(callback: MutationCallback) {
    this.callback = callback;
    MockMutationObserver.instances.push(this);
  }
  observe() {}
  disconnect() {}
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("EngagementTracker", () => {
  let fireCallback: ReturnType<typeof vi.fn>;
  let domMocks: ReturnType<typeof setupDomMocks>;

  beforeEach(() => {
    vi.useFakeTimers();
    fireCallback = vi.fn();
    domMocks = setupDomMocks();
    MockIntersectionObserver.instances = [];
    MockMutationObserver.instances = [];
    (globalThis as unknown as Record<string, unknown>).IntersectionObserver =
      MockIntersectionObserver;
    (globalThis as unknown as Record<string, unknown>).MutationObserver =
      MockMutationObserver;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ── Scroll Depth ──────────────────────────────────────────────────────

  describe("Scroll Depth Tracking", () => {
    it("should create sentinel elements at 25%, 50%, 75%, 90%", () => {
      const tracker = new EngagementTracker(fireCallback, {
        timeOnPage: false,
        productImpressions: false,
      });
      tracker.start();

      expect(document.createElement).toHaveBeenCalledTimes(4);
      expect(document.body.appendChild).toHaveBeenCalledTimes(4);

      // Verify sentinel positions
      const sentinels = domMocks.elements;
      expect(sentinels[0]?.dataset.scrollDepth).toBe("25");
      expect(sentinels[1]?.dataset.scrollDepth).toBe("50");
      expect(sentinels[2]?.dataset.scrollDepth).toBe("75");
      expect(sentinels[3]?.dataset.scrollDepth).toBe("90");

      tracker.destroy();
    });

    it("should fire scroll_depth event when sentinel becomes visible", () => {
      const tracker = new EngagementTracker(fireCallback, {
        timeOnPage: false,
        productImpressions: false,
      });
      tracker.start();

      const observer = MockIntersectionObserver.instances[0];
      expect(observer).toBeDefined();

      // Simulate 25% scroll
      observer!.simulateEntries([
        {
          isIntersecting: true,
          target: { dataset: { scrollDepth: "25" } } as unknown as Element,
        },
      ]);

      expect(fireCallback).toHaveBeenCalledWith("scroll_depth", { depth: 25 });

      tracker.destroy();
    });

    it("should fire each threshold only once", () => {
      const tracker = new EngagementTracker(fireCallback, {
        timeOnPage: false,
        productImpressions: false,
      });
      tracker.start();

      const observer = MockIntersectionObserver.instances[0]!;

      // Fire 50% twice
      const mockTarget = { dataset: { scrollDepth: "50" } } as unknown as Element;
      observer.simulateEntries([{ isIntersecting: true, target: mockTarget }]);
      observer.simulateEntries([{ isIntersecting: true, target: mockTarget }]);

      expect(fireCallback).toHaveBeenCalledTimes(1);
      expect(fireCallback).toHaveBeenCalledWith("scroll_depth", { depth: 50 });

      tracker.destroy();
    });

    it("should not fire when entry is not intersecting", () => {
      const tracker = new EngagementTracker(fireCallback, {
        timeOnPage: false,
        productImpressions: false,
      });
      tracker.start();

      const observer = MockIntersectionObserver.instances[0]!;
      observer.simulateEntries([
        {
          isIntersecting: false,
          target: { dataset: { scrollDepth: "25" } } as unknown as Element,
        },
      ]);

      expect(fireCallback).not.toHaveBeenCalled();
      tracker.destroy();
    });

    it("should fire multiple thresholds independently", () => {
      const tracker = new EngagementTracker(fireCallback, {
        timeOnPage: false,
        productImpressions: false,
      });
      tracker.start();

      const observer = MockIntersectionObserver.instances[0]!;

      observer.simulateEntries([
        {
          isIntersecting: true,
          target: { dataset: { scrollDepth: "25" } } as unknown as Element,
        },
        {
          isIntersecting: true,
          target: { dataset: { scrollDepth: "75" } } as unknown as Element,
        },
      ]);

      expect(fireCallback).toHaveBeenCalledTimes(2);
      expect(fireCallback).toHaveBeenCalledWith("scroll_depth", { depth: 25 });
      expect(fireCallback).toHaveBeenCalledWith("scroll_depth", { depth: 75 });

      tracker.destroy();
    });
  });

  // ── Time on Page ──────────────────────────────────────────────────────

  describe("Time on Page Tracking", () => {
    it("should fire time_on_page at 30s interval", () => {
      const tracker = new EngagementTracker(fireCallback, {
        scrollDepth: false,
        productImpressions: false,
      });
      tracker.start();

      // Advance 29 seconds - should not fire
      vi.advanceTimersByTime(29_000);
      expect(fireCallback).not.toHaveBeenCalled();

      // Advance to 30 seconds
      vi.advanceTimersByTime(1_000);
      expect(fireCallback).toHaveBeenCalledWith("time_on_page", { seconds: 30 });

      tracker.destroy();
    });

    it("should fire time_on_page at 60s interval", () => {
      const tracker = new EngagementTracker(fireCallback, {
        scrollDepth: false,
        productImpressions: false,
      });
      tracker.start();

      vi.advanceTimersByTime(60_000);
      expect(fireCallback).toHaveBeenCalledWith("time_on_page", { seconds: 30 });
      expect(fireCallback).toHaveBeenCalledWith("time_on_page", { seconds: 60 });
      expect(fireCallback).toHaveBeenCalledTimes(2);

      tracker.destroy();
    });

    it("should pause timer when tab is hidden", () => {
      const tracker = new EngagementTracker(fireCallback, {
        scrollDepth: false,
        productImpressions: false,
      });
      tracker.start();

      // Advance 20 seconds
      vi.advanceTimersByTime(20_000);

      // Hide the tab
      (document as unknown as Record<string, string>).visibilityState = "hidden";
      const visibilityListeners = domMocks.listeners.visibilitychange ?? [];
      for (const handler of visibilityListeners) handler();

      // Advance 20 more seconds while hidden - should NOT fire 30s event
      vi.advanceTimersByTime(20_000);
      expect(fireCallback).not.toHaveBeenCalled();

      // Show tab again
      (document as unknown as Record<string, string>).visibilityState = "visible";
      for (const handler of visibilityListeners) handler();

      // Need 10 more engaged seconds to reach 30s total
      vi.advanceTimersByTime(10_000);
      expect(fireCallback).toHaveBeenCalledWith("time_on_page", { seconds: 30 });

      tracker.destroy();
    });

    it("should fire each interval only once", () => {
      const tracker = new EngagementTracker(fireCallback, {
        scrollDepth: false,
        productImpressions: false,
      });
      tracker.start();

      // Run to 35 seconds
      vi.advanceTimersByTime(35_000);

      // Should have fired 30s once only
      const calls30 = fireCallback.mock.calls.filter(
        (c: unknown[]) => c[0] === "time_on_page" && (c[1] as Record<string, unknown>).seconds === 30,
      );
      expect(calls30).toHaveLength(1);

      tracker.destroy();
    });
  });

  // ── Product Impressions ───────────────────────────────────────────────

  describe("Product Impression Tracking", () => {
    it("should create IntersectionObserver with 0.5 threshold", () => {
      const tracker = new EngagementTracker(fireCallback, {
        scrollDepth: false,
        timeOnPage: false,
      });
      tracker.start();

      // First observer is the impressions observer (scroll is disabled)
      const observer = MockIntersectionObserver.instances[0];
      expect(observer).toBeDefined();
      expect(observer!.options?.threshold).toBe(0.5);

      tracker.destroy();
    });

    it("should batch product impressions and flush after delay", () => {
      const tracker = new EngagementTracker(fireCallback, {
        scrollDepth: false,
        timeOnPage: false,
        impressionBatchDelay: 500,
      });
      tracker.start();

      const observer = MockIntersectionObserver.instances[0]!;

      // Simulate two products becoming visible
      observer.simulateEntries([
        {
          isIntersecting: true,
          target: { dataset: { productId: "p1", productName: "Shirt" } } as unknown as Element,
        },
        {
          isIntersecting: true,
          target: { dataset: { productId: "p2", productName: "Pants" } } as unknown as Element,
        },
      ]);

      // Not yet flushed
      expect(fireCallback).not.toHaveBeenCalled();

      // Advance past batch delay
      vi.advanceTimersByTime(500);

      expect(fireCallback).toHaveBeenCalledWith("product_impression", {
        products: [
          { productId: "p1", productName: "Shirt" },
          { productId: "p2", productName: "Pants" },
        ],
        count: 2,
      });

      tracker.destroy();
    });

    it("should not track same product twice", () => {
      const tracker = new EngagementTracker(fireCallback, {
        scrollDepth: false,
        timeOnPage: false,
        impressionBatchDelay: 100,
      });
      tracker.start();

      const observer = MockIntersectionObserver.instances[0]!;

      // First impression
      observer.simulateEntries([
        {
          isIntersecting: true,
          target: { dataset: { productId: "p1", productName: "Shirt" } } as unknown as Element,
        },
      ]);
      vi.advanceTimersByTime(100);

      // Second impression of same product
      observer.simulateEntries([
        {
          isIntersecting: true,
          target: { dataset: { productId: "p1", productName: "Shirt" } } as unknown as Element,
        },
      ]);
      vi.advanceTimersByTime(100);

      // Should only have fired once
      expect(fireCallback).toHaveBeenCalledTimes(1);

      tracker.destroy();
    });

    it("should ignore entries without productId", () => {
      const tracker = new EngagementTracker(fireCallback, {
        scrollDepth: false,
        timeOnPage: false,
        impressionBatchDelay: 100,
      });
      tracker.start();

      const observer = MockIntersectionObserver.instances[0]!;

      observer.simulateEntries([
        {
          isIntersecting: true,
          target: { dataset: {} } as unknown as Element,
        },
      ]);
      vi.advanceTimersByTime(100);

      expect(fireCallback).not.toHaveBeenCalled();

      tracker.destroy();
    });

    it("should not fire for non-intersecting entries", () => {
      const tracker = new EngagementTracker(fireCallback, {
        scrollDepth: false,
        timeOnPage: false,
        impressionBatchDelay: 100,
      });
      tracker.start();

      const observer = MockIntersectionObserver.instances[0]!;

      observer.simulateEntries([
        {
          isIntersecting: false,
          target: { dataset: { productId: "p1" } } as unknown as Element,
        },
      ]);
      vi.advanceTimersByTime(100);

      expect(fireCallback).not.toHaveBeenCalled();

      tracker.destroy();
    });
  });

  // ── Page Change Reset ─────────────────────────────────────────────────

  describe("Page Change", () => {
    it("should reset scroll depth tracking on page change", () => {
      const tracker = new EngagementTracker(fireCallback, {
        timeOnPage: false,
        productImpressions: false,
      });
      tracker.start();

      const observer1 = MockIntersectionObserver.instances[0]!;
      observer1.simulateEntries([
        {
          isIntersecting: true,
          target: { dataset: { scrollDepth: "25" } } as unknown as Element,
        },
      ]);
      expect(fireCallback).toHaveBeenCalledTimes(1);

      // Navigate to new page
      tracker.onPageChange();

      // Same threshold should fire again
      const observer2 = MockIntersectionObserver.instances[MockIntersectionObserver.instances.length - 1]!;
      observer2.simulateEntries([
        {
          isIntersecting: true,
          target: { dataset: { scrollDepth: "25" } } as unknown as Element,
        },
      ]);
      expect(fireCallback).toHaveBeenCalledTimes(2);

      tracker.destroy();
    });

    it("should reset engaged time on page change", () => {
      const tracker = new EngagementTracker(fireCallback, {
        scrollDepth: false,
        productImpressions: false,
      });
      tracker.start();

      // Advance 25 seconds
      vi.advanceTimersByTime(25_000);
      expect(fireCallback).not.toHaveBeenCalled();

      // Navigate
      tracker.onPageChange();

      // Need full 30 seconds from page change
      vi.advanceTimersByTime(25_000);
      expect(fireCallback).not.toHaveBeenCalled();

      vi.advanceTimersByTime(5_000);
      expect(fireCallback).toHaveBeenCalledWith("time_on_page", { seconds: 30 });

      tracker.destroy();
    });
  });

  // ── Destroy ───────────────────────────────────────────────────────────

  describe("destroy", () => {
    it("should clean up all observers and timers", () => {
      const tracker = new EngagementTracker(fireCallback);
      tracker.start();
      tracker.destroy();

      // After destroy, advancing timers should not fire events
      vi.advanceTimersByTime(120_000);
      expect(fireCallback).not.toHaveBeenCalled();
    });

    it("should flush remaining impression batch on destroy", () => {
      const tracker = new EngagementTracker(fireCallback, {
        scrollDepth: false,
        timeOnPage: false,
        impressionBatchDelay: 5000,
      });
      tracker.start();

      const observer = MockIntersectionObserver.instances[0]!;
      observer.simulateEntries([
        {
          isIntersecting: true,
          target: { dataset: { productId: "p1" } } as unknown as Element,
        },
      ]);

      // Not yet flushed (5s delay)
      expect(fireCallback).not.toHaveBeenCalled();

      // Destroy should flush the batch
      tracker.destroy();
      expect(fireCallback).toHaveBeenCalledWith("product_impression", {
        products: [{ productId: "p1", productName: undefined }],
        count: 1,
      });
    });
  });

  // ── Options ───────────────────────────────────────────────────────────

  describe("Options", () => {
    it("should respect disabled features", () => {
      const tracker = new EngagementTracker(fireCallback, {
        scrollDepth: false,
        timeOnPage: false,
        productImpressions: false,
      });
      tracker.start();

      // No observers or timers should be created
      expect(MockIntersectionObserver.instances).toHaveLength(0);

      vi.advanceTimersByTime(120_000);
      expect(fireCallback).not.toHaveBeenCalled();

      tracker.destroy();
    });
  });
});
