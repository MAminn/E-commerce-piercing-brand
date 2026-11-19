import { describe, expect, it } from "vitest";
import { DEFAULT_HOMEPAGE_CONTENT } from "#root/shared/types/homepage-content";
import type { DatabaseClient } from "#root/shared/database/drizzle/db";
import { getStorefrontShellContentRaw } from "../legal-pages";

/** One homepage_content read gives the footer's legal pages and the inner pages' meta description. */

function fakeDb(rows: Array<{ content: unknown }>): DatabaseClient {
  const chain = {
    from: () => chain,
    where: () => chain,
    limit: () => chain,
    execute: async () => rows,
  };
  return { select: () => chain } as unknown as DatabaseClient;
}

describe("getStorefrontShellContentRaw", () => {
  it("returns the dashboard meta description when it is set", async () => {
    const meta = { enabled: true, pageTitle: "Percé", pageDescription: "  Dashboard description.  " };
    const shell = await getStorefrontShellContentRaw(fakeDb([{ content: { meta } }]), undefined);
    expect(shell.siteDescription).toBe("Dashboard description.");
    expect(shell.legalPages.map((p) => p.key)).toContain("returnPolicy");
  });

  it("is null when the meta block is off or blank", async () => {
    for (const meta of [
      { enabled: false, pageTitle: "x", pageDescription: "Hidden." },
      { enabled: true, pageTitle: "x", pageDescription: "   " },
    ]) {
      const shell = await getStorefrontShellContentRaw(fakeDb([{ content: { meta } }]), undefined);
      expect(shell.siteDescription).toBeNull();
    }
  });

  it("falls back to the defaults (approved wording) with no stored row", async () => {
    const shell = await getStorefrontShellContentRaw(fakeDb([]), undefined);
    expect(shell.siteDescription).toBe(DEFAULT_HOMEPAGE_CONTENT.meta.pageDescription);
    expect(shell.siteDescription).not.toBe("Piercing jewellery, delivered across Egypt.");
  });
});
