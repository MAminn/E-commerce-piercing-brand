import type { PixelPlatform, TrackingEvent } from "#root/shared/types/pixel-tracking";
import type { PixelAdapter } from "./types";

// ─── Pixel Adapter Registry ─────────────────────────────────────────────────
// Holds all active adapters and fans out events to each of them.

export class PixelAdapterRegistry {
  private adapters: Map<PixelPlatform, PixelAdapter> = new Map();

  /** Register an adapter. Replaces any existing adapter for the same platform. */
  register(adapter: PixelAdapter): void {
    this.adapters.set(adapter.platform, adapter);
  }

  /** Remove an adapter by platform. Calls `destroy()` before removing. */
  unregister(platform: PixelPlatform): void {
    const adapter = this.adapters.get(platform);
    if (adapter) {
      adapter.destroy();
      this.adapters.delete(platform);
    }
  }

  /** Get a specific adapter by platform. */
  getAdapter(platform: PixelPlatform): PixelAdapter | undefined {
    return this.adapters.get(platform);
  }

  /** Get all registered adapters. */
  getAllAdapters(): PixelAdapter[] {
    return Array.from(this.adapters.values());
  }

  /** Number of registered adapters. */
  get size(): number {
    return this.adapters.size;
  }

  /** Fan-out: send an event to every enabled & loaded adapter. */
  broadcastEvent(event: TrackingEvent): void {
    for (const adapter of this.adapters.values()) {
      if (adapter.isEnabled() && adapter.isLoaded()) {
        try {
          adapter.trackEvent(event);
        } catch {
          // Adapter errors must never break the event pipeline.
          // In production, we'd report this via console.warn or an error service.
          console.warn(
            `[PixelAdapterRegistry] Error broadcasting to ${adapter.platform}`,
          );
        }
      }
    }
  }

  /** Destroy all adapters and clear the registry. */
  destroyAll(): void {
    for (const adapter of this.adapters.values()) {
      try {
        adapter.destroy();
      } catch {
        // Best-effort cleanup
      }
    }
    this.adapters.clear();
  }
}
