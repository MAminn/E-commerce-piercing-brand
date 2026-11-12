import { describe, expect, it } from "vitest";
import {
  isGa4ClientOwnedFrom,
  serverSideDisplay,
  showsMissingTokenWarning,
} from "../ga4-display";

/**
 * The Pixels admin must not present GA4's server-side switch as sending
 * events while GA4 is client-owned (G1), nor warn about a missing GA4 secret.
 */

const ga4 = { platform: "google_ga4", enabled: true, enableServerSide: true, hasAccessToken: false };
const meta = { platform: "meta", enabled: true, enableServerSide: true, hasAccessToken: true };

describe("isGa4ClientOwnedFrom", () => {
  it("client-owned when the GA4 health row is client-judged, or when there is no GA4 row (server default)", () => {
    expect(isGa4ClientOwnedFrom([{ platform: "google_ga4", basis: "client" }])).toBe(true);
    expect(isGa4ClientOwnedFrom([{ platform: "meta", basis: "server_delivery" }])).toBe(true);
    expect(isGa4ClientOwnedFrom([])).toBe(true);
  });

  it("not client-owned when the server judges GA4 by deliveries (GA4_MP_MODE=legacy_all)", () => {
    expect(isGa4ClientOwnedFrom([{ platform: "google_ga4", basis: "server_delivery" }])).toBe(false);
  });
});

describe("serverSideDisplay", () => {
  it("GA4 client-owned: 'mirror disabled' whatever the switch and secret say", () => {
    for (const enableServerSide of [true, false]) {
      for (const hasAccessToken of [true, false]) {
        expect(serverSideDisplay({ ...ga4, enableServerSide, hasAccessToken }, true)).toBe("mirror_disabled");
      }
    }
  });

  it("GA4 in legacy_all and every other platform: the previous rule", () => {
    expect(serverSideDisplay({ ...ga4, hasAccessToken: true }, false)).toBe("active");
    expect(serverSideDisplay(ga4, false)).toBe("missing_token");
    expect(serverSideDisplay(meta, true)).toBe("active");
    expect(serverSideDisplay({ ...meta, hasAccessToken: false }, true)).toBe("missing_token");
    expect(serverSideDisplay({ ...meta, enableServerSide: false }, true)).toBe("off");
    expect(serverSideDisplay({ ...meta, enabled: false }, true)).toBe("off");
  });
});

describe("showsMissingTokenWarning", () => {
  it("no warning for GA4 server-side ON without a secret while client-owned", () => {
    expect(showsMissingTokenWarning([ga4, meta], true)).toBe(false);
  });

  it("still warns for Meta without a token, and for GA4 in legacy_all", () => {
    expect(showsMissingTokenWarning([ga4, { ...meta, hasAccessToken: false }], true)).toBe(true);
    expect(showsMissingTokenWarning([ga4], false)).toBe(true);
  });
});
