import type { TrackingEvent } from "#root/shared/types/pixel-tracking";

type EventBusListener = (event: TrackingEvent) => void;

/**
 * Platform-agnostic event bus for tracking events.
 * Singleton — all pixel adapters subscribe here, all components emit here.
 */
class TrackingEventBus {
  private listeners: Set<EventBusListener> = new Set();

  subscribe(listener: EventBusListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(event: TrackingEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error("[TrackingEventBus] Listener error:", err);
      }
    }
  }

  clear(): void {
    this.listeners.clear();
  }

  get listenerCount(): number {
    return this.listeners.size;
  }
}

export const trackingEventBus = new TrackingEventBus();
