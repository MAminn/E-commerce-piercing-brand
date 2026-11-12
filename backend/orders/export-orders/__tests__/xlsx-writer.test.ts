import { describe, expect, it } from "vitest";
import unzipper from "unzipper";
import {
  columnLetter,
  escapeXml,
  excelSerial,
  neutralizeFormula,
  XlsxWorkbookWriter,
} from "../xlsx-writer";

async function unzip(buf: Buffer): Promise<Record<string, string>> {
  const dir = await unzipper.Open.buffer(buf);
  const out: Record<string, string> = {};
  for (const f of dir.files) out[f.path] = (await f.buffer()).toString("utf8");
  return out;
}

describe("neutralizeFormula", () => {
  it.each([
    ["=HYPERLINK(\"http://x\")", "'=HYPERLINK(\"http://x\")"],
    ["@SUM(A1)", "'@SUM(A1)"],
    ["+cmd|' /C calc'!A0", "'+cmd|' /C calc'!A0"],
    ["-2+3+cmd|' /C calc'!A0", "'-2+3+cmd|' /C calc'!A0"],
    ["\t=1", "'\t=1"],
  ])("neutralises %j", (input, expected) => {
    expect(neutralizeFormula(input)).toEqual({ text: expected, quotePrefix: true });
  });

  it("keeps phone numbers and plain numbers intact (flagged as text only)", () => {
    expect(neutralizeFormula("+20 100 123 4567")).toEqual({ text: "+20 100 123 4567", quotePrefix: true });
    expect(neutralizeFormula("+201001234567")).toEqual({ text: "+201001234567", quotePrefix: true });
    expect(neutralizeFormula("-5")).toEqual({ text: "-5", quotePrefix: true });
  });

  it("leaves ordinary text alone", () => {
    expect(neutralizeFormula("محمد أحمد")).toEqual({ text: "محمد أحمد", quotePrefix: false });
    expect(neutralizeFormula("a=b")).toEqual({ text: "a=b", quotePrefix: false });
  });
});

describe("helpers", () => {
  it("columnLetter", () => {
    expect([0, 25, 26, 51, 52, 701, 702].map(columnLetter)).toEqual(["A", "Z", "AA", "AZ", "BA", "ZZ", "AAA"]);
  });

  it("escapeXml escapes markup and drops XML-illegal control characters", () => {
    expect(escapeXml(`<a href="x">&</a>\u0001\u0008ok\n`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;ok\n");
  });

  it("excelSerial uses Cairo wall-clock time (winter UTC+2, summer DST UTC+3)", () => {
    // 2026-01-15 10:00 UTC = 12:00 Cairo
    const winter = excelSerial(new Date("2026-01-15T10:00:00Z"), "Africa/Cairo");
    expect(winter).toBeCloseTo(46037 + 0.5, 9);
    // 2026-07-15 10:00 UTC = 13:00 Cairo (DST)
    const summer = excelSerial(new Date("2026-07-15T10:00:00Z"), "Africa/Cairo");
    expect(summer).toBeCloseTo(46218 + 13 / 24, 9);
  });
});

describe("XlsxWorkbookWriter", () => {
  it("writes a valid package with typed, safe cells", async () => {
    const wb = await XlsxWorkbookWriter.create({
      timeZone: "Africa/Cairo",
      title: "t",
      sheets: [
        {
          name: "Orders",
          columns: [
            { header: "N", kind: "integer" },
            { header: "Name", kind: "text" },
            { header: "Total", kind: "money" },
            { header: "At", kind: "datetime" },
            { header: "Flag", kind: "text" },
          ],
        },
        { name: "Payment & Courier", columns: [{ header: "X", kind: "text" }] },
      ],
    });
    try {
      await wb.sheet("Orders").writeRows([
        [10001, "سارة <محمود> & co", 1234.5, new Date("2026-01-15T10:00:00Z"), true],
        [10002, "=cmd()", null, null, false],
      ]);
      const files = await unzip(await wb.toBuffer());
      expect(Object.keys(files).sort()).toEqual(
        [
          "[Content_Types].xml",
          "_rels/.rels",
          "docProps/core.xml",
          "xl/_rels/workbook.xml.rels",
          "xl/styles.xml",
          "xl/workbook.xml",
          "xl/worksheets/sheet1.xml",
          "xl/worksheets/sheet2.xml",
        ].sort(),
      );
      const s1 = files["xl/worksheets/sheet1.xml"]!;
      expect(s1).toContain(`<c r="A2" s="4"><v>10001</v></c>`);
      expect(s1).toContain("سارة &lt;محمود&gt; &amp; co");
      expect(s1).toContain(`<c r="C2" s="3"><v>1234.5</v></c>`);
      expect(s1).toContain(`<c r="D2" s="2"><v>46037.5</v></c>`);
      expect(s1).toContain(`<t xml:space="preserve">Yes</t>`);
      // Formula text is stored as an inline STRING with the quote-prefix style, never as <f>.
      expect(s1).toContain(`<c r="B3" s="6" t="inlineStr"><is><t xml:space="preserve">'=cmd()</t></is></c>`);
      expect(s1).not.toContain("<f>");
      expect(s1).toContain(`<autoFilter ref="A1:E3"/>`);
      expect(s1).toContain(`state="frozen"`);
      expect(files["xl/worksheets/sheet2.xml"]).toContain(`<autoFilter ref="A1:A1"/>`);
      expect(files["xl/workbook.xml"]).toContain(`name="Payment &amp; Courier"`);
      expect(files["xl/workbook.xml"]).toContain(`'Orders'!$A$1:$E$3`);
    } finally {
      await wb.dispose();
    }
  });

  it("rejects worksheet names Excel would refuse", async () => {
    await expect(
      XlsxWorkbookWriter.create({ timeZone: "UTC", title: "t", sheets: [{ name: "a/b", columns: [] }] }),
    ).rejects.toThrow(/Invalid worksheet name/);
  });
});
