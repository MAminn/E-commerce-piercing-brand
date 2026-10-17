import { describe, expect, it } from "vitest";
import { ORDER_NUMBER_START, formatOrderNumber, matchesOrderNumber } from "../order-number";

describe("formatOrderNumber", () => {
  it("formats the database number as #N", () => {
    expect(formatOrderNumber(10001)).toBe("#10001");
    expect(formatOrderNumber("10042")).toBe("#10042");
  });

  it("renders nothing for a missing or invalid number rather than inventing one", () => {
    for (const bad of [null, undefined, "", "abc", 0, -5, 1.5]) {
      expect(formatOrderNumber(bad as never)).toBe("");
    }
  });

  it("starts at 10001", () => {
    expect(ORDER_NUMBER_START).toBe(10001);
  });

  it("gives every order its own label — unlike the old UUIDv7 prefix", () => {
    // Two UUIDv7 ids minted in the same ~65 s window share their first 8
    // characters (the timestamp prefix) — the old "#XXXXXXXX" collided.
    const a = "0192f3a1-7c00-7abc-8000-000000000001";
    const b = "0192f3a1-9e11-7def-8000-000000000002";
    expect(a.slice(0, 8)).toBe(b.slice(0, 8));
    const labels = new Set([10001, 10002, 10003].map(formatOrderNumber));
    expect(labels.size).toBe(3);
  });
});

describe("matchesOrderNumber", () => {
  it("matches with or without the #", () => {
    expect(matchesOrderNumber("10001", 10001)).toBe(true);
    expect(matchesOrderNumber(" #10001 ", 10001)).toBe(true);
    expect(matchesOrderNumber("1000", 10001)).toBe(true);
    expect(matchesOrderNumber("#", 10001)).toBe(false);
    expect(matchesOrderNumber("10001", null)).toBe(false);
  });
});
