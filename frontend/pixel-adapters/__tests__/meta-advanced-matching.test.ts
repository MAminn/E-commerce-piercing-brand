// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { MetaPixelAdapter } from "../meta-pixel-adapter";

const sha = (v: string) => createHash("sha256").update(v, "utf8").digest("hex");
const config = { platform: "meta", pixelId: "1234567890", enabled: true } as never;

let fbq: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fbq = Object.assign(vi.fn(), { queue: [] });
  (window as unknown as { fbq: unknown }).fbq = fbq;
});
const inits = () => fbq.mock.calls.filter(([c]) => c === "init");

describe("MetaPixelAdapter manual advanced matching", () => {
  it("no advanced matching → the unchanged two-argument init", () => {
    new MetaPixelAdapter().initialize(config);
    expect(inits()).toEqual([["init", "1234567890"]]);
  });

  it("hashed identifiers ride on the single init call", () => {
    const a = new MetaPixelAdapter();
    a.setAdvancedMatching({ external_id: sha("s"), em: sha("a@b.co") });
    a.initialize(config);
    expect(inits()).toEqual([["init", "1234567890", { em: sha("a@b.co"), external_id: sha("s") }]]);
    expect(fbq.mock.calls.filter(([c]) => c === "init")).toHaveLength(1);
  });

  it("drops anything that is not a SHA-256 digest of a known key — raw PII can never reach fbq", () => {
    const a = new MetaPixelAdapter();
    a.setAdvancedMatching({
      em: "raw@example.com",
      ph: "01012345678",
      external_id: sha("s"),
      ...({ unknown_key: sha("x") } as object),
    });
    a.initialize(config);
    expect(inits()).toEqual([["init", "1234567890", { external_id: sha("s") }]]);
    expect(JSON.stringify(fbq.mock.calls)).not.toMatch(/raw@example\.com|01012345678/);
  });

  it("only invalid values → falls back to the plain init", () => {
    const a = new MetaPixelAdapter();
    a.setAdvancedMatching({ em: "nope" });
    a.initialize(config);
    expect(inits()).toEqual([["init", "1234567890"]]);
  });

  it("track calls are unchanged: eventID dedup option on every standard event", () => {
    const a = new MetaPixelAdapter();
    a.setAdvancedMatching({ external_id: sha("s") });
    a.initialize(config);
    a.trackEvent({ eventId: "pv-1", eventName: "page_viewed", timestamp: 0, pageUrl: "", sessionId: "s" });
    expect(fbq.mock.calls.at(-1)).toEqual(["track", "PageView", {}, { eventID: "pv-1" }]);
  });
});
