import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SETS_HIDDEN_UNTIL,
  areSetsVisibleToShoppers,
  isSetsHref,
  withSetsLinksHidden,
} from "../sets-visibility";
import { DEFAULT_LAYOUT_SETTINGS, type LayoutSettings } from "#root/shared/types/layout-settings";
import { appRouter } from "#root/shared/trpc/router";
import { guard } from "#root/pages/bundles/+guard";

const DURING = new Date("2026-10-15T12:00:00+03:00");
const LAST_MOMENT = new Date(SETS_HIDDEN_UNTIL.getTime() - 1);
const AFTER = new Date("2026-10-29T00:00:00+03:00");

describe("Sets visibility window", () => {
  it("hides Sets until midnight Cairo time on Oct 29 2026, then restores them", () => {
    expect(SETS_HIDDEN_UNTIL.toISOString()).toBe("2026-10-28T21:00:00.000Z");
    expect(areSetsVisibleToShoppers(DURING)).toBe(false);
    expect(areSetsVisibleToShoppers(LAST_MOMENT)).toBe(false);
    expect(areSetsVisibleToShoppers(AFTER)).toBe(true);
    expect(areSetsVisibleToShoppers(new Date("2027-01-01T00:00:00Z"))).toBe(true);
  });

  it("recognises /bundles and its sub-pages only", () => {
    for (const href of ["/bundles", "/bundles/", "/bundles?ref=nav", "/bundles#x", "/bundles/pick-your-3"]) {
      expect(isSetsHref(href), href).toBe(true);
    }
    for (const href of ["/shop", "/bundles-guide", "/shop?section=bundles", "", undefined, null]) {
      expect(isSetsHref(href), String(href)).toBe(false);
    }
  });
});

describe("withSetsLinksHidden", () => {
  const stored: LayoutSettings = {
    ...DEFAULT_LAYOUT_SETTINGS,
    header: {
      ...DEFAULT_LAYOUT_SETTINGS.header,
      navigationLinks: [
        { id: "nav-shop", label: "Shop all", url: "/shop" },
        { id: "nav-sets", label: "Sets", url: "/bundles" },
      ],
    },
    footer: {
      ...DEFAULT_LAYOUT_SETTINGS.footer,
      footerLinkGroups: [
        {
          id: "shop",
          title: "Shop",
          links: [
            { id: "all", label: "Shop all", url: "/shop" },
            { id: "sets", label: "Sets", url: "/bundles" },
          ],
        },
        { id: "only-sets", title: "Sets", links: [{ id: "p3", label: "Pick 3", url: "/bundles/pick-your-3" }] },
      ],
    },
  };

  it("drops header and footer links to /bundles while hidden, and empty groups with them", () => {
    const view = withSetsLinksHidden(stored, DURING);
    expect(view.header.navigationLinks.map((l) => l.id)).toEqual(["nav-shop"]);
    expect(view.footer.footerLinkGroups.map((g) => g.id)).toEqual(["shop"]);
    expect(view.footer.footerLinkGroups[0]?.links.map((l) => l.id)).toEqual(["all"]);
  });

  it("never modifies the stored settings", () => {
    const before = JSON.stringify(stored);
    withSetsLinksHidden(stored, DURING);
    expect(JSON.stringify(stored)).toBe(before);
  });

  it("returns the stored settings untouched once the window ends", () => {
    expect(withSetsLinksHidden(stored, AFTER)).toBe(stored);
  });
});

describe("public bundle procedures and /bundles route", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function callerWithDbSpy() {
    const spy = { touched: false };
    const db = new Proxy(
      {},
      {
        get() {
          spy.touched = true;
          throw new Error("db reached");
        },
      },
    );
    const caller = appRouter.createCaller({
      db,
      clientSession: undefined,
      emailService: undefined,
      ipAddress: "127.0.0.1",
      userAgent: "vitest",
    } as never);
    return { caller, spy };
  }

  it("answers as if nothing is live while hidden, without reading campaigns", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(DURING);
    const { caller, spy } = callerWithDbSpy();

    expect(await caller.bundle.listLive({ type: "build_your_stack" })).toEqual({ success: true, result: [] });
    expect(await caller.bundle.listLive()).toEqual({ success: true, result: [] });
    expect(await caller.bundle.getLiveBySlug({ slug: "pick-your-3" })).toEqual({
      success: false,
      error: "Bundle campaign not found",
    });
    expect(spy.touched).toBe(false);
  });

  it("reads live campaigns again once the window ends", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(AFTER);
    const { caller, spy } = callerWithDbSpy();

    await caller.bundle.listLive().catch(() => undefined);
    expect(spy.touched).toBe(true);
  });

  it("redirects /bundles to /shop while hidden and lets it through afterwards", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(DURING);
    await expect(guard()).rejects.toBeTruthy();

    vi.setSystemTime(AFTER);
    await expect(guard()).resolves.toBeUndefined();
  });
});
