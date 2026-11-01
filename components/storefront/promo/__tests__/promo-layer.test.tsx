// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * The promotional layer is infrastructure only: one switch, OFF by default,
 * no offer, price or copy of its own. Off, it renders nothing and fetches
 * nothing; on, each piece still needs approved text or a live Pick Your Set
 * campaign that actually contains the product.
 */
const listLive = vi.fn();
vi.mock("#root/shared/trpc/client", () => ({
  trpc: { bundle: { listLive: { query: (input: unknown) => listLive(input) } } },
}));

import {
  AnnouncementBar,
  BundleEntryTile,
  OfferBlock,
  PdpBundleLink,
} from "../PromoLayer";
import { PROMO_LAYER, type PromoLayerConfig, isPromoLayerOn } from "#root/shared/config/promo-layer";
import { MinimalI18nProvider } from "#root/lib/i18n/MinimalI18nContext";

const on: PromoLayerConfig = {
  enabled: true,
  announcement: { text: "Announcement text" },
  offer: { title: "Offer title", body: "Offer body" },
  bundleEntryTile: true,
  pdpBundleLink: true,
};

const campaign = {
  id: "c1",
  slug: "pick-3",
  title: "Pick 3",
  availability: "available",
  heroImageUrl: null,
  eligibleProducts: [{ productId: "p-in-pool" }],
};

const wrap = (node: React.ReactNode) => <MinimalI18nProvider ssrLocale='en'>{node}</MinimalI18nProvider>;

beforeEach(() => {
  listLive.mockReset();
  listLive.mockResolvedValue({ success: true, result: [campaign] });
});
afterEach(cleanup);

describe("promotional layer — default", () => {
  it("is off, with no invented copy", () => {
    expect(PROMO_LAYER.enabled).toBe(false);
    expect(isPromoLayerOn()).toBe(false);
    expect(PROMO_LAYER.announcement).toBeNull();
    expect(PROMO_LAYER.offer).toBeNull();
  });

  it("renders nothing and fetches nothing while off", async () => {
    const { container } = render(
      wrap(
        <>
          <AnnouncementBar />
          <OfferBlock />
          <BundleEntryTile />
          <PdpBundleLink productId='p-in-pool' />
        </>,
      ),
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(container.innerHTML).toBe("");
    expect(listLive).not.toHaveBeenCalled();
  });
});

describe("promotional layer — switched on", () => {
  it("announcement: one 32px ink bar in the server render", () => {
    const html = renderToStaticMarkup(wrap(<AnnouncementBar config={on} />));
    expect(html).toContain("data-announcement-bar");
    expect(html).toContain("h-8");
    expect(html).toContain("bg-ink");
    expect(html).toContain("Announcement text");
    expect(html).not.toMatch(/marquee|countdown|animate/i);
  });

  it("announcement needs approved text even when on", () => {
    expect(renderToStaticMarkup(wrap(<AnnouncementBar config={{ ...on, announcement: { text: " " } }} />))).toBe("");
  });

  it("offer block: text only inside a 1px ink rule", () => {
    const html = renderToStaticMarkup(wrap(<OfferBlock config={on} />));
    expect(html).toContain("border border-ink");
    expect(html).toContain("Offer title");
    expect(html).not.toContain("<img");
  });

  it("PDP link appears only for a product in a live set's pool", async () => {
    render(wrap(<PdpBundleLink productId='p-in-pool' config={on} />));
    await waitFor(() => expect(screen.getByRole("link", { name: "Part of Pick 3" })).toBeTruthy());
    cleanup();
    render(wrap(<PdpBundleLink productId='p-elsewhere' config={on} />));
    await waitFor(() => expect(listLive).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("bundle tile appears only while a set is live", async () => {
    render(wrap(<BundleEntryTile config={on} />));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Pick 3" })).toBeTruthy());
    cleanup();
    listLive.mockResolvedValue({ success: true, result: [] });
    const { container } = render(wrap(<BundleEntryTile config={on} />));
    await waitFor(() => expect(listLive).toHaveBeenCalled());
    expect(container.innerHTML).toBe("");
  });
});
