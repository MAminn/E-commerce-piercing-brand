import { describe, expect, it } from "vitest";
import { OFFERS_PAGE_EMPTY_COPY, offersPageState } from "../offersPageState";

describe("offers page empty state", () => {
  it("no offers + no promo codes → the global empty state", () => {
    expect(offersPageState({ offers: 0, promoCodes: 0 })).toEqual({
      showGlobalEmpty: true,
      showOffers: false,
      showPromoCodes: false,
    });
  });

  it("no automatic offers + an active promo code → no misleading 'no offers' message", () => {
    expect(offersPageState({ offers: 0, promoCodes: 2 })).toEqual({
      showGlobalEmpty: false,
      showOffers: false,
      showPromoCodes: true,
    });
  });

  it("automatic offer only", () => {
    expect(offersPageState({ offers: 1, promoCodes: 0 })).toEqual({
      showGlobalEmpty: false,
      showOffers: true,
      showPromoCodes: false,
    });
  });

  it("both present", () => {
    expect(offersPageState({ offers: 3, promoCodes: 1 })).toEqual({
      showGlobalEmpty: false,
      showOffers: true,
      showPromoCodes: true,
    });
  });

  it("the empty copy covers both promotion types, in English and Arabic", () => {
    expect(OFFERS_PAGE_EMPTY_COPY.en).toMatch(/offers or promo codes/);
    expect(OFFERS_PAGE_EMPTY_COPY.ar).toContain("أكواد خصم");
  });
});
