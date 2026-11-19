import { describe, expect, it } from "vitest";
import lang from "../+lang";
import htmlAttributes from "../+htmlAttributes";
import { DEFAULT_LAYOUT_SETTINGS, type LayoutSettings } from "#root/shared/types/layout-settings";

/** `<html lang dir>` in the server HTML follows the Arabic cookie in the Percé shell. */

const minimal = DEFAULT_LAYOUT_SETTINGS;
const editorial: LayoutSettings = {
  ...DEFAULT_LAYOUT_SETTINGS,
  header: { ...DEFAULT_LAYOUT_SETTINGS.header, navbarStyle: "editorial" },
};
const ctx = (over: Record<string, unknown>) => over as never;

describe("SSR document locale", () => {
  it("Arabic cookie in the Percé shell → lang=ar dir=rtl", () => {
    const pc = ctx({ ssrLocale: "ar", layoutSettingsData: minimal });
    expect(lang(pc)).toBe("ar");
    expect(htmlAttributes(pc)).toEqual({ dir: "rtl" });
  });

  it("English is unchanged: lang=en and no dir attribute", () => {
    for (const pc of [ctx({ ssrLocale: "en", layoutSettingsData: minimal }), ctx({ layoutSettingsData: minimal }), ctx({})]) {
      expect(lang(pc)).toBe("en");
      expect(htmlAttributes(pc)).toBeUndefined();
    }
  });

  it("other shells stay English even with the Arabic cookie, as on the client", () => {
    const pc = ctx({ ssrLocale: "ar", layoutSettingsData: editorial });
    expect(lang(pc)).toBe("en");
    expect(htmlAttributes(pc)).toBeUndefined();
  });

  it("an unset navbar style means the Percé shell", () => {
    expect(lang(ctx({ ssrLocale: "ar" }))).toBe("ar");
  });
});
