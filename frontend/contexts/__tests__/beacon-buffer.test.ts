import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { TrackingEvent } from "#root/shared/types/pixel-tracking";
import { TrackingEventName } from "#root/shared/types/pixel-tracking";

// ─── Helpers ──────────────────────────────────────────────────────────────

const makeEvent = (overrides?: Partial<TrackingEvent>): TrackingEvent => ({
  eventId: "evt-buf-001",
  eventName: TrackingEventName.PAGE_VIEWED,
  timestamp: Date.now(),
  pageUrl: "https://shop.test/",
  sessionId: "sess-1",
  ...overrides,
});

/**
 * These tests verify the beacon buffer logic in isolation
 * (the same pattern used in TrackingContext.tsx).
 *
 * We replicate the buffer functions here to test them in a controlled
 * environment without React / DOM complexity.
 */

describe("Beacon Buffer Integration", () => {
  let eventBuffer: TrackingEvent[];
  let flushTimer: ReturnType<typeof setTimeout> | null;
  let fetchSpy: ReturnType<typeof vi.fn>;
  let sendBeaconSpy: ReturnType<typeof vi.fn>;

  function flushBuffer() {
    if (eventBuffer.length === 0) return;
    const batch = [...eventBuffer];
    eventBuffer = [];
    fetchSpy("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events: batch }),
      keepalive: true,
    });
  }

  function bufferEvent(event: TrackingEvent) {
    eventBuffer.push(event);
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(flushBuffer, 250);
  }

  function handleVisibilityHidden() {
    if (eventBuffer.length === 0) return;
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    const payload = JSON.stringify({ events: [...eventBuffer] });
    eventBuffer = [];
    sendBeaconSpy("/api/track", payload);
  }

  beforeEach(() => {
    eventBuffer = [];
    flushTimer = null;
    fetchSpy = vi.fn();
    sendBeaconSpy = vi.fn();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("buffers events without immediately flushing", () => {
    bufferEvent(makeEvent());
    bufferEvent(makeEvent({ eventId: "evt-buf-002" }));

    expect(eventBuffer).toHaveLength(2);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("flushes buffer after 250ms debounce", () => {
    bufferEvent(makeEvent());
    bufferEvent(makeEvent({ eventId: "evt-buf-002" }));

    vi.advanceTimersByTime(250);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const callArgs = fetchSpy.mock.calls[0]!;
    expect(callArgs[0]).toBe("/api/track");
    const body = JSON.parse(callArgs[1].body);
    expect(body.events).toHaveLength(2);
  });

  it("resets debounce timer on each new event", () => {
    bufferEvent(makeEvent());
    vi.advanceTimersByTime(200); // 200ms elapsed

    bufferEvent(makeEvent({ eventId: "evt-buf-002" }));
    vi.advanceTimersByTime(200); // total 400ms, but timer restarted at 200ms

    // Should NOT have flushed yet (250ms not elapsed since last event)
    expect(fetchSpy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(50); // 450ms total — 250ms since last event
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("clears buffer after flush", () => {
    bufferEvent(makeEvent());
    vi.advanceTimersByTime(250);

    expect(eventBuffer).toHaveLength(0);
  });

  it("uses sendBeacon on visibility hidden", () => {
    bufferEvent(makeEvent());
    bufferEvent(makeEvent({ eventId: "evt-buf-003" }));

    handleVisibilityHidden();

    expect(sendBeaconSpy).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(sendBeaconSpy.mock.calls[0]![1]);
    expect(payload.events).toHaveLength(2);
    expect(eventBuffer).toHaveLength(0);
  });

  it("does not send beacon when buffer is empty", () => {
    handleVisibilityHidden();
    expect(sendBeaconSpy).not.toHaveBeenCalled();
  });

  it("cancels pending flush timer when sendBeacon fires", () => {
    bufferEvent(makeEvent());

    // Before the 250ms debounce fires, simulate page hide
    handleVisibilityHidden();

    // The timer should have been cleared — advancing shouldn't cause fetch
    vi.advanceTimersByTime(300);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(sendBeaconSpy).toHaveBeenCalledTimes(1);
  });

  it("includes keepalive in fetch options", () => {
    bufferEvent(makeEvent());
    vi.advanceTimersByTime(250);

    const callArgs = fetchSpy.mock.calls[0]!;
    expect(callArgs[1].keepalive).toBe(true);
  });

  it("sends correct Content-Type header", () => {
    bufferEvent(makeEvent());
    vi.advanceTimersByTime(250);

    const callArgs = fetchSpy.mock.calls[0]!;
    expect(callArgs[1].headers["Content-Type"]).toBe("application/json");
  });
});
