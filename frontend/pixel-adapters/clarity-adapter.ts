import { PixelPlatform, type PixelConfig, type TrackingEvent } from "#root/shared/types/pixel-tracking";
import type { PixelAdapter } from "./types";

// ─── Window augmentation ────────────────────────────────────────────────────

declare global {
  interface Window {
    clarity?: {
      (...args: unknown[]): void;
      q?: unknown[];
    };
  }
}

// ─── Microsoft Clarity Adapter ──────────────────────────────────────────────
// Clarity is a session-recording/heatmap tool, not a conversion pixel — it has
// no e-commerce event taxonomy or server-side Conversions API. trackEvent()
// forwards our canonical event name as a Clarity custom event (best-effort,
// shows up in Clarity's "Custom tags" filtering) rather than mapping to a
// platform-specific event name like the ad-pixel adapters do.

export class ClarityAdapter implements PixelAdapter {
  readonly platform = PixelPlatform.CLARITY;

  private loaded = false;
  private enabled = false;
  private projectId = "";
  private scriptElement: HTMLScriptElement | null = null;

  initialize(config: PixelConfig): void {
    if (typeof window === "undefined") return;
    this.projectId = config.pixelId;
    this.enabled = config.enabled;

    this.injectSdk();
    this.loaded = true;
  }

  destroy(): void {
    if (this.scriptElement?.parentNode) {
      this.scriptElement.parentNode.removeChild(this.scriptElement);
      this.scriptElement = null;
    }
    this.loaded = false;
    this.enabled = false;
  }

  trackEvent(event: TrackingEvent): void {
    if (!this.loaded || !this.enabled) return;
    if (typeof window === "undefined" || typeof window.clarity !== "function")
      return;

    window.clarity("event", event.eventName);
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private injectSdk(): void {
    const existingScript = document.querySelector(
      `script[data-pixel-platform="clarity"][data-pixel-id="${this.projectId}"]`,
    ) as HTMLScriptElement | null;

    if (existingScript) {
      this.scriptElement = existingScript;
      return;
    }

    // Already initialized by another instance/hot-reload — don't double-inject.
    if (typeof window.clarity === "function") return;

    const projectId = this.projectId;
    const c = window;
    const l = document;
    const a = "clarity";
    const r = "script";
    c[a] =
      c[a] ||
      function (...args: unknown[]) {
        (c[a]!.q = c[a]!.q || []).push(args);
      };
    const t = l.createElement(r) as HTMLScriptElement;
    t.async = true;
    t.src = `https://www.clarity.ms/tag/${projectId}`;
    t.setAttribute("data-pixel-platform", "clarity");
    t.setAttribute("data-pixel-id", projectId);
    this.scriptElement = t;
    const y = l.getElementsByTagName(r)[0];
    if (y?.parentNode) {
      y.parentNode.insertBefore(t, y);
    } else {
      l.head.appendChild(t);
    }
  }
}
