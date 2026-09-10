/**
 * Engagement Tracking Module
 *
 * Tracks scroll depth (25/50/75/90%), engaged time on page, and product impressions.
 * All events fire through the existing tracking event bus.
 */
import type {
  ScrollDepthThreshold,
} from "#root/shared/types/pixel-tracking";
import {
  SCROLL_DEPTH_THRESHOLDS,
  TIME_ON_PAGE_INTERVALS,
} from "#root/shared/types/pixel-tracking";

// ─── Types ──────────────────────────────────────────────────────────────────

export type EngagementEventCallback = (
  eventName: string,
  customProperties: Record<string, unknown>,
) => void;

export interface EngagementTrackerOptions {
  /** Enable scroll depth tracking. Default: true */
  scrollDepth?: boolean;
  /** Enable time on page tracking. Default: true */
  timeOnPage?: boolean;
  /** Enable product impression tracking. Default: true */
  productImpressions?: boolean;
  /** Product impression batch delay in ms. Default: 500 */
  impressionBatchDelay?: number;
  /** CSS selector for product cards. Default: "[data-product-id]" */
  productSelector?: string;
}

const DEFAULT_OPTIONS: Required<EngagementTrackerOptions> = {
  scrollDepth: true,
  timeOnPage: true,
  productImpressions: true,
  impressionBatchDelay: 500,
  productSelector: "[data-product-id]",
};

// ─── Engagement Tracker ─────────────────────────────────────────────────────

export class EngagementTracker {
  private options: Required<EngagementTrackerOptions>;
  private fireCallback: EngagementEventCallback;
  private cleanupFns: Array<() => void> = [];

  // Scroll depth state
  private firedScrollDepths: Set<ScrollDepthThreshold> = new Set();
  private scrollSentinels: HTMLElement[] = [];
  private scrollObserver: IntersectionObserver | null = null;

  // Time on page state
  private engagedTimeMs = 0;
  private lastTickTimestamp: number | null = null;
  private timeIntervalId: ReturnType<typeof setInterval> | null = null;
  private firedTimeIntervals: Set<number> = new Set();
  private isPageVisible = true;

