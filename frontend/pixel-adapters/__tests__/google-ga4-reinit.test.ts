// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { GoogleGA4Adapter } from "#root/frontend/pixel-adapters/google-ga4-adapter";
import { PixelPlatform } from "#root/shared/types/pixel-tracking";

describe("GoogleGA4Adapter — re-initialise after destroy (A1)", () => {
  it("does not inject gtag.js a second time when tracking is switched back on", () => {
    const config = {
      id: "cfg-ga4",
      platform: PixelPlatform.GOOGLE_GA4,
      pixelId: "G-REINIT0001",
      enabled: true,
      enableClientSide: true,
      enableServerSide: false,
      consentRequired: false,
      createdAt: new Date(),
    };
    const first = new GoogleGA4Adapter();
    first.initialize(config);
    expect(document.querySelectorAll('script[data-pixel-id="G-REINIT0001"]')).toHaveLength(1);
    first.destroy();
    const second = new GoogleGA4Adapter();
    second.initialize(config);
    expect(document.querySelectorAll('script[data-pixel-id="G-REINIT0001"]')).toHaveLength(1);
    expect(second.isLoaded()).toBe(true);
  });
});
