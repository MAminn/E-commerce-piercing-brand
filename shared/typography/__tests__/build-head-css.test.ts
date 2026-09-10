import { describe, it, expect } from "vitest";
import { buildTypographyHeadCss } from "#root/shared/typography/build-head-css";
import type { CustomFontFileRow, TypographySettings } from "#root/shared/database/drizzle/schema";

const settings: TypographySettings = {
  roles: {
    heading: { familyName: "Brand Sans", weight: 400 },
    body: null,
    buttons: null,
    nav: null,
    productTitle: null,
    price: null,
    formInput: null,
  },
};

function makeFont(overrides?: Partial<CustomFontFileRow>): CustomFontFileRow {
  return {
    id: "font-1",
    familyName: "Brand Sans",
    weight: 400,
    style: "normal",
    fileUrl: "/uploads/fonts/brand-sans-400-normal-x.ttf",
    format: "ttf",
    createdAt: new Date(),
    ...overrides,
  };
}

describe("buildTypographyHeadCss", () => {
  // A .ttf file's DB-stored `format` is the short token "ttf", but the CSS
  // format() function requires the real keyword "truetype" — "ttf" is not a
  // valid format() value and browsers silently skip that @font-face source,
  // so the uploaded font never actually loads even though everything else
  // (the @font-face rule, the :root var) looks correct.
  it("emits format(\"truetype\") for a .ttf font row, not the raw \"ttf\" token", () => {
    const css = buildTypographyHeadCss(settings, [makeFont({ format: "ttf" })]);
    expect(css).toContain('format("truetype")');
    expect(css).not.toContain('format("ttf")');
  });

  it("emits format(\"woff2\")/format(\"woff\") unchanged for those formats", () => {
    const woff2Css = buildTypographyHeadCss(settings, [makeFont({ format: "woff2" })]);
    expect(woff2Css).toContain('format("woff2")');

    const woffCss = buildTypographyHeadCss(settings, [makeFont({ format: "woff" })]);
    expect(woffCss).toContain('format("woff")');
  });

  it("only emits @font-face rules for family+weight pairs actually assigned to a role", () => {
    const css = buildTypographyHeadCss(settings, [
      makeFont({ familyName: "Brand Sans", weight: 400 }),
      makeFont({ id: "font-2", familyName: "Brand Sans", weight: 700 }),
    ]);
    expect(css).toContain("font-weight: 400");
    expect(css).not.toContain("font-weight: 700");
  });

  it("falls back to the default stack when a role is unassigned", () => {
    const css = buildTypographyHeadCss(settings, []);
    expect(css).toContain('--font-body: "Poppins"');
  });
});
