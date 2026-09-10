import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildUnsubscribeHeaders } from "#root/backend/email-subscription/service";

describe("buildUnsubscribeHeaders", () => {
  const original = process.env.PUBLIC_ORIGIN;

  beforeEach(() => {
    process.env.PUBLIC_ORIGIN = "https://syntperfumes.com";
  });

  afterEach(() => {
    process.env.PUBLIC_ORIGIN = original;
  });

  it("builds an absolute unsubscribe URL using the site origin", () => {
    const { unsubscribeUrl } = buildUnsubscribeHeaders("abc123");
    expect(unsubscribeUrl).toBe("https://syntperfumes.com/unsubscribe?token=abc123");
  });

  it("points List-Unsubscribe at the one-click POST API endpoint, not the human page", () => {
    const { headers } = buildUnsubscribeHeaders("abc123");
    expect(headers["List-Unsubscribe"]).toBe(
      "<https://syntperfumes.com/api/unsubscribe?token=abc123>",
    );
  });

  it("sets List-Unsubscribe-Post for RFC 8058 one-click compliance", () => {
    const { headers } = buildUnsubscribeHeaders("abc123");
    expect(headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });

  it("URL-safe tokens pass through untouched (hex tokens never need encoding)", () => {
    const { unsubscribeUrl, headers } = buildUnsubscribeHeaders(
      "a1b2c3d4e5f6",
    );
    expect(unsubscribeUrl).toContain("token=a1b2c3d4e5f6");
    expect(headers["List-Unsubscribe"]).toContain("token=a1b2c3d4e5f6");
  });
});
