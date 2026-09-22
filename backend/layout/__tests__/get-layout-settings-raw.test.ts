import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { getStorefrontLayoutSettingsRaw } from "../get-layout-settings-raw";
import { resolveTemplateId } from "#root/shared/config/storefront";
import {
  DEFAULT_LAYOUT_SETTINGS,
  type LayoutSettings,
} from "#root/shared/types/layout-settings";

const MERCHANT = "0192c7a0-0000-7000-8000-000000000001";

/**
 * A stand-in for the request-scoped drizzle client that answers the one
 * query shape the loader issues and records which template_id it asked for.
 * The where-clause is compiled with the real Postgres dialect so the test
 * reads the bound parameters rather than guessing at drizzle internals.
 */
function fakeDb(rowsByTemplateId: Record<string, unknown>) {
  const queried: string[] = [];
  const db = {
    select: () => ({
      from: () => ({
        where: (condition: SQL) => ({
          limit: async () => {
            const params = new PgDialect().sqlToQuery(condition).params as string[];
            expect(params[0]).toBe(MERCHANT);
            const templateId = params[1]!;
            queried.push(templateId);
            const content = rowsByTemplateId[templateId];
            return content ? [{ content }] : [];
          },
        }),
      }),
    }),
  };
  return { db: db as never, queried };
}

const withFooter = (footer: Partial<LayoutSettings["footer"]>): LayoutSettings => ({
  ...DEFAULT_LAYOUT_SETTINGS,
  footer: { ...DEFAULT_LAYOUT_SETTINGS.footer, ...footer },
});

/** The row the dashboard writes for a given stored selection. */
const dashboardRow = (selection: Record<string, string> | undefined) =>
  resolveTemplateId("landing", selection?.landing);

describe("getStorefrontLayoutSettingsRaw", () => {
  it.each([
    ["no stored template selection", undefined],
    ["an empty template selection", {}],
    ["landing-minimal selected", { landing: "landing-minimal" }],
  ])("with %s reads the row the dashboard saved showNewsletter: false to", async (_label, selection) => {
    const { db, queried } = fakeDb({
      [dashboardRow(selection)]: withFooter({ showNewsletter: false }),
    });

    const settings = await getStorefrontLayoutSettingsRaw(db, MERCHANT, selection);

    expect(queried[0]).toBe(dashboardRow(selection));
    expect(settings.footer.showNewsletter).toBe(false);
  });

  it("keeps showNewsletter: true when that is what was saved", async () => {
    const { db } = fakeDb({
      [dashboardRow(undefined)]: withFooter({ showNewsletter: true }),
    });
    const settings = await getStorefrontLayoutSettingsRaw(db, MERCHANT, undefined);
    expect(settings.footer.showNewsletter).toBe(true);
  });

  it("defaults a legacy row without showNewsletter to shown", async () => {
    const { showNewsletter: _omitted, ...legacyFooter } = DEFAULT_LAYOUT_SETTINGS.footer;
    const { db } = fakeDb({
      [dashboardRow(undefined)]: { ...DEFAULT_LAYOUT_SETTINGS, footer: legacyFooter },
    });
    const settings = await getStorefrontLayoutSettingsRaw(db, MERCHANT, undefined);
    expect(settings.footer.showNewsletter).toBe(true);
  });

  it("still falls back to the legacy \"default\" row when no template row exists", async () => {
    const { db, queried } = fakeDb({
      default: withFooter({ showNewsletter: false }),
    });
    const settings = await getStorefrontLayoutSettingsRaw(db, MERCHANT, undefined);
    expect(queried).toEqual([dashboardRow(undefined), "default"]);
    expect(settings.footer.showNewsletter).toBe(false);
  });

  it("prefers the template row over the legacy \"default\" row", async () => {
    const { db } = fakeDb({
      default: withFooter({ showNewsletter: true }),
      [dashboardRow(undefined)]: withFooter({ showNewsletter: false }),
    });
    const settings = await getStorefrontLayoutSettingsRaw(db, MERCHANT, undefined);
    expect(settings.footer.showNewsletter).toBe(false);
  });

  it("honours an explicitly selected non-minimal landing template", async () => {
    const { db, queried } = fakeDb({
      "landing-editorial": withFooter({ showNewsletter: false }),
    });
    const settings = await getStorefrontLayoutSettingsRaw(db, MERCHANT, {
      landing: "landing-editorial",
    });
    expect(queried[0]).toBe("landing-editorial");
    expect(settings.footer.showNewsletter).toBe(false);
  });
});
