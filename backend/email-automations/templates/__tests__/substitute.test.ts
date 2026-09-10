import { describe, it, expect } from "vitest";
import { substituteTokens } from "#root/backend/email-automations/templates/substitute";

describe("substituteTokens", () => {
  it("replaces a single token", () => {
    expect(substituteTokens("Hello [name]", { name: "Alex" })).toBe(
      "Hello Alex",
    );
  });

  it("replaces multiple distinct tokens", () => {
    expect(
      substituteTokens("[greeting], [name]!", {
        greeting: "Hi",
        name: "Alex",
      }),
    ).toBe("Hi, Alex!");
  });

  it("replaces repeated occurrences of the same token", () => {
    expect(substituteTokens("[code] is your code: [code]", { code: "ABC" })).toBe(
      "ABC is your code: ABC",
    );
  });

  it("leaves unmatched tokens untouched rather than blanking them", () => {
    expect(substituteTokens("Hi [name], code: [missing]", { name: "Alex" })).toBe(
      "Hi Alex, code: [missing]",
    );
  });

  it("substitutes an empty string value correctly (not treated as missing)", () => {
    expect(substituteTokens("Code: [code]", { code: "" })).toBe("Code: ");
  });

  it("returns the text unchanged when it has no tokens", () => {
    expect(substituteTokens("No tokens here", { name: "Alex" })).toBe(
      "No tokens here",
    );
  });

  it("ignores malformed token syntax (no closing bracket)", () => {
    expect(substituteTokens("Hi [name", { name: "Alex" })).toBe("Hi [name");
  });

  it("matches multi-word labels, including a leading/trailing space inside the brackets", () => {
    expect(
      substituteTokens("Use code [Discount Code] at checkout", {
        "Discount Code": "SAVE10",
      }),
    ).toBe("Use code SAVE10 at checkout");
  });

  it("matches non-Latin (Arabic) labels", () => {
    expect(
      substituteTokens("مرحباً [اسم العميل]", { "اسم العميل": "أحمد" }),
    ).toBe("مرحباً أحمد");
  });
});
