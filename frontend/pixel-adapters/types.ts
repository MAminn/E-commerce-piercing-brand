import type {
  PixelPlatform,
  PixelConfig,
  TrackingEvent,
} from "#root/shared/types/pixel-tracking";

// ─── Pixel Adapter Interface ────────────────────────────────────────────────
// Every platform adapter must implement this interface.
// Adding a new platform = implement this + register it.

export interface PixelAdapter {
  /** Which platform this adapter handles */
  readonly platform: PixelPlatform;

  // ── Lifecycle ───────────────────────────────────────────────────────────

  /** Load the platform's JS SDK and initialize with the given config */
  initialize(config: PixelConfig): void;

  /** Clean up: remove injected scripts, detach globals */
  destroy(): void;

  // ── Event Tracking ──────────────────────────────────────────────────────

  /** Translate our canonical event into a platform-specific call */
  trackEvent(event: TrackingEvent): void;

  // ── Status ──────────────────────────────────────────────────────────────

  /** Whether the platform SDK script has finished loading */
  isLoaded(): boolean;

  /** Whether the adapter is currently active and should receive events */
  isEnabled(): boolean;
}