  // Product impressions state
  private impressionObserver: IntersectionObserver | null = null;
  private seenProductIds: Set<string> = new Set();
  private impressionBatch: Array<{ productId: string; productName?: string }> = [];
  private impressionBatchTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    fireCallback: EngagementEventCallback,
    options?: EngagementTrackerOptions,
  ) {
    this.fireCallback = fireCallback;
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Start tracking. Must be called after DOM is ready.
   */
  start(): void {
    if (typeof window === "undefined" || typeof document === "undefined") return;

    if (this.options.scrollDepth) {
      this.startScrollDepthTracking();
    }
    if (this.options.timeOnPage) {
      this.startTimeOnPageTracking();
    }
    if (this.options.productImpressions) {
      this.startProductImpressionTracking();
    }
  }

  /**
   * Called on page navigation. Resets per-page state and re-initializes.
   */
  onPageChange(): void {
    this.destroy();
    this.firedScrollDepths.clear();
    this.firedTimeIntervals.clear();
    this.engagedTimeMs = 0;
    this.lastTickTimestamp = null;
    this.seenProductIds.clear();
    this.start();
  }

  /**
   * Destroy all trackers and clean up listeners/observers.
   */
  destroy(): void {
    for (const fn of this.cleanupFns) {
      fn();
    }
    this.cleanupFns = [];

    // Clean up scroll
    if (this.scrollObserver) {
      this.scrollObserver.disconnect();
      this.scrollObserver = null;
    }
    for (const sentinel of this.scrollSentinels) {
      sentinel.remove();
    }
    this.scrollSentinels = [];

    // Clean up time tracking
    if (this.timeIntervalId) {
      clearInterval(this.timeIntervalId);
      this.timeIntervalId = null;
    }

    // Clean up impressions
    if (this.impressionObserver) {
      this.impressionObserver.disconnect();
      this.impressionObserver = null;
    }
    if (this.impressionBatchTimer) {
      clearTimeout(this.impressionBatchTimer);
      // Flush remaining batch
      this.flushImpressionBatch();
      this.impressionBatchTimer = null;
    }
  }

  // ── Scroll Depth Tracking ─────────────────────────────────────────────

  private startScrollDepthTracking(): void {
    if (typeof IntersectionObserver === "undefined") return;

    this.scrollObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;

          const depth = Number(
            (entry.target as HTMLElement).dataset.scrollDepth,
          ) as ScrollDepthThreshold;

          if (!this.firedScrollDepths.has(depth)) {
            this.firedScrollDepths.add(depth);
            this.fireCallback("scroll_depth", { depth });
          }
        }
      },
      { threshold: 0 },
    );

    // Create sentinel elements at each threshold
    for (const threshold of SCROLL_DEPTH_THRESHOLDS) {
      const sentinel = document.createElement("div");
      sentinel.style.cssText =
        "position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;";
      sentinel.dataset.scrollDepth = String(threshold);
      sentinel.style.top = `${threshold}%`;
      // Place sentinels relative to the document body
      document.body.appendChild(sentinel);
      this.scrollSentinels.push(sentinel);
      this.scrollObserver.observe(sentinel);
    }
  }

  // ── Time on Page Tracking ─────────────────────────────────────────────

  private startTimeOnPageTracking(): void {
    this.lastTickTimestamp = Date.now();
    this.isPageVisible = true;

    // Tick every second to accumulate engaged time
    this.timeIntervalId = setInterval(() => {
      if (!this.isPageVisible || this.lastTickTimestamp === null) return;

      const now = Date.now();
      this.engagedTimeMs += now - this.lastTickTimestamp;
      this.lastTickTimestamp = now;

      const engagedSeconds = Math.floor(this.engagedTimeMs / 1000);

      for (const interval of TIME_ON_PAGE_INTERVALS) {
        if (
          engagedSeconds >= interval &&
          !this.firedTimeIntervals.has(interval)
        ) {
          this.firedTimeIntervals.add(interval);
          this.fireCallback("time_on_page", { seconds: interval });
        }
      }
    }, 1000);

    // Pause timer when tab is hidden
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        // Accumulate time up to now before pausing
        if (this.lastTickTimestamp !== null) {
          this.engagedTimeMs += Date.now() - this.lastTickTimestamp;
        }
        this.isPageVisible = false;
        this.lastTickTimestamp = null;
      } else {
        this.isPageVisible = true;
        this.lastTickTimestamp = Date.now();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    this.cleanupFns.push(() => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    });
  }

  // ── Product Impression Tracking ───────────────────────────────────────

  private startProductImpressionTracking(): void {
    if (typeof IntersectionObserver === "undefined") return;

    this.impressionObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;

          const el = entry.target as HTMLElement;
          const productId = el.dataset.productId;
          if (!productId || this.seenProductIds.has(productId)) continue;

          this.seenProductIds.add(productId);
          this.impressionBatch.push({
            productId,
            productName: el.dataset.productName,
          });

          // Schedule batch flush
          if (this.impressionBatchTimer) {
            clearTimeout(this.impressionBatchTimer);
          }
          this.impressionBatchTimer = setTimeout(() => {
            this.flushImpressionBatch();
          }, this.options.impressionBatchDelay);
        }
      },
      { threshold: 0.5 },
    );

    // Observe existing product cards
    this.observeProductCards();

    // Watch for dynamically added product cards via MutationObserver
    if (typeof MutationObserver !== "undefined") {
      const mutationObserver = new MutationObserver(() => {
        this.observeProductCards();
      });
      mutationObserver.observe(document.body, {
        childList: true,
        subtree: true,
      });
      this.cleanupFns.push(() => mutationObserver.disconnect());
    }
  }

  private observeProductCards(): void {
    if (!this.impressionObserver) return;

    const cards = document.querySelectorAll(this.options.productSelector);
    for (const card of cards) {
      const productId = (card as HTMLElement).dataset.productId;
      if (productId && !this.seenProductIds.has(productId)) {
        this.impressionObserver.observe(card);
      }
    }
  }

  private flushImpressionBatch(): void {
    if (this.impressionBatch.length === 0) return;

    const batch = [...this.impressionBatch];
    this.impressionBatch = [];

    this.fireCallback("product_impression", {
      products: batch,
      count: batch.length,
    });
  }
}
