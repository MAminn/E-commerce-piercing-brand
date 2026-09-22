import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { and, eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";

// MinimalFooter only needs the current path from the page context; the
// newsletter submit and toasts are never exercised here.
vi.mock("vike-react/usePageContext", () => ({
  usePageContext: () => ({ urlPathname: "/" }),
}));
vi.mock("#root/shared/trpc/client", () => ({ trpc: {} }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = TEST_DB_URL ? describe : describe.skip;

/**
 * Regression: Dashboard > Layout Settings > Footer > "Show newsletter" OFF
 * still rendered "Join the list" on the live storefront.
 *
 * The component honoured `showNewsletter === false`; the value never reached
 * it. The dashboard resolves an unset template selection to the Percé preset
 * and saves to that row, while SSR passed the raw (unset) selection through
 * and read the legacy "default" row. This suite drives the real persistence
 * path end to end — save exactly as the dashboard does, load exactly as
 * server.ts / vike-handler.ts do, render the footer from what was loaded —
 * so a persisted `false` being lost at any layer fails here.
 */
describeIfDb("footer newsletter switch — persisted settings path (integration)", () => {
  let db: ReturnType<typeof import("drizzle-orm/node-postgres").drizzle>;
  let schema: typeof import("#root/shared/database/drizzle/schema");
  let updateLayoutSettings: typeof import("#root/backend/layout/update-layout-settings").updateLayoutSettings;
  let getStorefrontLayoutSettingsRaw: typeof import("#root/backend/layout/get-layout-settings-raw").getStorefrontLayoutSettingsRaw;
  let resolveTemplateId: typeof import("#root/shared/config/storefront").resolveTemplateId;
  let DEFAULT_LAYOUT_SETTINGS: typeof import("#root/shared/types/layout-settings").DEFAULT_LAYOUT_SETTINGS;
  let LayoutSettingsContext: typeof import("#root/frontend/contexts/LayoutSettingsContext").LayoutSettingsContext;
  let MinimalFooter: typeof import("#root/components/template-system/minimal/MinimalFooter").MinimalFooter;
  type LayoutSettings = import("#root/shared/types/layout-settings").LayoutSettings;

  // A merchant of our own so nothing here touches the store owner's rows.
  const merchantId = uuidv7();

  beforeAll(async () => {
    // updateLayoutSettings uses the DATABASE_URL singleton, exactly like the
    // tRPC mutation the dashboard calls.
    process.env.DATABASE_URL = TEST_DB_URL;
    const { drizzle } = await import("drizzle-orm/node-postgres");
    schema = await import("#root/shared/database/drizzle/schema");
    db = drizzle(TEST_DB_URL!, { schema });
    ({ updateLayoutSettings } = await import("#root/backend/layout/update-layout-settings"));
    ({ getStorefrontLayoutSettingsRaw } = await import("#root/backend/layout/get-layout-settings-raw"));
    ({ resolveTemplateId } = await import("#root/shared/config/storefront"));
    ({ DEFAULT_LAYOUT_SETTINGS } = await import("#root/shared/types/layout-settings"));
    ({ LayoutSettingsContext } = await import("#root/frontend/contexts/LayoutSettingsContext"));
    ({ MinimalFooter } = await import("#root/components/template-system/minimal/MinimalFooter"));
  });

  const clearRows = () =>
    db.delete(schema.layoutSettings).where(eq(schema.layoutSettings.merchantId, merchantId));

  beforeEach(clearRows);
  afterAll(clearRows);

  /** Save from the dashboard: same resolver, same mutation, same payload shape. */
  const saveAsDashboard = (
    storedSelection: Record<string, string> | undefined,
    footer: Partial<LayoutSettings["footer"]>,
  ) =>
    updateLayoutSettings(
      merchantId,
      {
        ...DEFAULT_LAYOUT_SETTINGS,
        footer: { ...DEFAULT_LAYOUT_SETTINGS.footer, ...footer },
      },
      resolveTemplateId("landing", storedSelection?.landing),
    );

  /** Load as SSR does: the raw stored selection, straight from the DB. */
  const loadAsStorefront = (storedSelection: Record<string, string> | undefined) =>
    getStorefrontLayoutSettingsRaw(db as never, merchantId, storedSelection);

  const renderFooter = (settings: LayoutSettings) =>
    renderToStaticMarkup(
      createElement(
        LayoutSettingsContext.Provider,
        { value: settings },
        createElement(MinimalFooter),
      ),
    );

  const rawRow = async (templateId: string) => {
    const rows = await db
      .select({ content: schema.layoutSettings.content })
      .from(schema.layoutSettings)
      .where(
        and(
          eq(schema.layoutSettings.merchantId, merchantId),
          eq(schema.layoutSettings.templateId, templateId),
        ),
      );
    return rows[0]?.content as LayoutSettings | undefined;
  };

  describe.each<[string, Record<string, string> | undefined]>([
    ["a store that never saved a template selection", undefined],
    ["a store with an empty template selection", {}],
    ["a store with landing-minimal selected", { landing: "landing-minimal" }],
  ])("on %s", (_label, storedSelection) => {
    it("keeps showNewsletter === false from save to render", async () => {
      await saveAsDashboard(storedSelection, { showNewsletter: false });

      // Persisted JSON: false was written, not dropped.
      const persisted = await rawRow(resolveTemplateId("landing", storedSelection?.landing));
      expect(persisted?.footer.showNewsletter).toBe(false);

      // Resolved settings: the storefront read the row the dashboard wrote.
      const loaded = await loadAsStorefront(storedSelection);
      expect(loaded.footer.showNewsletter).toBe(false);

      // Rendered footer: no newsletter block.
      const html = renderFooter(loaded);
      expect(html).not.toContain("Join the list");
      expect(html).not.toContain('type="email"');
    });

    it("renders the newsletter block when showNewsletter === true", async () => {
      await saveAsDashboard(storedSelection, { showNewsletter: true });

      const loaded = await loadAsStorefront(storedSelection);
      expect(loaded.footer.showNewsletter).toBe(true);

      const html = renderFooter(loaded);
      expect(html).toContain("Join the list");
      expect(html).toContain('type="email"');
    });
  });

  it("reads the same row the dashboard edits for every other footer value too", async () => {
    await saveAsDashboard(undefined, {
      showNewsletter: false,
      copyright: "Percé regression copyright",
    });

    const loaded = await loadAsStorefront(undefined);
    expect(loaded.footer.copyright).toBe("Percé regression copyright");
    expect(loaded.footer.showNewsletter).toBe(false);
  });

  it("a legacy row without showNewsletter keeps the shipped default (shown)", async () => {
    const { showNewsletter: _omitted, ...legacyFooter } = DEFAULT_LAYOUT_SETTINGS.footer;
    await db.insert(schema.layoutSettings).values({
      id: uuidv7(),
      merchantId,
      templateId: resolveTemplateId("landing", undefined),
      content: { ...DEFAULT_LAYOUT_SETTINGS, footer: legacyFooter },
    });

    const loaded = await loadAsStorefront(undefined);
    expect(loaded.footer.showNewsletter).toBe(true);
    expect(renderFooter(loaded)).toContain("Join the list");
  });

  it("still falls back to the legacy \"default\" row when no template row exists", async () => {
    await updateLayoutSettings(
      merchantId,
      {
        ...DEFAULT_LAYOUT_SETTINGS,
        footer: { ...DEFAULT_LAYOUT_SETTINGS.footer, showNewsletter: false },
      },
      "default",
    );

    const loaded = await loadAsStorefront(undefined);
    expect(loaded.footer.showNewsletter).toBe(false);
    expect(renderFooter(loaded)).not.toContain("Join the list");
  });

  it("prefers the template row over the legacy \"default\" row", async () => {
    await updateLayoutSettings(
      merchantId,
      { ...DEFAULT_LAYOUT_SETTINGS, footer: { ...DEFAULT_LAYOUT_SETTINGS.footer, showNewsletter: true } },
      "default",
    );
    await saveAsDashboard(undefined, { showNewsletter: false });

    const loaded = await loadAsStorefront(undefined);
    expect(loaded.footer.showNewsletter).toBe(false);
  });
});
