/**
 * Custom Event Trigger System
 *
 * Manages client-side triggers for merchant-defined custom events.
 * Supports 4 trigger types: manual, css_selector, url_match, time_on_page.
 */
import type {
  CustomTrackingEventConfig,
  CustomEventTriggerType,
} from "#root/shared/types/pixel-tracking";

// ─── Types ──────────────────────────────────────────────────────────────────

export type CustomEventFireCallback = (
  eventName: string,
  customProperties: Record<string, unknown>,
) => void;

interface ActiveTrigger {
  eventConfig: CustomTrackingEventConfig;
  cleanup: () => void;
}

// ─── Custom Event Trigger Manager ───────────────────────────────────────────

export class CustomEventTriggerManager {
  private activeTriggers: Map<string, ActiveTrigger> = new Map();
  private fireCallback: CustomEventFireCallback;
  private firedUrlMatches: Set<string> = new Set();
  private firedTimeOnPage: Set<string> = new Set();

  constructor(fireCallback: CustomEventFireCallback) {
    this.fireCallback = fireCallback;
  }

  /**
   * Load custom event configs and set up triggers.
   * Clears any previously active triggers first.
   */
  loadConfigs(configs: CustomTrackingEventConfig[]): void {
    this.destroyAll();
    for (const config of configs) {
      if (!config.isActive) continue;
      this.setupTrigger(config);
    }
  }

  /**
   * Called on page navigation to re-evaluate URL match and time-on-page triggers.
   */
  onPageChange(url: string): void {
    // Reset per-page fired sets for URL match and time-on-page
    this.firedUrlMatches.clear();
    this.firedTimeOnPage.clear();

    // Re-evaluate URL match triggers
    for (const [, trigger] of this.activeTriggers) {
      if (trigger.eventConfig.triggerType === "url_match") {
        this.evaluateUrlMatch(trigger.eventConfig, url);
      }
    }

    // Restart time-on-page timers
    for (const [id, trigger] of this.activeTriggers) {
      if (trigger.eventConfig.triggerType === "time_on_page") {
        // Clean up old timer
        trigger.cleanup();
        // Set up new timer
        const newCleanup = this.setupTimeOnPageTrigger(trigger.eventConfig);
        this.activeTriggers.set(id, {
          eventConfig: trigger.eventConfig,
          cleanup: newCleanup,
        });
      }
    }
  }

  /**
   * Destroy all active triggers and clean up listeners.
   */
  destroyAll(): void {
    for (const [, trigger] of this.activeTriggers) {
      trigger.cleanup();
    }
    this.activeTriggers.clear();
    this.firedUrlMatches.clear();
    this.firedTimeOnPage.clear();
  }

  // ── Private Setup Methods ───────────────────────────────────────────────

  private setupTrigger(config: CustomTrackingEventConfig): void {
    let cleanup: () => void;

    switch (config.triggerType) {
      case "css_selector":
        cleanup = this.setupCssSelectorTrigger(config);
        break;
      case "url_match":
        cleanup = this.setupUrlMatchTrigger(config);
        break;
      case "time_on_page":
        cleanup = this.setupTimeOnPageTrigger(config);
        break;
      case "manual":
      default:
        // Manual triggers have no auto-setup
        cleanup = () => {};
        break;
    }

    this.activeTriggers.set(config.id, { eventConfig: config, cleanup });
  }

  private setupCssSelectorTrigger(config: CustomTrackingEventConfig): () => void {
    const selector = (config.triggerConfig as { selector?: string }).selector;
    if (!selector) return () => {};

    const handleClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target) return;

      // Check if clicked element or any of its ancestors match the selector
      if (target.matches?.(selector) || target.closest?.(selector)) {
        this.fireEvent(config);
      }
    };

    // Use event delegation on document
    document.addEventListener("click", handleClick, true);

    return () => {
      document.removeEventListener("click", handleClick, true);
    };
  }

  private setupUrlMatchTrigger(config: CustomTrackingEventConfig): () => void {
    // Evaluate immediately for current page
    if (typeof window !== "undefined") {
      this.evaluateUrlMatch(config, window.location.href);
    }
    // Further evaluations happen on page change via onPageChange()
    return () => {};
  }

  private evaluateUrlMatch(
    config: CustomTrackingEventConfig,
    url: string,
  ): void {
    const pattern = (config.triggerConfig as { pattern?: string }).pattern;
    if (!pattern) return;

    // Don't fire more than once per page (per URL match event)
    if (this.firedUrlMatches.has(config.id)) return;

    try {
      const regex = new RegExp(pattern);
      if (regex.test(url)) {
        this.firedUrlMatches.add(config.id);
        this.fireEvent(config);
      }
    } catch {
      // Invalid regex — skip silently
    }
  }

  private setupTimeOnPageTrigger(
    config: CustomTrackingEventConfig,
  ): () => void {
    const seconds = (config.triggerConfig as { seconds?: number }).seconds;
    if (!seconds || seconds <= 0) return () => {};

    const timerId = setTimeout(() => {
      if (!this.firedTimeOnPage.has(config.id)) {
        this.firedTimeOnPage.add(config.id);
        this.fireEvent(config);
      }
    }, seconds * 1000);

    return () => {
      clearTimeout(timerId);
    };
  }

  private fireEvent(config: CustomTrackingEventConfig): void {
    // Merge static event data from config
    const customProperties: Record<string, unknown> = {
      ...((config.eventData as Record<string, unknown>) ?? {}),
      _customEventId: config.id,
      _triggerType: config.triggerType,
    };

    // If platform mappings exist, include them as metadata
    if (
      config.platformMapping &&
      Object.keys(config.platformMapping).length > 0
    ) {
      customProperties._platformMapping = config.platformMapping;
    }

    this.fireCallback(config.name, customProperties);
  }
}
