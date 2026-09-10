import { describe, it, expect, vi, afterEach } from "vitest";
import { trackingEventBus } from "#root/shared/utils/tracking-event-bus";
import { TrackingEventName, type TrackingEvent } from "#root/shared/types/pixel-tracking";

function makeEvent(overrides?: Partial<TrackingEvent>): TrackingEvent {
  return {
    eventId: "test-event-id",
    eventName: TrackingEventName.PAGE_VIEWED,
    timestamp: Date.now(),
    pageUrl: "https://shop.com",
    sessionId: "test-session",
    ...overrides,
  };
}

describe("TrackingEventBus", () => {
  afterEach(() => {
    trackingEventBus.clear();
  });

  it("should subscribe and receive events", () => {
    const listener = vi.fn();
    const unsubscribe = trackingEventBus.subscribe(listener);

    const event = makeEvent();
    trackingEventBus.emit(event);

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith(event);

    unsubscribe();
  });

  it("should support multiple listeners", () => {
    const listener1 = vi.fn();
    const listener2 = vi.fn();
    const unsub1 = trackingEventBus.subscribe(listener1);
    const unsub2 = trackingEventBus.subscribe(listener2);

    trackingEventBus.emit(makeEvent());

    expect(listener1).toHaveBeenCalledOnce();
    expect(listener2).toHaveBeenCalledOnce();

    unsub1();
    unsub2();
  });

  it("should unsubscribe correctly", () => {
    const listener = vi.fn();
    const unsubscribe = trackingEventBus.subscribe(listener);

    unsubscribe();
    trackingEventBus.emit(makeEvent());

    expect(listener).not.toHaveBeenCalled();
  });

  it("should not crash if a listener throws", () => {
    const badListener = vi.fn(() => {
      throw new Error("Boom");
    });
    const goodListener = vi.fn();

    const unsub1 = trackingEventBus.subscribe(badListener);
    const unsub2 = trackingEventBus.subscribe(goodListener);

    trackingEventBus.emit(makeEvent());

    expect(badListener).toHaveBeenCalledOnce();
    expect(goodListener).toHaveBeenCalledOnce();

    unsub1();
    unsub2();
  });

  it("should report listener count", () => {
    const before = trackingEventBus.listenerCount;
    const unsub = trackingEventBus.subscribe(() => {});
    expect(trackingEventBus.listenerCount).toBe(before + 1);
    unsub();
    expect(trackingEventBus.listenerCount).toBe(before);
  });

  it("should clear all listeners", () => {
    trackingEventBus.subscribe(() => {});
    trackingEventBus.subscribe(() => {});
    trackingEventBus.clear();
    expect(trackingEventBus.listenerCount).toBe(0);
  });
});
